/**
 * Calendar Keeper
 * ===============
 * Polls CrescaCalendarPayments contract for due schedules and executes them.
 *
 * Flow:
 *   1. List all box names for the CalendarPayments app
 *   2. Filter for schedule boxes (prefix 'sch_')
 *   3. Read each box → decode schedule data
 *   4. If schedule.active && schedule.executeAt <= now → execute_schedule()
 *   5. Log execution + trigger push notification
 */

import { AtomicTransactionComposer, ABIMethod } from 'algosdk';
import { getAlgod, getKeeperAccount, algosdk } from './algorand.js';
import {
  CONTRACT_APP_IDS,
  CALENDAR_METHODS,
  BOX_PREFIXES,
  buildBoxKey,
  uint64ToBytes,
} from '../shared/contracts.js';
import { logger } from '../shared/logger.js';
import { logKeeperExecution } from '../shared/supabase.js';

const APP_ID = CONTRACT_APP_IDS.CrescaCalendarPayments;

/**
 * Decoded schedule from box storage.
 *
 * Matches the ARC-4 packed `Schedule` struct in cresca_calendar_payments.py:
 *
 *   OFFSET  FIELD              SIZE
 *   0       payer              32 bytes (arc4.Address)
 *   32      recipient          32 bytes (arc4.Address)
 *   64      amount              8 bytes (arc4.UInt64, μALGO)
 *   72      execute_at          8 bytes (arc4.UInt64, Unix seconds)
 *   80      interval_seconds    8 bytes (arc4.UInt64, seconds; 0 = one-time)
 *   88      occurrences         8 bytes (arc4.UInt64)
 *   96      executed_count      8 bytes (arc4.UInt64)
 *   104     active              1 byte  (arc4.Bool)
 *   105     escrow_balance      8 bytes (arc4.UInt64, μALGO remaining)
 *   113     created_at          8 bytes (arc4.UInt64)
 *   TOTAL                     121 bytes
 */
interface DecodedSchedule {
  payerAddress: string;
  scheduleId: number;
  recipientAddress: string;
  amountMicroAlgo: number;
  executeAt: number;
  intervalSeconds: number;
  occurrences: number;
  executedCount: number;
  active: boolean;
  escrowBalanceMicroAlgo: number;
  createdAt: number;
}

function decodeScheduleBox(
  boxName: Uint8Array,
  boxValue: Uint8Array,
): DecodedSchedule | null {
  try {
    const nameStr = Buffer.from(boxName);

    // Box name: 'sch_' (4 bytes) + payer pubkey (32 bytes) + schedule_id (8 bytes)
    if (nameStr.length < 44) return null;
    const prefix = nameStr.subarray(0, 4).toString();
    if (prefix !== BOX_PREFIXES.SCHEDULE) return null;

    const payerPubKey = nameStr.subarray(4, 36);
    const scheduleIdBytes = nameStr.subarray(36, 44);
    const scheduleId = Number(Buffer.from(scheduleIdBytes).readBigUInt64BE(0));
    const payerAddress = algosdk.encodeAddress(new Uint8Array(payerPubKey));

    // Decode box value — 121 bytes matching the Schedule ARC-4 struct
    const buf = Buffer.from(boxValue);
    if (buf.length < 121) return null;

    // payer is at offset 0-31 (redundant — already in box name, but part of struct)
    const recipientPubKey = buf.subarray(32, 64);
    const recipientAddress = algosdk.encodeAddress(new Uint8Array(recipientPubKey));
    const amountMicroAlgo = Number(buf.readBigUInt64BE(64));
    const executeAt = Number(buf.readBigUInt64BE(72));
    const intervalSeconds = Number(buf.readBigUInt64BE(80));
    const occurrences = Number(buf.readBigUInt64BE(88));
    const executedCount = Number(buf.readBigUInt64BE(96));
    const active = buf[104] === 1;
    const escrowBalanceMicroAlgo = Number(buf.readBigUInt64BE(105));
    const createdAt = Number(buf.readBigUInt64BE(113));

    return {
      payerAddress,
      scheduleId,
      recipientAddress,
      amountMicroAlgo,
      executeAt,
      intervalSeconds,
      occurrences,
      executedCount,
      active,
      escrowBalanceMicroAlgo,
      createdAt,
    };
  } catch (err) {
    logger.debug('Failed to decode schedule box', err);
    return null;
  }
}

