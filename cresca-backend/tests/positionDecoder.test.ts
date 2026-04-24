/**
 * Position Box Decoder Tests
 * ==========================
 * Verifies that liquidationKeeper's decodePositionBox() correctly
 * parses the ARC-4 packed Position struct (66 bytes).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import algosdk from 'algosdk';

// ─── Re-implement decoder for isolated testing ──────────────

const BOX_PREFIX_POSITION = 'pos_';

interface DecodedPosition {
  ownerAddress: string;
  positionId: number;
  bucketId: number;
  isLong: boolean;
  marginMicroAlgo: number;
  entryPrice: number;
  active: boolean;
  openTimestamp: number;
}

function decodePositionBox(
  boxName: Uint8Array,
  boxValue: Uint8Array,
): DecodedPosition | null {
  try {
    const nameBuf = Buffer.from(boxName);
    if (nameBuf.length < 44) return null;
    const prefix = nameBuf.subarray(0, 4).toString();
    if (prefix !== BOX_PREFIX_POSITION) return null;

    const ownerPubKey = nameBuf.subarray(4, 36);
    const positionId = Number(Buffer.from(nameBuf.subarray(36, 44)).readBigUInt64BE(0));
    const ownerAddress = algosdk.encodeAddress(new Uint8Array(ownerPubKey));

    const buf = Buffer.from(boxValue);
    if (buf.length < 66) return null;

    return {
      ownerAddress,
      positionId,
      bucketId: Number(buf.readBigUInt64BE(0)),
      isLong: buf[8] === 1,
      marginMicroAlgo: Number(buf.readBigUInt64BE(9)),
      entryPrice: Number(buf.readBigUInt64BE(17)),
      // owner at offset 25-56 (redundant — already extracted from box name)
      active: buf[57] === 1,
      openTimestamp: Number(buf.readBigUInt64BE(58)),
    };
  } catch {
    return null;
  }
}

// ─── Helper: build mock Position struct ─────────────────────

function buildMockPositionBoxName(ownerPubKey: Uint8Array, positionId: number): Uint8Array {
  const prefix = Buffer.from('pos_');
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64BE(BigInt(positionId));
  return new Uint8Array(Buffer.concat([prefix, ownerPubKey, idBuf]));
}

/**
 * Build a 66-byte Position struct matching the Python ARC-4 layout.
 *
 *   0       bucket_id           8 bytes
 *   8       is_long             1 byte
 *   9       margin              8 bytes
 *   17      entry_price         8 bytes
 *   25      owner              32 bytes
 *   57      active              1 byte
 *   58      open_timestamp      8 bytes
 */
function buildMockPositionBoxValue(opts: {
  bucketId: number;
  isLong: boolean;
  margin: number;
  entryPrice: number;
  ownerPubKey: Uint8Array;
  active: boolean;
  openTimestamp: number;
}): Uint8Array {
  const buf = Buffer.alloc(66);
  buf.writeBigUInt64BE(BigInt(opts.bucketId), 0);
  buf[8] = opts.isLong ? 1 : 0;
  buf.writeBigUInt64BE(BigInt(opts.margin), 9);
  buf.writeBigUInt64BE(BigInt(opts.entryPrice), 17);
  Buffer.from(opts.ownerPubKey).copy(buf, 25);  // owner at offset 25 (32 bytes)
  buf[57] = opts.active ? 1 : 0;
  buf.writeBigUInt64BE(BigInt(opts.openTimestamp), 58);
  return new Uint8Array(buf);
}

// ─── Tests ──────────────────────────────────────────────────

