const PYTH_FEED_IDS: Record<string, string> = {
  'ALGO/USD': '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318',
  'USDC/USD': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
};

async function fetchHermesPrices(symbols: string[]): Promise<{
  prices: Record<string, number>;
  publishTime: number;
}> {
  const ids = symbols.map(s => PYTH_FEED_IDS[s]);
  const url = `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${ids.join('&ids[]=')}`;
  const res = await fetch(url);
  const data = await res.json() as Array<{
    price: { price: string; expo: number; publish_time: string };
  }>;

  const prices: Record<string, number> = {};
  let publishTime = 0;

  for (let i = 0; i < symbols.length; i++) {
    const feed = data[i];
    prices[symbols[i]] = parseFloat(feed.price.price) * Math.pow(10, feed.price.expo);
    publishTime = Math.max(publishTime, parseInt(feed.price.publish_time));
  }

  return { prices, publishTime };
}
/**
 * Liquidation Keeper
 * ==================
 * Scans CrescaBucketProtocol for open positions and liquidates
 * any that are underwater (margin + PnL <= 0).
 *
 * Anyone can call liquidate_position() — the keeper acts as a
 * public service to maintain protocol health.
 */

import { AtomicTransactionComposer, ABIMethod } from 'algosdk';
import { getAlgod, getKeeperAccount, algosdk } from './algorand.js';
import {
  CONTRACT_APP_IDS,
  BUCKET_METHODS,
  BOX_PREFIXES,
  buildBoxKey,
  uint64ToBytes,
} from '../shared/contracts.js';
import { logger } from '../shared/logger.js';
import { logKeeperExecution } from '../shared/supabase.js';

const APP_ID = CONTRACT_APP_IDS.CrescaBucketProtocol;

/**
 * Decoded position from box storage.
 *
 * Matches the ARC-4 packed `Position` struct in cresca_bucket_protocol.py:
 *
 *   OFFSET  FIELD              SIZE
 *   0       bucket_id           8 bytes (arc4.UInt64)
 *   8       is_long             1 byte  (arc4.Bool)
 *   9       margin              8 bytes (arc4.UInt64, μALGO)
 *   17      entry_price         8 bytes (arc4.UInt64, 8-decimal)
 *   25      owner              32 bytes (arc4.Address)
 *   57      active              1 byte  (arc4.Bool)
 *   58      open_timestamp      8 bytes (arc4.UInt64)
 *   TOTAL                      66 bytes
 */
interface DecodedPosition {
  ownerAddress: string;
  positionId: number;
  bucketId: number;
  isLong: boolean;
  marginMicroAlgo: number;
  entryPrice: number;
  active: boolean;
  openTimestamp: number;
}

function decodePositionBox(
  boxName: Uint8Array,
  boxValue: Uint8Array,
): DecodedPosition | null {
  try {
    const nameBuf = Buffer.from(boxName);

    // Box name: 'pos_' (4 bytes) + owner pubkey (32 bytes) + position_id (8 bytes)
    if (nameBuf.length < 44) return null;
    const prefix = nameBuf.subarray(0, 4).toString();
    if (prefix !== BOX_PREFIXES.POSITION) return null;

    const ownerPubKey = nameBuf.subarray(4, 36);
    const positionId = Number(Buffer.from(nameBuf.subarray(36, 44)).readBigUInt64BE(0));
    const ownerAddress = algosdk.encodeAddress(new Uint8Array(ownerPubKey));

    const buf = Buffer.from(boxValue);
    if (buf.length < 66) return null;

    return {
      ownerAddress,
      positionId,
      bucketId: Number(buf.readBigUInt64BE(0)),
      isLong: buf[8] === 1,
      marginMicroAlgo: Number(buf.readBigUInt64BE(9)),
      entryPrice: Number(buf.readBigUInt64BE(17)),
      // owner at offset 25-56 (redundant — already extracted from box name)
      active: buf[57] === 1,
      openTimestamp: Number(buf.readBigUInt64BE(58)),
    };
  } catch (err) {
    logger.debug('Failed to decode position box', err);
    return null;
  }
}

