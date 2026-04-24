/**
 * Backend API Configuration
 * =========================
 * Single source of truth for the Cresca backend API URL.
 * Used by all mobile services that talk to the backend.
 */

/**
 * Base URL for the Cresca backend API.
 *
 * - Development: local backend on port 3001
 * - Production:  deployed Vercel API
 *
 * Override with `EXPO_PUBLIC_API_URL` env var if needed.
 */
export const BACKEND_API_URL: string = (() => {
  // Allow override via Expo env var
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // In __DEV__ mode (Expo Go / dev client), hit local backend
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://localhost:3001';
  }

  // Production
  return 'https://cresca-api.vercel.app';
})();

/**
 * API request timeout in milliseconds.
 */
export const API_TIMEOUT_MS = 10_000;

/**
 * Helper: make a typed fetch to the backend with timeout.
 */
export async function backendFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.message ?? data?.error ?? 'Request failed' };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, status: 0, error: 'Request timed out' };
    }
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error' };
  } finally {
    clearTimeout(timeout);
  }
}
