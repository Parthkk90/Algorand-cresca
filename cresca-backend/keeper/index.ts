/**
 * Keeper — Main Entry Point
 * =========================
 * Starts two keeper loops and a health HTTP endpoint:
 *   1. Calendar keeper    — execute due scheduled payments (30s)
 *   2. Liquidation keeper — liquidate underwater positions (60s)
 */

import http from 'http';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { checkKeeperBalance } from './algorand.js';
import { runCalendarCycle } from './calendarKeeper.js';
import { runLiquidationCycle } from './liquidationKeeper.js';

// ─── Health tracking ────────────────────────────────────────

let lastCalendarCycle = 0;
let lastLiquidationCycle = 0;
let startedAt = 0;

function trackCycle(keeper: 'calendar' | 'liquidation') {
  if (keeper === 'calendar') lastCalendarCycle = Date.now();
  if (keeper === 'liquidation') lastLiquidationCycle = Date.now();
}

// ─── Wrapped cycle runners ──────────────────────────────────

async function safeRun(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    logger.error(`${name} cycle crashed — will retry next interval`, err);
  }
}

// ─── Health HTTP endpoint ───────────────────────────────────

function startHealthServer() {
  const server = http.createServer((_req, res) => {
    const now = Date.now();
    const maxMiss = 3; // Allow 3 missed cycles before unhealthy

    const calendarOk = now - lastCalendarCycle < config.keeper.calendarIntervalMs * maxMiss;
    const liquidationOk = now - lastLiquidationCycle < config.keeper.liquidationIntervalMs * maxMiss;

    const healthy = calendarOk && liquidationOk;

    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: healthy ? 'ok' : 'degraded',
      uptime: Math.floor((now - startedAt) / 1000),
      keepers: {
        calendar: { ok: calendarOk, lastCycle: lastCalendarCycle },
        liquidation: { ok: liquidationOk, lastCycle: lastLiquidationCycle },
      },
    }));
  });

  server.listen(config.port, () => {
    logger.info(`Health endpoint listening on :${config.port}`);
  });
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  startedAt = Date.now();

  logger.info('═══════════════════════════════════════════════');
  logger.info('  🤖 Cresca Keeper Bot');
  logger.info(`  Network: ${config.algo.network}`);
  logger.info(`  Calendar interval: ${config.keeper.calendarIntervalMs / 1000}s`);
  logger.info(`  Liquidation interval: ${config.keeper.liquidationIntervalMs / 1000}s`);
  logger.info('═══════════════════════════════════════════════');

  // Check keeper wallet balance on startup
  const balance = await checkKeeperBalance();
  if (balance < 1) {
    logger.warn('⚠️  Keeper wallet balance is very low — fund it before production use');
  }

  // Run initial cycles immediately
  logger.info('Running initial cycles...');

  await safeRun('Calendar', runCalendarCycle);
  trackCycle('calendar');

  await safeRun('Liquidation', runLiquidationCycle);
  trackCycle('liquidation');

  logger.info('Initial cycles complete — starting intervals');

  // Set up recurring intervals
  setInterval(async () => {
    await safeRun('Calendar', runCalendarCycle);
    trackCycle('calendar');
  }, config.keeper.calendarIntervalMs);

  setInterval(async () => {
    await safeRun('Liquidation', runLiquidationCycle);
    trackCycle('liquidation');
  }, config.keeper.liquidationIntervalMs);

  // Periodic balance check (every 10 minutes)
  setInterval(async () => {
    await checkKeeperBalance();
  }, 10 * 60 * 1000);

  // Start health endpoint
  startHealthServer();

  logger.info('✅ All keepers running');
}

main().catch((err) => {
  logger.error('Keeper bot failed to start', err);
  process.exit(1);
});
