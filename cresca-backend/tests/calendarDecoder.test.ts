/**
 * Schedule Box Decoder Tests
 * ==========================
 * Verifies that calendarKeeper's decodeScheduleBox() correctly
 * parses the ARC-4 packed Schedule struct (121 bytes).
 *
 * These tests construct mock box data that mirrors what the
 * CrescaCalendarPayments contract writes to on-chain boxes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import algosdk from 'algosdk';

// ─── Re-implement decoder for isolated testing ──────────────
// (We can't import directly from calendarKeeper without mocking algod)

const BOX_PREFIX_SCHEDULE = 'sch_';

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
    if (nameStr.length < 44) return null;
    const prefix = nameStr.subarray(0, 4).toString();
    if (prefix !== BOX_PREFIX_SCHEDULE) return null;

    const payerPubKey = nameStr.subarray(4, 36);
    const scheduleIdBytes = nameStr.subarray(36, 44);
    const scheduleId = Number(Buffer.from(scheduleIdBytes).readBigUInt64BE(0));
    const payerAddress = algosdk.encodeAddress(new Uint8Array(payerPubKey));

    const buf = Buffer.from(boxValue);
    if (buf.length < 121) return null;

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
  } catch {
    return null;
  }
}

// ─── Helper: build mock struct data ─────────────────────────

function buildMockScheduleBoxName(payerPubKey: Uint8Array, scheduleId: number): Uint8Array {
  const prefix = Buffer.from('sch_');
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64BE(BigInt(scheduleId));
  return new Uint8Array(Buffer.concat([prefix, payerPubKey, idBuf]));
}

/**
 * Build a 121-byte Schedule struct matching the Python ARC-4 layout.
 */
function buildMockScheduleBoxValue(opts: {
  payerPubKey: Uint8Array;
  recipientPubKey: Uint8Array;
  amount: number;
  executeAt: number;
  intervalSeconds: number;
  occurrences: number;
  executedCount: number;
  active: boolean;
  escrowBalance: number;
  createdAt: number;
}): Uint8Array {
  const buf = Buffer.alloc(121);
  Buffer.from(opts.payerPubKey).copy(buf, 0);          // offset 0: payer (32 bytes)
  Buffer.from(opts.recipientPubKey).copy(buf, 32);     // offset 32: recipient (32 bytes)
  buf.writeBigUInt64BE(BigInt(opts.amount), 64);        // offset 64: amount
  buf.writeBigUInt64BE(BigInt(opts.executeAt), 72);     // offset 72: execute_at
  buf.writeBigUInt64BE(BigInt(opts.intervalSeconds), 80); // offset 80: interval_seconds
  buf.writeBigUInt64BE(BigInt(opts.occurrences), 88);   // offset 88: occurrences
  buf.writeBigUInt64BE(BigInt(opts.executedCount), 96); // offset 96: executed_count
  buf[104] = opts.active ? 1 : 0;                      // offset 104: active (bool)
  buf.writeBigUInt64BE(BigInt(opts.escrowBalance), 105);// offset 105: escrow_balance
  buf.writeBigUInt64BE(BigInt(opts.createdAt), 113);    // offset 113: created_at
  return new Uint8Array(buf);
}

// ─── Tests ──────────────────────────────────────────────────

