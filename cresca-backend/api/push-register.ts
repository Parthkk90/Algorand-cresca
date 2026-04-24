/**
 * Push Token Registration API
 * ===========================
 * POST /api/push/register — mobile app registers its Expo Push Token.
 *
 * Request:  { "pushToken": "ExponentPushToken[...]", "walletAddress": "ALGO...", "platform": "ios" }
 * Response: { "success": true }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? '',
);

interface RegisterRequest {
  pushToken?: string;
  walletAddress?: string;
  platform?: string;
}

export async function handlePushRegister(body: RegisterRequest): Promise<{ status: number; body: Record<string, unknown> }> {
  const { pushToken, walletAddress, platform } = body;

  if (!pushToken || !walletAddress) {
    return {
      status: 400,
      body: { success: false, message: 'pushToken and walletAddress are required' },
    };
  }

  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          wallet_address: walletAddress,
          push_token: pushToken,
          platform: platform ?? 'unknown',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'wallet_address' },
      );

    if (error) {
      console.error('Push register error:', error);
      return {
        status: 500,
        body: { success: false, message: 'Failed to register push token' },
      };
    }

    return {
      status: 200,
      body: { success: true },
    };
  } catch (err) {
    console.error('Push register handler error:', err);
    return {
      status: 500,
      body: { success: false, message: 'Internal error' },
    };
  }
}

// ─── Vercel Serverless Handler ──────────────────────────────

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  const result = await handlePushRegister(req.body);
  return res.status(result.status).json(result.body);
}
