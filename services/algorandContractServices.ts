/**
 * Algorand Contract Services
 * ===========================
 * ARC-4 contract interaction layer for the three Cresca contracts:
 *   - CrescaPayments
 *   - CrescaCalendarPayments
 *   - CrescaBucketProtocol
 *
 * Mirror of contractServices.ts but for Algorand.
 * Uses AtomicTransactionComposer (ATC) for all ARC-4 calls.
 *
 * Deploy the Python contracts from ../contracts/algorand first
 * and paste/update App IDs in CONTRACT_APP_IDS below.
 */

import algosdk, {
  AtomicTransactionComposer,
  ABIMethod,
  ABIContract,
} from 'algosdk';
import { algorandService, AlgorandService, MICROALGO_PER_ALGO } from './algorandService';
import { pythOracleService, PYTH_PRICE_FEEDS } from './pythOracleService';
import {
  CONTRACT_APP_IDS,
  REAL_ASA_IDS,
  ORACLE_SCALE,
  MAX_BATCH_RECIPIENTS,
} from '../constants/config';

// Re-export so other services can import CONTRACT_APP_IDS from here (backwards compat)
export { CONTRACT_APP_IDS };

/**
 * ASA ID → Pyth symbol mapping.
 * Add entries here as new baskets are created.
 * 0 = native ALGO (uses CoinGecko fallback via pythOracleService).
 */
const ASA_ID_TO_SYMBOL: Record<number, string> = {
  [REAL_ASA_IDS.ALGO]: 'ALGO',
  [REAL_ASA_IDS.USDC]: 'USDC',
  100: 'BTC',
  101: 'ETH',
  102: 'SOL',
};

/**
 * Fetch Pyth Hermes prices for a set of ASA IDs and return:
 *  - prices8dec: array of prices in 8-decimal integer form (same order as assetIds)
 *  - publishTime: Unix seconds of the Hermes publish_time
 *
 * This is called immediately before every open/close/liquidate call so the
 * contract receives a price that is < ~300ms old (well within the 60s window).
 */
async function fetchHermesPrices(assetIds: number[]): Promise<{
  prices8dec: number[];
  publishTime: number;
}> {
  const symbols = assetIds.map((id) => ASA_ID_TO_SYMBOL[id] ?? 'ALGO');
  const unique = [...new Set(symbols)];
  const priceMap = await pythOracleService.getPrices(unique);

  // Lowest publish_time across all fetched assets (most conservative)
  let publishTime = Math.floor(Date.now() / 1000);
  for (const sym of unique) {
    const p = priceMap[sym];
    if (p) {
      const t = Math.floor(p.timestamp / 1000);
      if (t < publishTime) publishTime = t;
    }
  }

  const prices8dec = symbols.map((sym) => {
    const p = priceMap[sym];
    if (!p || !Number.isFinite(p.price) || p.price <= 0) {
      throw new Error(`Could not fetch Pyth price for ${sym} — open/close blocked`);
    }
    return Math.round(p.price * 1e8);
  });

  return { prices8dec, publishTime };
}

// CONTRACT_APP_IDS is imported from constants/config and re-exported above.
// Do not redeclare it here.

// ---------------------------------------------------------------------------
// Minimal ABI descriptors (subset of the full ARC-32 spec)
// After `algokit compile`, the full ABI lives in ../contracts/algorand/artifacts/*.arc32.json.
// You can load those JSON files directly in production via require().
// ---------------------------------------------------------------------------

const PAYMENTS_ABI_METHODS: Record<string, string> = {
  send_payment: 'send_payment(pay,address,string)byte[]',
  tap_to_pay: 'tap_to_pay(pay,address)bool',
  batch_send: 'batch_send(pay,address[],uint64[])bool',
  get_total_payments: 'get_total_payments()uint64',
  get_total_volume: 'get_total_volume()uint64',
};

const CALENDAR_ABI_METHODS: Record<string, string> = {
  create_schedule: 'create_schedule(pay,address,uint64,uint64,uint64,uint64)uint64',
  create_one_time_payment: 'create_one_time_payment(pay,address,uint64,uint64)uint64',
  create_recurring_payment: 'create_recurring_payment(pay,address,uint64,uint64,uint64,uint64)uint64',
  execute_schedule: 'execute_schedule(address,uint64)bool',
  cancel_schedule: 'cancel_schedule(uint64)bool',
  is_executable: 'is_executable(address,uint64)bool',
  get_next_execution_time: 'get_next_execution_time(address,uint64)uint64',
  get_user_schedule_count: 'get_user_schedule_count(address)uint64',
  fund_contract: 'fund_contract(pay)bool',
};

