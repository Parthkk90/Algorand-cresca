/**
 * Expo Push Service
 * =================
 * Sends push notifications to mobile devices via Expo's Push API.
 * Looks up push tokens from Supabase by wallet address.
 */

import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { lookupPushToken } from '../shared/supabase.js';

interface PushPayload {
  walletAddress: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to a wallet owner's device.
 * Silently no-ops if:
 *   - No push token registered for this wallet
 *   - Expo Push token not configured
 */
export async function sendPushToWallet(payload: PushPayload): Promise<boolean> {
  const pushToken = await lookupPushToken(payload.walletAddress);
  if (!pushToken) {
    logger.debug(`No push token for wallet ${payload.walletAddress.slice(0, 8)}...`);
    return false;
  }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.expoPush.accessToken
          ? { Authorization: `Bearer ${config.expoPush.accessToken}` }
          : {}),
      },
      body: JSON.stringify({
        to: pushToken,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: 'default',
        badge: 1,
        channelId: 'cresca-transactions',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`Expo Push failed: ${res.status} ${text}`);
      return false;
    }

    logger.debug(`Push sent to ${payload.walletAddress.slice(0, 8)}...`);
    return true;
  } catch (err) {
    logger.warn('Expo Push request failed', err);
    return false;
  }
}

/**
 * Send push notifications to multiple wallets in a batch.
 * Expo supports up to 100 messages per request.
 */
export async function sendPushBatch(payloads: PushPayload[]): Promise<number> {
  let sent = 0;
  for (const payload of payloads) {
    const ok = await sendPushToWallet(payload);
    if (ok) sent++;
  }
  return sent;
}
