# Pyth Oracle, Transaction History & UI Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy router oracle usage with Pyth Network, show all transaction types in the Profile screen, and fix content-behind-status-bar on Android punch-hole devices.

**Architecture:** `pythOracleService.ts` (already exists) fetches USD prices from Pyth Hermes; `dartRouterService.ts` converts USD→ALGO-denominated 8-decimal values for the contract; trades call `updateOracle` immediately before `openPosition` instead of using a background keeper. `getTransactionHistory` gains a `txTypes` filter so the Profile screen can fetch both `pay` and `appl` transactions. All screens share a `ScreenContainer` component that applies explicit safe-area insets.

**Tech Stack:** algosdk, @pythnetwork/pyth-evm-js (already installed), react-native-safe-area-context, Expo Router, TypeScript

---

## File Map

| Action | File |
|--------|------|
| Modify | `services/pythOracleService.ts` — add ALGO feed ID |
| Modify | `services/dartRouterService.ts` — replace legacy router oracle methods with Pyth |
| Modify | `services/oracleKeeperService.ts` — remove on-chain push cycle |
| Modify | `app/_layout.tsx` — remove keeper start/stop |
| Modify | `app/bundleTrade.tsx` — push oracle before open_position; use Pyth for display |
| Modify | `services/algorandService.ts` — extend getTransactionHistory with txTypes |
| Modify | `app/payments.tsx` — add Transaction History section, replace SafeAreaView |
| Create | `components/ScreenContainer.tsx` — reusable safe-area wrapper |
| Modify | `app/index.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/calendar.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/swap.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/bucket.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/assetDetail.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/bundlesList.tsx` — replace SafeAreaView with ScreenContainer |
| Modify | `app/markets.tsx` — replace SafeAreaView with ScreenContainer |

---

## Task 1: Add ALGO to Pyth price feeds

**Files:**
- Modify: `services/pythOracleService.ts`

- [ ] **Step 1: Add ALGO feed ID to PYTH_PRICE_FEEDS**

Open `services/pythOracleService.ts`. The current `PYTH_PRICE_FEEDS` object is missing ALGO. Add it:

```ts
export const PYTH_PRICE_FEEDS = {
  ALGO: '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318',
  BTC:  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL:  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  MOVE: '0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  USDT: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
};
```

- [ ] **Step 2: Commit**

```bash
git add services/pythOracleService.ts
git commit -m "feat: add ALGO/USD Pyth price feed ID"
```

---

## Task 2: Replace legacy router oracle with Pyth in `dartRouterService.ts`

**Files:**
- Modify: `services/dartRouterService.ts`

The swap-routing methods (`fetchQuote`, `executeSwap`, `getDartSavings`, `formatRoute`) stay untouched. Only the oracle price methods (`getAssetOraclePrice`, `getOraclePrices`) are replaced.

- [ ] **Step 1: Add the ASA→Pyth symbol mapping and rewrite oracle methods**

In `services/dartRouterService.ts`, add this import at the top alongside the existing `algorandService` import:

```ts
import { pythOracleService } from './pythOracleService';
```

Then add the mapping and replace the two oracle methods. Find `getAssetOraclePrice` (line ~204) and `getOraclePrices` (line ~223) and replace both:

```ts
// Maps Algorand ASA IDs to Pyth symbol keys in PYTH_PRICE_FEEDS.
// ASA 0 = native ALGO (priced at 1 ALGO = 1 ALGO, no Pyth call needed).
// Add new entries here when basket assets expand.
private readonly ASA_TO_PYTH: Record<number, 'ALGO' | 'BTC' | 'ETH' | 'SOL' | 'MOVE' | 'USDC' | 'USDT'> = {
  10458941: 'USDC',   // USDCa on Algorand testnet
};

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

  const symbol = this.ASA_TO_PYTH[assetId];
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
 * Falls back to static defaults on failure so the UI stays usable:
 *   ASA 0 (ALGO)     → 100_000_000
 *   ASA 10458941 (USDC) → 555_555_556  (≈ 1/0.18 ALGO)
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
        if (asaId === 0)        results.set(asaId, 100_000_000);
        else if (asaId === 10458941) results.set(asaId, 555_555_556);
      }
    }),
  );
  return results;
}
```

