/**
 * Cresca App — Central Configuration
 * ====================================
 * Single source of truth for ALL constants used across features:
 *   - Contract App IDs (Payments, Calendar, Bucket, DART Swap)
 *   - ASA IDs (real and synthetic)
 *   - Network node URLs (Algod, Indexer, Explorer)
 *   - Protocol limits and defaults
 *
 * ⚠️  Do NOT hardcode any of these values in individual screens or services.
 *     Import them from here instead.
 *
 * To switch from Testnet to Mainnet: update CONTRACT_APP_IDS and REAL_ASA_IDS
 * for the mainnet-deployed contract addresses and redeploy the app.
 */

// ---------------------------------------------------------------------------
// Contract App IDs — Testnet
// Update ALL four when deploying new contracts to mainnet.
// ---------------------------------------------------------------------------

export const CONTRACT_APP_IDS = {
  /** CrescaPayments — P2P send / batch send / tap-to-pay */
  CrescaPayments: 762822694,

  /** CrescaCalendarPayments — scheduled & recurring escrow payments */
  CrescaCalendarPayments: 762822695,

  /** CrescaBucketProtocol — leveraged basket (long/short) positions */
  CrescaBucketProtocol: 762824138,

  /** CrescaDartSwap — on-chain constant-product AMM router */
  CrescaDartSwap: 762822712,
} as const;

export type ContractName = keyof typeof CONTRACT_APP_IDS;

// ---------------------------------------------------------------------------
// Human-readable labels for transaction history
// ---------------------------------------------------------------------------

export const CONTRACT_TX_LABELS: Record<number, string> = {
  [CONTRACT_APP_IDS.CrescaPayments]: 'Payment',
  [CONTRACT_APP_IDS.CrescaCalendarPayments]: 'Scheduled Payment',
  [CONTRACT_APP_IDS.CrescaBucketProtocol]: 'Bundle Trade',
  [CONTRACT_APP_IDS.CrescaDartSwap]: 'Swap',
};

// ---------------------------------------------------------------------------
// Real ASA IDs on Testnet
// ---------------------------------------------------------------------------

export const REAL_ASA_IDS = {
  /** Native ALGO (always 0) */
  ALGO: 0,

  /** USDCa on Algorand Testnet */
  USDC: 10458941,

  /** Cresca Test Token — the live AMM pool asset */
  TST: 758849338,
} as const;

// ---------------------------------------------------------------------------
// Oracle precision constant (8 decimals, 1 ALGO = 100_000_000)
// ---------------------------------------------------------------------------

export const ORACLE_SCALE = 100_000_000;

// ---------------------------------------------------------------------------
// Micro-ALGO conversion
// ---------------------------------------------------------------------------

/** 1 ALGO = 1_000_000 μALGO */
export const MICROALGO_PER_ALGO = 1_000_000;

/** Minimum on-chain account balance (0.1 ALGO in μALGO) */
export const MIN_BALANCE_MICROALGO = 100_000;

// ---------------------------------------------------------------------------
// Protocol limits
// ---------------------------------------------------------------------------

/** Max recipients per batch payment (AVM inner-txn limit) */
export const MAX_BATCH_RECIPIENTS = 8;

/** Default leverage multiplier for Bucket positions */
export const DEFAULT_LEVERAGE = 2;

/** Default swap slippage tolerance (0.5%) */
export const DEFAULT_SLIPPAGE_PCT = 0.5;

/** On-chain oracle max age before considered stale (seconds) */
export const ORACLE_MAX_AGE_SECONDS = 30;

/** Quote TTL before re-fetch is forced (milliseconds) */
export const QUOTE_TTL_MS = 30_000;

/** Duration to keep "confirmed" UI state before resetting (ms) */
export const CONFIRM_RESET_DELAY_MS = 2_000;

/** Price cache duration in the price service (ms) */
export const PRICE_CACHE_DURATION_MS = 30_000;

// ---------------------------------------------------------------------------
// DART AMM pool fee
// ---------------------------------------------------------------------------

/** AMM swap fee in basis points (30 bps = 0.3%) */
export const DART_POOL_FEE_BPS = 30;

// ---------------------------------------------------------------------------
// Explorer / faucet URLs (keyed by network)
// ---------------------------------------------------------------------------

export const NETWORK_CONFIG = {
  testnet: {
    algodUrl: 'https://testnet-api.algonode.cloud',
    algodToken: '',
    algodPort: 443,
    indexerUrl: 'https://testnet-idx.algonode.cloud',
    indexerPort: 443,
    name: 'Algorand Testnet',
    explorerUrl: 'https://lora.algokit.io/testnet',
    faucetUrl: 'https://bank.testnet.algorand.network/',
  },
  mainnet: {
    algodUrl: 'https://mainnet-api.algonode.cloud',
    algodToken: '',
    algodPort: 443,
    indexerUrl: 'https://mainnet-idx.algonode.cloud',
    indexerPort: 443,
    name: 'Algorand Mainnet',
    explorerUrl: 'https://algoexplorer.io',
    faucetUrl: '',
  },
} as const;

export type AlgorandNetwork = keyof typeof NETWORK_CONFIG;

// ---------------------------------------------------------------------------
// Helper: build an explorer transaction link for the active network
// ---------------------------------------------------------------------------

export function explorerTxUrl(txId: string, network: AlgorandNetwork = 'testnet'): string {
  return `${NETWORK_CONFIG[network].explorerUrl}/transaction/${txId}`;
}

// ---------------------------------------------------------------------------
// Helper: build an explorer application link for the active network
// ---------------------------------------------------------------------------

export function explorerAppUrl(appId: number, network: AlgorandNetwork = 'testnet'): string {
  return `${NETWORK_CONFIG[network].explorerUrl}/application/${appId}`;
}
