/**
 * Contract Constants
 * ==================
 * Deployed App IDs and ABI method signatures — single source of truth
 * for the backend. Mirrors wallet/services/algorandContractServices.ts.
 */

// ─── Deployed Testnet App IDs ───────────────────────────────
export const CONTRACT_APP_IDS = {
  CrescaPayments: 758849047,
  CrescaCalendarPayments: 758849049,
  CrescaBucketProtocol: 758849061,
  CrescaDartSwap: 758849063,
} as const;

// ─── CrescaCalendarPayments ABI ─────────────────────────────
export const CALENDAR_METHODS = {
  execute_schedule: 'execute_schedule(address,uint64)bool',
  is_executable: 'is_executable(address,uint64)bool',
  get_next_execution_time: 'get_next_execution_time(address,uint64)uint64',
  get_user_schedule_count: 'get_user_schedule_count(address)uint64',
  fund_contract: 'fund_contract(pay)bool',
} as const;

// ─── CrescaBucketProtocol ABI ───────────────────────────────
export const BUCKET_METHODS = {
  update_oracle: 'update_oracle(uint64[],uint64[])bool',
  liquidate_position: 'liquidate_position(address,uint64)bool',
  get_collateral_balance: 'get_collateral_balance(address)uint64',
  get_unrealized_pnl: 'get_unrealized_pnl(address,uint64)uint64',
  get_total_positions: 'get_total_positions()uint64',
  fund_contract: 'fund_contract(pay)bool',
} as const;

// ─── Box Key Prefixes ───────────────────────────────────────
export const BOX_PREFIXES = {
  // CrescaCalendarPayments
  SCHEDULE_COUNT: 'cnt_',   // cnt_ + 32-byte payer pubkey
  SCHEDULE: 'sch_',         // sch_ + 32-byte payer pubkey + 8-byte schedule_id

  // CrescaBucketProtocol
  BUCKET_COUNT: 'bkc_',    // bkc_ + 32-byte owner pubkey
  BUCKET: 'bkt_',           // bkt_ + 32-byte owner pubkey + 8-byte bucket_id
  COLLATERAL: 'col_',       // col_ + 32-byte owner pubkey
  POSITION: 'pos_',         // pos_ + 32-byte owner pubkey + 8-byte position_id
  PRICE: 'prc_',            // prc_ + 8-byte asset_id
} as const;

// ─── Pyth Price Feed IDs (Hermes v2) ────────────────────────
export const PYTH_PRICE_FEEDS: Record<string, string> = {
  ALGO: '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318',
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
};

// ─── Tracked ASAs for oracle keeper ─────────────────────────
export const TRACKED_ASSETS = [
  { asaId: 0, symbol: 'ALGO', decimals: 6 },
  { asaId: 10458941, symbol: 'USDC', decimals: 6 },
] as const;

// ─── Helper: build box key ──────────────────────────────────
export function buildBoxKey(prefix: string, ...parts: Uint8Array[]): Uint8Array {
  const buffers = [Buffer.from(prefix), ...parts.map((p) => Buffer.from(p))];
  return new Uint8Array(Buffer.concat(buffers));
}

export function uint64ToBytes(value: number | bigint): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(value));
  return new Uint8Array(buf);
}
