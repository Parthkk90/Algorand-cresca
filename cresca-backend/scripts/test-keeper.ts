/**
 * Test Keeper Script
 * ==================
 * Manually trigger one cycle of each keeper for testing.
 * Run: npx tsx scripts/test-keeper.ts
 */

import 'dotenv/config';
import { checkKeeperBalance } from '../keeper/algorand.js';
import { runCalendarCycle } from '../keeper/calendarKeeper.js';
import { runLiquidationCycle } from '../keeper/liquidationKeeper.js';
import { logger } from '../shared/logger.js';

async function test() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('  🧪 Cresca Keeper — Manual Test Run');
  logger.info('═══════════════════════════════════════════════');

  logger.info('');
  logger.info('1️⃣  Checking keeper wallet balance...');
  const balance = await checkKeeperBalance();
  logger.info(`   Balance: ${balance.toFixed(6)} ALGO`);

  logger.info('');
  logger.info('2️⃣  Running calendar keeper cycle...');
  await runCalendarCycle();

  logger.info('');
  logger.info('3️⃣  Running liquidation keeper cycle...');
  await runLiquidationCycle();

  logger.info('');
  logger.info('✅ Test run complete');
  process.exit(0);
}

test().catch((err) => {
  logger.error('Test failed', err);
  process.exit(1);
});