async function liquidatePosition(position: DecodedPosition, assetPrices: bigint[], publishTime: bigint): Promise<string | null> {
  const algod = getAlgod();
  const keeper = getKeeperAccount();
  const sp = await algod.getTransactionParams().do();

  const ownerPubKey = algosdk.decodeAddress(position.ownerAddress).publicKey;
  const positionBox = buildBoxKey(
    BOX_PREFIXES.POSITION,
    new Uint8Array(ownerPubKey),
    uint64ToBytes(position.positionId),
  );
  const collateralBox = buildBoxKey(BOX_PREFIXES.COLLATERAL, new Uint8Array(ownerPubKey));
  const bucketBox = buildBoxKey(
    BOX_PREFIXES.BUCKET,
    new Uint8Array(ownerPubKey),
    uint64ToBytes(position.bucketId),
  );

  const atc = new AtomicTransactionComposer();

  atc.addMethodCall({
    appID: APP_ID,
    method: ABIMethod.fromSignature(BUCKET_METHODS.liquidate_position),
    methodArgs: [position.ownerAddress, position.positionId, assetPrices, publishTime],
    sender: keeper.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(keeper),
    suggestedParams: { ...sp, fee: 3000, flatFee: true },
    appAccounts: [position.ownerAddress],
    boxes: [
      { appIndex: APP_ID, name: positionBox },
      { appIndex: APP_ID, name: collateralBox },
      { appIndex: APP_ID, name: bucketBox },
    ],
  });

  try {
    const result = await atc.execute(algod, 4);
    return result.txIDs[result.txIDs.length - 1];
  } catch (err) {
    // Expected to fail if position is not yet liquidatable
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('assert') || errMsg.includes('logic eval error')) {
      // Position is not underwater — this is normal
      logger.debug(`Position #${position.positionId} not liquidatable (expected)`);
    } else {
      logger.error(`Liquidation failed for position #${position.positionId}`, err);
    }
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────

export async function runLiquidationCycle(): Promise<void> {
  const algod = getAlgod();

  try {
    // 1. List all boxes for the BucketProtocol app
    const boxesResp = await algod.getApplicationBoxes(APP_ID).do() as { boxes?: Array<{ name: Uint8Array | string }> };
    const boxes = boxesResp.boxes ?? [];

    if (boxes.length === 0) {
      logger.debug('Liquidation keeper: no boxes found');
      return;
    }

    let checked = 0;
    let liquidated = 0;

    for (const box of boxes) {
      const nameBytes = typeof box.name === 'string'
        ? new Uint8Array(Buffer.from(box.name, 'base64'))
        : new Uint8Array(box.name);

      // Only check position boxes
      const prefix = Buffer.from(nameBytes.subarray(0, 4)).toString();
      if (prefix !== BOX_PREFIXES.POSITION) continue;

      // Read position data
      let boxData: { value: Uint8Array | string };
      try {
        boxData = await algod.getApplicationBoxByName(APP_ID, nameBytes).do() as any;
      } catch {
        continue;
      }

      const valueBytes = typeof boxData.value === 'string'
        ? new Uint8Array(Buffer.from(boxData.value, 'base64'))
        : new Uint8Array(boxData.value);

      const position = decodePositionBox(nameBytes, valueBytes);
      if (!position || !position.active) continue;

      checked++;

      // Attempt liquidation — the contract itself checks if the position
      // is underwater. If it's healthy, the call will fail with an assertion
      // error, which we handle gracefully above.
      const { prices, publishTime } = await fetchHermesPrices(['ALGO/USD', 'USDC/USD']);
      const assetPrices = [
        BigInt(Math.round(prices['ALGO/USD'] * 1e8)),
        BigInt(Math.round(prices['USDC/USD'] * 1e8)),
      ];
      const txId = await liquidatePosition(position, assetPrices, BigInt(publishTime));
      if (txId) {
        liquidated++;
        logger.keeper('Position liquidated', txId, {
          positionId: position.positionId,
          owner: position.ownerAddress.slice(0, 8),
          bucketId: position.bucketId,
        });

        await logKeeperExecution({
          action_type: 'liquidation',
          tx_id: txId,
          details: {
            positionId: position.positionId,
            owner: position.ownerAddress,
            bucketId: position.bucketId,
            marginMicroAlgo: position.marginMicroAlgo,
          },
        });

        // TODO (Phase 3): send push notification to position owner
      }
    }

    if (checked > 0) {
      logger.debug(`Liquidation keeper: checked ${checked} positions, liquidated ${liquidated}`);
    }
  } catch (err) {
    logger.error('Liquidation keeper cycle failed', err);
  }
}