const BUCKET_ABI_METHODS: Record<string, string> = {
  create_bucket: 'create_bucket(uint64[],uint64[],uint64)uint64',
  deposit_collateral: 'deposit_collateral(pay)bool',
  withdraw_collateral: 'withdraw_collateral(uint64)bool',
  // Pyth pull oracle — prices + publish_time supplied by caller at tx time
  open_position: 'open_position(uint64,bool,uint64,uint64[],uint64)uint64',
  close_position: 'close_position(uint64,uint64[],uint64)uint64',
  rebalance_bucket: 'rebalance_bucket(uint64,uint64[])bool',
  update_oracle: 'update_oracle(uint64[],uint64[])bool',
  liquidate_position: 'liquidate_position(address,uint64,uint64[],uint64)bool',
  get_collateral_balance: 'get_collateral_balance(address)uint64',
  get_unrealized_pnl: 'get_unrealized_pnl(address,uint64)uint64',
  get_total_positions: 'get_total_positions()uint64',
  fund_contract: 'fund_contract(pay)bool',
};

// ---------------------------------------------------------------------------
// Shared types (mirrors contractServices.ts)
// ---------------------------------------------------------------------------

export interface AlgoScheduledPayment {
  scheduleId: number;
  payer: string;
  recipient: string;
  amountAlgo: string;
  executeAt: number;
  intervalSeconds: number;
  occurrences: number;
  executedCount: number;
  active: boolean;
  escrowBalanceAlgo: string;
  createdAt: number;
}

export interface AlgoBucket {
  bucketId: number;
  assetIds: number[];    // Algorand ASA IDs (0 = native ALGO)
  weights: number[];     // percentages summing to 100
  leverage: number;      // 1-150
  owner: string;
}

export interface AlgoPosition {
  positionId: number;
  bucketId: number;
  isLong: boolean;
  marginAlgo: string;
  entryPrice: string;
  owner: string;
  active: boolean;
  openTimestamp: number;
}

// ---------------------------------------------------------------------------
// Helper: build and submit an ATC call, return txid
// ---------------------------------------------------------------------------

async function callMethod(
  appId: number,
  methodSig: string,
  args: algosdk.ABIArgument[],
  extraPayment?: { amount: number }, // μALGO payment to attach (for pay args)
  appAccounts: string[] = [],
  appBoxes: Array<{ appIndex: number; name: Uint8Array }> = [],
): Promise<{ txId: string; returnValue?: any }> {
  if (appId === 0) {
    throw new Error(
      `App ID not set — deploy the contract first and update CONTRACT_APP_IDS`,
    );
  }

  const client = algorandService.getAlgodClient();
  const account = algorandService.getAccount();
  const params = await client.getTransactionParams().do();
  const appAddr = algosdk.getApplicationAddress(appId);

  const method = ABIMethod.fromSignature(methodSig);
  const atc = new AtomicTransactionComposer();

  // If the method takes a pay argument, prepend a payment transaction
  if (extraPayment) {
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: account.addr,
      receiver: appAddr,
      amount: extraPayment.amount,
      suggestedParams: { ...params, fee: 1000, flatFee: true },
    });
    // The ATC receives it as a TransactionWithSigner
    args = [
      { txn: payTxn, signer: algosdk.makeBasicAccountTransactionSigner(account) } as any,
      ...args,
    ];
  }

  atc.addMethodCall({
    appID: appId,
    method,
    methodArgs: args,
    sender: account.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(account),
    // 3000 μALGO covers the outer txn + up to 2 inner txns.
    // Methods that do batch_send (up to 8 inner txns) set their own fee via callMethod's fee param.
    suggestedParams: { ...params, fee: 3000, flatFee: true },
    appAccounts,
    boxes: appBoxes,
  });

  // Readonly methods (named `get_*` / `is_*` on our contracts) don't change
  // state — running them via `atc.execute()` broadcasts a real transaction
  // and costs a fee, AND collides with itself if called twice in the same
  // validity window ("transaction already in ledger"). Run them through
  // `atc.simulate()` instead: same return value, no broadcast, no collision.
  const isReadOnly = /^(get_|is_)/.test(methodSig);

  let result;
  try {
    if (isReadOnly) {
      const sim = await atc.simulate(client);
      const methodResult = sim.methodResults?.[0];
      const simReturnValue = methodResult?.returnValue;
      const simTxId = methodResult?.txID ?? '';
      console.log(`✅ ${methodSig} (simulated) | ${simTxId.slice(0, 8)}...`);
      return { txId: simTxId, returnValue: simReturnValue };
    }
    result = await atc.execute(client, 4);
  } catch (raw: any) {
    // algod returns a 400 with a body like:
    //   "TransactionPool.Remember: transaction <id>: logic eval error: assert failed pc=... \"Insufficient escrow funds\""
    // The algosdk error wraps that — pull out the useful bit instead of letting "Request failed with status code 400" reach the UI.
    const body =
      raw?.response?.body?.message ??
      raw?.response?.text ??
      raw?.response?.body ??
      raw?.message ??
      String(raw);
    const text = typeof body === 'string' ? body : JSON.stringify(body);

    const duplicateMatch = text.match(/transaction already in ledger: ([A-Z0-9]+)/);
    if (duplicateMatch) {
      const dupTxId = duplicateMatch[1];
      console.warn(`⚠️ Duplicate txn already in ledger: ${dupTxId}`);
      return { txId: dupTxId };
    }

    // Pattern-match common AVM errors first for human-readable messages.
    let friendly: string;
    if (/Not yet executable/.test(text)) {
      friendly = "Schedule isn't due yet — please wait until the scheduled time.";
    } else if (/Schedule already completed\/cancelled/.test(text)) {
      friendly = "This schedule is already cancelled or fully executed.";
    } else if (/Insufficient escrow/.test(text)) {
      friendly = "The contract escrow has run out — the schedule is exhausted.";
    } else if (/overspend\s*\(account/.test(text)) {
      const spentMatch = text.match(/tried to spend ([\d.]+)A/);
      friendly = spentMatch
        ? `Wallet doesn't have ${spentMatch[1]} ALGO free to spend right now. ` +
          `Tap Max again to use the current available amount.`
        : "Wallet doesn't have enough free ALGO. Refresh and try again.";
    } else if (/below min \d+ \(\d+ assets\)/.test(text)) {
      // Phrasing with "(N assets)" only appears for user wallets (contracts
      // don't opt into ASAs). Apply the user-wallet message here.
      friendly =
        "Your wallet doesn't have enough free ALGO — too much is reserved " +
        "as min-balance for asset opt-ins and created apps. Lower the amount " +
        "or top up the wallet at the testnet faucet.";
    } else if (/below min \d+/.test(text)) {
      friendly = "Wallet balance would drop below the protocol minimum — reduce the amount or fund the wallet.";
    } else {
      // Fall back to extracting the contract's assertion string in quotes.
      const assertion = text.match(/"([^"]+)"/)?.[1];
      const tealMsg = text.match(/logic eval error:[^\\]*/)?.[0];
      friendly = assertion ?? tealMsg ?? text.slice(0, 240);
    }
    console.error(`❌ ${methodSig} failed:`, text);
    throw new Error(`Contract call failed: ${friendly}`);
  }

  const txId = result.txIDs[result.txIDs.length - 1];
  const returnValue = result.methodResults?.[0]?.returnValue;

  console.log(`✅ ${methodSig} | txid: ${txId}`);
  return { txId, returnValue };
}

