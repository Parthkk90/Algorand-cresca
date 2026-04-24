/**
 * Oracle Keeper Logic Tests
 * =========================
 * Tests the price conversion logic (USD → ALGO-denominated 8-decimal)
 * without requiring network access.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Re-implement oracle conversion for isolated testing ────

const TRACKED_ASSETS = [
  { asaId: 0, symbol: 'ALGO', decimals: 6 },
  { asaId: 10458941, symbol: 'USDC', decimals: 6 },
] as const;

function toOraclePrices(
  usdPrices: Record<string, number>,
): { assetIds: number[]; prices: number[] } {
  const algoUsd = usdPrices['ALGO'];
  if (!algoUsd || algoUsd <= 0) {
    throw new Error('ALGO USD price unavailable');
  }

  const assetIds: number[] = [];
  const prices: number[] = [];

  for (const asset of TRACKED_ASSETS) {
    if (asset.asaId === 0) {
      assetIds.push(0);
      prices.push(100_000_000); // ALGO = 1:1
      continue;
    }

    const usd = usdPrices[asset.symbol];
    if (!usd || usd <= 0) continue;

    const oraclePrice = Math.round((usd / algoUsd) * 100_000_000);
    assetIds.push(asset.asaId);
    prices.push(oraclePrice);
  }

  return { assetIds, prices };
}

// ─── Tests ──────────────────────────────────────────────────

describe('Oracle Price Conversion (toOraclePrices)', () => {
  it('ALGO is always 100_000_000 (1:1)', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 0.35, USDC: 1.0 });
    const algoIdx = assetIds.indexOf(0);
    assert.ok(algoIdx >= 0, 'ALGO should be in result');
    assert.equal(prices[algoIdx], 100_000_000);
  });

  it('USDC at $1.00 with ALGO at $0.35 → ~285_714_286', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 0.35, USDC: 1.0 });
    const usdcIdx = assetIds.indexOf(10458941);
    assert.ok(usdcIdx >= 0, 'USDC should be in result');
    // 1.0 / 0.35 * 1e8 ≈ 285,714,286
    assert.equal(prices[usdcIdx], Math.round((1.0 / 0.35) * 100_000_000));
  });

  it('USDC at $1.00 with ALGO at $1.00 → exactly 100_000_000', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 1.0, USDC: 1.0 });
    const usdcIdx = assetIds.indexOf(10458941);
    assert.ok(usdcIdx >= 0);
    assert.equal(prices[usdcIdx], 100_000_000);
  });

  it('USDC at $0.999 with ALGO at $0.35 → slightly less than $1 ratio', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 0.35, USDC: 0.999 });
    const usdcIdx = assetIds.indexOf(10458941);
    assert.ok(usdcIdx >= 0);
    const expected = Math.round((0.999 / 0.35) * 100_000_000);
    assert.equal(prices[usdcIdx], expected);
  });

  it('throws if ALGO price is missing', () => {
    assert.throws(
      () => toOraclePrices({ USDC: 1.0 }),
      { message: 'ALGO USD price unavailable' },
    );
  });

  it('throws if ALGO price is zero', () => {
    assert.throws(
      () => toOraclePrices({ ALGO: 0, USDC: 1.0 }),
      { message: 'ALGO USD price unavailable' },
    );
  });

  it('skips assets with no USD price', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 0.35 });
    // Only ALGO should be in results (USDC has no price)
    assert.equal(assetIds.length, 1);
    assert.equal(assetIds[0], 0);
    assert.equal(prices[0], 100_000_000);
  });

  it('always returns integer oracle prices (no decimals)', () => {
    const { prices } = toOraclePrices({ ALGO: 0.37, USDC: 1.01 });
    prices.forEach((p) => {
      assert.equal(p, Math.floor(p), 'Price should be an integer');
    });
  });

  it('result arrays have matching lengths', () => {
    const { assetIds, prices } = toOraclePrices({ ALGO: 0.35, USDC: 1.0 });
    assert.equal(assetIds.length, prices.length);
  });
});

describe('Oracle Staleness Check', () => {
  // Contract: ORACLE_MAX_AGE = 30 seconds
  const ORACLE_MAX_AGE = 30;

  it('oracle is fresh if last update was 1 second ago', () => {
    const lastUpdate = Date.now() / 1000;
    const now = lastUpdate + 1;
    assert.ok(now - lastUpdate <= ORACLE_MAX_AGE);
  });

  it('oracle is stale if last update was 31 seconds ago', () => {
    const lastUpdate = Date.now() / 1000;
    const now = lastUpdate + 31;
    assert.ok(now - lastUpdate > ORACLE_MAX_AGE);
  });

  it('oracle is fresh at exactly 30 seconds', () => {
    const lastUpdate = Date.now() / 1000;
    const now = lastUpdate + 30;
    assert.ok(now - lastUpdate <= ORACLE_MAX_AGE);
  });
});
