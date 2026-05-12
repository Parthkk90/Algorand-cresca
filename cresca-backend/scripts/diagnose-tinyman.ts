import algosdk from 'algosdk';
import { logger } from '../shared/logger.js';

const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');

async function diagnose() {
  const APP_ID = 62368684;
  
  console.log(`🔍 Diagnosing Tinyman Pool App ${APP_ID}\n`);
  
  try {
    const app = await algod.getApplicationByID(APP_ID).do();
    const globalState = app.params['global-state'] || [];
    
    console.log(`✅ App exists!`);
    console.log(`   Creator: ${app.params.creator}`);
    console.log(`   Global state entries: ${globalState.length}\n`);
    
    if (globalState.length === 0) {
      console.log('⚠️  WARNING: No global state found!');
      console.log('   This might not be a pool contract.\n');
    }
    
    console.log('📊 Global State:');
    globalState.forEach((item, i) => {
      const keyBase64 = item.key;
      const keyDecoded = Buffer.from(keyBase64, 'base64').toString('utf8');
      const keyHex = Buffer.from(keyBase64, 'base64').toString('hex');
      
      let value = 'unknown';
      if (item.value.uint !== undefined) {
        value = item.value.uint.toString();
      } else if (item.value.bytes) {
        value = `bytes: ${item.value.bytes}`;
      }
      
      console.log(`   ${i}. Key: ${keyDecoded || `(hex: ${keyHex})`}`);
      console.log(`      Base64: ${keyBase64}`);
      console.log(`      Value: ${value}`);
      console.log(`      Type: ${item.value.type}\n`);
    });
    
    // Check for expected Tinyman keys
    const expectedKeys = ['asset_1_id', 'asset_2_id', 'asset_1_reserves', 'asset_2_reserves', 'total_fee_share'];
    console.log('🔍 Looking for expected Tinyman pool keys:');
    
    expectedKeys.forEach(key => {
      const found = globalState.find(item => 
        Buffer.from(item.key, 'base64').toString('utf8') === key
      );
      
      if (found) {
        console.log(`   ✅ ${key}: ${found.value.uint || found.value.bytes}`);
      } else {
        console.log(`   ❌ ${key}: NOT FOUND`);
      }
    });
    
    // Check if this looks like a Tinyman pool
    console.log('\n📋 Verdict:');
    const hasAsset1 = globalState.find(item => 
      Buffer.from(item.key, 'base64').toString('utf8') === 'asset_1_id'
    );
    const hasAsset2 = globalState.find(item => 
      Buffer.from(item.key, 'base64').toString('utf8') === 'asset_2_id'
    );
    const hasReserves = globalState.find(item => 
      Buffer.from(item.key, 'base64').toString('utf8').includes('reserves')
    );
    
    if (hasAsset1 && hasAsset2 && hasReserves) {
      console.log('   ✅ This looks like a valid Tinyman V2 pool!');
      console.log('   ✅ Should work with our adapter.');
    } else if (hasAsset1 && hasAsset2) {
      console.log('   ⚠️  Has asset IDs but missing reserves data.');
      console.log('   ⚠️  Might need adapter adjustment.');
    } else {
      console.log('   ❌ Does NOT look like a Tinyman pool contract.');
      console.log('   ❌ This might be a LogicSig or pool account, not the contract.');
      console.log('\n   💡 Try querying the pool account for app interactions:');
      console.log('   https://testnet.algoexplorer.io/account/6YL7XGUPNFEY4TH5YVDYQLNVM33KSP2VFATAYGFMSIDNOW5OGCCMHVQ6XE');
    }
    
  } catch (error) {
    console.error('❌ Error:', (error as any).message);
    console.error('\n   App ID 62368684 might not exist or might not be accessible.');
  }
}

diagnose();
