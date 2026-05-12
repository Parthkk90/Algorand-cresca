/**
 * Tinyman V2 Adapter Test Script
 * Verifies quote fetching from Tinyman pools (when available)
 */

import { TinymanAdapter } from '../lib/adapters/tinyman.js';
import { logger } from '../shared/logger.js';

const ALGOD_URL = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';

async function testTinymanAdapter() {
  try {
    logger.info('🧪 Testing Tinyman V2 Adapter...');

    const adapter = new TinymanAdapter(ALGOD_URL, ALGOD_TOKEN, true); // testnet

    // Test 1: ALGO → USDC quote (if pool exists)
    logger.info('\n📊 Test 1: ALGO → USDC quote');
    const amountIn = 1_000_000n; // 1 ALGO
    const quote1 = await adapter.getQuote(amountIn, 0, 10458941);

    if (quote1) {
      logger.info(`✅ Tinyman quote received:`, {
        dex: quote1.dex,
        poolId: quote1.poolId,
        amountIn: amountIn.toString(),
        amountOut: quote1.amountOut.toString(),
        priceImpact: quote1.priceImpact.toFixed(6),
      });
    } else {
      logger.warn('⚠️  No Tinyman pool available for ALGO-USDC (expected on empty testnet)');
    }

    // Test 2: ALGO → TST quote (if pool exists)
    logger.info('\n📊 Test 2: ALGO → TST quote');
    const quote2 = await adapter.getQuote(amountIn, 0, 757259066);

    if (quote2) {
      logger.info(`✅ Tinyman quote received:`, {
        dex: quote2.dex,
        poolId: quote2.poolId,
        amountIn: amountIn.toString(),
        amountOut: quote2.amountOut.toString(),
        priceImpact: quote2.priceImpact.toFixed(6),
      });
    } else {
      logger.warn('⚠️  No Tinyman pool available for ALGO-TST');
    }

    // Test 3: Unsupported pair (should return null)
    logger.info('\n❌ Test 3: Unsupported pair');
    const quote3 = await adapter.getQuote(amountIn, 123, 456);

    if (!quote3) {
      logger.info('✅ Correctly returned null for unsupported pair');
    } else {
      logger.error('❌ Should have returned null for unsupported pair');
    }

    // Test 4: Zero amount input
    logger.info('\n⚠️  Test 4: Zero amount (edge case)');
    const quote4 = await adapter.getQuote(0n, 0, 10458941);

    if (!quote4) {
      logger.info('✅ Correctly handled zero amount');
    }

    logger.info('\n✨ Tinyman tests completed!');

    if (!quote1 && !quote2) {
      logger.warn('\n⚠️  NOTE: No Tinyman pools found on testnet');
      logger.warn('To add testnet pools:');
      logger.warn('1. Find Tinyman V2 testnet validator app ID');
      logger.warn('2. Identify pool app IDs for ALGO-USDC, ALGO-TST pairs');
      logger.warn('3. Add to TESTNET_POOLS in lib/adapters/tinyman.ts');
      logger.warn('System will continue with Cresca pools only.');
    }
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTinymanAdapter();
