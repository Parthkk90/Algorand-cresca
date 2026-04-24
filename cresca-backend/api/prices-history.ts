/**
 * Price History API
 * =================
 * GET /api/prices/history?symbol=ALGO&period=24h
 *
 * Returns price snapshots and 24h percentage change.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? '',
);

const PERIOD_MINUTES: Record<string, number> = {
  '1h': 60,
  '24h': 1440,
  '7d': 10080,
  '30d': 43200,
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query?.symbol as string)?.toUpperCase();
  const period = (req.query?.period as string) ?? '24h';

  if (!symbol) {
    return res.status(400).json({ error: 'symbol query parameter required' });
  }

  const minutes = PERIOD_MINUTES[period];
  if (!minutes) {
    return res.status(400).json({
      error: `Invalid period. Allowed: ${Object.keys(PERIOD_MINUTES).join(', ')}`,
    });
  }

  try {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();

    const { data, error } = await supabase
      .from('price_snapshots')
      .select('price, timestamp')
      .eq('symbol', symbol)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Price history query error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const prices = data ?? [];

    // Calculate percentage change over the period
    let change = 0;
    if (prices.length >= 2) {
      const first = prices[0].price;
      const last = prices[prices.length - 1].price;
      change = first > 0 ? ((last - first) / first) * 100 : 0;
    }

    return res.status(200).json({
      symbol,
      period,
      change,
      priceCount: prices.length,
      prices: prices.map((p: any) => ({
        price: Number(p.price),
        timestamp: p.timestamp,
      })),
    });
  } catch (err) {
    console.error('Price history error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
