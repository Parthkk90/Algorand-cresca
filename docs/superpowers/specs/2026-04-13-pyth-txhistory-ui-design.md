# Cresca — Pyth Oracle, Transaction History & UI Responsiveness
**Date:** 2026-04-13  
**Status:** Approved

---

## 1. Pyth Oracle Integration

### Goal
Replace legacy router-based pricing with Pyth Network's Hermes HTTP API for live price data. Remove the background oracle keeper push cycle entirely. Prices are read directly from Pyth — no on-chain push at idle.

### Price Feed IDs (Pyth Stable)
| Asset | Pyth Price Feed ID |
|-------|-------------------|
| ALGO/USD | `0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318` |
| USDC/USD | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| BTC/USD | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |

Additional assets (SOL, SUI, etc.) use their `/USD` Pyth feeds when added to baskets.

### Hermes Endpoint
```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<id>&ids[]=<id>
```
Response includes `price`, `expo`, and `publish_time` per feed. Normalized price = `price * 10^expo`.

### Staleness Validation
Client-side only. If `now - publish_time > 60s`, mark the price as stale and show a UI warning. No contract-level staleness enforcement for display prices.

### Trade Flow (Pull Model)
The Algorand contract has a custom `update_oracle(uint64[], uint64[])` method — not Pyth's native `update_price_feeds`. When the user opens or closes a position, the app:

1. Fetches fresh prices from Pyth Hermes
2. Submits an **atomic transaction group**:
   - `update_oracle(ids, prices)` — pushes fresh prices to the contract
   - `open_position(...)` / `close_position(...)` — executes the trade

This mirrors Pyth's pull model: prices are updated inline with the trade, never stale, no idle background fees.

### Files Changed
- `services/dartRouterService.ts` — rewrite `getOraclePrices()` to call Pyth Hermes; remove legacy router API logic and API key references
- `services/oracleKeeperService.ts` — remove `_runCycle` on-chain push block; keeper loop can be stopped on app init or removed entirely
- `app/bundleTrade.tsx` — update `handleOpen` to fetch Pyth prices and include `update_oracle` in the atomic group before `open_position`

---

## 2. Transaction History

### Goal
Show all app transaction types in the Profile section. Keep Home screen showing only individual pay/receive.

### Home Screen
No change. `getTransactionHistory()` called with default `txTypes: ['pay']`. Shows sent/received ALGO only.

### Profile Screen (`payments.tsx`)
New "Transaction History" section added at the bottom, below existing profile settings cards.

Calls `getTransactionHistory(address, 20, ['pay', 'appl'])`.

### `getTransactionHistory` Signature Change
```ts
getTransactionHistory(
  address?: string,
  limit: number = 20,
  txTypes: ('pay' | 'appl')[] = ['pay'],
): Promise<AlgorandTransaction[]>
```

The Algorand Indexer only supports one `tx-type` per query. When `txTypes` contains both `'pay'` and `'appl'`, `getTransactionHistory` runs two parallel Indexer queries and merges the results, sorted by `round-time` descending, before returning up to `limit` records. For `appl` transactions, the returned object is extended with a `label` field derived from the on-chain app ID:

| App ID | Label |
|--------|-------|
| `758711867` | Payment |
| `758711869` | Scheduled Payment |
| `758711872` | Bundle Trade |
| anything else | App Call |

### `AlgorandTransaction` Type Extension
```ts
export interface AlgorandTransaction {
  txId: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
  note: string;
  fee: number;
  type: 'sent' | 'received';
  label?: string;   // added — human-readable tx label for appl types
  appId?: number;   // added — for appl transactions
}
```

### Profile History Row
Same visual style as Home screen tx rows: label/counterparty, date, "Lora ↗" link. No ABI decoding of `appl` call arguments — only top-level Indexer fields are read (sender, round-time, app-id).

---

## 3. Nord CE3 UI Responsiveness

### Root Cause
On Android punch-hole camera devices (including OnePlus Nord CE3), `SafeAreaView` with `edges={['top']}` can under-report the top inset when the status bar is translucent, causing content to render behind the status bar.

### Fix

**Step 1 — `app/_layout.tsx`**  
Add at root level:
```tsx
<StatusBar translucent={false} backgroundColor="#000000" />
```
This locks the status bar as opaque, forcing Android to push content below it on all devices.

**Step 2 — `ScreenContainer` component (`components/ScreenContainer.tsx`)**  
Reusable wrapper that applies explicit top insets via `useSafeAreaInsets()` instead of relying on `SafeAreaView` edge detection:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

export function ScreenContainer({ children, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.screen },
});
```

**Step 3 — Replace `SafeAreaView` in affected screens**  
Swap `<SafeAreaView edges={['top']}>` → `<ScreenContainer>` in:
- `app/index.tsx`
- `app/payments.tsx`
- `app/calendar.tsx`
- `app/bundleTrade.tsx`
- `app/swap.tsx`
- `app/bucket.tsx`
- `app/assetDetail.tsx`
- `app/bundlesList.tsx`
- `app/markets.tsx`

### Why `ScreenContainer` (DRY)
All screens get consistent safe-area behaviour from a single component. If the inset logic needs updating (e.g., adding bottom inset for gesture nav), it changes in one place.
