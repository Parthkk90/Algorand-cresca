/**
 * Supabase Client
 * ===============
 * Server-side Supabase client using the service role key
 * (bypasses Row Level Security for backend operations).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './logger.js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  if (!config.supabase.url || !config.supabase.serviceKey) {
    logger.warn('Supabase not configured — DB operations will be skipped');
    // Return a dummy client that won't crash but won't persist data
    _client = createClient('https://placeholder.supabase.co', 'placeholder');
    return _client;
  }

  _client = createClient(config.supabase.url, config.supabase.serviceKey);
  logger.info('Supabase client initialized');
  return _client;
}

// ─── Typed DB helpers ───────────────────────────────────────

export interface WaitlistEntry {
  email: string;
  source?: string;
}

export interface PushTokenEntry {
  wallet_address: string;
  push_token: string;
  platform?: string;
}

export interface KeeperExecution {
  action_type: 'calendar_execute' | 'oracle_update' | 'liquidation';
  tx_id: string;
  details?: Record<string, unknown>;
}

export interface PriceSnapshot {
  symbol: string;
  price: number;
}

export async function logKeeperExecution(entry: KeeperExecution): Promise<void> {
  try {
    await getSupabase().from('keeper_executions').insert(entry);
  } catch (err) {
    logger.warn('Failed to log keeper execution to DB', err);
  }
}

export async function storePriceSnapshots(snapshots: PriceSnapshot[]): Promise<void> {
  try {
    await getSupabase().from('price_snapshots').insert(snapshots);
  } catch (err) {
    logger.warn('Failed to store price snapshots', err);
  }
}

export async function lookupPushToken(walletAddress: string): Promise<string | null> {
  try {
    const { data } = await getSupabase()
      .from('push_tokens')
      .select('push_token')
      .eq('wallet_address', walletAddress)
      .single();
    return data?.push_token ?? null;
  } catch {
    return null;
  }
}
