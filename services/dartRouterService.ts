/**
 * DART Router Service
 * ===================
 * Provides two capabilities:
 *
 * 1. Swap quote estimation using Pyth oracle prices:
 *    fetchQuote(), getDartSavings(), formatRoute()
 *
 * 2. Oracle prices via Pyth Network (Hermes HTTP API):
 *    getAssetOraclePrice(), getOraclePrices()
 *    Prices are ALGO-denominated 8-decimal integers for CrescaBucketProtocol.
 *    ASA 0 (ALGO) = 100_000_000; others derived as (asset_usd/algo_usd)*1e8.
 */

import algosdk, { ABIMethod, AtomicTransactionComposer } from 'algosdk';
import { ASA_ID_TO_PYTH_SYMBOL } from '../constants/baskets';
import { algorandService } from './algorandService';
import { pythOracleService } from './pythOracleService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Testnet ASA IDs supported by the current swap UI
export const TESTNET_ASSETS: Record<string, { asaId: number; decimals: number; name: string }> = {
  ALGO: { asaId: 0,        decimals: 6, name: 'Algorand'  },
  USDC: { asaId: 10458941, decimals: 6, name: 'USD Coin'  },
  TST:  { asaId: 758849338, decimals: 6, name: 'Cresca Test Asset' },
};

const DART_SWAP_APP_ID = 758849063;
const LIVE_POOL_ASA_IDS = new Set<number>([
  TESTNET_ASSETS.TST.asaId,
]);

