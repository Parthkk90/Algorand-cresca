/**
 * Database Seed Script
 * ====================
 * Creates all required tables in Supabase.
 * Run: npx tsx scripts/seed-db.ts
 *
 * NOTE: You can also run this SQL directly in the Supabase SQL Editor.
 */

import { query } from '../shared/postgres';
import 'dotenv/config';

const SCHEMA_SQL = `
-- =====================================================
-- Cresca Backend Database Schema
-- =====================================================

-- 1. Waitlist signups (landing page)
CREATE TABLE IF NOT EXISTS waitlist (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source     TEXT DEFAULT 'landing_page'
);

-- 2. Push notification tokens (mobile app)
CREATE TABLE IF NOT EXISTS push_tokens (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  TEXT UNIQUE NOT NULL,
  push_token      TEXT NOT NULL,
  platform        TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Keeper execution log (audit trail)
CREATE TABLE IF NOT EXISTS keeper_executions (
  id            BIGSERIAL PRIMARY KEY,
  action_type   TEXT NOT NULL,
  tx_id         TEXT NOT NULL,
  details       JSONB,
  executed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keeper_exec_type
  ON keeper_executions(action_type, executed_at DESC);

-- 4. Price snapshots (for charts + 24h change)
CREATE TABLE IF NOT EXISTS price_snapshots (
  id        BIGSERIAL PRIMARY KEY,
  symbol    TEXT NOT NULL,
  price     NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_ts
  ON price_snapshots(symbol, timestamp DESC);

-- =====================================================
-- Done!
-- =====================================================
`;

async function seed() {
  console.log('🗄️  Creating database tables...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        wallet_address TEXT PRIMARY KEY,
        push_token TEXT NOT NULL,
        platform TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        price NUMERIC NOT NULL,
        timestamp BIGINT NOT NULL
      );
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_price_snapshots_symbol_timestamp 
        ON price_snapshots(symbol, timestamp);
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS keeper_logs (
        id SERIAL PRIMARY KEY,
        keeper TEXT NOT NULL,
        cycle_count INT,
        error_count INT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Tables created or already exist!');
  } catch (err) {
    console.error('❌ Error creating tables:', err);
    process.exit(1);
  }
}

seed().catch(console.error);
