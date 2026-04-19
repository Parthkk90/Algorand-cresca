/**
 * Algorand Wallet Service
 * =======================
 * Non-custodial wallet for the Cresca app on Algorand Testnet.
 *
 * Key storage design (same philosophy as web3Service.ts):
 *   - 25-word mnemonic → SecureStore (hardware-backed, biometric-locked on device)
 *   - Public address   → AsyncStorage (non-sensitive, for display)
 *   - No server ever sees the private key.
 *
 * Network: Algorand Testnet via AlgoNode (free, no API key needed)
 *   Algod:   https://testnet-api.algonode.cloud
 *   Indexer: https://testnet-idx.algonode.cloud
 *
 * Install:
 *   npx expo install algosdk
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import '../utils/globalPolyfills';
import algosdk from 'algosdk';
import WalletStorage from './walletStorage';

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

export const ALGORAND_NETWORKS = {
  testnet: {
    algodUrl: 'https://testnet-api.algonode.cloud',
    algodToken: '',
    algodPort: 443,
    indexerUrl: 'https://testnet-idx.algonode.cloud',
    indexerPort: 443,
    name: 'Algorand Testnet',
    explorerUrl: 'https://lora.algokit.io/testnet',
    faucetUrl: 'https://bank.testnet.algorand.network/',
  },
  mainnet: {
    algodUrl: 'https://mainnet-api.algonode.cloud',
    algodToken: '',
    algodPort: 443,
    indexerUrl: 'https://mainnet-idx.algonode.cloud',
    indexerPort: 443,
    name: 'Algorand Mainnet',
    explorerUrl: 'https://algoexplorer.io',
    faucetUrl: '',
  },
} as const;

export type AlgorandNetwork = keyof typeof ALGORAND_NETWORKS;

// ---------------------------------------------------------------------------
// SecureStore keys  (never overlap with Algorand keys — different namespaces)
// ---------------------------------------------------------------------------

export const ALGO_STORAGE_KEYS = {
  /**
   * 25-word mnemonic stored in SecureStore.
   * SecureStore uses the device's hardware-backed keystore (Keychain on iOS,
   * Keystore on Android) — biometric auth can be added via SecureStore options.
   */
  MNEMONIC: 'algo_mnemonic',

  /** Public address stored in plain AsyncStorage (not sensitive). */
  ADDRESS: 'algo_address',

  /** User's preferred network (testnet | mainnet). */
  NETWORK: 'algo_network',

  /** Cached balance string for fast UI display on cold start. */
  CACHED_BALANCE: 'algo_cached_balance',
} as const;

// Dev/testing override: force app signer to funded deployer wallet on testnet.
// Remove or disable before production builds.
const FORCE_TESTNET_DEPLOYER_WALLET = false;
const FORCED_TESTNET_DEPLOYER_MNEMONIC =
  'cushion local fantasy task edge solid region cactus inspire local club link scrub razor silk dutch coil wire secret park sustain pattern scale absent loud';

// 1 ALGO = 1_000_000 μALGO
export const MICROALGO_PER_ALGO = 1_000_000;

// Minimum account balance required by the Algorand protocol (0.1 ALGO)
export const MIN_BALANCE_MICROALGO = 100_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlgorandWalletInfo {
  address: string;
  isNew: boolean;
  network: AlgorandNetwork;
}

export interface AlgorandBalance {
  algo: string;        // "3.142000"
  microAlgo: number;   // 3142000
}

export interface AlgorandTransaction {
  txId:       string;
  sender:     string;
  receiver:   string;
  amount:     number;      // μALGO (0 for appl transactions)
  timestamp:  number;
  note:       string;
  fee:        number;
  type:       'sent' | 'received';
  label?:     string;      // Human-readable label for appl transactions
  appId?:     number;      // App ID for appl transactions
}

// ---------------------------------------------------------------------------
// AlgorandService
// ---------------------------------------------------------------------------

