"""
Cresca Bucket Protocol — Algorand Smart Contract (algopy / Puya)
================================================================
Equivalent of CrescaBucketProtocol.sol — leveraged basket trading
with up to 150x leverage.  Ported for the Algorand Hackathon.

Units: all collateral / P&L amounts in μALGO.
       All prices use 8-decimal precision (PRICE_PRECISION = 1e8).

Key design differences from Solidity:
- Asset addresses replaced with Algorand Asset IDs (uint64).
- Bucket and Position data stored in AVM Boxes.
- Oracle prices updated via update_oracle() (mock; use Pyth in production).
- Collateral deposited / withdrawn in ALGO (or an ASA if extended).
- P&L settlement returned to the user's collateral balance in the contract.
- Anyone can call liquidate_position() when a position is undercollateralised.

Build & deploy:
    pip install algokit-utils algopy
    algokit compile python cresca_bucket_protocol.py
    algokit deploy
"""

from algopy import (
    ARC4Contract,
    BoxMap,
    Bytes,
    Global,
    GlobalState,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    op,
    subroutine,
    urange,
)
from algopy.arc4 import abimethod


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_LEVERAGE = 150
MIN_LEVERAGE = 1
LIQUIDATION_THRESHOLD_PCT = 5   # 5 % remaining margin
PRICE_PRECISION = 100_000_000   # 1e8


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class Bucket(arc4.Struct):
    """A basket of Algorand ASAs with weighted allocations and a leverage setting."""
    # Encoded as pipe-separated uint64 strings to stay within struct limitations.
    # We store assets and weights as fixed-length arrays using arc4.StaticArray.
    # For simplicity we allow up to 8 assets per bucket.
    asset0: arc4.UInt64
    asset1: arc4.UInt64
    asset2: arc4.UInt64
    asset3: arc4.UInt64
    asset4: arc4.UInt64
    asset5: arc4.UInt64
    asset6: arc4.UInt64
    asset7: arc4.UInt64
    weight0: arc4.UInt64   # percentage, all weights must sum to 100
    weight1: arc4.UInt64
    weight2: arc4.UInt64
    weight3: arc4.UInt64
    weight4: arc4.UInt64
    weight5: arc4.UInt64
    weight6: arc4.UInt64
    weight7: arc4.UInt64
    asset_count: arc4.UInt64
    leverage: arc4.UInt64   # 1-150
    owner: arc4.Address
    exists: arc4.Bool


class Position(arc4.Struct):
    bucket_id: arc4.UInt64
    is_long: arc4.Bool
    margin: arc4.UInt64       # μALGO
    entry_price: arc4.UInt64  # 8-decimal precision
    owner: arc4.Address
    active: arc4.Bool
    open_timestamp: arc4.UInt64


class PriceData(arc4.Struct):
    price: arc4.UInt64      # 8-decimal precision
    timestamp: arc4.UInt64


# ---------------------------------------------------------------------------
# Box-key helpers
# ---------------------------------------------------------------------------

@subroutine
def _bucket_key(owner: Bytes, bucket_id: UInt64) -> Bytes:
    return b"bkt_" + owner + op.itob(bucket_id)

@subroutine
def _position_key(owner: Bytes, position_id: UInt64) -> Bytes:
    return b"pos_" + owner + op.itob(position_id)

@subroutine
def _price_key(asset_id: UInt64) -> Bytes:
    return b"prc_" + op.itob(asset_id)


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

ORACLE_MAX_AGE = 30   # seconds — positions reject if oracle is staler than this


