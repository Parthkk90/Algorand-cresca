"""
Cresca Calendar Payments — Algorand Smart Contract (algopy / Puya)
==================================================================
Equivalent of CrescaCalendarPayments.sol — scheduled and recurring
payment automation.  Ported for the Algorand Hackathon.

Units: all amounts are in micro-ALGO (μALGO).

Key Algorand design notes:
- Algorand has no "anyone can call" cron — a keeper/bot must call
  execute_schedule() when a payment is due (same pattern as Solidity).
- Schedule state stored in AVM Boxes (keyed by payer_address + schedule_id).
- Escrow funds are held by the contract account.
- Max occurrences per schedule: 255 (fits arc4.UInt8) — increase to
  arc4.UInt64 if you need more.

Build & deploy:
    pip install algokit-utils algopy
    algokit compile python cresca_calendar_payments.py
    algokit deploy
"""

from algopy import (
    ARC4Contract,
    Box,
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
# On-chain data structures
# ---------------------------------------------------------------------------

class Schedule(arc4.Struct):
    payer: arc4.Address
    recipient: arc4.Address
    amount: arc4.UInt64          # μALGO per payment
    execute_at: arc4.UInt64      # Unix timestamp of first execution
    interval_seconds: arc4.UInt64  # 0 = one-time, >0 = recurring
    occurrences: arc4.UInt64     # total payments requested
    executed_count: arc4.UInt64  # how many already done
    active: arc4.Bool
    escrow_balance: arc4.UInt64  # μALGO still held in contract for this schedule
    created_at: arc4.UInt64


# Box key: payer_address (32 bytes) + schedule_id (8 bytes big-endian) = 40 bytes
@subroutine
def _schedule_key(payer: Bytes, schedule_id: UInt64) -> Bytes:
    return payer + op.itob(schedule_id)


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class CrescaCalendarPayments(ARC4Contract):
    """
    Scheduled and recurring payment contract on Algorand.

    State layout:
    - Global: total_schedules, total_executed, schedule_count_per_user (BoxMap)
    - Boxes:  one Box<Schedule> per (payer, schedule_id) pair
    """

    total_schedules: GlobalState[UInt64]
    total_executed: GlobalState[UInt64]

    # Maps payer_address -> number of schedules created (used for ID generation)
    schedule_counts: BoxMap[arc4.Address, arc4.UInt64]

    # Maps (payer_address + schedule_id bytes) -> Schedule struct
    schedules: BoxMap[Bytes, Schedule]

    def __init__(self) -> None:
        self.total_schedules = GlobalState(UInt64(0))
        self.total_executed = GlobalState(UInt64(0))
        self.schedule_counts = BoxMap(arc4.Address, arc4.UInt64, key_prefix=b"cnt_")
        self.schedules = BoxMap(Bytes, Schedule, key_prefix=b"sch_")

    # ------------------------------------------------------------------
    # create_schedule
    # ------------------------------------------------------------------
    @abimethod
    def create_schedule(
        self,
        payment_txn: gtxn.PaymentTransaction,
        recipient: arc4.Address,
        amount: arc4.UInt64,
        execute_at: arc4.UInt64,
        interval_seconds: arc4.UInt64,
        occurrences: arc4.UInt64,
    ) -> arc4.UInt64:
        """
        Create a one-time or recurring payment schedule.

        The caller must attach a PaymentTransaction covering
        amount * occurrences μALGO (plus the contract's min-balance bump
        for the new Box storage — handled separately via fund_contract()).

        Returns the new schedule_id.
        """
        assert amount.native > UInt64(0), "Amount must be > 0"
        assert execute_at.native > Global.latest_timestamp, "execute_at must be in future"
        assert occurrences.native > UInt64(0), "occurrences must be > 0"
        assert payment_txn.receiver == Global.current_application_address, "Payment must target contract"

        total_required: UInt64 = amount.native * occurrences.native
        assert payment_txn.amount >= total_required, "Insufficient escrow funds"

        # Determine schedule_id
        payer_addr = arc4.Address(Txn.sender)
        if payer_addr in self.schedule_counts:
            schedule_id = self.schedule_counts[payer_addr].native
        else:
            schedule_id = UInt64(0)

        # Store schedule in a Box
        schedule_key = _schedule_key(Txn.sender.bytes, schedule_id)
        self.schedules[schedule_key] = Schedule(
            payer=payer_addr,
            recipient=recipient,
            amount=amount,
            execute_at=execute_at,
            interval_seconds=interval_seconds,
            occurrences=occurrences,
            executed_count=arc4.UInt64(0),
            active=arc4.Bool(True),
            escrow_balance=arc4.UInt64(total_required),
            created_at=arc4.UInt64(Global.latest_timestamp),
        )

        # Increment user's schedule counter
        self.schedule_counts[payer_addr] = arc4.UInt64(schedule_id + UInt64(1))

        self.total_schedules.value = self.total_schedules.value + UInt64(1)

        # Refund any excess
        excess = payment_txn.amount - total_required
        if excess > UInt64(0):
            itxn.Payment(
                receiver=Txn.sender,
                amount=excess,
                fee=0,
            ).submit()

        arc4.emit(
            "ScheduleCreated(address,uint64,address,uint64,uint64,bool)",
            payer_addr,
            arc4.UInt64(schedule_id),
            recipient,
            amount,
            execute_at,
            arc4.Bool(interval_seconds.native > UInt64(0)),
        )

        return arc4.UInt64(schedule_id)

    # ------------------------------------------------------------------
    # create_one_time_payment  (convenience wrapper)
    # ------------------------------------------------------------------
    @abimethod
    def create_one_time_payment(
        self,
        payment_txn: gtxn.PaymentTransaction,
        recipient: arc4.Address,
        amount: arc4.UInt64,
        execute_at: arc4.UInt64,
    ) -> arc4.UInt64:
        """Convenience: schedule a single future payment."""
        return self.create_schedule(
            payment_txn,
            recipient,
            amount,
            execute_at,
            arc4.UInt64(0),   # interval = 0 → one-time
            arc4.UInt64(1),   # occurrences = 1
        )

    # ------------------------------------------------------------------
    # create_recurring_payment  (convenience wrapper)
    # ------------------------------------------------------------------
    @abimethod
    def create_recurring_payment(
        self,
        payment_txn: gtxn.PaymentTransaction,
        recipient: arc4.Address,
        amount: arc4.UInt64,
        first_execution_at: arc4.UInt64,
        interval_days: arc4.UInt64,
        occurrences: arc4.UInt64,
    ) -> arc4.UInt64:
        """Convenience: schedule a recurring payment every N days."""
        interval_seconds = arc4.UInt64(interval_days.native * UInt64(86400))
        return self.create_schedule(
            payment_txn,
            recipient,
            amount,
            first_execution_at,
            interval_seconds,
            occurrences,
        )

    # ------------------------------------------------------------------
    # execute_schedule
    # ------------------------------------------------------------------
    @abimethod
    def execute_schedule(
        self,
        payer: arc4.Address,
        schedule_id: arc4.UInt64,
    ) -> arc4.Bool:
        """
        Execute a due scheduled payment. Anyone can call this (keeper/bot pattern).

        Reverts if:
        - Schedule doesn't exist or is inactive.
        - Payment is not yet due.
        - Escrow is insufficient.
        """
        schedule_key = _schedule_key(payer.native.bytes, schedule_id.native)
        assert schedule_key in self.schedules, "Schedule not found"

        schedule = self.schedules[schedule_key].copy()

        assert schedule.active.native, "Schedule already completed/cancelled"
        assert schedule.executed_count.native < schedule.occurrences.native, "All payments done"

        # Calculate next execution time
        next_exec = schedule.execute_at.native + (
            schedule.executed_count.native * schedule.interval_seconds.native
        )
        assert Global.latest_timestamp >= next_exec, "Not yet executable"
        assert schedule.escrow_balance.native >= schedule.amount.native, "Insufficient escrow"

        # Deduct from escrow and increment count
        new_balance = schedule.escrow_balance.native - schedule.amount.native
        new_count = schedule.executed_count.native + UInt64(1)
        is_done = new_count >= schedule.occurrences.native

        self.schedules[schedule_key] = Schedule(
            payer=schedule.payer,
            recipient=schedule.recipient,
            amount=schedule.amount,
            execute_at=schedule.execute_at,
            interval_seconds=schedule.interval_seconds,
            occurrences=schedule.occurrences,
            executed_count=arc4.UInt64(new_count),
            active=arc4.Bool(not is_done),
            escrow_balance=arc4.UInt64(new_balance),
            created_at=schedule.created_at,
        )

        # Send payment to recipient
        itxn.Payment(
            receiver=schedule.recipient.native,
            amount=schedule.amount.native,
            fee=0,
        ).submit()

        arc4.emit(
            "PaymentExecuted(address,uint64,address,uint64,uint64)",
            schedule.payer,
            schedule_id,
            schedule.recipient,
            schedule.amount,
            arc4.UInt64(new_count),
        )

        if is_done:
            self.total_executed.value = self.total_executed.value + UInt64(1)
            arc4.emit(
                "ScheduleCompleted(address,uint64)",
                schedule.payer,
                schedule_id,
            )

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # cancel_schedule
    # ------------------------------------------------------------------
    @abimethod
    def cancel_schedule(self, schedule_id: arc4.UInt64) -> arc4.Bool:
        """
        Cancel a schedule and refund remaining escrow to the payer.
        Only the payer can cancel.
        """
        payer_addr = arc4.Address(Txn.sender)
        schedule_key = _schedule_key(Txn.sender.bytes, schedule_id.native)
        assert schedule_key in self.schedules, "Schedule not found"

        schedule = self.schedules[schedule_key].copy()

        assert schedule.payer == payer_addr, "Unauthorized"
        assert schedule.active.native, "Schedule already completed/cancelled"

        refund_amount = schedule.escrow_balance.native

        # Mark inactive with zero escrow
        self.schedules[schedule_key] = Schedule(
            payer=schedule.payer,
            recipient=schedule.recipient,
            amount=schedule.amount,
            execute_at=schedule.execute_at,
            interval_seconds=schedule.interval_seconds,
            occurrences=schedule.occurrences,
            executed_count=schedule.executed_count,
            active=arc4.Bool(False),
            escrow_balance=arc4.UInt64(0),
            created_at=schedule.created_at,
        )

        # Refund remaining escrow
        if refund_amount > UInt64(0):
            itxn.Payment(
                receiver=Txn.sender,
                amount=refund_amount,
                fee=0,
            ).submit()

        arc4.emit(
            "ScheduleCancelled(address,uint64,uint64)",
            payer_addr,
            schedule_id,
            arc4.UInt64(refund_amount),
        )

        return arc4.Bool(True)

    # ------------------------------------------------------------------
    # Read-only views
    # ------------------------------------------------------------------
    @abimethod(readonly=True)
    def is_executable(self, payer: arc4.Address, schedule_id: arc4.UInt64) -> arc4.Bool:
        """Check whether a schedule is currently executable."""
        schedule_key = _schedule_key(payer.native.bytes, schedule_id.native)
        if schedule_key not in self.schedules:
            return arc4.Bool(False)
        schedule = self.schedules[schedule_key].copy()
        if not schedule.active.native:
            return arc4.Bool(False)
        if schedule.executed_count.native >= schedule.occurrences.native:
            return arc4.Bool(False)
        next_exec = schedule.execute_at.native + (
            schedule.executed_count.native * schedule.interval_seconds.native
        )
        return arc4.Bool(Global.latest_timestamp >= next_exec)

    @abimethod(readonly=True)
    def get_next_execution_time(
        self, payer: arc4.Address, schedule_id: arc4.UInt64
    ) -> arc4.UInt64:
        """Returns the Unix timestamp of the next due execution (0 if inactive)."""
        schedule_key = _schedule_key(payer.native.bytes, schedule_id.native)
        if schedule_key not in self.schedules:
            return arc4.UInt64(0)
        schedule = self.schedules[schedule_key].copy()
        if not schedule.active.native or schedule.executed_count.native >= schedule.occurrences.native:
            return arc4.UInt64(0)
        return arc4.UInt64(
            schedule.execute_at.native
            + schedule.executed_count.native * schedule.interval_seconds.native
        )

    @abimethod(readonly=True)
    def get_total_schedules(self) -> arc4.UInt64:
        return arc4.UInt64(self.total_schedules.value)

    @abimethod(readonly=True)
    def get_total_executed(self) -> arc4.UInt64:
        return arc4.UInt64(self.total_executed.value)

    @abimethod(readonly=True)
    def get_user_schedule_count(self, user: arc4.Address) -> arc4.UInt64:
        if user in self.schedule_counts:
            return self.schedule_counts[user]
        return arc4.UInt64(0)

    # ------------------------------------------------------------------
    # fund_contract
    # ------------------------------------------------------------------
    @abimethod
    def fund_contract(self, payment_txn: gtxn.PaymentTransaction) -> arc4.Bool:
        """
        Increase the contract's minimum balance to cover Box storage costs.
        Each Schedule Box costs ~0.0025 ALGO + byte-based fees.
        Call this before creating schedules if the contract is underfunded.
        """
        assert payment_txn.receiver == Global.current_application_address, "Must send to contract"
        assert payment_txn.amount > UInt64(0), "Amount must be > 0"
        return arc4.Bool(True)