// Maps Cresca contract app IDs to human-readable transaction labels.
const CRESCA_APP_LABELS: Record<number, string> = {
  758849047: 'Payment',
  758849049: 'Scheduled Payment',
  758849061: 'Bundle Trade',
};

export class AlgorandService {
  private algodClient: algosdk.Algodv2 | null = null;
  private indexerClient: algosdk.Indexer | null = null;
  private account: algosdk.Account | null = null;
  private currentNetwork: AlgorandNetwork = 'testnet';
  private initPromise: Promise<AlgorandWalletInfo> | null = null;

  private normalizeAddress(value: unknown): string {
    return typeof value === 'string' ? value : String(value);
  }

  private ensureClientsReady(): void {
    if (!this.algodClient || !this.indexerClient) {
      this.buildClients(this.currentNetwork);
    }
  }

  private resolveAddress(address?: string): string {
    const candidate = typeof address === 'string' ? address.trim() : '';
    return candidate.length > 0 ? candidate : this.getAddress();
  }

  // --------------------------------------------------------------------------
  // Client initialisation
  // --------------------------------------------------------------------------

  private buildClients(network: AlgorandNetwork): void {
    const cfg = ALGORAND_NETWORKS[network];

    this.algodClient = new algosdk.Algodv2(
      cfg.algodToken,
      cfg.algodUrl,
      cfg.algodPort,
    );

    this.indexerClient = new algosdk.Indexer(
      cfg.algodToken,
      cfg.indexerUrl,
      cfg.indexerPort,
    );

    console.log(`🔗 Algorand clients connected to ${cfg.name}`);
  }

  getAlgodClient(): algosdk.Algodv2 {
    if (!this.algodClient) throw new Error('AlgorandService not initialised');
    return this.algodClient;
  }

  getIndexerClient(): algosdk.Indexer {
    if (!this.indexerClient) throw new Error('AlgorandService not initialised');
    return this.indexerClient;
  }

  getCurrentNetwork(): AlgorandNetwork {
    return this.currentNetwork;
  }

  getNetworkConfig() {
    return ALGORAND_NETWORKS[this.currentNetwork];
  }

  // --------------------------------------------------------------------------
  // Wallet initialisation  (singleton promise — safe to call multiple times)
  // --------------------------------------------------------------------------

  async initializeWallet(): Promise<AlgorandWalletInfo> {
    if (this.initPromise) return this.initPromise;
    if (this.account && WalletStorage.isWalletReady()) {
      this.ensureClientsReady();
      return {
        address: this.normalizeAddress(this.account.addr),
        isNew: false,
        network: this.currentNetwork,
      };
    }

    this.initPromise = this._doInit();
    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInit(): Promise<AlgorandWalletInfo> {
    console.log('🔐 Initialising Algorand wallet...');

    // Load saved network preference
    const savedNetwork = await AsyncStorage.getItem(ALGO_STORAGE_KEYS.NETWORK);
    if (savedNetwork === 'mainnet' || savedNetwork === 'testnet') {
      this.currentNetwork = savedNetwork;
    }

    if (FORCE_TESTNET_DEPLOYER_WALLET) {
      this.currentNetwork = 'testnet';
      await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.NETWORK), 'testnet');
    }

    this.buildClients(this.currentNetwork);