const DART_METHODS = {
  get_quote_exact_in: 'get_quote_exact_in(uint64,bool,uint64)uint64',
  swap_exact_algo_for_asset: 'swap_exact_algo_for_asset(pay,uint64,uint64,address)uint64',
  swap_exact_asset_for_algo: 'swap_exact_asset_for_algo(axfer,uint64,uint64,address)uint64',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwapRouteLeg {
  name: string;        // e.g. "pact: 0.3% fee tier"
  in:   { id: number };
  out:  { id: number };
}

export interface SwapRoute {
  percent: number;
  path: SwapRouteLeg[];
}

export interface VenueQuote {
  name:  string;
  value: number;  // output amount in base units
}

export interface SwapQuote {
  quote:            number;       // output amount estimate in base units
  profitAmount:     number;
  profitASAID:      number;
  usdIn:            number;
  usdOut:           number;
  userPriceImpact:  number;
  route:            SwapRoute[];
  quotes:           VenueQuote[];
  requiredAppOptIns: number[];
  txnPayload:       { iv: string; data: string };
  fromASAID?: number;
  toASAID?: number;
  amountInBase?: number;
}

export interface DartSavings {
  savingsBaseUnits: number;  // extra output vs best single-venue quote
  savingsPct:       number;  // as a percentage of single-venue output
}

// ---------------------------------------------------------------------------
// DartRouterService
// ---------------------------------------------------------------------------

class DartRouterService {
  // ASA_ID_TO_PYTH_SYMBOL is the authoritative mapping (from constants/baskets).
  // Keeping a local reference here so internal methods can use it without re-importing.

  private isLivePair(fromASAID: number, toASAID: number): boolean {
    const algo = TESTNET_ASSETS.ALGO.asaId;
    const candidate = fromASAID === algo ? toASAID : (toASAID === algo ? fromASAID : -1);
    return candidate !== -1 && LIVE_POOL_ASA_IDS.has(candidate);
  }

  private poolBoxName(assetId: number): Uint8Array {
    const id = BigInt(assetId);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(id);
    return new Uint8Array(Buffer.concat([Buffer.from('pl_'), buf]));
  }

  private async ensureAssetOptIn(assetId: number, address?: string): Promise<void> {
    if (assetId === TESTNET_ASSETS.ALGO.asaId) return;

    const acct = algorandService.getAccount();
    const addr = address ?? String(acct.addr);
    const client = algorandService.getAlgodClient();

    const info = await client.accountInformation(addr).do();
    const assets: Array<{ 'asset-id'?: number } | { assetId?: number }> =
      (info?.assets as any[]) ?? [];
    const hasAsset = assets.some((a: any) =>
      Number(a?.['asset-id'] ?? a?.assetId ?? -1) === assetId,
    );
    if (hasAsset) return;

    const sp = await client.getTransactionParams().do();
    const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: acct.addr,
      receiver: acct.addr,
      amount: 0,
      assetIndex: assetId,
      suggestedParams: sp,
    });

    const signed = optInTxn.signTxn(acct.sk);
    const { txid } = await client.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(client, txid, 4);
  }

  private async fetchLiveQuote(
    fromASAID: number,
    toASAID: number,
    amount: number,
  ): Promise<SwapQuote> {
    const client = algorandService.getAlgodClient();
    const account = algorandService.getAccount();
    const assetId = fromASAID === TESTNET_ASSETS.ALGO.asaId ? toASAID : fromASAID;
    const isAlgoIn = fromASAID === TESTNET_ASSETS.ALGO.asaId;

    const atc = new AtomicTransactionComposer();
    const sp = await client.getTransactionParams().do();
    atc.addMethodCall({
      appID: DART_SWAP_APP_ID,
      method: ABIMethod.fromSignature(DART_METHODS.get_quote_exact_in),
      methodArgs: [assetId, isAlgoIn, amount],
      sender: account.addr,
      signer: algosdk.makeBasicAccountTransactionSigner(account),
      suggestedParams: { ...sp, fee: 1000, flatFee: true },
      boxes: [{ appIndex: DART_SWAP_APP_ID, name: this.poolBoxName(assetId) }],
      appForeignAssets: [assetId],
    });

    const res = await atc.execute(client, 4);
    const out = Number(res.methodResults?.[0]?.returnValue ?? 0);

    const fromDecimals = this.getDecimals(fromASAID);
    const toDecimals = this.getDecimals(toASAID);
    const fromUsd = await this.getAssetUsdPrice(fromASAID);
    const toUsd = await this.getAssetUsdPrice(toASAID);
    const usdIn = (amount / Math.pow(10, fromDecimals)) * fromUsd;
    const usdOut = (out / Math.pow(10, toDecimals)) * toUsd;
    const impactPct = usdIn > 0 ? Math.max(0, ((usdIn - usdOut) / usdIn) * 100) : 0;

    return {
      quote: out,
      profitAmount: 0,
      profitASAID: toASAID,
      usdIn,
      usdOut,
      userPriceImpact: impactPct,
      route: [
        {
          percent: 100,
          path: [{ name: 'cresca-dart', in: { id: fromASAID }, out: { id: toASAID } }],
        },
      ],
      quotes: [{ name: 'cresca-dart', value: out }],
      requiredAppOptIns: [DART_SWAP_APP_ID],
      txnPayload: { iv: '', data: '' },
      fromASAID,
      toASAID,
      amountInBase: amount,
    };
  }

  private getDecimals(asaId: number): number {
    if (asaId === TESTNET_ASSETS.ALGO.asaId) return TESTNET_ASSETS.ALGO.decimals;
    if (asaId === TESTNET_ASSETS.USDC.asaId) return TESTNET_ASSETS.USDC.decimals;
    return 6;
  }

  private async getAssetUsdPrice(asaId: number): Promise<number> {
    if (asaId === TESTNET_ASSETS.USDC.asaId) return 1;
    if (asaId === TESTNET_ASSETS.ALGO.asaId) {
      const algo = await pythOracleService.getPrice('ALGO');
      if (!algo?.price) throw new Error('ALGO price unavailable');
      return algo.price;
    }

    const symbol = ASA_ID_TO_PYTH_SYMBOL[asaId];
    if (!symbol) throw new Error(`No price symbol configured for ASA ${asaId}`);
    const asset = await pythOracleService.getPrice(symbol);
    if (!asset?.price) throw new Error(`${symbol} price unavailable`);
    return asset.price;
  }

  /**
  * Fetch a swap quote estimate using oracle prices.
   *
   * @param fromASAID  Input asset ID (0 = ALGO)
   * @param toASAID    Output asset ID (0 = ALGO)
   * @param amount     Amount in base units (μALGO or ASA smallest unit)
   * @param type       'fixed-input' (default) or 'fixed-output'
   */
  async fetchQuote(
    fromASAID: number,
    toASAID: number,
    amount: number,
    type: 'fixed-input' | 'fixed-output' = 'fixed-input',
  ): Promise<SwapQuote> {
    if (type !== 'fixed-input') {
      throw new Error('Only fixed-input quotes are currently supported');
    }

    if (this.isLivePair(fromASAID, toASAID)) {
      return this.fetchLiveQuote(fromASAID, toASAID, amount);
    }

    const fromDecimals = this.getDecimals(fromASAID);
    const toDecimals = this.getDecimals(toASAID);
    const fromUsd = await this.getAssetUsdPrice(fromASAID);
    const toUsd = await this.getAssetUsdPrice(toASAID);

    let inAmountBase = amount;
    let outAmountBase = amount;

    if (type === 'fixed-input') {
      const inAmount = amount / Math.pow(10, fromDecimals);
      const outAmount = (inAmount * fromUsd) / toUsd;
      outAmountBase = Math.round(outAmount * Math.pow(10, toDecimals));
    } else {
      const outAmount = amount / Math.pow(10, toDecimals);
      const inAmount = (outAmount * toUsd) / fromUsd;
      inAmountBase = Math.round(inAmount * Math.pow(10, fromDecimals));
    }

    const usdIn = (inAmountBase / Math.pow(10, fromDecimals)) * fromUsd;
    const usdOut = (outAmountBase / Math.pow(10, toDecimals)) * toUsd;

    return {
      quote: type === 'fixed-input' ? outAmountBase : inAmountBase,
      profitAmount: 0,
      profitASAID: toASAID,
      usdIn,
      usdOut,
      userPriceImpact: 0,
      route: [
        {
          percent: 100,
          path: [{ name: 'oracle-estimate', in: { id: fromASAID }, out: { id: toASAID } }],
        },
      ],
      quotes: [],
      requiredAppOptIns: [],
      txnPayload: { iv: '', data: '' },
      fromASAID,
      toASAID,
      amountInBase: amount,
    };
  }

  /**
   * Execute swap is disabled until an on-chain router backend is configured.
   * @param quote       Quote from fetchQuote()
   * @param slippagePct Max acceptable slippage e.g. 0.5 for 0.5%
   * @returns           { txId, amountOut } where amountOut is in base units of toASAID
   */
  async executeSwap(
    quote: SwapQuote,
    slippagePct: number = 0.5,
  ): Promise<{ txId: string; amountOut: number }> {
    const fromASAID = quote.fromASAID;
    const toASAID = quote.toASAID;
    const amountIn = quote.amountInBase;
    if (
      fromASAID == null ||
      toASAID == null ||
      amountIn == null ||
      !this.isLivePair(fromASAID, toASAID)
    ) {
      throw new Error('Live swap execution is unavailable for this pair.');
    }

    const client = algorandService.getAlgodClient();
    const account = algorandService.getAccount();
    const assetId = fromASAID === TESTNET_ASSETS.ALGO.asaId ? toASAID : fromASAID;
    const minOut = Math.max(1, Math.floor(quote.quote * (1 - slippagePct / 100)));

    // Ensure recipient can receive ASA when swapping ALGO -> ASA.
    if (toASAID !== TESTNET_ASSETS.ALGO.asaId) {
      await this.ensureAssetOptIn(toASAID);
    }

    const sp = await client.getTransactionParams().do();
    const atc = new AtomicTransactionComposer();

    if (fromASAID === TESTNET_ASSETS.ALGO.asaId) {
      const pay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: algosdk.getApplicationAddress(DART_SWAP_APP_ID),
        amount: amountIn,
        suggestedParams: { ...sp, fee: 1000, flatFee: true },
      });

      atc.addMethodCall({
        appID: DART_SWAP_APP_ID,
        method: ABIMethod.fromSignature(DART_METHODS.swap_exact_algo_for_asset),
        methodArgs: [
          { txn: pay, signer: algosdk.makeBasicAccountTransactionSigner(account) } as any,
          assetId,
          minOut,
          String(account.addr),
        ],
        sender: account.addr,
        signer: algosdk.makeBasicAccountTransactionSigner(account),
        suggestedParams: { ...sp, fee: 3000, flatFee: true },
        boxes: [{ appIndex: DART_SWAP_APP_ID, name: this.poolBoxName(assetId) }],
        appForeignAssets: [assetId],
      });
    } else {
      const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: algosdk.getApplicationAddress(DART_SWAP_APP_ID),
        amount: amountIn,
        assetIndex: assetId,
        suggestedParams: { ...sp, fee: 1000, flatFee: true },
      });

      atc.addMethodCall({
        appID: DART_SWAP_APP_ID,
        method: ABIMethod.fromSignature(DART_METHODS.swap_exact_asset_for_algo),
        methodArgs: [
          { txn: axfer, signer: algosdk.makeBasicAccountTransactionSigner(account) } as any,
          assetId,
          minOut,
          String(account.addr),
        ],
        sender: account.addr,
        signer: algosdk.makeBasicAccountTransactionSigner(account),
        suggestedParams: { ...sp, fee: 3000, flatFee: true },
        boxes: [{ appIndex: DART_SWAP_APP_ID, name: this.poolBoxName(assetId) }],
        appForeignAssets: [assetId],
      });
    }

    const res = await atc.execute(client, 4);
    const out = Number(res.methodResults?.[0]?.returnValue ?? quote.quote);
    return { txId: res.txIDs[res.txIDs.length - 1], amountOut: out };
  }

  /**
   * Returns the ALGO-denominated 8-decimal oracle price for an ASA.
   *
   * Price formula:
   *   asset_oracle_price = (asset_usd / algo_usd) * 100_000_000
   *
   * ALGO (asaId = 0) always returns 100_000_000 (1 ALGO = 1 ALGO).
   *
   * @returns integer in 8-decimal format (1 ALGO = 100_000_000)
   */
  async getAssetOraclePrice(assetId: number): Promise<number> {
    if (assetId === 0) return 100_000_000;

    const symbol = ASA_ID_TO_PYTH_SYMBOL[assetId];
    if (!symbol) {
      throw new Error(`No Pyth price feed configured for ASA ${assetId}`);
    }

    const [assetPrice, algoPrice] = await Promise.all([
      pythOracleService.getPrice(symbol),
      pythOracleService.getPrice('ALGO'),
    ]);

    if (!assetPrice || !algoPrice || algoPrice.price === 0) {
      throw new Error(`Pyth price unavailable for ASA ${assetId} (${symbol})`);
    }

    if (assetPrice.isStale || algoPrice.isStale) {
      console.warn(`⚠️ Pyth price is stale for ${symbol} or ALGO — using anyway`);
    }

    return Math.round((assetPrice.price / algoPrice.price) * 100_000_000);
  }

  /**
   * Batch-fetch oracle prices for multiple ASAs.
   * Returns Map<asaId, 8-decimal ALGO-denominated price>.
   *
   * On failure, falls back to ALGO price (100_000_000) for unknown assets so
   * the UI stays usable — callers should check isStale flags if precision matters.
   */
  async getOraclePrices(assetIds: number[]): Promise<Map<number, number>> {
    const results = new Map<number, number>();
    await Promise.all(
      assetIds.map(async (asaId) => {
        try {
          const price = await this.getAssetOraclePrice(asaId);
          results.set(asaId, price);
        } catch (err: any) {
          console.warn(`⚠️ Pyth oracle price failed for ASA ${asaId}:`, err?.message);
          // ALGO is always 1:1; everything else falls back to 1 ALGO as a safe default
          results.set(asaId, 100_000_000);
        }
      }),
    );
    return results;
  }

  /**
  * Calculate savings: how much more output aggregated routing
   * routing gives vs the best single-venue quote.
   *
   * This number is displayed as the "DART savings badge" in the swap UI.
   */
  getDartSavings(quoteData: SwapQuote): DartSavings {
    if (!quoteData.quotes.length) {
      return { savingsBaseUnits: 0, savingsPct: 0 };
    }
    const bestSingle = Math.max(...quoteData.quotes.map((q) => q.value));
    const savingsBaseUnits = Math.max(0, quoteData.quote - bestSingle);
    const savingsPct = bestSingle > 0 ? (savingsBaseUnits / bestSingle) * 100 : 0;
    return { savingsBaseUnits, savingsPct };
  }

  /**
   * Human-readable summary of the routing (for the swap preview UI).
   * e.g. "50% via Pact · 50% via AlgoFi"
   */
  formatRoute(quoteData: SwapQuote): string {
    return quoteData.route
      .map((r) => {
        const venue = r.path[0]?.name?.split(':')[0] ?? 'DEX';
        return `${r.percent}% via ${venue}`;
      })
      .join(' · ');
  }
}

export const dartRouterService = new DartRouterService();
export default dartRouterService;