// ---------------------------------------------------------------------------
// 1. CrescaPaymentsService
// ---------------------------------------------------------------------------

export class CrescaPaymentsService {

  /**
   * Send ALGO to a recipient with an optional memo.
   * @param toAddress  Algorand address
   * @param amountAlgo  amount in ALGO (e.g. 1.5)
   * @param memo  optional note (max 1024 bytes on-chain)
   */
  async sendPayment(
    toAddress: string,
    amountAlgo: number,
    memo: string = '',
  ): Promise<string> {
    const microAlgo = AlgorandService.algoToMicroAlgo(amountAlgo);
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaPayments,
      PAYMENTS_ABI_METHODS.send_payment,
      [toAddress, memo],
      { amount: microAlgo },
      [toAddress],
    );
    return txId;
  }

  /**
   * Quick tap-to-pay without a memo.
   */
  async tapToPay(toAddress: string, amountAlgo: number): Promise<string> {
    const microAlgo = AlgorandService.algoToMicroAlgo(amountAlgo);
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaPayments,
      PAYMENTS_ABI_METHODS.tap_to_pay,
      [toAddress],
      { amount: microAlgo },
      [toAddress],
    );
    return txId;
  }

  /**
   * Batch send to multiple recipients.
   * @param recipients  array of Algorand addresses
   * @param amountsAlgo  array of amounts in ALGO (must match recipients.length)
   */
  async batchSend(
    recipients: string[],
    amountsAlgo: number[],
  ): Promise<string> {
    if (recipients.length !== amountsAlgo.length) {
      throw new Error('recipients and amounts must have the same length');
    }
    if (recipients.length > MAX_BATCH_RECIPIENTS) {
      throw new Error(`Max ${MAX_BATCH_RECIPIENTS} recipients per batch (AVM inner-txn limit)`);
    }

    const amountsMicro = amountsAlgo.map(AlgorandService.algoToMicroAlgo);
    const total = amountsMicro.reduce((a, b) => a + b, 0);

    // Fee: outer txn + up to 8 inner payment txns = 9 × 1000 μALGO
    const batchFee = (recipients.length + 1) * 1000;
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaPayments,
      PAYMENTS_ABI_METHODS.batch_send,
      [recipients, amountsMicro],
      { amount: total },
      recipients,
    );
    void batchFee; // fee is applied via the shared callMethod default (3000); override if needed
    return txId;
  }

  async getTotalPayments(): Promise<number> {
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaPayments,
      PAYMENTS_ABI_METHODS.get_total_payments,
      [],
    );
    return Number(returnValue ?? 0);
  }

  async getTotalVolumeAlgo(): Promise<string> {
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaPayments,
      PAYMENTS_ABI_METHODS.get_total_volume,
      [],
    );
    return AlgorandService.microAlgoToAlgo(Number(returnValue ?? 0));
  }
}

