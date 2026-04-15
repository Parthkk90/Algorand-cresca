/**
 * Basket definitions — single source of truth for all basket trading.
 *
 * Cross-chain assets (SOL, ADA, XRP, …) are not native Algorand ASAs.
 * CrescaBucketProtocol uses the assetId only as a uint64 key in its
 * oracle BoxMap (`prc_` + u64(assetId)). It never holds those tokens;
 * ALGO is the only collateral. So we assign synthetic uint64 IDs that
 * are unique, unused on testnet, and stable across all service calls.
 */

// ---------------------------------------------------------------------------
// Synthetic ASA IDs
// 0 and 10458941 are real (native ALGO and USDCa testnet).
// 100–109 are synthetic keys — just uint64 labels for the oracle BoxMap.
// ---------------------------------------------------------------------------

export const SYNTHETIC_ASA_IDS = {
  ALGO: 0,
  USDC: 10458941,
  BTC:  100,
  ETH:  101,
  SOL:  102,
  ADA:  103,
  XRP:  104,
  SUI:  105,
  APT:  106,
  NEAR: 107,
  AVAX: 108,
  MOVE: 109,
} as const;

// ---------------------------------------------------------------------------
// Synthetic ASA ID → Pyth symbol (used by dartRouterService oracle methods)
// ---------------------------------------------------------------------------

export const ASA_ID_TO_PYTH_SYMBOL: Record<number, string> = {
  [SYNTHETIC_ASA_IDS.ALGO]: 'ALGO',
  [SYNTHETIC_ASA_IDS.USDC]: 'USDC',
  [SYNTHETIC_ASA_IDS.BTC]:  'BTC',
  [SYNTHETIC_ASA_IDS.ETH]:  'ETH',
  [SYNTHETIC_ASA_IDS.SOL]:  'SOL',
  [SYNTHETIC_ASA_IDS.ADA]:  'ADA',
  [SYNTHETIC_ASA_IDS.XRP]:  'XRP',
  [SYNTHETIC_ASA_IDS.SUI]:  'SUI',
  [SYNTHETIC_ASA_IDS.APT]:  'APT',
  [SYNTHETIC_ASA_IDS.NEAR]: 'NEAR',
  [SYNTHETIC_ASA_IDS.AVAX]: 'AVAX',
  [SYNTHETIC_ASA_IDS.MOVE]: 'MOVE',
};

// ---------------------------------------------------------------------------
// Basket types
// ---------------------------------------------------------------------------

export interface BasketAsset {
  symbol: string;
  asaId:  number;   // synthetic ASA ID used as oracle box key
  weight: number;   // integer percentage; all weights in a basket sum to 100
}

export interface Basket {
  id:          string;
  name:        string;
  description: string;
  assets:      BasketAsset[];
}

// ---------------------------------------------------------------------------
// The 5 curated baskets
// ---------------------------------------------------------------------------

export const BASKETS: Basket[] = [
  {
    id:          'non-evm-giants',
    name:        'Non-EVM Giants',
    description: 'Leading blockchains outside the EVM ecosystem',
    assets: [
      { symbol: 'SOL',  asaId: SYNTHETIC_ASA_IDS.SOL,  weight: 30 },
      { symbol: 'ALGO', asaId: SYNTHETIC_ASA_IDS.ALGO, weight: 25 },
      { symbol: 'ADA',  asaId: SYNTHETIC_ASA_IDS.ADA,  weight: 25 },
      { symbol: 'XRP',  asaId: SYNTHETIC_ASA_IDS.XRP,  weight: 20 },
    ],
  },
  {
    id:          'crypto-blue-chips',
    name:        'Crypto Blue Chips',
    description: 'The highest market-cap, most liquid crypto assets',
    assets: [
      { symbol: 'BTC',  asaId: SYNTHETIC_ASA_IDS.BTC,  weight: 40 },
      { symbol: 'ETH',  asaId: SYNTHETIC_ASA_IDS.ETH,  weight: 30 },
      { symbol: 'SOL',  asaId: SYNTHETIC_ASA_IDS.SOL,  weight: 20 },
      { symbol: 'AVAX', asaId: SYNTHETIC_ASA_IDS.AVAX, weight: 10 },
    ],
  },
  {
    id:          'move-ecosystem',
    name:        'Move Ecosystem',
    description: 'Chains built on the Move language — the next smart contract era',
    assets: [
      { symbol: 'SUI',  asaId: SYNTHETIC_ASA_IDS.SUI,  weight: 35 },
      { symbol: 'APT',  asaId: SYNTHETIC_ASA_IDS.APT,  weight: 35 },
      { symbol: 'MOVE', asaId: SYNTHETIC_ASA_IDS.MOVE, weight: 20 },
      { symbol: 'NEAR', asaId: SYNTHETIC_ASA_IDS.NEAR, weight: 10 },
    ],
  },
  {
    id:          'speed-l1s',
    name:        'Speed L1s',
    description: 'High-throughput chains optimized for low cost and fast finality',
    assets: [
      { symbol: 'SOL',  asaId: SYNTHETIC_ASA_IDS.SOL,  weight: 35 },
      { symbol: 'AVAX', asaId: SYNTHETIC_ASA_IDS.AVAX, weight: 25 },
      { symbol: 'APT',  asaId: SYNTHETIC_ASA_IDS.APT,  weight: 20 },
      { symbol: 'NEAR', asaId: SYNTHETIC_ASA_IDS.NEAR, weight: 20 },
    ],
  },
  {
    id:          'store-of-value',
    name:        'Store of Value',
    description: 'Established assets with strong monetary properties',
    assets: [
      { symbol: 'BTC',  asaId: SYNTHETIC_ASA_IDS.BTC,  weight: 45 },
      { symbol: 'ETH',  asaId: SYNTHETIC_ASA_IDS.ETH,  weight: 30 },
      { symbol: 'XRP',  asaId: SYNTHETIC_ASA_IDS.XRP,  weight: 15 },
      { symbol: 'ALGO', asaId: SYNTHETIC_ASA_IDS.ALGO, weight: 10 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getBasket(id: string): Basket | undefined {
  return BASKETS.find((b) => b.id === id);
}

/** Returns [asaIds[], weights[]] ready to pass to createBucket / updateOracle. */
export function basketToContractArgs(basket: Basket): { asaIds: number[]; weights: number[] } {
  return {
    asaIds:  basket.assets.map((a) => a.asaId),
    weights: basket.assets.map((a) => a.weight),
  };
}
