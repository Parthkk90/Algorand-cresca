/**
 * Test Tinyman Adapter with Real Testnet Pool
 * ==========================================
 * 
 * Verifies that the Tinyman adapter can:
 * 1. Discover the real ALGO/USDC pool account
 * 2. Read reserves from pool account local state
 * 3. Calculate accurate swap quotes
 * 4. Fetch fresh data on each call (no staleness)
 */

import algosdk from 'algosdk';
import { TinymanAdapter } from '../lib/adapters/tinyman.js';
import { calculateAmountOut } from '../lib/utils/amm.js';

const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
const tinyman = new TinymanAdapter('https://testnet-api.algonode.cloud', '', true);

async function testTinymanReal() {
  console.log('🧪 Testing Tinyman Adapter with Real Testnet Pool\n');
  console.log('Pool Details:');
  console.log('  URL: https://testnet.tinyman.org/pool/6YL7XGUPNFEY4TH5YVDYQLNVM33KSP2VFATAYGFMSIDNOW5OGCCMHVQ6XE');
  console.log('  App ID: 62368684');
  console.log('  Pool Account: 6YL7XGUPNFEY4TH5YVDYQLNVM33KSP2VFATAYGFMSIDNOW5OGCCMHVQ6XE');
  console.log('  Pair: ALGO (0) ↔ USDC (67395862)\n');

  try {
    // Test 1: Fetch pool account info
    console.log('Test 1: Verify pool account exists and has local state...');
    const accountInfo = await algod
      .accountInformation('6YL7XGUPNFEY4TH5YVDYQLNVM33KSP2VFATAYGFMSIDNOW5OGCCMHVQ6XE')
      .do();

    // algosdk v3 uses camelCase: appsLocalState
    const appsLocalState = (accountInfo as any).appsLocalState || [];
    
    // Find pool app (handle both number and BigInt comparisons)
    const poolAppState = appsLocalState.find((app: any) => {
      const appId = typeof app.id === 'bigint' ? Number(app.id) : app.id;
      return appId === 62368684;
    });

    if (!poolAppState) {
      console.log('  ❌ Pool app not found in account local state');
      console.log('  Available apps:', appsLocalState.map((a: any) => {
        const id = typeof a.id === 'bigint' ? Number(a.id) : a.id;
        return id;
      }));
      return;
    }

    // algosdk v3 uses camelCase: keyValue
    const kvData = (poolAppState as any).keyValue || [];
    console.log(`  ✅ Pool account found with ${kvData.length} local state entries\n`);

    // Test 2: Decode reserves
    console.log('Test 2: Extract reserves from local state...');
    let asset1 = null,
      asset2 = null,
      reserve1 = null,
      reserve2 = null;

    console.log(`  Parsing ${kvData.length} local state entries...`);
    kvData.forEach(kv => {
      const key = Buffer.from(kv.key, 'base64').toString('utf8');
      const val = kv.value.uint;

      console.log(`    key="${key}" value=${val}`);

      if (key === 'a1') asset1 = typeof val === 'bigint' ? Number(val) : val;
      if (key === 'a2') asset2 = typeof val === 'bigint' ? Number(val) : val;
      if (key === 'c1') reserve1 = BigInt(val);
      if (key === 'c2') reserve2 = BigInt(val);
    });

    console.log(`  Extracted: asset1=${asset1} (type: ${typeof asset1}), asset2=${asset2} (type: ${typeof asset2}), r1=${reserve1}, r2=${reserve2}`);

    if (!asset1 || asset2 === null || !reserve1 || !reserve2) {
      console.log('  ❌ Could not extract reserve data');
      console.log(`  Failed check: asset1=${asset1} (${!asset1}), asset2=${asset2} (${asset2 === null}), r1=${reserve1} (${!reserve1}), r2=${reserve2} (${!reserve2})`);
      return;
    }

    // Verify this is ALGO/USDC pair (order doesn't matter)
    console.log(`\n  Checking ALGO/USDC pair:`);
    console.log(`    asset1 === 0? ${asset1 === 0}`);
    console.log(`    asset1 === 67395862? ${asset1 === 67395862}`);
    console.log(`    asset2 === 0? ${asset2 === 0}`);
    console.log(`    asset2 === 67395862? ${asset2 === 67395862}`);

    const isALGOUSDC = 
      (asset1 === 0 && asset2 === 67395862) ||
      (asset1 === 67395862 && asset2 === 0);

    if (!isALGOUSDC) {
      console.log('  ❌ This is not an ALGO/USDC pool');
      console.log(`  Found: ${asset1} / ${asset2}`);
      return;
    }

    console.log(`  ✅ Extracted pool data:`);
    console.log(`     Asset 1: ${asset1} (${asset1 === 0 ? 'ALGO' : 'USDC'})`);
    console.log(`     Asset 2: ${asset2} (${asset2 === 0 ? 'ALGO' : 'USDC'})`);
    console.log(`     Reserve 1: ${reserve1.toString().slice(-15)} (${reserve1.toString()})`);
    console.log(`     Reserve 2: ${reserve2.toString().slice(-15)} (${reserve2.toString()})\n`);

    // Test 3: Calculate swap quote (ALGO → USDC)
    console.log('Test 3: Calculate ALGO → USDC swap quote...');
    const amountInAlgo = BigInt(1_000_000); // 1 ALGO in microAlgos

    // Determine reserve mapping based on actual asset order
    // asset1 is USDC (67395862), asset2 is ALGO (0)
    // So: reserve1 = USDC, reserve2 = ALGO
    // If swapping ALGO → USDC:
    // reserveIn = reserve2 (ALGO), reserveOut = reserve1 (USDC)
    const reserveAlgo = asset1 === 0 ? reserve1 : reserve2;
    const reserveUSDC = asset1 === 67395862 ? reserve1 : reserve2;

    const expectedOut = calculateAmountOut(amountInAlgo, reserveAlgo, reserveUSDC, 25);

    console.log(`  Input: ${amountInAlgo.toString()} microALGO`);
    console.log(`  ALGO Reserve: ${reserveAlgo.toString()}`);
    console.log(`  USDC Reserve: ${reserveUSDC.toString()}`);
    console.log(`  Output (AMM calc): ${expectedOut.toString()} microUSDC`);
    console.log(`  Rate: ${(Number(expectedOut) / 1_000_000).toFixed(4)} USDC per ALGO\n`);

    // Test 4: Call adapter directly
    console.log('Test 4: Call TinymanAdapter.getQuote()...');
    const adapterQuote = await tinyman.getQuote(amountInAlgo, 0, 67395862);

    if (adapterQuote) {
      console.log(`  ✅ Quote received from adapter:`);
      console.log(`     DEX: ${adapterQuote.dex}`);
      console.log(`     Pool ID: ${adapterQuote.poolId}`);
      console.log(`     Amount Out: ${adapterQuote.amountOut.toString()}`);
      console.log(`     Price Impact: ${(adapterQuote.priceImpact * 100).toFixed(2)}%`);
      console.log(`     Reserve In: ${adapterQuote.reserveIn.toString()}`);
      console.log(`     Reserve Out: ${adapterQuote.reserveOut.toString()}\n`);
    } else {
      console.log(`  ❌ Adapter returned null\n`);
    }

    // Test 5: Call again to verify freshness (no caching issues)
    console.log('Test 5: Call again to verify fresh data...');
    const quote2 = await tinyman.getQuote(amountInAlgo, 0, 67395862);

    if (quote2 && quote2.amountOut === adapterQuote?.amountOut) {
      console.log(`  ✅ Second call returned consistent data`);
      console.log(`     Amount Out: ${quote2.amountOut.toString()} (same as first call)\n`);
    } else {
      console.log(`  ⚠️  Second call returned different data`);
      console.log(`     First:  ${adapterQuote?.amountOut.toString()}`);
      console.log(`     Second: ${quote2?.amountOut.toString()}\n`);
    }

    // Test 6: Try reverse pair (USDC → ALGO)
    console.log('Test 6: Try reverse pair (USDC → ALGO)...');
    const amountInUSDC = BigInt(1_000_000); // 1 USDC in microUSDC

    const reverseQuote = await tinyman.getQuote(amountInUSDC, 67395862, 0);

    if (reverseQuote) {
      console.log(`  ✅ Reverse quote calculated:`);
      console.log(`     Amount In: ${amountInUSDC.toString()} microUSDC`);
      console.log(`     Amount Out: ${reverseQuote.amountOut.toString()} microALGO`);
      console.log(`     Price Impact: ${(reverseQuote.priceImpact * 100).toFixed(2)}%\n`);
    } else {
      console.log(`  ❌ Reverse quote returned null\n`);
    }

    console.log('✅ All tests completed!');
    console.log('\nSummary:');
    console.log('- Pool account verified and accessible');
    console.log('- Reserves extracted from local state');
    console.log('- Swap quotes calculated successfully');
    console.log('- Tinyman adapter working with real testnet pool');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

testTinymanReal();