// ---------------------------------------------------------------------------
// 2. CrescaCalendarPaymentsService
// ---------------------------------------------------------------------------

export class CrescaCalendarPaymentsService {

  // --------------------------------------------------------------------------
  // Box key helpers — mirrors Python contract's key scheme:
  //   schedule_counts: BoxMap[arc4.Address, arc4.UInt64]  key_prefix=b"cnt_"
  //     full key = b"cnt_" + 32-byte payer pubkey
  //   schedules: BoxMap[Bytes, Schedule]                   key_prefix=b"sch_"
  //     full key = b"sch_" + 32-byte payer pubkey + 8-byte big-endian schedule_id
  // --------------------------------------------------------------------------

  private get calOwnerBytes(): Uint8Array {
    return algosdk.decodeAddress(algorandService.getAccount().addr.toString()).publicKey;
  }

  private calKey(prefix: string, payerBytes: Uint8Array, scheduleId?: number): Uint8Array {
    const parts: Buffer[] = [Buffer.from(prefix), Buffer.from(payerBytes)];
    if (scheduleId !== undefined) {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(BigInt(scheduleId));
      parts.push(buf);
    }
    return new Uint8Array(Buffer.concat(parts));
  }

  private async getScheduleCounter(): Promise<number> {
    const client = algorandService.getAlgodClient();
    const key = this.calKey('cnt_', this.calOwnerBytes);
    try {
      const box = await client
        .getApplicationBoxByName(CONTRACT_APP_IDS.CrescaCalendarPayments, key)
        .do() as { value: Uint8Array | string };
      const value = box.value;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(Buffer.from(value, 'base64'));
      if (bytes.length < 8) return 0;
      return Number(Buffer.from(bytes).readBigUInt64BE(0));
    } catch {
      return 0;
    }
  }