- [ ] **Step 2: Remove the now-unused `warnedInvalidApiKey` field and legacy API-specific error handling**

Delete the private field declaration at the top of the class:
```ts
// DELETE THIS LINE:
private warnedInvalidApiKey = false;
```

Also remove legacy API constants at the top of the file only if they are no longer referenced by any remaining method. Only remove `warnedInvalidApiKey` when it is unused.

- [ ] **Step 3: Update the file-level comment to reflect dual purpose**

Replace the first block comment at line 1:

```ts
/**
 * DART Router Service
 * ===================
 * Provides two capabilities:
 *
 * 1. DEX Swap routing via the configured router backend:
 *    fetchQuote(), executeSwap(), getDartSavings(), formatRoute()
 *
 * 2. Oracle prices via Pyth Network (Hermes HTTP API):
 *    getAssetOraclePrice(), getOraclePrices()
 *    Prices are ALGO-denominated 8-decimal integers for CrescaBucketProtocol.
 *    ASA 0 (ALGO) = 100_000_000; others derived as (asset_usd/algo_usd)*1e8.
 */
```

- [ ] **Step 4: Commit**

```bash
git add services/dartRouterService.ts
git commit -m "feat: replace legacy oracle source with Pyth Network price feeds"
```

---

## Task 3: Gut the oracle keeper and remove from app layout

**Files:**
- Modify: `services/oracleKeeperService.ts`
- Modify: `app/_layout.tsx`

The keeper's job was to push prices on-chain every 20s. We now push inline before each trade. The keeper loop is no longer needed.

- [ ] **Step 1: Hollow out `_runCycle` in `oracleKeeperService.ts`**

Find `_runCycle` (starts around line 97). Replace its entire body with a no-op log:

```ts
private async _runCycle(_assetIds: number[]): Promise<void> {
  // Oracle prices are now pushed inline before each trade via Pyth pull model.
  // This keeper no longer performs on-chain updates.
}
```

Keep `start()`, `stop()`, `getLastUpdateTimestamp()`, `getLastUpdateTxId()`, and `isOracleFresh()` stubs intact — removing them would require touching many import sites. They return `null` / `false` harmlessly.

- [ ] **Step 2: Remove keeper start/stop from `app/_layout.tsx`**

Find these lines in `_layout.tsx` (around line 20–25):

```ts
import { oracleKeeperService, DEFAULT_TRACKED_ASSET_IDS } from '../services/oracleKeeperService';

// Start oracle keeper when app mounts; stop on teardown
useEffect(() => {
  oracleKeeperService.start(DEFAULT_TRACKED_ASSET_IDS, 20_000);
  return () => {
    oracleKeeperService.stop();
  };
}, []);
```

Delete both the import line and the entire `useEffect` block.

- [ ] **Step 3: Commit**

```bash
git add services/oracleKeeperService.ts app/_layout.tsx
git commit -m "feat: remove oracle keeper background push — using Pyth pull model"
```

---

## Task 4: Pre-trade oracle update in `bundleTrade.tsx`

**Files:**
- Modify: `app/bundleTrade.tsx`

Before opening a position, the contract reads oracle prices from its `prc_` boxes. We must call `updateOracle` with fresh Pyth data in the same session as `openPosition`.

- [ ] **Step 1: Update the display prices in `init()` to use Pyth**

Find the `init` function (around line 41). Replace:

```ts
const prices = await dartRouterService.getOraclePrices(ASSET_IDS);
setLiveAlgoPrice((prices.get(0) ?? 100_000_000) / 1e8);
setLiveUsdcPrice((prices.get(10458941) ?? 100_000_000) / 1e8);
setOracleAlive(true);
```

