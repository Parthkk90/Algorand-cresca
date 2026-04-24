/**
 * Keeper — Algorand Client
 * ========================
 * Shared Algod/Indexer/Account for all keeper operations.
 * The keeper wallet is a hot wallet that only holds enough ALGO for tx fees.
 */

import algosdk from 'algosdk';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';

const NETWORKS = {
  testnet: {
    algodUrl: 'https://testnet-api.algonode.cloud',
    indexerUrl: 'https://testnet-idx.algonode.cloud',
    name: 'Algorand Testnet',
  },
  mainnet: {
    algodUrl: 'https://mainnet-api.algonode.cloud',
    indexerUrl: 'https://mainnet-idx.algonode.cloud',
    name: 'Algorand Mainnet',
  },
} as const;

const MICROALGO_PER_ALGO = 1_000_000;
const LOW_BALANCE_THRESHOLD = 1_000_000; // 1 ALGO — warn if below

let _algod: algosdk.Algodv2 | null = null;
let _indexer: algosdk.Indexer | null = null;
let _account: algosdk.Account | null = null;

export function getAlgod(): algosdk.Algodv2 {
  if (_algod) return _algod;
  const net = NETWORKS[config.algo.network];
  _algod = new algosdk.Algodv2('', net.algodUrl, 443);
  logger.info(`Algod connected → ${net.name}`);
  return _algod;
}

export function getIndexer(): algosdk.Indexer {
  if (_indexer) return _indexer;
  const net = NETWORKS[config.algo.network];
  _indexer = new algosdk.Indexer('', net.indexerUrl, 443);
  logger.info(`Indexer connected → ${net.name}`);
  return _indexer;
}

export function getKeeperAccount(): algosdk.Account {
  if (_account) return _account;
  if (!config.algo.keeperMnemonic) {
    throw new Error('ALGO_KEEPER_MNEMONIC not set — cannot start keeper');
  }
  _account = algosdk.mnemonicToSecretKey(config.algo.keeperMnemonic.trim());
  logger.info(`Keeper wallet loaded → ${String(_account.addr).slice(0, 8)}...`);
  return _account;
}

/**
 * Check keeper wallet balance and warn if low.
 * Returns balance in ALGO.
 */
export async function checkKeeperBalance(): Promise<number> {
  const account = getKeeperAccount();
  const algod = getAlgod();

  try {
    const info = await algod.accountInformation(account.addr).do();
    const microAlgo = Number(info['amount'] ?? 0);
    const algo = microAlgo / MICROALGO_PER_ALGO;

    if (microAlgo < LOW_BALANCE_THRESHOLD) {
      logger.warn(`Keeper wallet balance LOW: ${algo.toFixed(6)} ALGO — refund needed!`);
    } else {
      logger.debug(`Keeper wallet balance: ${algo.toFixed(6)} ALGO`);
    }

    return algo;
  } catch (err) {
    logger.error('Failed to check keeper balance', err);
    return 0;
  }
}

export { algosdk, MICROALGO_PER_ALGO };