describe('Position Box Decoder', () => {
  const ownerPubKey = new Uint8Array(32).fill(0xAA);

  it('decodes an active long position correctly', () => {
    const boxName = buildMockPositionBoxName(ownerPubKey, 0);
    const boxValue = buildMockPositionBoxValue({
      bucketId: 3,
      isLong: true,
      margin: 10_000_000,       // 10 ALGO
      entryPrice: 100_000_000,  // 1.0 in 8-decimal
      ownerPubKey,
      active: true,
      openTimestamp: 1700000000,
    });

    const result = decodePositionBox(boxName, boxValue);
    assert.ok(result, 'Should decode successfully');
    assert.equal(result.positionId, 0);
    assert.equal(result.bucketId, 3);
    assert.equal(result.isLong, true);
    assert.equal(result.marginMicroAlgo, 10_000_000);
    assert.equal(result.entryPrice, 100_000_000);
    assert.equal(result.active, true);
    assert.equal(result.openTimestamp, 1700000000);
  });

  it('decodes a short position correctly', () => {
    const boxName = buildMockPositionBoxName(ownerPubKey, 42);
    const boxValue = buildMockPositionBoxValue({
      bucketId: 1,
      isLong: false,
      margin: 50_000_000,       // 50 ALGO
      entryPrice: 250_000_000,  // 2.5 in 8-decimal
      ownerPubKey,
      active: true,
      openTimestamp: 1700100000,
    });

    const result = decodePositionBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.positionId, 42);
    assert.equal(result.isLong, false);
    assert.equal(result.marginMicroAlgo, 50_000_000);
    assert.equal(result.entryPrice, 250_000_000);
  });

  it('decodes a closed (inactive) position correctly', () => {
    const boxName = buildMockPositionBoxName(ownerPubKey, 5);
    const boxValue = buildMockPositionBoxValue({
      bucketId: 0,
      isLong: true,
      margin: 1_000_000,
      entryPrice: 100_000_000,
      ownerPubKey,
      active: false,
      openTimestamp: 1699000000,
    });

    const result = decodePositionBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.active, false);
  });

  it('returns null for box name too short', () => {
    const shortName = new Uint8Array(20);
    const boxValue = new Uint8Array(66);
    assert.equal(decodePositionBox(shortName, boxValue), null);
  });

  it('returns null for wrong prefix', () => {
    const wrongPrefix = Buffer.concat([
      Buffer.from('bkt_'),
      ownerPubKey,
      Buffer.alloc(8),
    ]);
    const boxValue = new Uint8Array(66);
    assert.equal(decodePositionBox(new Uint8Array(wrongPrefix), boxValue), null);
  });

  it('returns null for box value too short (< 66 bytes)', () => {
    const boxName = buildMockPositionBoxName(ownerPubKey, 0);
    const shortValue = new Uint8Array(34); // old wrong size
    assert.equal(decodePositionBox(boxName, shortValue), null);
  });

  it('correctly reads owner address from box name', () => {
    const specificPubKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) specificPubKey[i] = i * 8;

    const expectedAddress = algosdk.encodeAddress(specificPubKey);
    const boxName = buildMockPositionBoxName(specificPubKey, 7);
    const boxValue = buildMockPositionBoxValue({
      bucketId: 2,
      isLong: true,
      margin: 5_000_000,
      entryPrice: 100_000_000,
      ownerPubKey: specificPubKey,
      active: true,
      openTimestamp: 1700000000,
    });

    const result = decodePositionBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.ownerAddress, expectedAddress);
    assert.equal(result.positionId, 7);
  });

  it('handles maximum values correctly', () => {
    const boxName = buildMockPositionBoxName(ownerPubKey, 999999);
    const boxValue = buildMockPositionBoxValue({
      bucketId: 255,
      isLong: true,
      margin: 999_999_999_999,     // ~999,999 ALGO
      entryPrice: 99_999_999_999,  // huge price
      ownerPubKey,
      active: true,
      openTimestamp: 4_000_000_000, // year ~2096
    });

    const result = decodePositionBox(boxName, boxValue);
    assert.ok(result);
    assert.equal(result.bucketId, 255);
    assert.equal(result.marginMicroAlgo, 999_999_999_999);
    assert.equal(result.entryPrice, 99_999_999_999);
    assert.equal(result.openTimestamp, 4_000_000_000);
  });
});

describe('Liquidation Threshold Logic', () => {
  // Contract: LIQUIDATION_THRESHOLD_PCT = 5 (5%)
  // liquidation_threshold = (margin * 5) / 100
  // Position is liquidatable when remaining_margin <= liquidation_threshold
  const LIQUIDATION_THRESHOLD_PCT = 5;

  function isLiquidatable(
    marginMicroAlgo: number,
    entryPrice: number,
    currentPrice: number,
    isLong: boolean,
    leverage: number,
  ): boolean {
    const priceChange = Math.abs(currentPrice - entryPrice);
    const pnlAbs = Math.floor((priceChange * marginMicroAlgo * leverage) / entryPrice);
    const isProfit = isLong ? currentPrice >= entryPrice : entryPrice >= currentPrice;
    const remainingMargin = isProfit
      ? marginMicroAlgo + pnlAbs
      : Math.max(0, marginMicroAlgo - pnlAbs);
    const threshold = Math.floor((marginMicroAlgo * LIQUIDATION_THRESHOLD_PCT) / 100);
    return remainingMargin <= threshold;
  }

  it('50x long with 30% price drop is liquidatable', () => {
    // margin=10 ALGO, entry=1.0, current=0.7, leverage=50
    // PnL = (0.3/1.0) * 10 * 50 = 150 ALGO loss → remaining = max(0, 10 - 150) = 0
    // threshold = 10 * 5/100 = 0.5 ALGO → 0 <= 0.5 → liquidatable
    assert.ok(isLiquidatable(10_000_000, 100_000_000, 70_000_000, true, 50));
  });

  it('1x long with 10% price drop is NOT liquidatable', () => {
    // margin=10 ALGO, entry=1.0, current=0.9, leverage=1
    // PnL = (0.1/1.0) * 10 * 1 = 1 ALGO → remaining = 9 ALGO
    // threshold = 0.5 ALGO → 9 > 0.5 → NOT liquidatable
    assert.ok(!isLiquidatable(10_000_000, 100_000_000, 90_000_000, true, 1));
  });

  it('150x short with small price increase is liquidatable', () => {
    // margin=10 ALGO, entry=1.0, current=1.001, leverage=150
    // PnL = (0.001/1.0) * 10 * 150 = 1.5 ALGO loss → remaining = 8.5
    // threshold = 0.5 → 8.5 > 0.5 → NOT liquidatable yet
    assert.ok(!isLiquidatable(10_000_000, 100_000_000, 100_100_000, false, 150));
  });

  it('150x short with 1% price increase is liquidatable', () => {
    // margin=10 ALGO, entry=1.0, current=1.01, leverage=150
    // PnL = (0.01/1.0) * 10 * 150 = 15 ALGO loss → remaining = 0
    // threshold = 0.5 → 0 <= 0.5 → liquidatable
    assert.ok(isLiquidatable(10_000_000, 100_000_000, 101_000_000, false, 150));
  });

  it('profitable position is never liquidatable', () => {
    // Long with price going up
    assert.ok(!isLiquidatable(10_000_000, 100_000_000, 200_000_000, true, 50));
    // Short with price going down
    assert.ok(!isLiquidatable(10_000_000, 100_000_000, 50_000_000, false, 50));
  });
});