With:

```ts
const prices = await dartRouterService.getOraclePrices(ASSET_IDS);
const algoOraclePrice = prices.get(0) ?? 100_000_000;
const usdcOraclePrice = prices.get(10458941) ?? 100_000_000;
// Convert ALGO-denominated 8-decimal back to display values
// ALGO display: always 1.0000 ALGO (it IS ALGO)
// USDC display: price in ALGO (e.g. 5.56 means 1 USDC = 5.56 ALGO)
setLiveAlgoPrice(algoOraclePrice / 1e8);
setLiveUsdcPrice(usdcOraclePrice / 1e8);
setOracleAlive(true);
```

- [ ] **Step 2: Push oracle update before openPosition in `handleOpen`**

Find the `handleOpen` function (around line 60). After the validation block and `setBusy(true)`, and **before** the `crescaBucketService.depositCollateral` call, add:

```ts
// Fetch fresh Pyth prices and push to contract oracle.
// Must happen before open_position reads the prc_ boxes.
const oraclePriceMap = await dartRouterService.getOraclePrices(ASSET_IDS);
const oracleIds     = Array.from(oraclePriceMap.keys());
const oraclePrices  = oracleIds.map((id) => oraclePriceMap.get(id)!);
await crescaBucketService.updateOracle(oracleIds, oraclePrices);
```

The full `handleOpen` body should now look like:

```ts
const handleOpen = async () => {
  const amt = Number(amount);
  if (!amt || amt <= 0) {
    Alert.alert('Invalid amount', 'Enter a positive ALGO amount.');
    return;
  }
  if (amt > Number(balance)) {
    Alert.alert('Insufficient balance', 'Your ALGO balance is too low for this margin.');
    return;
  }
  if (oracleAlive === false) {
    Alert.alert('Oracle not ready', 'Live oracle data is unavailable. Try again in a moment.');
    return;
  }

  try {
    setBusy(true);

    // 1. Push fresh Pyth prices to the contract oracle (pull model)
    const oraclePriceMap = await dartRouterService.getOraclePrices(ASSET_IDS);
    const oracleIds      = Array.from(oraclePriceMap.keys());
    const oraclePrices   = oracleIds.map((id) => oraclePriceMap.get(id)!);
    await crescaBucketService.updateOracle(oracleIds, oraclePrices);

    // 2. Deposit collateral
    await crescaBucketService.depositCollateral(amt);

    // 3. Create bucket on first trade
    let id = bucketId;
    if (id === null) {
      const weights = params.bundleId === 'defensive' ? [80, 20]
        : params.bundleId === 'tactical' ? [45, 55]
        : [60, 40];
      const result = await crescaBucketService.createBucket(ASSET_IDS, weights, leverage);
      id = result.bucketId;
      setBucketId(id);
    }

    // 4. Open position
    const opened = await crescaBucketService.openPosition(id, true, amt);
    const url = `https://lora.algokit.io/testnet/transaction/${opened.txId}`;

    Alert.alert('Position Opened', `Position #${opened.positionId} opened successfully.`, [
      { text: 'View Tx', onPress: () => Linking.openURL(url) },
      { text: 'Done', style: 'cancel' },
    ]);

    setAmount('');
    const bal = await algorandService.getBalance();
    setBalance(Number(bal.algo).toFixed(3));
  } catch (e: any) {
    Alert.alert('Trade failed', e?.message || 'Could not open position.');
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add app/bundleTrade.tsx
git commit -m "feat: push Pyth oracle before openPosition — pull model trade flow"
```

---

## Task 5: Extend `getTransactionHistory` in `algorandService.ts`

**Files:**
- Modify: `services/algorandService.ts`

- [ ] **Step 1: Extend the `AlgorandTransaction` type**

Find the `AlgorandTransaction` interface (around line 104). Add two optional fields:

```ts
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
```

- [ ] **Step 2: Add the app-ID→label map constant**

Add this constant just before the `AlgorandService` class declaration (around line 119):

```ts
// Maps Cresca contract app IDs to human-readable transaction labels.
const CRESCA_APP_LABELS: Record<number, string> = {
  758711867: 'Payment',
  758711869: 'Scheduled Payment',
  758711872: 'Bundle Trade',
};
```

- [ ] **Step 3: Rewrite `getTransactionHistory` to accept `txTypes`**

Find `getTransactionHistory` (around line 411). Replace the entire method:

```ts
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
  const addr    = address ?? this.getAddress();
  const indexer = this.getIndexerClient();

  const fetchForType = async (txType: 'pay' | 'appl'): Promise<AlgorandTransaction[]> => {
    const response = await indexer
      .lookupAccountTransactions(addr)
      .txType(txType)
      .limit(limit)
      .do();

    return (response.transactions ?? []).map((tx: any): AlgorandTransaction => {
      const pay   = tx['payment-transaction'];
      const appl  = tx['application-transaction'];
      const isSent = tx['sender'] === addr;
      const appId  = appl?.['application-id'] as number | undefined;

      return {
        txId:      tx.id,
        sender:    tx['sender'],
        receiver:  pay?.receiver ?? '',
        amount:    pay?.amount ?? 0,
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

    // Merge, sort by timestamp descending, trim to limit
    return results
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } catch (err) {
    console.error('❌ Failed to fetch transaction history:', err);
    return [];
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add services/algorandService.ts
git commit -m "feat: extend getTransactionHistory with txTypes filter and app-call labeling"
```

---

## Task 6: Add Transaction History section to `payments.tsx`

**Files:**
- Modify: `app/payments.tsx`

- [ ] **Step 1: Add state and load function for full transaction history**

In `payments.tsx`, add these imports at the top alongside existing ones:

```ts
import { algorandService, AlgorandTransaction } from '../services/algorandService';
```

(It may already import `algorandService` — if so, just add `AlgorandTransaction` to the existing import.)

Add state variables after the existing `useState` declarations:

```ts
const [txHistory, setTxHistory]   = useState<AlgorandTransaction[]>([]);
const [txLoading, setTxLoading]   = useState(false);
```

Add the load function after `loadWallet`:

```ts
const loadTxHistory = async (addr: string) => {
  try {
    setTxLoading(true);
    const txs = await algorandService.getTransactionHistory(addr, 20, ['pay', 'appl']);
    setTxHistory(txs);
  } catch {
    // keep previous history on failure
  } finally {
    setTxLoading(false);
  }
};
```

- [ ] **Step 2: Call `loadTxHistory` inside the existing `useEffect`**

Find the `useEffect` that calls `loadWallet` (around line 64):

```ts
useEffect(() => {
  (async () => {
    try {
      await loadWallet();
    } finally {
      setLoading(false);
    }
  })();
}, []);
```

Replace with:

```ts
useEffect(() => {
  (async () => {
    try {
      await loadWallet();
      // algorandService.getAddress() is safe here — loadWallet() calls initializeWallet()
      const addr = algorandService.getAddress();
      await loadTxHistory(addr);
    } finally {
      setLoading(false);
    }
  })();
}, []);
```

Do NOT remove `loadWallet` — it is still called from `onSend` to refresh the balance after a payment.

- [ ] **Step 3: Add the Transaction History section to the JSX**

Find the closing `</View>` of `settingsCard` and the closing `</ScrollView>` (around line 244). Insert the history section between them:

```tsx
{/* Transaction History */}
<View style={styles.txSectionHead}>
  <Text style={styles.txSectionTitle}>Transaction History</Text>
  {txLoading && <ActivityIndicator size="small" color={Colors.navy} />}
</View>

<View style={styles.txCard}>
  {txHistory.length === 0 && !txLoading ? (
    <View style={styles.txEmpty}>
      <Ionicons name="receipt-outline" size={28} color={Colors.sky} />
      <Text style={styles.txEmptyText}>No transactions yet</Text>
    </View>
  ) : (
    txHistory.map((tx, index) => {
      const isSent       = tx.type === 'sent';
      const isAppl       = tx.appId !== undefined;
      const algoAmount   = isAppl ? null : (tx.amount / 1_000_000).toFixed(4);
      const counterparty = isSent ? tx.receiver : tx.sender;
      const shortParty   = counterparty
        ? `${counterparty.slice(0, 6)}…${counterparty.slice(-4)}`
        : '—';
      const dateStr      = tx.timestamp
        ? new Date(tx.timestamp * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : '—';
      const isLast = index === txHistory.length - 1;
      const rowLabel = tx.label ?? (isSent ? 'Sent' : 'Received');

      return (
        <View key={tx.txId} style={isLast ? styles.txRowLast : styles.txRow}>
          <View style={[styles.txIcon, isAppl ? styles.txIconAppl : isSent ? styles.txIconSent : styles.txIconRecv]}>
            <Ionicons
              name={isAppl ? 'flash' : isSent ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={isAppl ? Colors.navy : isSent ? Colors.loss : Colors.gain}
            />
          </View>

          <View style={styles.txMeta}>
            <Text style={styles.txLabel}>{rowLabel}</Text>
            {!isAppl && (
              <Text style={styles.txParty} numberOfLines={1}>
                {isSent ? 'To ' : 'From '}{shortParty}
              </Text>
            )}
            {tx.note ? <Text style={styles.txNote} numberOfLines={1}>{tx.note}</Text> : null}
            <Text style={styles.txDate}>{dateStr}</Text>
          </View>

          <View style={styles.txRight}>
            {algoAmount !== null && (
              <Text style={[styles.txAmount, isSent ? styles.txAmountSent : styles.txAmountRecv]}>
                {isSent ? '−' : '+'}{algoAmount} ALGO
              </Text>
            )}
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(`https://lora.algokit.io/testnet/transaction/${tx.txId}`)
              }
              style={styles.txExplorerBtn}
            >
              <Text style={styles.txExplorerText}>Lora ↗</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    })
  )}
</View>
```

- [ ] **Step 4: Add the new styles to `StyleSheet.create`**

Append inside the existing `StyleSheet.create({...})` in `payments.tsx`:

```ts
txSectionHead: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: Spacing.xl,
  marginBottom: Spacing.sm,
},
txSectionTitle: {
  fontSize: Typography.base,
  fontWeight: Typography.semibold,
  color: Colors.text.primary,
},
txCard: {
  backgroundColor: Colors.bg.card,
  borderRadius: Radius.lg,
  borderWidth: 1,
  borderColor: Colors.border,
  overflow: 'hidden',
},
txRow: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: Spacing.md,
  borderBottomWidth: 1,
  borderBottomColor: Colors.divider,
  gap: Spacing.sm,
},
txRowLast: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: Spacing.md,
  gap: Spacing.sm,
},
txIcon: {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
},
txIconSent: { backgroundColor: Colors.lossBg },
txIconRecv: { backgroundColor: Colors.gainBg },
txIconAppl: { backgroundColor: Colors.bg.subtle },
txMeta:  { flex: 1 },
txLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.text.primary },
txParty: { fontSize: Typography.xs, color: Colors.text.secondary },
txNote:  { fontSize: Typography.xs, color: Colors.text.muted, fontStyle: 'italic' },
txDate:  { fontSize: Typography.xs, color: Colors.text.muted, marginTop: 2 },
txRight: { alignItems: 'flex-end' },
txAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold },
txAmountSent: { color: Colors.loss },
txAmountRecv: { color: Colors.gain },
txExplorerBtn: { marginTop: 4 },
txExplorerText: { fontSize: Typography.xs, color: Colors.navy },
txEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl },
txEmptyText: { color: Colors.text.muted, fontSize: Typography.sm, marginTop: Spacing.sm },
```

- [ ] **Step 5: Add missing imports to `payments.tsx`**

Ensure `ActivityIndicator` is in the React Native import list (it may already be there). Also ensure `Linking` is imported (it may already be there from existing code).

- [ ] **Step 6: Commit**

```bash
git add app/payments.tsx
git commit -m "feat: add full transaction history section to Profile/Payments screen"
```

---

## Task 7: Create `ScreenContainer` component

**Files:**
- Create: `components/ScreenContainer.tsx`

- [ ] **Step 1: Create the component file**

Create a new file `components/ScreenContainer.tsx` with the following content:

```tsx
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

/**
 * ScreenContainer
 * ===============
 * Replaces SafeAreaView across all screens.
 *
 * Uses useSafeAreaInsets() to apply an explicit paddingTop equal to the
 * device-reported top inset. This is more reliable than SafeAreaView's
 * edge detection on Android punch-hole camera devices (e.g. OnePlus Nord CE3)
 * where translucent status bar reporting can be inaccurate.
 *
 * Usage:
 *   import { ScreenContainer } from '../components/ScreenContainer';
 *   <ScreenContainer>...</ScreenContainer>
 */
export function ScreenContainer({ children, style }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.screen,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add components/ScreenContainer.tsx
git commit -m "feat: add ScreenContainer with explicit safe-area insets for Android punch-hole fix"
```

---

## Task 8: Replace SafeAreaView with ScreenContainer in all screens

**Files:**
- Modify: `app/index.tsx`, `app/payments.tsx`, `app/calendar.tsx`, `app/bundleTrade.tsx`, `app/swap.tsx`, `app/bucket.tsx`, `app/assetDetail.tsx`, `app/bundlesList.tsx`, `app/markets.tsx`

Apply the same two-step change in each file. Steps below use `index.tsx` as the worked example — repeat for every screen listed.

- [ ] **Step 1: Update `app/index.tsx`**

Remove this import line:
```ts
import { SafeAreaView } from 'react-native-safe-area-context';
```

Add in its place:
```ts
import { ScreenContainer } from '../components/ScreenContainer';
```

Find every occurrence of:
```tsx
<SafeAreaView style={styles.container} edges={['top']}>
```
Replace with:
```tsx
<ScreenContainer>
```

Find every corresponding closing tag:
```tsx
</SafeAreaView>
```
Replace with:
```tsx
</ScreenContainer>
```

Note: `index.tsx` has the onboarding flow which uses `SafeAreaView` with `styles.obsWrap` — replace those too:
```tsx
// Find:
<SafeAreaView style={styles.obsWrap} edges={['top']}>
// Replace with:
<ScreenContainer style={styles.obsWrap}>
```

And the closing tags accordingly.

- [ ] **Step 2: Repeat for all remaining screens**

Apply the identical import swap and tag replacement in:
- `app/payments.tsx` — one `SafeAreaView` wrapping the `ScrollView`
- `app/calendar.tsx` — one `SafeAreaView`
- `app/bundleTrade.tsx` — one `SafeAreaView`
- `app/swap.tsx` — one `SafeAreaView`
- `app/bucket.tsx` — one `SafeAreaView`
- `app/assetDetail.tsx` — one `SafeAreaView`
- `app/bundlesList.tsx` — one `SafeAreaView`
- `app/markets.tsx` — one `SafeAreaView`

For any screen that passes a custom `style` to `SafeAreaView` (e.g. `style={styles.container}`), pass it as `style` prop to `ScreenContainer` instead:
```tsx
<ScreenContainer style={styles.container}>
```

If a screen's `styles.container` sets `backgroundColor`, keep that — it overrides `ScreenContainer`'s default `Colors.bg.screen`.

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx app/payments.tsx app/calendar.tsx app/bundleTrade.tsx app/swap.tsx app/bucket.tsx app/assetDetail.tsx app/bundlesList.tsx app/markets.tsx
git commit -m "fix: replace SafeAreaView with ScreenContainer across all screens — fixes Nord CE3 status bar overlap"
```
