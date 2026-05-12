/**
 * Discover Pact and Folks pool app IDs on Algorand testnet/mainnet.
 *
 * This is intentionally conservative: it scans a bounded set of app IDs and
 * prints any candidates that match common pool key patterns.
 *
 * Usage:
 *   pnpm dex:discover
 *
 * Optional env:
 *   DEX_DISCOVERY_RANGES='[{"name":"Pact","start":110000000,"end":110010000}]'
 */

import 'dotenv/config';

import algosdk from 'algosdk';

type DiscoveryRange = {
  name: string;
  start: number;
  end: number;
};

const ALGOD_URL = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';
const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, '');

const DEFAULT_RANGES: DiscoveryRange[] = [
  { name: 'Pact', start: 110000000, end: 110010000 },
  { name: 'Folks', start: 120000000, end: 120010000 },
];

function decodeKey(key: unknown): string {
  if (typeof key === 'string') {
    try {
      return Buffer.from(key, 'base64').toString('utf8');
    } catch {
      return key;
    }
  }

  if (key instanceof Uint8Array) {
    return Buffer.from(key).toString('utf8');
  }

  return '';
}

function getUint(value: any): number | null {
  if (value?.uint === undefined || value?.uint === null) return null;
  const numeric = Number(value.uint);
  return Number.isFinite(numeric) ? numeric : null;
}

async function scanRange(range: DiscoveryRange): Promise<Array<{ appId: number; assetA: number; assetB: number }>> {
  const found: Array<{ appId: number; assetA: number; assetB: number }> = [];

  console.log(`\n🔍 Scanning ${range.name}: ${range.start} - ${range.end}`);

  for (let appId = range.start; appId < range.end; appId += 1) {
    try {
      const app = await algod.getApplicationByID(appId).do();
      const globalState = (app as any)?.params?.['global-state'] ?? [];
      const keys = new Set<string>(globalState.map((kv: any) => decodeKey(kv.key)));

      const keyList = Array.from(keys);
      const looksLikePact = keys.has('A') && keys.has('B') && keyList.some((key: string) => key.includes('reserve'));
      const looksLikeFolks = keys.has('asset_1_id') && keys.has('asset_2_id') && keyList.some((key: string) => key.includes('reserve'));

      if (!looksLikePact && !looksLikeFolks) continue;

      let assetA = 0;
      let assetB = 0;
      for (const kv of globalState) {
        const key = decodeKey(kv.key);
        if (key === 'A' || key === 'asset_1_id') assetA = getUint(kv.value) ?? 0;
        if (key === 'B' || key === 'asset_2_id') assetB = getUint(kv.value) ?? 0;
      }

      if (assetA > 0 && assetB > 0) {
        found.push({ appId, assetA, assetB });
        console.log(`✅ Found ${range.name} pool app ${appId} for ${assetA} <-> ${assetB}`);
        console.log(`   Suggested map key: '${Math.min(assetA, assetB)}_${Math.max(assetA, assetB)}': ${appId}`);
      }
    } catch {
      // App doesn't exist or is not readable, skip.
    }
  }

  console.log(`\n${range.name}: found ${found.length} candidate pools`);
  return found;
}

async function main() {
  const ranges = process.env.DEX_DISCOVERY_RANGES
    ? (JSON.parse(process.env.DEX_DISCOVERY_RANGES) as DiscoveryRange[])
    : DEFAULT_RANGES;

  console.log('🔍 DEX pool discovery');
  console.log(`Algod: ${ALGOD_URL}`);

  for (const range of ranges) {
    await scanRange(range);
  }
}

main().catch((err) => {
  console.error('Discovery failed:', err);
  process.exit(1);
});