  /**
   * Create a one-time scheduled payment.
   * @param recipient     Algorand address
   * @param amountAlgo    amount in ALGO
   * @param executeAtUnix Unix timestamp (seconds) when to execute
   */
  async createOneTimePayment(
    recipient: string,
    amountAlgo: number,
    executeAtUnix: number,
  ): Promise<{ txId: string; scheduleId: number }> {
    const microAlgo = AlgorandService.algoToMicroAlgo(amountAlgo);
    const nextId = await this.getScheduleCounter();
    const owner = this.calOwnerBytes;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('sch_', owner, nextId) },
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.create_one_time_payment,
      [recipient, microAlgo, executeAtUnix],
      { amount: microAlgo },
      [recipient],
      appBoxes,
    );
    return { txId, scheduleId: Number(returnValue ?? 0) };
  }

  /**
   * Create a recurring payment.
   * @param recipient       Algorand address
   * @param amountAlgo      amount per payment in ALGO
   * @param firstExecUnix   Unix timestamp of first payment
   * @param intervalDays    days between payments (e.g. 30 = monthly)
   * @param occurrences     total number of payments
   */
  async createRecurringPayment(
    recipient: string,
    amountAlgo: number,
    firstExecUnix: number,
    intervalDays: number,
    occurrences: number,
  ): Promise<{ txId: string; scheduleId: number }> {
    const microAlgo = AlgorandService.algoToMicroAlgo(amountAlgo);
    const totalRequired = microAlgo * occurrences;
    const nextId = await this.getScheduleCounter();
    const owner = this.calOwnerBytes;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('sch_', owner, nextId) },
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.create_recurring_payment,
      [recipient, microAlgo, firstExecUnix, intervalDays, occurrences],
      { amount: totalRequired },
      [recipient],
      appBoxes,
    );
    return { txId, scheduleId: Number(returnValue ?? 0) };
  }

  /**
   * Create a fully customised schedule (wrapper of create_schedule).
   */
  async createSchedule(
    recipient: string,
    amountAlgo: number,
    executeAtUnix: number,
    intervalSeconds: number,
    occurrences: number,
  ): Promise<{ txId: string; scheduleId: number }> {
    const microAlgo = AlgorandService.algoToMicroAlgo(amountAlgo);
    const totalRequired = microAlgo * occurrences;
    const nextId = await this.getScheduleCounter();
    const owner = this.calOwnerBytes;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('sch_', owner, nextId) },
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.create_schedule,
      [recipient, microAlgo, executeAtUnix, intervalSeconds, occurrences],
      { amount: totalRequired },
      [recipient],
      appBoxes,
    );
    return { txId, scheduleId: Number(returnValue ?? 0) };
  }

  /**
   * Execute a due schedule (anyone can call — keeper pattern).
   * @param payerAddress     Address of the schedule owner
   * @param scheduleId       Schedule ID to execute
   * @param recipientAddress Optional: known recipient to include in foreign accounts (required for inner payment)
   */
  async executeSchedule(
    payerAddress: string,
    scheduleId: number,
    recipientAddress?: string,
  ): Promise<string> {
    const payerBytes = algosdk.decodeAddress(payerAddress).publicKey;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', payerBytes) },
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('sch_', payerBytes, scheduleId) },
    ];
    const appAccounts = recipientAddress ? [payerAddress, recipientAddress] : [payerAddress];

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.execute_schedule,
      [payerAddress, scheduleId],
      undefined,
      appAccounts,
      appBoxes,
    );
    return txId;
  }

  /**
   * Cancel a schedule and refund remaining escrow.
   */
  async cancelSchedule(scheduleId: number): Promise<string> {
    const owner = this.calOwnerBytes;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('sch_', owner, scheduleId) },
    ];

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.cancel_schedule,
      [scheduleId],
      undefined,
      [],
      appBoxes,
    );
    return txId;
  }

  /**
   * Check if a schedule is currently executable.
   */
  async isExecutable(payerAddress: string, scheduleId: number): Promise<boolean> {
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.is_executable,
      [payerAddress, scheduleId],
    );
    return Boolean(returnValue);
  }

  /**
   * Get the next execution timestamp (0 if done/cancelled).
   */
  async getNextExecutionTime(payerAddress: string, scheduleId: number): Promise<number> {
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.get_next_execution_time,
      [payerAddress, scheduleId],
    );
    return Number(returnValue ?? 0);
  }

  /** Number of schedules created by a user. */
  async getUserScheduleCount(address: string): Promise<number> {
    const payerBytes = algosdk.decodeAddress(address).publicKey;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaCalendarPayments, name: this.calKey('cnt_', payerBytes) },
    ];

    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.get_user_schedule_count,
      [address],
      undefined,
      [address],
      appBoxes,
    );
    return Number(returnValue ?? 0);
  }

  /**
   * Fund the contract with extra ALGO to cover Box storage min-balance.
   * Call this once after deployment with ~0.5 ALGO.
   */
  async fundContract(amountAlgo: number = 0.5): Promise<string> {
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaCalendarPayments,
      CALENDAR_ABI_METHODS.fund_contract,
      [],
      { amount: AlgorandService.algoToMicroAlgo(amountAlgo) },
    );
    return txId;
  }
}

// ---------------------------------------------------------------------------
// 3. CrescaBucketProtocolService
// ---------------------------------------------------------------------------

export class CrescaBucketProtocolService {
  private readonly oracleBoxNameBytes = 12; // prc_ + uint64(asset_id)
  private readonly oracleBoxValueBytes = 16; // PriceData { uint64 price, uint64 timestamp }

  private get ownerBytes(): Uint8Array {
    return algosdk.decodeAddress(algorandService.getAccount().addr.toString()).publicKey;
  }

  private get appAddress(): string {
    return algosdk.getApplicationAddress(CONTRACT_APP_IDS.CrescaBucketProtocol);
  }

  private key(prefix: string, ...parts: Uint8Array[]): Uint8Array {
    const buffers = [Buffer.from(prefix), ...parts.map((p) => Buffer.from(p))];
    return new Uint8Array(Buffer.concat(buffers));
  }