async function executeSchedule(schedule: DecodedSchedule): Promise<string | null> {
  const algod = getAlgod();
  const keeper = getKeeperAccount();

  const payerPubKey = algosdk.decodeAddress(schedule.payerAddress).publicKey;
  const counterBox = buildBoxKey(BOX_PREFIXES.SCHEDULE_COUNT, new Uint8Array(payerPubKey));
  const scheduleBox = buildBoxKey(
    BOX_PREFIXES.SCHEDULE,
    new Uint8Array(payerPubKey),
    uint64ToBytes(schedule.scheduleId),
  );

  const sp = await algod.getTransactionParams().do();
  const atc = new AtomicTransactionComposer();

  atc.addMethodCall({
    appID: APP_ID,
    method: ABIMethod.fromSignature(CALENDAR_METHODS.execute_schedule),
    methodArgs: [schedule.payerAddress, schedule.scheduleId],
    sender: keeper.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(keeper),
    suggestedParams: { ...sp, fee: 3000, flatFee: true },
    appAccounts: [schedule.payerAddress, schedule.recipientAddress],
    boxes: [
      { appIndex: APP_ID, name: counterBox },
      { appIndex: APP_ID, name: scheduleBox },
    ],
  });

  try {
    const result = await atc.execute(algod, 4);
    const txId = result.txIDs[result.txIDs.length - 1];
    return txId;
  } catch (err) {
    logger.error(`Failed to execute schedule #${schedule.scheduleId}`, err);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────

export async function runCalendarCycle(): Promise<void> {
  const algod = getAlgod();
  const now = Math.floor(Date.now() / 1000);

  try {
    // 1. List all boxes for the CalendarPayments app
    const boxesResp = await algod.getApplicationBoxes(APP_ID).do() as { boxes?: Array<{ name: Uint8Array | string }> };
    const boxes = boxesResp.boxes ?? [];

    if (boxes.length === 0) {
      logger.debug('Calendar keeper: no boxes found');
      return;
    }

    // 2. Filter schedule boxes and read their data
    let executed = 0;

    for (const box of boxes) {
      const nameBytes = typeof box.name === 'string'
        ? new Uint8Array(Buffer.from(box.name, 'base64'))
        : new Uint8Array(box.name);

      // Only process schedule boxes (prefix 'sch_')
      const prefix = Buffer.from(nameBytes.subarray(0, 4)).toString();
      if (prefix !== BOX_PREFIXES.SCHEDULE) continue;

      // Read box value
      let boxData: { value: Uint8Array | string };
      try {
        boxData = await algod.getApplicationBoxByName(APP_ID, nameBytes).do() as any;
      } catch {
        continue;
      }

      const valueBytes = typeof boxData.value === 'string'
        ? new Uint8Array(Buffer.from(boxData.value, 'base64'))
        : new Uint8Array(boxData.value);

      const schedule = decodeScheduleBox(nameBytes, valueBytes);
      if (!schedule) continue;

      // 3. Check if due — matches contract logic:
      //    next_exec = execute_at + (executed_count * interval_seconds)
      if (!schedule.active) continue;
      const nextExec = schedule.executeAt + (schedule.executedCount * schedule.intervalSeconds);
      if (nextExec > now) continue;

      // 4. Execute!
      logger.keeper(
        'Executing schedule',
        undefined,
        {
          scheduleId: schedule.scheduleId,
          payer: schedule.payerAddress.slice(0, 8),
          recipient: schedule.recipientAddress.slice(0, 8),
          amount: (schedule.amountMicroAlgo / 1_000_000).toFixed(6),
        },
      );

      const txId = await executeSchedule(schedule);
      if (txId) {
        executed++;
        logger.keeper('Schedule executed', txId, { scheduleId: schedule.scheduleId });

        await logKeeperExecution({
          action_type: 'calendar_execute',
          tx_id: txId,
          details: {
            scheduleId: schedule.scheduleId,
            payer: schedule.payerAddress,
            recipient: schedule.recipientAddress,
            amountMicroAlgo: schedule.amountMicroAlgo,
          },
        });

        // TODO (Phase 3): trigger push notification to payer
      }
    }

    if (executed > 0) {
      logger.info(`Calendar keeper: executed ${executed} schedule(s)`);
    } else {
      logger.debug('Calendar keeper: no due schedules');
    }
  } catch (err) {
    logger.error('Calendar keeper cycle failed', err);
  }
}
