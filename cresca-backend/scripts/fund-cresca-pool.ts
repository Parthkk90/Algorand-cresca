import algosdk from '@algorandfoundation/algosdk';

const algodClient = new algosdk.Algodv2(
  '',
  'https://testnet-api.algonode.cloud',
  ''
);

const CRESCA_APP_ID = 762822712;

// Your deployer account mnemonic
const mnemonic = 'YOUR_MNEMONIC_HERE';
const account = algosdk.mnemonicToSecretKey(mnemonic);

async function fundPool() {
  const params = await algodClient.getTransactionParams().do();

  // 1. Opt-in to USDC if needed
  const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: account.addr,
    to: account.addr,
    assetIndex: 10458941, // USDC testnet
    amount: 0,
    suggestedParams: params,
  });

  // 2. Fund pool with ALGO
  const fundAlgoTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: account.addr,
    to: algosdk.getApplicationAddress(CRESCA_APP_ID),
    amount: 10_000_000, // 10 ALGO
    suggestedParams: params,
  });

  // Sign and send
  const signedTxn = fundAlgoTxn.signTxn(account.sk);
  await algodClient.sendRawTransaction(signedTxn).do();

  console.log('✅ Pool funded!');
}

fundPool();
