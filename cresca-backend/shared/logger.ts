/**
 * Logger
 * ======
 * Structured logging with emoji prefixes for quick visual scanning.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const currentLevel: Level = (process.env.LOG_LEVEL as Level) ?? 'info';

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(msg: string, data?: unknown) {
    if (shouldLog('debug')) console.log(`${timestamp()} 🔍 ${msg}`, data ?? '');
  },

  info(msg: string, data?: unknown) {
    if (shouldLog('info')) console.log(`${timestamp()} ✅ ${msg}`, data ?? '');
  },

  warn(msg: string, data?: unknown) {
    if (shouldLog('warn')) console.warn(`${timestamp()} ⚠️  ${msg}`, data ?? '');
  },

  error(msg: string, data?: unknown) {
    if (shouldLog('error')) console.error(`${timestamp()} ❌ ${msg}`, data ?? '');
  },

  keeper(action: string, txId?: string, details?: Record<string, unknown>) {
    const parts = [`${timestamp()} 🤖 [KEEPER] ${action}`];
    if (txId) parts.push(`txId=${txId}`);
    if (details) parts.push(JSON.stringify(details));
    console.log(parts.join(' | '));
  },
};