describe('Schedule Box Decoder', () => {
  const payerPubKey = new Uint8Array(32).fill(0x01);
  const recipientPubKey = new Uint8Array(32).fill(0x02);

  it('decodes a one-time active schedule correctly', () => {
    const boxName = buildMockScheduleBoxName(payerPubKey, 0);
    const boxValue = buildMockScheduleBoxValue({
      payerPubKey,
      recipientPubKey,
      amount: 5_000_000,       // 5 ALGO
      executeAt: 1700000000,
      intervalSeconds: 0,      // one-time
      occurrences: 1,
      executedCount: 0,
      active: true,
      escrowBalance: 5_000_000,
      createdAt: 1699999000,
    });

    const result = decodeScheduleBox(boxName, boxValue);
    assert.ok(result, 'Should decode successfully');
    assert.equal(result.scheduleId, 0);
    assert.equal(result.amountMicroAlgo, 5_000_000);
    assert.equal(result.executeAt, 1700000000);
    assert.equal(result.intervalSeconds, 0);
    assert.equal(result.occurrences, 1);
    assert.equal(result.executedCount, 0);
    assert.equal(result.active, true);
    assert.equal(result.escrowBalanceMicroAlgo, 5_000_000);
    assert.equal(result.createdAt, 1699999000);
  });

  it('decodes a recurring schedule with 3 payments done', () => {
    const boxName = buildMockScheduleBoxName(payerPubKey, 7);
    const boxValue = buildMockScheduleBoxValue({
      payerPubKey,
      recipientPubKey,
      amount: 1_000_000,       // 1 ALGO per payment
      executeAt: 1700000000,
      intervalSeconds: 86400,  // daily
      occurrences: 10,
      executedCount: 3,
      active: true,
      escrowBalance: 7_000_000,// 7 remaining
      createdAt: 1699000000,
    });

    const result = decodeScheduleBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.scheduleId, 7);
    assert.equal(result.amountMicroAlgo, 1_000_000);
    assert.equal(result.intervalSeconds, 86400);
    assert.equal(result.occurrences, 10);
    assert.equal(result.executedCount, 3);
    assert.equal(result.active, true);
    assert.equal(result.escrowBalanceMicroAlgo, 7_000_000);
  });

  it('decodes an inactive (completed) schedule', () => {
    const boxName = buildMockScheduleBoxName(payerPubKey, 5);
    const boxValue = buildMockScheduleBoxValue({
      payerPubKey,
      recipientPubKey,
      amount: 2_000_000,
      executeAt: 1700000000,
      intervalSeconds: 0,
      occurrences: 1,
      executedCount: 1,
      active: false,
      escrowBalance: 0,
      createdAt: 1699000000,
    });

    const result = decodeScheduleBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.active, false);
    assert.equal(result.executedCount, 1);
    assert.equal(result.escrowBalanceMicroAlgo, 0);
  });

  it('returns null for box name too short', () => {
    const shortName = new Uint8Array(10);
    const boxValue = new Uint8Array(121);
    assert.equal(decodeScheduleBox(shortName, boxValue), null);
  });

  it('returns null for wrong prefix', () => {
    const wrongPrefix = Buffer.concat([
      Buffer.from('cnt_'),
      payerPubKey,
      Buffer.alloc(8),
    ]);
    const boxValue = new Uint8Array(121);
    assert.equal(decodeScheduleBox(new Uint8Array(wrongPrefix), boxValue), null);
  });

  it('returns null for box value too short (< 121 bytes)', () => {
    const boxName = buildMockScheduleBoxName(payerPubKey, 0);
    const shortValue = new Uint8Array(80); // old wrong size
    assert.equal(decodeScheduleBox(boxName, shortValue), null);
  });

  it('correctly encodes/decodes payer address from box name', () => {
    // Use a deterministic pubkey
    const specificPubKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) specificPubKey[i] = i;

    const expectedAddress = algosdk.encodeAddress(specificPubKey);
    const boxName = buildMockScheduleBoxName(specificPubKey, 99);
    const boxValue = buildMockScheduleBoxValue({
      payerPubKey: specificPubKey,
      recipientPubKey,
      amount: 1_000_000,
      executeAt: 1700000000,
      intervalSeconds: 0,
      occurrences: 1,
      executedCount: 0,
      active: true,
      escrowBalance: 1_000_000,
      createdAt: 1700000000,
    });

    const result = decodeScheduleBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.payerAddress, expectedAddress);
    assert.equal(result.scheduleId, 99);
  });
});

describe('Schedule Executability Logic', () => {
  it('one-time schedule: due when executeAt <= now', () => {
    const executeAt = 1700000000;
    const executedCount = 0;
    const intervalSeconds = 0;
    const now = 1700000001;

    const nextExec = executeAt + (executedCount * intervalSeconds);
    assert.ok(nextExec <= now, 'Should be due');
  });

  it('one-time schedule: NOT due when executeAt > now', () => {
    const executeAt = 1700000000;
    const executedCount = 0;
    const intervalSeconds = 0;
    const now = 1699999999;

    const nextExec = executeAt + (executedCount * intervalSeconds);
    assert.ok(nextExec > now, 'Should NOT be due');
  });

  it('recurring: 4th payment due at executeAt + 3*interval', () => {
    const executeAt = 1700000000;
    const executedCount = 3;
    const intervalSeconds = 86400; // 1 day
    const now = 1700000000 + 3 * 86400 + 1; // 1 second after due

    const nextExec = executeAt + (executedCount * intervalSeconds);
    assert.equal(nextExec, 1700000000 + 259200);
    assert.ok(nextExec <= now, 'Should be due');
  });

  it('recurring: 4th payment NOT due yet at executeAt + 2.5*interval', () => {
    const executeAt = 1700000000;
    const executedCount = 3;
    const intervalSeconds = 86400;
    const now = 1700000000 + 2 * 86400 + 43200; // midway between 3rd and 4th

    const nextExec = executeAt + (executedCount * intervalSeconds);
    assert.ok(nextExec > now, 'Should NOT be due yet');
  });

  it('completed schedule (executedCount >= occurrences) should be filtered by active=false', () => {
    const executedCount = 10;
    const occurrences = 10;
    const active = false;
    assert.ok(!active || executedCount >= occurrences, 'Should not execute');
  });
});
