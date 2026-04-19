"""
Cresca DART Swap — Algorand Smart Contract (algopy / Puya)
===========================================================
In-house swap router for ALGO <-> ASA pools with a simple DART-like best-route
selector across configured pools.

Design goals:
- Support multiple assets (each asset has its own ALGO pool)
- Deterministic on-chain quotes using constant-product invariant
- Exact-in swap methods for both directions
- Slippage protection via min_amount_out
- Box-backed pool storage

Notes:
- This is v1 and intentionally simple: one-hop ALGO pairs.
- True multi-hop pathfinding can be added later as an extension.
"""

from algopy import (
    ARC4Contract,
    BoxMap,
    Global,
    GlobalState,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    subroutine,
    urange,
)
from algopy.arc4 import abimethod

FEE_BPS_DENOM = 10_000
DEFAULT_FEE_BPS = 30  # 0.30%
MAX_FEE_BPS = 100     # 1.00%


class Pool(arc4.Struct):
    asset_id: arc4.UInt64
    algo_reserve: arc4.UInt64
    asset_reserve: arc4.UInt64
    enabled: arc4.Bool


class BestQuote(arc4.Struct):
    asset_id: arc4.UInt64
    amount_out: arc4.UInt64


class CrescaDartSwap(ARC4Contract):
    fee_bps: GlobalState[UInt64]
    pools: BoxMap[arc4.UInt64, Pool]

    def __init__(self) -> None:
        self.fee_bps = GlobalState(UInt64(DEFAULT_FEE_BPS))
        self.pools = BoxMap(arc4.UInt64, Pool, key_prefix=b"pl_")

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------
    @abimethod
    def set_fee_bps(self, fee_bps: arc4.UInt64) -> arc4.Bool:
        assert Txn.sender == Global.creator_address, "Only creator"
        assert fee_bps.native <= UInt64(MAX_FEE_BPS), "Fee too high"
        self.fee_bps.value = fee_bps.native
        return arc4.Bool(True)

    @abimethod
    def configure_pool(self, asset_id: arc4.UInt64, enabled: arc4.Bool) -> arc4.Bool:
        assert Txn.sender == Global.creator_address, "Only creator"

        if asset_id in self.pools:
            pool = self.pools[asset_id].copy()
            pool.enabled = enabled
            self.pools[asset_id] = pool.copy()
        else:
            self.pools[asset_id] = Pool(
                asset_id=asset_id,
                algo_reserve=arc4.UInt64(0),
                asset_reserve=arc4.UInt64(0),
                enabled=enabled,
            )
        return arc4.Bool(True)

    @abimethod
    def opt_in_asset(self, asset_id: arc4.UInt64) -> arc4.Bool:
        assert Txn.sender == Global.creator_address, "Only creator"
        itxn.AssetTransfer(
            xfer_asset=asset_id.native,
            asset_receiver=Global.current_application_address,
            asset_amount=UInt64(0),
            fee=UInt64(0),
        ).submit()
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Pool funding
    # ------------------------------------------------------------------
    @abimethod
    def fund_pool_algo(self, payment_txn: gtxn.PaymentTransaction, asset_id: arc4.UInt64) -> arc4.Bool:
        assert payment_txn.receiver == Global.current_application_address, "Must fund app"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"

        pool = self._require_pool(asset_id)
        pool.algo_reserve = arc4.UInt64(pool.algo_reserve.native + payment_txn.amount)
        self.pools[asset_id] = pool.copy()
        return arc4.Bool(True)

    @abimethod
    def fund_pool_asset(
        self,
        asset_txn: gtxn.AssetTransferTransaction,
        asset_id: arc4.UInt64,
    ) -> arc4.Bool:
        assert asset_txn.asset_receiver == Global.current_application_address, "Must fund app"
        assert asset_txn.asset_amount > UInt64(0), "Amount must be > 0"
        assert asset_txn.xfer_asset.id == asset_id.native, "Wrong asset"

        pool = self._require_pool(asset_id)
        pool.asset_reserve = arc4.UInt64(pool.asset_reserve.native + asset_txn.asset_amount)
        self.pools[asset_id] = pool.copy()
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Quotes
    # ------------------------------------------------------------------
    @abimethod(readonly=True)
    def get_quote_exact_in(
        self,
        asset_id: arc4.UInt64,
        is_algo_in: arc4.Bool,
        amount_in: arc4.UInt64,
    ) -> arc4.UInt64:
        pool = self._require_pool(asset_id)
        assert pool.enabled.native, "Pool disabled"

        if is_algo_in.native:
            out = self._quote_exact_in(
                amount_in.native,
                pool.algo_reserve.native,
                pool.asset_reserve.native,
            )
            return arc4.UInt64(out)

        out = self._quote_exact_in(
            amount_in.native,
            pool.asset_reserve.native,
            pool.algo_reserve.native,
        )
        return arc4.UInt64(out)

    @abimethod(readonly=True)
    def get_best_quote_exact_in(
        self,
        asset_ids: arc4.DynamicArray[arc4.UInt64],
        amount_in: arc4.UInt64,
        is_algo_in: arc4.Bool,
    ) -> BestQuote:
        """
        DART-like selection: returns best output among provided candidate pools.
        Output packing: (asset_id << 64) | amount_out
        """
        assert asset_ids.length > UInt64(0), "No candidates"

        best_asset = UInt64(0)
        best_out = UInt64(0)

        for i in urange(asset_ids.length):
            asset_id = asset_ids[i]
            if asset_id not in self.pools:
                continue
            pool = self.pools[asset_id].copy()
            if not pool.enabled.native:
                continue

            if is_algo_in.native:
                out = self._quote_exact_in(
                    amount_in.native,
                    pool.algo_reserve.native,
                    pool.asset_reserve.native,
                )
            else:
                out = self._quote_exact_in(
                    amount_in.native,
                    pool.asset_reserve.native,
                    pool.algo_reserve.native,
                )

            if out > best_out:
                best_out = out
                best_asset = asset_id.native

        return BestQuote(asset_id=arc4.UInt64(best_asset), amount_out=arc4.UInt64(best_out))

    # ------------------------------------------------------------------
    # Swaps
    # ------------------------------------------------------------------
    @abimethod
    def swap_exact_algo_for_asset(
        self,
        payment_txn: gtxn.PaymentTransaction,
        asset_id: arc4.UInt64,
        min_asset_out: arc4.UInt64,
        recipient: arc4.Address,
    ) -> arc4.UInt64:
        assert payment_txn.receiver == Global.current_application_address, "Must pay app"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"

        pool = self._require_pool(asset_id)
        assert pool.enabled.native, "Pool disabled"

        amount_out = self._quote_exact_in(
            payment_txn.amount,
            pool.algo_reserve.native,
            pool.asset_reserve.native,
        )
        assert amount_out >= min_asset_out.native, "Slippage exceeded"
        assert amount_out > UInt64(0), "No output"
        assert pool.asset_reserve.native >= amount_out, "Insufficient pool liquidity"

        pool.algo_reserve = arc4.UInt64(pool.algo_reserve.native + payment_txn.amount)
        pool.asset_reserve = arc4.UInt64(pool.asset_reserve.native - amount_out)
        self.pools[asset_id] = pool.copy()

        itxn.AssetTransfer(
            xfer_asset=asset_id.native,
            asset_receiver=recipient.native,
            asset_amount=amount_out,
            fee=UInt64(0),
        ).submit()

        arc4.emit(
            "SwapExecuted(address,uint64,bool,uint64,uint64)",
            arc4.Address(Txn.sender),
            asset_id,
            arc4.Bool(True),
            arc4.UInt64(payment_txn.amount),
            arc4.UInt64(amount_out),
        )

        return arc4.UInt64(amount_out)

    @abimethod
    def swap_exact_asset_for_algo(
        self,
        asset_txn: gtxn.AssetTransferTransaction,
        asset_id: arc4.UInt64,
        min_algo_out: arc4.UInt64,
        recipient: arc4.Address,
    ) -> arc4.UInt64:
        assert asset_txn.asset_receiver == Global.current_application_address, "Must pay app"
        assert asset_txn.asset_amount > UInt64(0), "Amount must be > 0"
        assert asset_txn.xfer_asset.id == asset_id.native, "Wrong asset"

        pool = self._require_pool(asset_id)
        assert pool.enabled.native, "Pool disabled"

        amount_out = self._quote_exact_in(
            asset_txn.asset_amount,
            pool.asset_reserve.native,
            pool.algo_reserve.native,
        )
        assert amount_out >= min_algo_out.native, "Slippage exceeded"
        assert amount_out > UInt64(0), "No output"
        assert pool.algo_reserve.native >= amount_out, "Insufficient pool liquidity"

        pool.asset_reserve = arc4.UInt64(pool.asset_reserve.native + asset_txn.asset_amount)
        pool.algo_reserve = arc4.UInt64(pool.algo_reserve.native - amount_out)
        self.pools[asset_id] = pool.copy()

        itxn.Payment(
            receiver=recipient.native,
            amount=amount_out,
            fee=UInt64(0),
        ).submit()

        arc4.emit(
            "SwapExecuted(address,uint64,bool,uint64,uint64)",
            arc4.Address(Txn.sender),
            asset_id,
            arc4.Bool(False),
            arc4.UInt64(asset_txn.asset_amount),
            arc4.UInt64(amount_out),
        )

        return arc4.UInt64(amount_out)

    # ------------------------------------------------------------------
    # Views
    # ------------------------------------------------------------------
    @abimethod(readonly=True)
    def get_pool(self, asset_id: arc4.UInt64) -> Pool:
        return self._require_pool(asset_id)

    @abimethod(readonly=True)
    def get_fee_bps(self) -> arc4.UInt64:
        return arc4.UInt64(self.fee_bps.value)

    @abimethod
    def fund_contract(self, payment_txn: gtxn.PaymentTransaction) -> arc4.Bool:
        assert payment_txn.receiver == Global.current_application_address, "Must fund app"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @subroutine
    def _require_pool(self, asset_id: arc4.UInt64) -> Pool:
        assert asset_id in self.pools, "Pool not found"
        return self.pools[asset_id].copy()

    @subroutine
    def _quote_exact_in(
        self,
        amount_in: UInt64,
        reserve_in: UInt64,
        reserve_out: UInt64,
    ) -> UInt64:
        assert reserve_in > UInt64(0), "Empty pool"
        assert reserve_out > UInt64(0), "Empty pool"

        fee_multiplier = UInt64(FEE_BPS_DENOM) - self.fee_bps.value
        amount_in_after_fee = (amount_in * fee_multiplier) // UInt64(FEE_BPS_DENOM)
        numerator = amount_in_after_fee * reserve_out
        denominator = reserve_in + amount_in_after_fee
        return numerator // denominator
