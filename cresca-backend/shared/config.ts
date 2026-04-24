/**
 * Shared Configuration
 * ====================
 * Central config loaded from environment variables.
 */

import 'dotenv/config';

export const config = {
  // ── Algorand ──────────────────────────────────────────────
  algo: {
    keeperMnemonic: process.env.ALGO_KEEPER_MNEMONIC ?? '',
    network: (process.env.ALGO_NETWORK ?? 'testnet') as 'testnet' | 'mainnet',
  },

  // ── Supabase ──────────────────────────────────────────────
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  },

  // ── Expo Push ─────────────────────────────────────────────
  expoPush: {
    accessToken: process.env.EXPO_PUSH_ACCESS_TOKEN ?? '',
  },

  // ── Keeper intervals ─────────────────────────────────────
  // NOTE: Oracle interval is now non-critical for users — open/close fetch
  // Pyth prices directly at tx time (Pyth pull oracle pattern).
  // Oracle keeper only feeds the liquidation keeper's prc_ boxes.
  keeper: {
    calendarIntervalMs: parseInt(process.env.KEEPER_CALENDAR_INTERVAL_MS ?? '30000', 10),
    oracleIntervalMs: parseInt(process.env.KEEPER_ORACLE_INTERVAL_MS ?? '60000', 10),    // was 20s
    liquidationIntervalMs: parseInt(process.env.KEEPER_LIQUIDATION_INTERVAL_MS ?? '60000', 10),
  },

  // ── Server ────────────────────────────────────────────────
  port: parseInt(process.env.PORT ?? '3001', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;