class CrescaBucketProtocol(ARC4Contract):
    """
    Leveraged basket trading protocol on Algorand.

    State:
    - Global: total_positions, total_buckets, oracle_updated_at
    - Boxes:  Bucket, Position, PriceData per entry
    """

    total_positions: GlobalState[UInt64]
    total_buckets: GlobalState[UInt64]
    oracle_updated_at: GlobalState[UInt64]   # Unix timestamp of last update_oracle() call

    # Collateral balances (μALGO) held by the contract per user
    collateral: BoxMap[arc4.Address, arc4.UInt64]

    # Bucket count per user (for ID generation)
    bucket_counts: BoxMap[arc4.Address, arc4.UInt64]

    # Bucket storage:   key = b"bkt_" + owner_bytes + bucket_id_bytes
    buckets: BoxMap[Bytes, Bucket]

    # Position storage: key = b"pos_" + owner_bytes + position_id_bytes
    positions: BoxMap[Bytes, Position]

    # Oracle price storage: key = b"prc_" + asset_id_bytes
    prices: BoxMap[Bytes, PriceData]

    def __init__(self) -> None:
        self.total_positions = GlobalState(UInt64(0))
        self.total_buckets = GlobalState(UInt64(0))
        self.oracle_updated_at = GlobalState(UInt64(0))
        self.collateral = BoxMap(arc4.Address, arc4.UInt64, key_prefix=b"col_")
        self.bucket_counts = BoxMap(arc4.Address, arc4.UInt64, key_prefix=b"bkc_")
        self.buckets = BoxMap(Bytes, Bucket, key_prefix=b"")
        self.positions = BoxMap(Bytes, Position, key_prefix=b"")
        self.prices = BoxMap(Bytes, PriceData, key_prefix=b"")

    # ------------------------------------------------------------------
    # create_bucket
    # ------------------------------------------------------------------
    @abimethod
    def create_bucket(
        self,
        assets: arc4.DynamicArray[arc4.UInt64],   # Algorand ASA IDs
        weights: arc4.DynamicArray[arc4.UInt64],   # must sum to 100
        leverage: arc4.UInt64,
    ) -> arc4.UInt64:
        """
        Create a custom asset basket.

        assets  — up to 8 Algorand ASA IDs (use 0 for ALGO itself)
        weights — percentage allocation per asset (must sum to 100)
        leverage — 1 to 150
        """
        assert assets.length == weights.length, "Length mismatch"
        assert assets.length > UInt64(0), "Must have at least 1 asset"
        assert assets.length <= UInt64(8), "Max 8 assets per bucket"
        assert leverage.native >= UInt64(MIN_LEVERAGE), "Leverage too low"
        assert leverage.native <= UInt64(MAX_LEVERAGE), "Leverage too high"

        # Validate weights sum to 100
        total_weight = UInt64(0)
        for i in urange(weights.length):
            total_weight = total_weight + weights[i].native
        assert total_weight == UInt64(100), "Weights must sum to 100"

        owner_addr = arc4.Address(Txn.sender)

        # Assign bucket ID
        if owner_addr in self.bucket_counts:
            bucket_id = self.bucket_counts[owner_addr].native
        else:
            bucket_id = UInt64(0)

        bucket = Bucket(
            asset0=assets[0] if assets.length > UInt64(0) else arc4.UInt64(0),
            asset1=assets[1] if assets.length > UInt64(1) else arc4.UInt64(0),
            asset2=assets[2] if assets.length > UInt64(2) else arc4.UInt64(0),
            asset3=assets[3] if assets.length > UInt64(3) else arc4.UInt64(0),
            asset4=assets[4] if assets.length > UInt64(4) else arc4.UInt64(0),
            asset5=assets[5] if assets.length > UInt64(5) else arc4.UInt64(0),
            asset6=assets[6] if assets.length > UInt64(6) else arc4.UInt64(0),
            asset7=assets[7] if assets.length > UInt64(7) else arc4.UInt64(0),
            weight0=weights[0] if weights.length > UInt64(0) else arc4.UInt64(0),
            weight1=weights[1] if weights.length > UInt64(1) else arc4.UInt64(0),
            weight2=weights[2] if weights.length > UInt64(2) else arc4.UInt64(0),
            weight3=weights[3] if weights.length > UInt64(3) else arc4.UInt64(0),
            weight4=weights[4] if weights.length > UInt64(4) else arc4.UInt64(0),
            weight5=weights[5] if weights.length > UInt64(5) else arc4.UInt64(0),
            weight6=weights[6] if weights.length > UInt64(6) else arc4.UInt64(0),
            weight7=weights[7] if weights.length > UInt64(7) else arc4.UInt64(0),
            asset_count=arc4.UInt64(assets.length),
            leverage=leverage,
            owner=owner_addr,
            exists=arc4.Bool(True),
        )

        self.buckets[_bucket_key(Txn.sender.bytes, bucket_id)] = bucket.copy()
        self.bucket_counts[owner_addr] = arc4.UInt64(bucket_id + UInt64(1))
        self.total_buckets.value = self.total_buckets.value + UInt64(1)

        arc4.emit(
            "BucketCreated(uint64,address,uint64[],uint64[],uint64)",
            arc4.UInt64(bucket_id),
            owner_addr,
            assets,
            weights,
            leverage,
        )

        return arc4.UInt64(bucket_id)

    # ------------------------------------------------------------------
    # deposit_collateral
    # ------------------------------------------------------------------
    @abimethod
    def deposit_collateral(self, payment_txn: gtxn.PaymentTransaction) -> arc4.Bool:
        """
        Deposit ALGO as collateral for trading.
        Attach a PaymentTransaction to this contract in the same group.
        """
        assert payment_txn.receiver == Global.current_application_address, "Must pay contract"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"

        user = arc4.Address(Txn.sender)
        current = UInt64(0)
        if user in self.collateral:
            current = self.collateral[user].native
        self.collateral[user] = arc4.UInt64(current + payment_txn.amount)

        arc4.emit(
            "CollateralDeposited(address,uint64)",
            user,
            arc4.UInt64(payment_txn.amount),
        )
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # withdraw_collateral
    # ------------------------------------------------------------------
    @abimethod
    def withdraw_collateral(self, amount: arc4.UInt64) -> arc4.Bool:
        """Withdraw ALGO collateral back to sender."""
        user = arc4.Address(Txn.sender)
        assert user in self.collateral, "No collateral balance"
        current = self.collateral[user].native
        assert current >= amount.native, "Insufficient collateral"

        self.collateral[user] = arc4.UInt64(current - amount.native)

        itxn.Payment(
            receiver=Txn.sender,
            amount=amount.native,
            fee=0,
        ).submit()

        arc4.emit(
            "CollateralWithdrawn(address,uint64)",
            user,
            amount,
        )
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # open_position
    # ------------------------------------------------------------------
    @abimethod
    def open_position(
        self,
        bucket_id: arc4.UInt64,
        is_long: arc4.Bool,
        margin: arc4.UInt64,
    ) -> arc4.UInt64:
        """
        Open a leveraged long or short position on a bucket.

        bucket_id — ID of the bucket owned by Txn.sender
        is_long   — True = long, False = short
        margin    — μALGO to lock from collateral balance
        """
        # Enforce oracle freshness — reject if keeper hasn't run within ORACLE_MAX_AGE seconds
        assert Global.latest_timestamp - self.oracle_updated_at.value <= UInt64(ORACLE_MAX_AGE), "Oracle price stale"

        owner_addr = arc4.Address(Txn.sender)
        bkt_key = _bucket_key(Txn.sender.bytes, bucket_id.native)
        assert bkt_key in self.buckets, "Bucket not found"

        bucket = self.buckets[bkt_key].copy()
        assert bucket.exists.native, "Bucket not found"
        assert bucket.owner == owner_addr, "Not your bucket"

        # Check collateral
        assert owner_addr in self.collateral, "No collateral balance"
        current_collateral = self.collateral[owner_addr].native
        assert current_collateral >= margin.native, "Insufficient collateral"

        # Deduct margin from collateral
        self.collateral[owner_addr] = arc4.UInt64(current_collateral - margin.native)

        # Calculate weighted basket entry price
        entry_price = self._calculate_basket_price(bucket)

        # Assign position ID from global counter to keep box usage low.
        pos_id = self.total_positions.value

        pos = Position(
            bucket_id=bucket_id,
            is_long=is_long,
            margin=margin,
            entry_price=arc4.UInt64(entry_price),
            owner=owner_addr,
            active=arc4.Bool(True),
            open_timestamp=arc4.UInt64(Global.latest_timestamp),
        )
        self.positions[_position_key(Txn.sender.bytes, pos_id)] = pos.copy()
        self.total_positions.value = self.total_positions.value + UInt64(1)

        arc4.emit(
            "PositionOpened(uint64,uint64,address,bool,uint64,uint64)",
            arc4.UInt64(pos_id),
            bucket_id,
            owner_addr,
            is_long,
            margin,
            arc4.UInt64(entry_price),
        )

        return arc4.UInt64(pos_id)

    # ------------------------------------------------------------------
    # close_position
    # ------------------------------------------------------------------
    @abimethod
    def close_position(self, position_id: arc4.UInt64) -> arc4.UInt64:
        """
        Close a position and realise P&L back into the collateral balance.
        Returns absolute P&L in μALGO.
        """
        # Enforce oracle freshness
        assert Global.latest_timestamp - self.oracle_updated_at.value <= UInt64(ORACLE_MAX_AGE), "Oracle price stale"

        owner_addr = arc4.Address(Txn.sender)
        pos_key = _position_key(Txn.sender.bytes, position_id.native)
        assert pos_key in self.positions, "Position not found"

        pos = self.positions[pos_key].copy()
        assert pos.active.native, "Position already closed"
        assert pos.owner == owner_addr, "Not your position"

        bkt_key = _bucket_key(Txn.sender.bytes, pos.bucket_id.native)
        bucket = self.buckets[bkt_key].copy()
        exit_price = self._calculate_basket_price(bucket)

        pnl_abs = self._calculate_pnl_abs(pos, exit_price, bucket.leverage.native)
        is_profit = self._is_profit(pos, exit_price)

        # Mark closed
        self.positions[pos_key] = Position(
            bucket_id=pos.bucket_id,
            is_long=pos.is_long,
            margin=pos.margin,
            entry_price=pos.entry_price,
            owner=pos.owner,
            active=arc4.Bool(False),
            open_timestamp=pos.open_timestamp,
        )

        # Return margin ± P&L to collateral
        margin_val = pos.margin.native
        if is_profit:
            return_amount = margin_val + pnl_abs
        else:
            return_amount = margin_val - pnl_abs if margin_val > pnl_abs else UInt64(0)

        current_col = UInt64(0)
        if owner_addr in self.collateral:
            current_col = self.collateral[owner_addr].native
        self.collateral[owner_addr] = arc4.UInt64(current_col + return_amount)

        arc4.emit(
            "PositionClosed(uint64,address,uint64,bool)",
            position_id,
            owner_addr,
            arc4.UInt64(pnl_abs),
            arc4.Bool(is_profit),
        )

        return arc4.UInt64(pnl_abs)

    # ------------------------------------------------------------------
    # rebalance_bucket
    # ------------------------------------------------------------------
    @abimethod
    def rebalance_bucket(
        self,
        bucket_id: arc4.UInt64,
        new_weights: arc4.DynamicArray[arc4.UInt64],
    ) -> arc4.Bool:
        """Update the weight allocation of an existing bucket (owner only)."""
        bkt_key = _bucket_key(Txn.sender.bytes, bucket_id.native)
        assert bkt_key in self.buckets, "Bucket not found"

        bucket = self.buckets[bkt_key].copy()
        assert bucket.owner == arc4.Address(Txn.sender), "Not your bucket"
        assert new_weights.length == bucket.asset_count.native, "Weight count mismatch"

        total_weight = UInt64(0)
        for i in urange(new_weights.length):
            total_weight = total_weight + new_weights[i].native
        assert total_weight == UInt64(100), "Weights must sum to 100"

        self.buckets[bkt_key] = Bucket(
            asset0=bucket.asset0, asset1=bucket.asset1,
            asset2=bucket.asset2, asset3=bucket.asset3,
            asset4=bucket.asset4, asset5=bucket.asset5,
            asset6=bucket.asset6, asset7=bucket.asset7,
            weight0=new_weights[0] if new_weights.length > UInt64(0) else arc4.UInt64(0),
            weight1=new_weights[1] if new_weights.length > UInt64(1) else arc4.UInt64(0),
            weight2=new_weights[2] if new_weights.length > UInt64(2) else arc4.UInt64(0),
            weight3=new_weights[3] if new_weights.length > UInt64(3) else arc4.UInt64(0),
            weight4=new_weights[4] if new_weights.length > UInt64(4) else arc4.UInt64(0),
            weight5=new_weights[5] if new_weights.length > UInt64(5) else arc4.UInt64(0),
            weight6=new_weights[6] if new_weights.length > UInt64(6) else arc4.UInt64(0),
            weight7=new_weights[7] if new_weights.length > UInt64(7) else arc4.UInt64(0),
            asset_count=bucket.asset_count,
            leverage=bucket.leverage,
            owner=bucket.owner,
            exists=bucket.exists,
        )

        arc4.emit("BucketRebalanced(uint64,uint64[])", bucket_id, new_weights)
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # update_oracle  (mock — replace with Pyth in production)
    # ------------------------------------------------------------------
    @abimethod
    def update_oracle(
        self,
        asset_ids: arc4.DynamicArray[arc4.UInt64],
        asset_prices: arc4.DynamicArray[arc4.UInt64],
    ) -> arc4.Bool:
        """
        Update mock oracle prices. In production, consume a Pyth price feed
        via a Pyth Algorand oracle contract instead.

        Prices must use 8-decimal precision (e.g. 1 ALGO = 100_000_000).
        """
        assert asset_ids.length == asset_prices.length, "Length mismatch"

        for i in urange(asset_ids.length):
            asset_id = asset_ids[i].native
            price = asset_prices[i].native
            pkey = _price_key(asset_id)
            self.prices[pkey] = PriceData(
                price=arc4.UInt64(price),
                timestamp=arc4.UInt64(Global.latest_timestamp),
            )
            arc4.emit(
                "OracleUpdated(uint64,uint64)",
                arc4.UInt64(asset_id),
                arc4.UInt64(price),
            )

        # Record the timestamp so open/close can enforce freshness
        self.oracle_updated_at.value = Global.latest_timestamp

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # liquidate_position  (anyone can call)
    # ------------------------------------------------------------------
    @abimethod
    def liquidate_position(
        self,
        owner: arc4.Address,
        position_id: arc4.UInt64,
    ) -> arc4.Bool:
        """
        Liquidate an undercollateralised position.
        Anyone may call this (keeper/bot pattern — same as Solidity version).
        """
        # Enforce oracle freshness — stale prices make liquidation invalid
        assert Global.latest_timestamp - self.oracle_updated_at.value <= UInt64(ORACLE_MAX_AGE), "Oracle price stale"

        pos_key = _position_key(owner.native.bytes, position_id.native)
        assert pos_key in self.positions, "Position not found"

        pos = self.positions[pos_key].copy()
        assert pos.active.native, "Position already closed"

        bkt_key = _bucket_key(owner.native.bytes, pos.bucket_id.native)
        bucket = self.buckets[bkt_key].copy()
        current_price = self._calculate_basket_price(bucket)

        pnl_abs = self._calculate_pnl_abs(pos, current_price, bucket.leverage.native)
        is_profit = self._is_profit(pos, current_price)

        margin_val = pos.margin.native
        remaining_margin: UInt64
        if is_profit:
            remaining_margin = margin_val + pnl_abs
        else:
            remaining_margin = margin_val - pnl_abs if margin_val > pnl_abs else UInt64(0)

        liquidation_threshold = (margin_val * UInt64(LIQUIDATION_THRESHOLD_PCT)) // UInt64(100)
        assert remaining_margin <= liquidation_threshold, "Position not liquidatable"

        # Close position (margin goes to zero / protocol fee — simplified)
        self.positions[pos_key] = Position(
            bucket_id=pos.bucket_id,
            is_long=pos.is_long,
            margin=pos.margin,
            entry_price=pos.entry_price,
            owner=pos.owner,
            active=arc4.Bool(False),
            open_timestamp=pos.open_timestamp,
        )

        arc4.emit(
            "Liquidation(uint64,address,byte[])",
            position_id,
            owner,
            arc4.DynamicBytes(b"Insufficient margin"),
        )

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Read-only views
    # ------------------------------------------------------------------
    @abimethod(readonly=True)
    def get_collateral_balance(self, user: arc4.Address) -> arc4.UInt64:
        if user in self.collateral:
            return self.collateral[user]
        return arc4.UInt64(0)

    @abimethod(readonly=True)
    def get_unrealized_pnl(
        self, owner: arc4.Address, position_id: arc4.UInt64
    ) -> arc4.UInt64:
        pos_key = _position_key(owner.native.bytes, position_id.native)
        if pos_key not in self.positions:
            return arc4.UInt64(0)
        pos = self.positions[pos_key].copy()
        if not pos.active.native:
            return arc4.UInt64(0)
        bkt_key = _bucket_key(owner.native.bytes, pos.bucket_id.native)
        bucket = self.buckets[bkt_key].copy()
        current_price = self._calculate_basket_price(bucket)
        pnl_abs = self._calculate_pnl_abs(pos, current_price, bucket.leverage.native)
        return arc4.UInt64(pnl_abs)

    @abimethod(readonly=True)
    def get_oracle_updated_at(self) -> arc4.UInt64:
        """Returns Unix timestamp of the last oracle update (0 if never updated)."""
        return arc4.UInt64(self.oracle_updated_at.value)

    @abimethod(readonly=True)
    def get_total_positions(self) -> arc4.UInt64:
        return arc4.UInt64(self.total_positions.value)

    @abimethod(readonly=True)
    def get_total_buckets(self) -> arc4.UInt64:
        return arc4.UInt64(self.total_buckets.value)

    # ------------------------------------------------------------------
    # fund_contract  (covers Box min-balance)
    # ------------------------------------------------------------------
    @abimethod
    def fund_contract(self, payment_txn: gtxn.PaymentTransaction) -> arc4.Bool:
        """Increase contract's minimum balance to cover Box storage costs."""
        assert payment_txn.receiver == Global.current_application_address, "Must pay contract"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"
        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @subroutine
    def _get_asset_price(self, asset_id: UInt64) -> UInt64:
        """Return oracle price for an asset (defaults to PRICE_PRECISION if not set)."""
        pkey = _price_key(asset_id)
        if pkey in self.prices:
            price: UInt64 = self.prices[pkey].price.native
            return price
        return UInt64(PRICE_PRECISION)  # default: price = 1.0 (in 8-decimal precision)

    @subroutine
    def _calculate_basket_price(self, bucket: Bucket) -> UInt64:
        """
        Weighted average price of all assets in the bucket.
        price_i is fetched from the mock oracle.
        weighted_sum = sum(price_i * weight_i) / 100
        """
        n = bucket.asset_count.native
        weighted_sum = UInt64(0)
        for i in urange(n):
            asset_id = UInt64(0)
            weight = UInt64(0)

            if i == UInt64(0):
                asset_id = bucket.asset0.native
                weight = bucket.weight0.native
            elif i == UInt64(1):
                asset_id = bucket.asset1.native
                weight = bucket.weight1.native
            elif i == UInt64(2):
                asset_id = bucket.asset2.native
                weight = bucket.weight2.native
            elif i == UInt64(3):
                asset_id = bucket.asset3.native
                weight = bucket.weight3.native
            elif i == UInt64(4):
                asset_id = bucket.asset4.native
                weight = bucket.weight4.native
            elif i == UInt64(5):
                asset_id = bucket.asset5.native
                weight = bucket.weight5.native
            elif i == UInt64(6):
                asset_id = bucket.asset6.native
                weight = bucket.weight6.native
            else:
                asset_id = bucket.asset7.native
                weight = bucket.weight7.native

            price = self._get_asset_price(asset_id)
            weighted_sum = weighted_sum + (price * weight) // UInt64(100)

        return weighted_sum if weighted_sum > UInt64(0) else UInt64(PRICE_PRECISION)

    @subroutine
    def _is_profit(
        self,
        pos: Position,
        exit_price: UInt64,
    ) -> bool:
        entry = pos.entry_price.native
        if pos.is_long.native:
            if exit_price >= entry:
                return True
            return False
        if entry >= exit_price:
            return True
        return False

    @subroutine
    def _calculate_pnl_abs(
        self,
        pos: Position,
        exit_price: UInt64,
        leverage: UInt64,
    ) -> UInt64:
        """
        Absolute P&L = (|price_change| / entry_price) * margin * leverage
        """
        entry = pos.entry_price.native
        margin = pos.margin.native
        price_change = exit_price - entry if exit_price >= entry else entry - exit_price
        pnl: UInt64 = (price_change * margin * leverage) // entry
        return pnl
