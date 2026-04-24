/**
 * Waitlist API
 * ============
 * POST /api/waitlist — collect email signups from the landing page.
 *
 * This file is designed to work as:
 *   1. A Vercel Serverless Function (drop into cresca.in/api/)
 *   2. Or imported by an Express server
 *
 * Request:  { "email": "user@example.com" }
 * Response: { "success": true, "message": "You're on the list!" }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? '',
);

// Email validation regex (simple but effective)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistRequest {
  email?: string;
  source?: string;
}

interface WaitlistResponse {
  success: boolean;
  message: string;
}

export async function handleWaitlist(body: WaitlistRequest): Promise<{ status: number; body: WaitlistResponse }> {
  const email = body.email?.toLowerCase().trim();

  if (!email || !EMAIL_RE.test(email)) {
    return {
      status: 400,
      body: { success: false, message: 'A valid email address is required.' },
    };
  }

  try {
    const { error } = await supabase
      .from('waitlist')
      .upsert(
        { email, source: body.source ?? 'landing_page' },
        { onConflict: 'email' },
      );

    if (error) {
      console.error('Waitlist insert error:', error);
      return {
        status: 500,
        body: { success: false, message: 'Something went wrong. Please try again.' },
      };
    }

    return {
      status: 200,
      body: { success: true, message: "You're on the list! We'll notify you at launch." },
    };
  } catch (err) {
    console.error('Waitlist handler error:', err);
    return {
      status: 500,
      body: { success: false, message: 'Something went wrong. Please try again.' },
    };
  }
}

// ─── Vercel Serverless Handler ──────────────────────────────
// If this file is placed in cresca.in/api/waitlist.ts, Vercel
// will auto-detect it as a serverless function.

export default async function handler(req: any, res: any) {
  // CORS headers for landing page
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const result = await handleWaitlist(req.body);
  return res.status(result.status).json(result.body);
}