    if (FORCE_TESTNET_DEPLOYER_WALLET) {
      this.account = algosdk.mnemonicToSecretKey(FORCED_TESTNET_DEPLOYER_MNEMONIC.trim());
      const forcedAddress = this.normalizeAddress(this.account.addr);

      await SecureStore.setItemAsync(ALGO_STORAGE_KEYS.MNEMONIC, FORCED_TESTNET_DEPLOYER_MNEMONIC.trim(), {
        requireAuthentication: false,
        authenticationPrompt: 'Authenticate to access your Algorand wallet',
      });
      await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.ADDRESS), forcedAddress);

      WalletStorage.setWalletData(forcedAddress);
      console.log('🧪 Test mode signer wallet loaded:', forcedAddress);

      return { address: forcedAddress, isNew: false, network: this.currentNetwork };
    }

    // Try to load existing mnemonic from SecureStore
    const storedMnemonic = await SecureStore.getItemAsync(ALGO_STORAGE_KEYS.MNEMONIC);

    if (storedMnemonic) {
      // ----------------------------------------------------------------
      // EXISTING WALLET — restore from stored mnemonic
      // ----------------------------------------------------------------
      console.log('🔑 Restoring wallet from SecureStore mnemonic...');
      try {
        this.account = algosdk.mnemonicToSecretKey(storedMnemonic.trim());
        const storedAddress = await AsyncStorage.getItem(ALGO_STORAGE_KEYS.ADDRESS);

        const addrStr = this.normalizeAddress(this.account.addr);
        // Sanity check: derived address should match stored address
        if (storedAddress && storedAddress !== addrStr) {
          console.warn('⚠️  Address mismatch — regenerating from mnemonic');
          await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.ADDRESS), this.normalizeAddress(addrStr));
        }

        WalletStorage.setWalletData(this.normalizeAddress(addrStr));
        console.log('✅ Wallet restored:', addrStr);

        return { address: addrStr, isNew: false, network: this.currentNetwork };
      } catch (err) {
        console.error('❌ Failed to restore from mnemonic, generating new wallet:', err);
        // Fall through to generate a fresh wallet
      }
    }

    // ----------------------------------------------------------------
    // NEW WALLET — generate and persist securely
    // ----------------------------------------------------------------
    console.log('✨ Generating new Algorand wallet...');
    this.account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(this.account.sk);
    const addrStr = this.normalizeAddress(this.account.addr);

    // Store mnemonic in hardware-backed SecureStore
    await SecureStore.setItemAsync(ALGO_STORAGE_KEYS.MNEMONIC, mnemonic, {
      // Require biometric / device passcode to access on supported devices
      requireAuthentication: false, // set true to enforce biometrics
      authenticationPrompt: 'Authenticate to access your Algorand wallet',
    });

    // Store public address in plain AsyncStorage (safe — not a secret)
    await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.ADDRESS), this.normalizeAddress(addrStr));
    await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.NETWORK), String(this.currentNetwork));

    WalletStorage.setWalletData(this.normalizeAddress(addrStr));
    console.log('✅ New wallet created:', addrStr);
    console.log(`💧 Fund this address on testnet faucet: ${ALGORAND_NETWORKS.testnet.faucetUrl}`);

    return { address: addrStr, isNew: true, network: this.currentNetwork };
  }

  // --------------------------------------------------------------------------
  // Import wallet from mnemonic (user brings their own seed phrase)
  // --------------------------------------------------------------------------

  async importFromMnemonic(mnemonic: string): Promise<string> {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 25) {
      throw new Error('Algorand mnemonics must be exactly 25 words');
    }

    const imported = algosdk.mnemonicToSecretKey(mnemonic.trim());

    // Overwrite stored mnemonic and address
    await SecureStore.setItemAsync(ALGO_STORAGE_KEYS.MNEMONIC, mnemonic.trim(), {
      requireAuthentication: false,
      authenticationPrompt: 'Authenticate to save your wallet',
    });
    await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.ADDRESS), this.normalizeAddress(imported.addr));

    this.account = imported;
    this.ensureClientsReady();
    const addrStr = this.normalizeAddress(imported.addr);
    WalletStorage.setWalletData(this.normalizeAddress(addrStr));
    console.log('✅ Wallet imported:', addrStr);

    return addrStr;
  }

  // --------------------------------------------------------------------------
  // Export mnemonic (show to user for backup — requires SecureStore read)
  // --------------------------------------------------------------------------

  async exportMnemonic(): Promise<string> {
    const mnemonic = await SecureStore.getItemAsync(ALGO_STORAGE_KEYS.MNEMONIC);
    if (!mnemonic) throw new Error('No wallet found in SecureStore');
    return mnemonic;
  }

  // --------------------------------------------------------------------------
  // Sign transactions (private key never leaves the device)
  // --------------------------------------------------------------------------

  signTransaction(txn: algosdk.Transaction): Uint8Array {
    if (!this.account) throw new Error('Wallet not initialised');
    return txn.signTxn(this.account.sk);
  }

  signTransactions(txns: algosdk.Transaction[]): Uint8Array[] {
    if (!this.account) throw new Error('Wallet not initialised');
    return txns.map(txn => txn.signTxn(this.account!.sk));
  }

  getAddress(): string {
    if (!this.account) throw new Error('Wallet not initialised');
    return this.normalizeAddress(this.account.addr);
  }

  getAccount(): algosdk.Account {
    if (!this.account) throw new Error('Wallet not initialised');
    return this.account;
  }

  // --------------------------------------------------------------------------
  // Balance
  // --------------------------------------------------------------------------

  async getBalance(address?: string): Promise<AlgorandBalance> {
    const addr = this.resolveAddress(address);
    const client = this.getAlgodClient();

    if (!algosdk.isValidAddress(addr)) {
      throw new Error('Invalid Algorand address for balance lookup');
    }

    try {
      const info = await client.accountInformation(addr).do();
      const microAlgo: number = Number(info['amount']);
      const algo = (microAlgo / MICROALGO_PER_ALGO).toFixed(6);

      // Cache for cold-start display
      if (!address) {
        await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.CACHED_BALANCE), String(algo));
        WalletStorage.updateBalance(algo);
      }

      return { algo, microAlgo };
    } catch (err) {
      console.error('❌ Failed to fetch balance:', err);
      // Return cached value on failure
      const cached = await AsyncStorage.getItem(ALGO_STORAGE_KEYS.CACHED_BALANCE);
      return { algo: cached ?? '0.000000', microAlgo: 0 };
    }
  }

  // --------------------------------------------------------------------------
  // Send ALGO
  // --------------------------------------------------------------------------

  async sendAlgo(
    toAddress: string,
    amountAlgo: number,
    memo: string = '',
  ): Promise<string> {
    if (!this.account) throw new Error('Wallet not initialised');
    const client = this.getAlgodClient();

    const amountMicroAlgo = Math.round(amountAlgo * MICROALGO_PER_ALGO);
    const params = await client.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: this.account.addr,
      receiver: toAddress,
      amount: amountMicroAlgo,
      note: memo ? new TextEncoder().encode(memo) : undefined,
      suggestedParams: params,
    });

    const signed = txn.signTxn(this.account.sk);
    const { txid } = await client.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(client, txid, 4);

    console.log(`✅ Sent ${amountAlgo} ALGO — txid: ${txid}`);
    return txid;
  }

  // --------------------------------------------------------------------------
  // Transaction history (via Indexer)
  // --------------------------------------------------------------------------

  /**
   * Fetch transaction history from the Algorand Indexer.
   *
   * @param address  Wallet address (defaults to current wallet)
   * @param limit    Max records to return (default 20)
   * @param txTypes  Transaction types to include. Defaults to ['pay'].
   *                 Pass ['pay', 'appl'] to include contract calls.
   *                 The Indexer only supports one tx-type per query, so
   *                 multi-type requests run parallel queries and merge results.
   */
  async getTransactionHistory(
    address?: string,
    limit: number = 20,
    txTypes: ('pay' | 'appl')[] = ['pay'],
  ): Promise<AlgorandTransaction[]> {
    let addr = '';
    try {
      addr = this.resolveAddress(address);
    } catch (err) {
      console.warn('Skipping transaction history fetch until wallet is initialized');
      return [];
    }

    const indexer = this.getIndexerClient();

    if (!algosdk.isValidAddress(addr)) {
      console.warn('Skipping transaction history fetch due to invalid address:', addr);
      return [];
    }

    const extractInnerPayment = (tx: any): { receiver: string; amount: number } | null => {
      const innerTxns = Array.isArray(tx?.['inner-txns']) ? tx['inner-txns'] : [];

      for (const inner of innerTxns) {
        const innerPay = inner?.['payment-transaction'];
        if (innerPay?.receiver && Number(innerPay?.amount ?? 0) > 0) {
          return {
            receiver: String(innerPay.receiver),
            amount: Number(innerPay.amount),
          };
        }

        const nested = extractInnerPayment(inner);
        if (nested) return nested;
      }

      return null;
    };

    const fetchForType = async (txType: 'pay' | 'appl'): Promise<AlgorandTransaction[]> => {
      const response = await indexer
        .lookupAccountTransactions(addr)
        .txType(txType)
        .limit(limit)
        .do();

      return (response.transactions ?? []).map((tx: any): AlgorandTransaction => {
        const pay   = tx['payment-transaction'];
        const appl  = tx['application-transaction'];
        const innerPay = extractInnerPayment(tx);
        const isSent = tx['sender'] === addr;
        const appId  = appl?.['application-id'] as number | undefined;

        return {
          txId:      tx.id,
          sender:    tx['sender'],
          receiver:  pay?.receiver ?? innerPay?.receiver ?? '',
          amount:    Number(pay?.amount ?? innerPay?.amount ?? 0),
          timestamp: tx['round-time'] ?? 0,
          note:      tx['note']
            ? new TextDecoder().decode(Buffer.from(tx['note'], 'base64'))
            : '',
          fee:       tx['fee'] ?? 0,
          type:      isSent ? 'sent' : 'received',
          label:     appId !== undefined
            ? (CRESCA_APP_LABELS[appId] ?? 'App Call')
            : undefined,
          appId,
        };
      });
    };

    try {
      // Run a query per type (Indexer does not support OR on tx-type)
      const results = await Promise.all(txTypes.map(fetchForType));

      const deduped = new Map<string, AlgorandTransaction>();
      for (const tx of results.flat()) {
        if (!deduped.has(tx.txId)) {
          deduped.set(tx.txId, tx);
        }
      }

      // Merge, sort by timestamp descending, trim to limit
      return [...deduped.values()]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (err) {
      console.error('❌ Failed to fetch transaction history:', err);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Network switching
  // --------------------------------------------------------------------------

  async switchNetwork(network: AlgorandNetwork): Promise<void> {
    this.currentNetwork = network;
    this.buildClients(network);
    await AsyncStorage.setItem(String(ALGO_STORAGE_KEYS.NETWORK), String(network));
    console.log(`🌐 Switched to ${ALGORAND_NETWORKS[network].name}`);
  }

  // --------------------------------------------------------------------------
  // Utility helpers
  // --------------------------------------------------------------------------

  static algoToMicroAlgo(algo: number): number {
    return Math.round(algo * MICROALGO_PER_ALGO);
  }

  static microAlgoToAlgo(microAlgo: number): string {
    return (microAlgo / MICROALGO_PER_ALGO).toFixed(6);
  }

  /** Explorer URL for an address or transaction */
  getExplorerUrl(addressOrTxId: string, type: 'address' | 'tx' = 'address'): string {
    const base = this.getNetworkConfig().explorerUrl;
    return type === 'address'
      ? `${base}/address/${addressOrTxId}`
      : `${base}/tx/${addressOrTxId}`;
  }

  /** Validate an Algorand address */
  static isValidAddress(address: string): boolean {
    return algosdk.isValidAddress(address);
  }

  // --------------------------------------------------------------------------
  // Clear wallet (DANGEROUS — user loses funds if no backup)
  // --------------------------------------------------------------------------

  async clearWallet(): Promise<void> {
    await SecureStore.deleteItemAsync(ALGO_STORAGE_KEYS.MNEMONIC);
    await AsyncStorage.multiRemove([
      ALGO_STORAGE_KEYS.ADDRESS,
      ALGO_STORAGE_KEYS.NETWORK,
      ALGO_STORAGE_KEYS.CACHED_BALANCE,
    ]);
    this.account = null;
    WalletStorage.clear();
    console.log('🗑️  Wallet cleared from device');
  }
}

// Singleton — import this everywhere, just like web3Service
export const algorandService = new AlgorandService();
export default algorandService;
