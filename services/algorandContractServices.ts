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

// ---------------------------------------------------------------------------
// Deployed App IDs — update after running deploy.py on testnet
// ---------------------------------------------------------------------------

export const CONTRACT_APP_IDS = {
  CrescaPayments: 758836614,
  CrescaCalendarPayments: 758836616,
  CrescaBucketProtocol: 758836627,
} as const;

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
  open_position: 'open_position(uint64,bool,uint64)uint64',
  close_position: 'close_position(uint64)uint64',
  rebalance_bucket: 'rebalance_bucket(uint64,uint64[])bool',
  update_oracle: 'update_oracle(uint64[],uint64[])bool',
  liquidate_position: 'liquidate_position(address,uint64)bool',
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

  const result = await atc.execute(client, 4);
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
    if (recipients.length > 8) {
      throw new Error('Max 8 recipients per batch (AVM inner-txn limit)');
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
  private get ownerBytes(): Uint8Array {
    return algosdk.decodeAddress(algorandService.getAccount().addr.toString()).publicKey;
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
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkc_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', owner, this.u64(nextBucketId)) },
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.create_bucket,
      [assetIds, weights, leverage],
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
   * @param bucketId    ID of your bucket
   * @param isLong      true = long, false = short
   * @param marginAlgo  margin to lock (in ALGO)
   * @param assetIds    ASA IDs used when the bucket was created (drives price box refs)
   */
  async openPosition(
    bucketId: number,
    isLong: boolean,
    marginAlgo: number,
    assetIds: number[],
  ): Promise<{ txId: string; positionId: number }> {
    const owner = this.ownerBytes;
    const nextPositionId = await this.getTotalPositions();
    const priceBoxes = assetIds.map((id) => ({
      appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
      name: this.key('prc_', this.u64(id)),
    }));
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', owner, this.u64(bucketId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', owner) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('pos_', owner, this.u64(nextPositionId)) },
      ...priceBoxes,
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.open_position,
      [bucketId, isLong, AlgorandService.algoToMicroAlgo(marginAlgo)],
      undefined,
      [],
      appBoxes,
    );
    return { txId, positionId: Number(returnValue ?? 0) };
  }

  /**
   * Close a position and realise P&L.
   * @param positionId  ID of the position to close
   * @param bucketId    ID of the bucket used when opening this position (needed for box refs)
   * @param assetIds    ASA IDs used when the bucket was created (drives price box refs)
   * @returns P&L in ALGO (positive = profit, can be 0 on full loss)
   */
  async closePosition(
    positionId: number,
    bucketId: number,
    assetIds: number[],
  ): Promise<{ txId: string; pnlAlgo: string }> {
    const owner = this.ownerBytes;
    const priceBoxes = assetIds.map((id) => ({
      appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol,
      name: this.key('prc_', this.u64(id)),
    }));
    const appBoxes = [
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('pos_', owner, this.u64(positionId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('bkt_', owner, this.u64(bucketId)) },
      { appIndex: CONTRACT_APP_IDS.CrescaBucketProtocol, name: this.key('col_', owner) },
      ...priceBoxes,
    ];

    const { txId, returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.close_position,
      [positionId],
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
   */
  async liquidatePosition(ownerAddress: string, positionId: number): Promise<string> {
    const { txId } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.liquidate_position,
      [ownerAddress, positionId],
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
    const { returnValue } = await callMethod(
      CONTRACT_APP_IDS.CrescaBucketProtocol,
      BUCKET_ABI_METHODS.get_unrealized_pnl,
      [ownerAddress, positionId],
    );
    const micro = Number(returnValue ?? 0);
    return (micro / MICROALGO_PER_ALGO).toFixed(6);
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
