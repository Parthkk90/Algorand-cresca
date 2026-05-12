/**
 * Pool Registry Test Script
 * Verifies pool discovery from Cresca DART contract
 */

import { discoverPools, getPool, refreshPools, invalidateCache } from '../lib/services/poolRegistry.js';
import { logger } from '../shared/logger.js';

async function testPoolRegistry() {
  try {
    logger.info('🧪 Testing Pool Registry...');

    // Test 1: Discover all pools
    logger.info('\n📋 Test 1: Discover all pools');
    const pools1 = await discoverPools();
    logger.info(`✅ Found ${pools1.size} pools`);

    if (pools1.size > 0) {
      pools1.forEach((pool, assetId) => {
        logger.info(`   - Asset ${assetId}:`, {
          algoReserve: pool.algoReserve.toString(),
          assetReserve: pool.assetReserve.toString(),
          enabled: pool.enabled,
        });
      });
    } else {
      logger.warn('⚠️  No pools found (expected on testnet if no pools configured)');
    }

    // Test 2: Verify caching (second call should be instant)
    logger.info('\n⏱️  Test 2: Verify caching');
    const start = Date.now();
    const pools2 = await discoverPools();
    const elapsed = Date.now() - start;
    logger.info(`✅ Second call took ${elapsed}ms (should be <10ms if cached)`);

    // Test 3: Get specific pool
    if (pools1.size > 0) {
      logger.info('\n🔍 Test 3: Get specific pool');
      const firstAssetId = Array.from(pools1.keys())[0];
      const pool = await getPool(firstAssetId);
      logger.info(`✅ Retrieved pool for asset ${firstAssetId}:`, pool);
    }

    // Test 4: Invalidate cache and refresh
    logger.info('\n🔄 Test 4: Invalidate and refresh cache');
    invalidateCache();
    const pools3 = await discoverPools();
    logger.info(`✅ Refreshed pools: ${pools3.size} pools found`);

    // Test 5: Refresh function
    logger.info('\n🔄 Test 5: Force refresh');
    const pools4 = await refreshPools();
    logger.info(`✅ Refreshed: ${pools4.size} pools`);

    logger.info('\n✨ All tests completed!');
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testPoolRegistry();
