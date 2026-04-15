"""
Cresca Payments — Algorand Smart Contract (algopy / Puya)
=========================================================
Equivalent of CrescaPayments.sol — instant P2P transfers with memo,
tap-to-pay, and batch send.  Ported for the Algorand Hackathon.

Units: all amounts are in micro-ALGO (μALGO).
       1 ALGO = 1_000_000 μALGO

Build & deploy:
    pip install algokit-utils algopy
    algokit compile python cresca_payments.py
    algokit deploy
"""

from algopy import (
    ARC4Contract,
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


class CrescaPayments(ARC4Contract):
    """
    Instant P2P payment contract on Algorand.

    Key differences vs Solidity version:
    - Amounts in μALGO (not wei).
    - Payment history emitted as ARC-28 events; index off-chain via Algorand Indexer.
    - Funds forwarded atomically via AVM inner transactions — the contract holds
      funds only transiently within the same atomic group.
    - Batch send limited to ~8 recipients per call (AVM inner-txn budget).
    """

    total_payments: GlobalState[UInt64]
    total_volume: GlobalState[UInt64]

    def __init__(self) -> None:
        self.total_payments = GlobalState(UInt64(0))
        self.total_volume = GlobalState(UInt64(0))

    # ------------------------------------------------------------------
    # send_payment
    # ------------------------------------------------------------------
    @abimethod
    def send_payment(
        self,
        payment_txn: gtxn.PaymentTransaction,
        receiver: arc4.Address,
        memo: arc4.String,
    ) -> arc4.DynamicBytes:
        """
        Send ALGO to `receiver` with an optional memo.

        Caller must attach a PaymentTransaction TO this contract as the
        preceding transaction in the same atomic group.

        Returns a sha256 payment-ID usable for off-chain lookups.
        """
        assert (
            payment_txn.receiver == Global.current_application_address
        ), "Payment must target contract"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"

        amount: UInt64 = payment_txn.amount
        timestamp: UInt64 = Global.latest_timestamp

        # Forward funds to receiver via inner transaction
        itxn.Payment(
            receiver=receiver.native,
            amount=amount,
            note=memo.bytes,
            fee=0,
        ).submit()

        self.total_payments.value = self.total_payments.value + UInt64(1)
        self.total_volume.value = self.total_volume.value + amount

        payment_id = self._make_payment_id(
            Txn.sender.bytes, receiver.native.bytes, amount, timestamp
        )

        arc4.emit(
            "PaymentSent(address,address,uint64,uint64,byte[])",
            arc4.Address(Txn.sender),
            receiver,
            arc4.UInt64(amount),
            arc4.UInt64(timestamp),
            arc4.DynamicBytes(payment_id),
        )

        return arc4.DynamicBytes(payment_id)

    # ------------------------------------------------------------------
    # tap_to_pay
    # ------------------------------------------------------------------
    @abimethod
    def tap_to_pay(
        self,
        payment_txn: gtxn.PaymentTransaction,
        receiver: arc4.Address,
    ) -> arc4.Bool:
        """Quick send without a memo — tap-to-pay use case."""
        assert (
            payment_txn.receiver == Global.current_application_address
        ), "Payment must target contract"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"

        amount: UInt64 = payment_txn.amount

        itxn.Payment(
            receiver=receiver.native,
            amount=amount,
            note=b"Tap to Pay",
            fee=0,
        ).submit()

        self.total_payments.value = self.total_payments.value + UInt64(1)
        self.total_volume.value = self.total_volume.value + amount

        arc4.emit(
            "TapToPayCompleted(address,address,uint64)",
            arc4.Address(Txn.sender),
            receiver,
            arc4.UInt64(amount),
        )

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # batch_send
    # ------------------------------------------------------------------
    @abimethod
    def batch_send(
        self,
        payment_txn: gtxn.PaymentTransaction,
        recipients: arc4.DynamicArray[arc4.Address],
        amounts: arc4.DynamicArray[arc4.UInt64],
    ) -> arc4.Bool:
        """
        Batch send to multiple recipients (max ~8 due to AVM inner-txn limit).

        The attached `payment_txn` must cover sum(amounts).
        Excess μALGO is refunded to the caller.
        """
        assert recipients.length == amounts.length, "Length mismatch"
        assert (
            payment_txn.receiver == Global.current_application_address
        ), "Payment must target contract"

        total_required = UInt64(0)
        for i in urange(amounts.length):
            total_required = total_required + amounts[i].native

        assert payment_txn.amount >= total_required, "Insufficient funds"

        for i in urange(recipients.length):
            amt: UInt64 = amounts[i].native
            rcv: arc4.Address = recipients[i]
            if amt > UInt64(0):
                itxn.Payment(
                    receiver=rcv.native,
                    amount=amt,
                    note=b"Batch Payment",
                    fee=0,
                ).submit()
                arc4.emit(
                    "PaymentSent(address,address,uint64,uint64,byte[])",
                    arc4.Address(Txn.sender),
                    rcv,
                    arc4.UInt64(amt),
                    arc4.UInt64(Global.latest_timestamp),
                    arc4.DynamicBytes(b"batch"),
                )

        self.total_payments.value = self.total_payments.value + recipients.length
        self.total_volume.value = self.total_volume.value + total_required

        # Refund any excess
        excess = payment_txn.amount - total_required
        if excess > UInt64(0):
            itxn.Payment(
                receiver=Txn.sender,
                amount=excess,
                fee=0,
            ).submit()

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Read-only views
    # ------------------------------------------------------------------
    @abimethod(readonly=True)
    def get_total_payments(self) -> arc4.UInt64:
        return arc4.UInt64(self.total_payments.value)

    @abimethod(readonly=True)
    def get_total_volume(self) -> arc4.UInt64:
        """Returns total μALGO volume processed."""
        return arc4.UInt64(self.total_volume.value)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @subroutine
    def _make_payment_id(
        self,
        sender: Bytes,
        receiver: Bytes,
        amount: UInt64,
        timestamp: UInt64,
    ) -> Bytes:
        """Deterministic payment ID: sha256(sender | receiver | amount | timestamp | count)."""
        return op.sha256(
            sender
            + receiver
            + op.itob(amount)
            + op.itob(timestamp)
            + op.itob(self.total_payments.value)
        )
