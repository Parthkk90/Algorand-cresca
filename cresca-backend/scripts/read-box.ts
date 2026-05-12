import algosdk from 'algosdk';
const algod = new algosdk.Algodv2(
  '',
  'https://testnet-api.algonode.cloud',
  ''
);

const APP_ID = 758849063;

async function main() {
  const boxName = new Uint8Array(Buffer.from('cGxfAAAAAC07Hzo=', 'base64'));

  const result = await algod.getApplicationBoxByName(APP_ID, boxName).do();

  console.log(result);
}

main().catch(console.error);
