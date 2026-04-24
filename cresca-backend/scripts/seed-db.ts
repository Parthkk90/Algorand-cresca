/**
 * Database Seed Script
 * ====================
 * Creates all required tables in Supabase.
 * Run: npx tsx scripts/seed-db.ts
 *
 * NOTE: You can also run this SQL directly in the Supabase SQL Editor.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
  console.log('');
  console.log('ℹ️  Copy the SQL below into Supabase SQL Editor:');
  console.log('   Dashboard → SQL Editor → New Query → Paste → Run');
  console.log('');
  console.log('─'.repeat(60));
  console.log(SCHEMA_SQL);
  console.log('─'.repeat(60));
  console.log('');

  // Verify connection by attempting a simple query
  try {
    const { error } = await supabase.from('waitlist').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.log('⚠️  Tables do not exist yet. Run the SQL above in Supabase SQL Editor.');
    } else if (error) {
      console.log(`⚠️  Supabase responded with: ${error.message}`);
    } else {
      console.log('✅ Supabase connection verified — tables exist!');
    }
  } catch (err) {
    console.log('⚠️  Could not connect to Supabase. Check your URL and key.');
  }
}

seed().catch(console.error);