  private u64(value: number): Uint8Array {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(value));
    return new Uint8Array(buf);
  }

  private estimateOracleMinBalanceMicro(assetCount: number): number {
    const base = 100_000; // Protocol minimum balance
    const boxOverhead = 2_500;
    const perByte = 400;
    const perBox = boxOverhead + perByte * (this.oracleBoxNameBytes + this.oracleBoxValueBytes);
    const reserve = 50_000; // small buffer for safety
    return base + assetCount * perBox + reserve;
  }

  private async ensureOracleFunding(assetCount: number): Promise<void> {
    const client = algorandService.getAlgodClient();
    const info = await client.accountInformation(this.appAddress).do();
    const balance = Number(info?.amount ?? 0);
    const required = this.estimateOracleMinBalanceMicro(assetCount);
    if (balance >= required) return;

    const topUpMicro = required - balance;
    const topUpAlgo = topUpMicro / MICROALGO_PER_ALGO;
    await this.fundContract(topUpAlgo);
  }

  private async getCounterBox(prefix: 'bkc_'): Promise<number> {
    const client = algorandService.getAlgodClient();
    const key = this.key(prefix, this.ownerBytes);
    try {
      const box = await client
        .getApplicationBoxByName(CONTRACT_APP_IDS.CrescaBucketProtocol, key)
        .do() as { value: Uint8Array | string };
      const value = box.value;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(Buffer.from(value, 'base64'));
      if (bytes.length < 8) return 0;
      return Number(Buffer.from(bytes).readBigUInt64BE(0));
    } catch {
      return 0;
    }
  }

  /**
   * Create an asset basket.
   * @param assetIds   Algorand ASA IDs (use 0 for native ALGO)
   * @param weights    percentage allocations (must sum to 100)
   * @param leverage   1-150
   */
  async createBucket(
    assetIds: number[],
    weights: number[],
    leverage: number,
  ): Promise<{ txId: string; bucketId: number }> {
    if (assetIds.length !== weights.length) throw new Error('Length mismatch');
    if (assetIds.length === 0 || assetIds.length > 8) throw new Error('1-8 assets required');
    if (leverage < 1 || leverage > 150) throw new Error('Leverage must be 1-150');
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum !== 100) throw new Error('Weights must sum to 100');

    const nextBucketId = await this.getCounterBox('bkc_');
    const owner = this.ownerBytes;
    // The contract assigns `bucket_id = current_counter`. Our read of that
    // counter is one round behind reality, so the value the contract
    // actually picks can be higher than `nextBucketId`. Declare a 4-slot
    // sliding window of `bkt_*` references so any of the next 4 ids the
    // contract might choose are covered. AVM caps box refs at 8/txn — we
    // use 1 (bkc) + 4 (bkt window) = 5, well within budget.
    const bktSlots = [0, 1, 2, 3].map((offset) => ({
      appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
      name: this.key('bkt_', owner, this.u64(nextBucketId + offset)),
    }));
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkc_', owner) },
      ...bktSlots,
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.create_bucket,
      [assetIds, weights, BigInt(leverage)],
      undefined,
      [],
      appBoxes,
    );
    return { txId, bucketId: Number(returnValue ?? 0) };
  }

  /**
   * Deposit ALGO as trading collateral.
   * @param amountAlgo  amount in ALGO
   */
  async depositCollateral(amountAlgo: number): Promise<string> {
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', this.ownerBytes) },
    ];

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.deposit_collateral,
      [],
      { amount: AlgorandService.algoToMicroAlgo(amountAlgo) },
      [],
      appBoxes,
    );
    return txId;
  }

  /** Fund the bucket contract account to cover box min-balance. */
  async fundContract(amountAlgo: number): Promise<string> {
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.fund_contract,
      [],
      { amount: AlgorandService.algoToMicroAlgo(amountAlgo) },
    );
    return txId;
  }

  /**
   * Withdraw ALGO collateral back to wallet.
   */
  async withdrawCollateral(amountAlgo: number): Promise<string> {
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', this.ownerBytes) },
    ];

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.withdraw_collateral,
      [AlgorandService.algoToMicroAlgo(amountAlgo)],
      undefined,
      [],
      appBoxes,
    );
    return txId;
  }

  /**
   * Read the global position counter so the next position box can be named correctly.
   */
  async getTotalPositions(): Promise<number> {
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.get_total_positions,
      [],
    );
    return Number(returnValue ?? 0);
  }

  /**
   * Open a leveraged position on a bucket.
   *
   * Pyth pull oracle: fetches fresh prices from Hermes immediately before
   * submitting the transaction. The contract verifies publish_time is within
   * 60 seconds — no keeper dependency.
   *
   * @param bucketId    ID of your bucket
   * @param isLong      true = long, false = short
   * @param marginAlgo  margin to lock (in ALGO)
   * @param assetIds    ASA IDs in the same order as the bucket's assets array
   */
  async openPosition(
    bucketId: number,
    isLong: boolean,
    marginAlgo: number,
    assetIds: number[],
  ): Promise<{ txId: string; positionId: number }> {
    await this.ensureOracleFunding(assetIds.length);
    // Fetch Pyth Hermes prices at call time (<150ms) — no keeper required
    const { prices8dec, publishTime } = await fetchHermesPrices(assetIds);

    const owner = this.ownerBytes;
    const nextPositionId = await this.getTotalPositions();
    // The contract's _store_oracle_prices writes one `prc_<assetId>` box
    // per asset in the bucket. Every box accessed inside the call must be
    // declared up-front in the txn's box-ref array, otherwise the AVM
    // rejects with "invalid Box reference".
    //
    // The new pos id chosen by the contract = current `total_positions`,
    // which can race ahead of our pre-read by a round or two — so declare
    // a 2-slot sliding window for `pos_*` like we do for `bkt_*`. AVM
    // caps box refs at 8/txn; with bkt + col + 2×pos + up-to-4 prc, we
    // sit at ≤ 8.
    const posSlots = [0, 1].map((offset) => ({
      appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
      name: this.key('pos_', owner, this.u64(nextPositionId + offset)),
    }));
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', owner, this.u64(bucketId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', owner) },
      ...posSlots,
      ...assetIds.map((id) => ({
        appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
        name: this.key('prc_', this.u64(id)),
      })),
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.open_position,
      [
        bucketId,
        isLong,
        AlgorandService.algoToMicroAlgo(marginAlgo),
        prices8dec,       // asset_prices[] — Hermes 8-decimal prices
        publishTime,      // price_publish_time — Unix seconds from Hermes
      ],
      undefined,
      [],
      appBoxes,
    );
    return { txId, positionId: Number(returnValue ?? 0) };
  }

  /**
   * Close a position and realise P&L.
   *
   * Pyth pull oracle: fetches fresh prices from Hermes at call time.
   * No keeper dependency.
   *
   * @param positionId  ID of the position to close
   * @param bucketId    ID of the bucket used when opening (needed for box refs)
   * @param assetIds    ASA IDs in the same order as the bucket's assets array
   * @returns P&L in ALGO (positive = profit, can be 0 on full loss)
   */
  async closePosition(
    positionId: number,
    bucketId: number,
    assetIds: number[],
  ): Promise<{ txId: string; pnlAlgo: string }> {
    await this.ensureOracleFunding(assetIds.length);
    // Fetch Pyth Hermes prices at call time (<150ms) — no keeper required
    const { prices8dec, publishTime } = await fetchHermesPrices(assetIds);

    const owner = this.ownerBytes;
    // close_position also calls _store_oracle_prices → needs every prc_<id>
    // box declared, same as open_position.
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('pos_', owner, this.u64(positionId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', owner, this.u64(bucketId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', owner) },
      ...assetIds.map((id) => ({
        appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
        name: this.key('prc_', this.u64(id)),
      })),
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.close_position,
      [
        positionId,
        prices8dec,    // asset_prices[] — Hermes 8-decimal prices
        publishTime,   // price_publish_time — Unix seconds from Hermes
      ],
      undefined,
      [],
      appBoxes,
    );
    const pnlMicro = Number(returnValue ?? 0);
    return {
      txId,
      pnlAlgo: (pnlMicro / MICROALGO_PER_ALGO).toFixed(6),
    };
  }

  /**
   * Rebalance bucket weights (owner only).
   */
  async rebalanceBucket(bucketId: number, newWeights: number[]): Promise<string> {
    const sum = newWeights.reduce((a, b) => a + b, 0);
    if (sum !== 100) throw new Error('Weights must sum to 100');

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.rebalance_bucket,
      [bucketId, newWeights],
    );
    return txId;
  }

  /**
   * Update mock oracle prices.
   * In production, integrate Pyth Network's Algorand oracle instead.
   * @param assetIds  Algorand ASA IDs
   * @param prices    prices with 8-decimal precision (1 ALGO = 100_000_000)
   */
  async updateOracle(assetIds: number[], prices: number[]): Promise<string> {
    if (assetIds.length !== prices.length) throw new Error('Length mismatch');
    await this.ensureOracleFunding(assetIds.length);
    const appBoxes = assetIds.map((assetId) => ({
      appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
      name: this.key('prc_', this.u64(assetId)),
    }));

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.update_oracle,
      [assetIds, prices],
      undefined,
      [],
      appBoxes,
    );
    return txId;
  }

  /**
   * Liquidate an undercollateralised position (anyone can call).
   *
   * Pyth pull oracle: fetches fresh prices from Hermes at call time.
   * The liquidation keeper calls this — no stale-oracle dependency.
   *
   * @param ownerAddress  wallet address of the position owner
   * @param positionId    position to liquidate
   * @param assetIds      ASA IDs in the same order as the bucket's assets array
   */
  async liquidatePosition(
    ownerAddress: string,
    positionId: number,
    assetIds: number[],
  ): Promise<string> {
    await this.ensureOracleFunding(assetIds.length);
    const { prices8dec, publishTime } = await fetchHermesPrices(assetIds);

    const ownerBytes = algosdk.decodeAddress(ownerAddress).publicKey;
    const posKey = this.key('pos_', ownerBytes, this.u64(positionId));

    // Read the position box first to learn its bucket_id (we can't pass it
    // as a param because the keeper-pattern caller may only know positionId).
    let bucketId = 0;
    try {
      const client = algorandService.getAlgodClient();
      const posBox = await client
        .getApplicationBoxByName(CONTRACT_APP_IDS.CrescaBucketProtocol, posKey)
        .do();
      const value =
        typeof posBox.value === 'string'
          ? new Uint8Array(Buffer.from(posBox.value, 'base64'))
          : new Uint8Array(posBox.value);
      if (value.length >= 8) bucketId = Number(Buffer.from(value).readBigUInt64BE(0));
    } catch {
      // If we can't read it, fall through — the chain will reject with a
      // proper "Position not found" / "invalid Box reference" message.
    }

    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: posKey },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', ownerBytes, this.u64(bucketId)) },
      ...assetIds.map((id) => ({
        appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
        name: this.key('prc_', this.u64(id)),
      })),
    ];

    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.liquidate_position,
      [
        ownerAddress,
        positionId,
        prices8dec,   // asset_prices[] — Hermes 8-decimal prices
        publishTime,  // price_publish_time — Unix seconds from Hermes
      ],
      undefined,
      [],
      appBoxes,
    );
    return txId;
  }

  /** Get collateral balance in ALGO for an address. */
  async getCollateralBalance(address: string): Promise<string> {
    const ownerBytes = algosdk.decodeAddress(address).publicKey;
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', ownerBytes) },
    ];

    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.get_collateral_balance,
      [address],
      undefined,
      [],
      appBoxes,
    );
    return AlgorandService.microAlgoToAlgo(Number(returnValue ?? 0));
  }

  /** Get unrealised P&L for a position in ALGO. */
  async getUnrealizedPnL(ownerAddress: string, positionId: number): Promise<string> {
    const ownerBytes = algosdk.decodeAddress(ownerAddress).publicKey;
    const posKey = this.key('pos_', ownerBytes, this.u64(positionId));
    const client = algorandService.getAlgodClient();

    // The contract reads:
    //   1. `pos_<addr><id>`      — position box
    //   2. `bkt_<addr><bucket>`  — bucket box
    //   3. `prc_<asset_id>`      — one per asset in the bucket (up to 8)
    // AVM requires every accessed box to be declared in the txn's box ref
    // array. We don't know bucket_id or the asset ids ahead of time — read
    // the position box, then the bucket box, then collect the asset ids.

    const readBoxBytes = async (key: Uint8Array): Promise<Uint8Array | null> => {
      try {
        const box = await client
          .getApplicationBoxByName(CONTRACT_APP_IDS.CrescaBucketProtocol, key)
          .do();
        return typeof box.value === 'string'
          ? new Uint8Array(Buffer.from(box.value, 'base64'))
          : new Uint8Array(box.value);
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (msg.includes('box not found') || msg.includes('404')) return null;
        throw err;
      }
    };

    // Step 1: read position box → bucket_id at offset 0
    const posBytes = await readBoxBytes(posKey);
    if (!posBytes || posBytes.length < 8) return '0.000000';
    const bucketId = Number(Buffer.from(posBytes).readBigUInt64BE(0));

    // Step 2: read bucket box → asset_count + asset0..asset_count-1
    // Bucket struct layout: 8 × asset uint64 (0-63), 8 × weight uint64
    // (64-127), asset_count uint64 (128-135), leverage (136-143), ...
    const bktKey = this.key('bkt_', ownerBytes, this.u64(bucketId));
    const bktBytes = await readBoxBytes(bktKey);
    if (!bktBytes || bktBytes.length < 136) return '0.000000';
    const bktBuf = Buffer.from(bktBytes);
    const assetCount = Math.min(Number(bktBuf.readBigUInt64BE(128)), 8);
    const assetIds: number[] = [];
    for (let i = 0; i < assetCount; i++) {
      assetIds.push(Number(bktBuf.readBigUInt64BE(i * 8)));
    }

    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: posKey },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: bktKey },
      ...assetIds.map((id) => ({
        appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
        name: this.key('prc_', this.u64(id)),
      })),
    ];

    try {
      const { returnValue } = await callMethod(
        CONTRACT_APP_IDS.CrescaBucketProtocol,
        BUCKET_ABI_METHODS.get_unrealized_pnl,
        [ownerAddress, positionId],
        undefined,
        [],
        appBoxes,
      );
      const micro = Number(returnValue ?? 0);
      return (micro / MICROALGO_PER_ALGO).toFixed(6);
    } catch (err: any) {
      // If a referenced box is missing (e.g., already closed/withdrawn),
      // treat P&L as zero instead of blowing up the whole bucket screen.
      const msg = String(err?.message ?? '');
      if (msg.includes('invalid Box reference') || msg.includes('box not found')) {
        return '0.000000';
      }
      throw err;
    }
  }

  /**
   * Seed the contract with ALGO to cover Box storage min-balance costs.
   * Each bucket/position Box costs ~0.0025 ALGO + bytes. Fund ~1 ALGO initially.
   */
  async fundContract(amountAlgo: number = 1): Promise<string> {
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.fund_contract,
      [],
      { amount: AlgorandService.algoToMicroAlgo(amountAlgo) },
    );
    return txId;
  }
}

// ---------------------------------------------------------------------------
// Singleton exports (drop-in replacement for contractServices.ts singletons)
// ---------------------------------------------------------------------------

export const crescaPaymentsService = new CrescaPaymentsService();
export const crescaCalendarService = new CrescaCalendarPaymentsService();
export const crescaBucketService = new CrescaBucketProtocolService();
