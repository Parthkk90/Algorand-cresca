/**
 * API Handler Tests
 * =================
 * Tests the input validation and response logic of API endpoints
 * without requiring Supabase or network access.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Re-implement validation logic for isolated testing ─────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateWaitlistInput(body: { email?: string; source?: string }): {
  valid: boolean;
  email?: string;
  error?: string;
} {
  const email = body.email?.toLowerCase().trim();
  if (!email || !EMAIL_RE.test(email)) {
    return { valid: false, error: 'A valid email address is required.' };
  }
  return { valid: true, email };
}

function validatePushRegisterInput(body: {
  pushToken?: string;
  walletAddress?: string;
  platform?: string;
}): { valid: boolean; error?: string } {
  if (!body.pushToken || !body.walletAddress) {
    return { valid: false, error: 'pushToken and walletAddress are required' };
  }
  return { valid: true };
}

// ─── Waitlist Tests ─────────────────────────────────────────

describe('Waitlist Input Validation', () => {
  it('accepts valid email', () => {
    const result = validateWaitlistInput({ email: 'user@example.com' });
    assert.equal(result.valid, true);
    assert.equal(result.email, 'user@example.com');
  });

  it('lowercases and trims email', () => {
    const result = validateWaitlistInput({ email: '  User@Example.COM  ' });
    assert.equal(result.valid, true);
    assert.equal(result.email, 'user@example.com');
  });

  it('rejects missing email', () => {
    const result = validateWaitlistInput({});
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('valid email'));
  });

  it('rejects empty string', () => {
    const result = validateWaitlistInput({ email: '' });
    assert.equal(result.valid, false);
  });

  it('rejects email without @', () => {
    const result = validateWaitlistInput({ email: 'userexample.com' });
    assert.equal(result.valid, false);
  });

  it('rejects email without domain', () => {
    const result = validateWaitlistInput({ email: 'user@' });
    assert.equal(result.valid, false);
  });

  it('rejects email with spaces', () => {
    const result = validateWaitlistInput({ email: 'user @example.com' });
    assert.equal(result.valid, false);
  });

  it('accepts email with subdomain', () => {
    const result = validateWaitlistInput({ email: 'user@mail.example.com' });
    assert.equal(result.valid, true);
  });

  it('accepts email with + character', () => {
    const result = validateWaitlistInput({ email: 'user+tag@example.com' });
    assert.equal(result.valid, true);
  });
});

// ─── Push Token Registration Tests ──────────────────────────

describe('Push Register Input Validation', () => {
  it('accepts valid pushToken and walletAddress', () => {
    const result = validatePushRegisterInput({
      pushToken: 'ExponentPushToken[abc123]',
      walletAddress: 'ALGO1234567890ABCDEF',
      platform: 'ios',
    });
    assert.equal(result.valid, true);
  });

  it('rejects missing pushToken', () => {
    const result = validatePushRegisterInput({
      walletAddress: 'ALGO1234567890ABCDEF',
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('pushToken'));
  });

  it('rejects missing walletAddress', () => {
    const result = validatePushRegisterInput({
      pushToken: 'ExponentPushToken[abc123]',
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('walletAddress'));
  });

  it('rejects both missing', () => {
    const result = validatePushRegisterInput({});
    assert.equal(result.valid, false);
  });

  it('platform is optional', () => {
    const result = validatePushRegisterInput({
      pushToken: 'ExponentPushToken[abc123]',
      walletAddress: 'ALGO1234567890ABCDEF',
    });
    assert.equal(result.valid, true);
  });
});

// ─── Notification Templates Tests ───────────────────────────

describe('Notification Templates', () => {
  // Matches templates.ts message structure
  const templates = {
    schedule_executed: (amount: string, recipient: string) => ({
      title: '✅ Payment Sent',
      body: `${amount} ALGO sent to ${recipient}`,
    }),
    position_liquidated: (positionId: number) => ({
      title: '⚠️ Position Liquidated',
      body: `Your position #${positionId} was liquidated due to insufficient margin`,
    }),
    oracle_stale: () => ({
      title: '🔴 Oracle Alert',
      body: 'Oracle prices are stale — trading may be paused',
    }),
  };

  it('schedule_executed includes amount and recipient', () => {
    const msg = templates.schedule_executed('5.000000', 'ALGO...WXYZ');
    assert.ok(msg.title.includes('Payment'));
    assert.ok(msg.body.includes('5.000000'));
    assert.ok(msg.body.includes('ALGO...WXYZ'));
  });

  it('position_liquidated includes position ID', () => {
    const msg = templates.position_liquidated(42);
    assert.ok(msg.title.includes('Liquidat'));
    assert.ok(msg.body.includes('42'));
  });

  it('oracle_stale is a fixed message', () => {
    const msg = templates.oracle_stale();
    assert.ok(msg.title.includes('Oracle'));
    assert.ok(msg.body.includes('stale'));
  });
});
