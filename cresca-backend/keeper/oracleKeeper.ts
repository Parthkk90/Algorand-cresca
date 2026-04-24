/**
 * Oracle Keeper
 * =============
 * Fetches live prices from Pyth Hermes API and pushes them
 * to CrescaBucketProtocol.update_oracle() on-chain.
 *
 * The contract enforces a 30-second staleness window —
 * if the keeper misses 2 cycles, position opens/closes are blocked.
 */

import { AtomicTransactionComposer, ABIMethod } from 'algosdk';
import { getAlgod, getKeeperAccount, algosdk, MICROALGO_PER_ALGO } from './algorand.js';
import {
  CONTRACT_APP_IDS,
  BUCKET_METHODS,
  BOX_PREFIXES,
  buildBoxKey,
  uint64ToBytes,
  PYTH_PRICE_FEEDS,
  TRACKED_ASSETS,
} from '../shared/contracts.js';
import { logger } from '../shared/logger.js';
import { logKeeperExecution, storePriceSnapshots } from '../shared/supabase.js';

const APP_ID = CONTRACT_APP_IDS.CrescaBucketProtocol;
const HERMES_BASE = 'https://hermes.pyth.network';

// CoinGecko fallback mapping
const COINGECKO_IDS: Record<string, string> = {
  ALGO: 'algorand',
  USDC: 'usd-coin',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

// Known symbols that fail on Hermes — go directly to CoinGecko
const FORCE_FALLBACK = new Set(['ALGO']);

interface PythParsedPrice {
  id?: string;
  price: {
    price: string | number;
    conf: string | number;
    expo: number;
    publish_time: number;
  };
}

// ─── Price Fetching ─────────────────────────────────────────

async function fetchPythPrices(symbols: string[]): Promise<Record<string, number>> {
  const pythSymbols = symbols.filter((s) => !FORCE_FALLBACK.has(s));
  const ids = pythSymbols
    .map((s) => PYTH_PRICE_FEEDS[s])
    .filter(Boolean);

  const result: Record<string, number> = {};

  // Pyth Hermes
  if (ids.length > 0) {
    try {
      const qs = ids.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
      const url = `${HERMES_BASE}/v2/updates/price/latest?${qs}&parsed=true`;
      const res = await fetch(url);

      if (res.ok) {
        const data = (await res.json()) as { parsed?: PythParsedPrice[] };
        const parsed = data.parsed ?? [];

        pythSymbols.forEach((symbol, i) => {
          const p = parsed[i];
          if (!p) return;
          const price = Number(p.price.price) * Math.pow(10, p.price.expo);
          if (price > 0) result[symbol] = price;
        });
      }
    } catch (err) {
      logger.warn('Pyth Hermes fetch failed, will fallback', err);
    }
  }

  // CoinGecko fallback for missing symbols
  const missing = symbols.filter((s) => !result[s]);
  if (missing.length > 0) {
    try {
      const cgIds = missing.map((s) => COINGECKO_IDS[s]).filter(Boolean).join(',');
      if (cgIds) {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd`;
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as Record<string, { usd?: number }>;
          missing.forEach((symbol) => {
            const cgId = COINGECKO_IDS[symbol];
            const usd = cgId ? data?.[cgId]?.usd : undefined;
            if (usd && usd > 0) result[symbol] = usd;
          });
        }
      }
    } catch (err) {
      logger.warn('CoinGecko fallback fetch failed', err);
    }
  }

  return result;
}

/**
 * Convert USD prices to ALGO-denominated 8-decimal integers
 * for the CrescaBucketProtocol oracle.
 *
 * Formula: oraclePrice = (assetUsd / algoUsd) * 100_000_000
 * ALGO itself = 100_000_000 (1:1)
 */
function toOraclePrices(
  usdPrices: Record<string, number>,
): { assetIds: number[]; prices: number[] } {
  const algoUsd = usdPrices['ALGO'];
  if (!algoUsd || algoUsd <= 0) {
    throw new Error('ALGO USD price unavailable — cannot compute oracle prices');
  }

  const assetIds: number[] = [];
  const prices: number[] = [];

  for (const asset of TRACKED_ASSETS) {
    if (asset.asaId === 0) {
      // ALGO is always 1:1
      assetIds.push(0);
      prices.push(100_000_000);
      continue;
    }

    const usd = usdPrices[asset.symbol];
    if (!usd || usd <= 0) {
      logger.warn(`No USD price for ${asset.symbol} — skipping oracle update`);
      continue;
    }

    const oraclePrice = Math.round((usd / algoUsd) * 100_000_000);
    assetIds.push(asset.asaId);
    prices.push(oraclePrice);
  }

  return { assetIds, prices };
}

// ─── On-chain Oracle Update ─────────────────────────────────

async function pushOracleOnChain(
  assetIds: number[],
  prices: number[],
): Promise<string | null> {
  if (assetIds.length === 0) return null;

  const algod = getAlgod();
  const keeper = getKeeperAccount();
  const sp = await algod.getTransactionParams().do();

  const priceBoxes = assetIds.map((id) => ({
    appIndex: APP_ID,
    name: buildBoxKey(BOX_PREFIXES.PRICE, uint64ToBytes(id)),
  }));

  const atc = new AtomicTransactionComposer();

  atc.addMethodCall({
    appID: APP_ID,
    method: ABIMethod.fromSignature(BUCKET_METHODS.update_oracle),
    methodArgs: [assetIds, prices],
    sender: keeper.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(keeper),
    suggestedParams: { ...sp, fee: 2000, flatFee: true },
    boxes: priceBoxes,
  });

  try {
    const result = await atc.execute(algod, 4);
    return result.txIDs[result.txIDs.length - 1];
  } catch (err) {
    logger.error('Oracle on-chain update failed', err);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────

let lastPushTimestamp = 0;

export async function runOracleCycle(): Promise<void> {
  try {
    // 1. Fetch USD prices
    const symbols = TRACKED_ASSETS.map((a) => a.symbol);
    const usdPrices = await fetchPythPrices(symbols);

    if (Object.keys(usdPrices).length === 0) {
      logger.warn('Oracle keeper: no prices fetched');
      return;
    }

    // 2. Convert to ALGO-denominated oracle format
    const { assetIds, prices } = toOraclePrices(usdPrices);

    // 3. Push to contract
    const txId = await pushOracleOnChain(assetIds, prices);

    if (txId) {
      lastPushTimestamp = Date.now();
      logger.keeper('Oracle updated', txId, {
        assets: assetIds,
        prices: prices.map((p) => p / 100_000_000),
      });

      await logKeeperExecution({
        action_type: 'oracle_update',
        tx_id: txId,
        details: { assetIds, prices, usdPrices },
      });
    }

    // 4. Store price snapshots for Phase 4 price history API
    const snapshots = Object.entries(usdPrices).map(([symbol, price]) => ({
      symbol,
      price,
    }));
    await storePriceSnapshots(snapshots);

  } catch (err) {
    logger.error('Oracle keeper cycle failed', err);
  }
}

export function getLastOraclePushTimestamp(): number {
  return lastPushTimestamp;
}

export function isOracleFresh(maxAgeMs: number = 60_000): boolean {
  return Date.now() - lastPushTimestamp <= maxAgeMs;
}
