# DART on Algorand — Design Spec
**Date:** 2026-04-12  
**Status:** Approved  
**Scope:** Dynamic Allocation and Real-Time Routing engine integrated into Cresca on Algorand testnet

---

## 1. Problem Statement

The existing `CrescaBucketProtocol` uses a mock oracle (`update_oracle()`) with manually supplied prices. There is no real price feed, no real swap routing, and the swap screen in cresca executes mock trades. This spec defines how to replace all three with production-quality, testnet-deployed infrastructure using Deflex (the Algorand DEX aggregator powering Hay.app) as the routing and price discovery layer.

---

## 2. Key Design Decisions

### 2.1 BucketProtocol is Synthetic (not spot)

`CrescaBucketProtocol` is a synthetic perpetuals contract. Opening a position does not acquire any underlying ASAs — it records a notional entry price and tracks P&L mathematically. This is correct and intentional. The entry price IS the oracle price. There is no execution divergence because there is no execution.

This aligns with how GMX, dYdX, and Synthetix work.

### 2.2 Oracle = Deflex Live Quote Prices (Keeper Pattern)

Instead of manually calling `update_oracle()`, a TypeScript **keeper service** runs on a 20-second interval and:
1. Fetches real-time mid-prices for all tracked ASAs from `@deflex/deflex-sdk-js` (`getFixedInputSwapQuote`)
2. Calls `CrescaBucketProtocol.update_oracle(asset_ids, prices)` on-chain

The contract enforces a **30-second oracle freshness window** — `open_position()` and `close_position()` reject if the oracle timestamp is stale.

### 2.3 DART = Deflex for Swap Execution

The swap screen uses `@deflex/deflex-sdk-js` to route trades through real Algorand testnet DEX liquidity (Tinyman, Pact, etc.) via the Deflex Order Router contract. No custom pool contracts are built. Deflex is the routing layer.

### 2.4 No Hardcoded Prices, No Fake Data

All prices come from live Deflex quotes against real testnet DEX liquidity. All swaps execute on-chain through the Deflex Order Router. All contracts are deployed on Algorand testnet.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  cresca (React Native / Expo)                             │
│  swap.tsx ──► dartRouterService.ts ──► Deflex SDK             │
│  bucket UI ──► dartRouterService.ts ──► BucketProtocol        │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  oracleKeeperService.ts  (runs every 20s)                      │
│  Deflex getFixedInputSwapQuote() ──► update_oracle() on-chain  │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Algorand Testnet Contracts                                     │
│                                                                 │
│  CrescaBucketProtocol (modified)                               │
│  ├── update_oracle(asset_ids, prices, timestamp)               │
│  ├── open_position()  — rejects if oracle stale > 30s          │
│  └── close_position() — rejects if oracle stale > 30s          │
│                                                                 │
│  Deflex Order Router (already deployed on testnet)             │
│  ├── User_opt_into_assets(expected_amount_out, finalize_index) │
│  ├── User_swap(nr_swaps, protocol_list, ...)                   │
│  └── User_swap_finalize(asset_in, asset_out, min_amount_out,…) │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Components

### 4.1 Modified `cresca_bucket_protocol.py`

**Changes to existing contract:**

| What | Change |
|---|---|
| `oracle_updated_at` | New `GlobalState[UInt64]` — timestamp of last oracle update |
| `update_oracle()` | Sets `oracle_updated_at = Global.latest_timestamp` alongside price storage |
| `open_position()` | Asserts `Global.latest_timestamp - oracle_updated_at <= 30` |
| `close_position()` | Asserts `Global.latest_timestamp - oracle_updated_at <= 30` |
| `liquidate_position()` | Asserts `Global.latest_timestamp - oracle_updated_at <= 30` |

No new ABI methods. No structural changes. Minimal, targeted diff.

**Why 30 seconds:** Algorand block time is ~4s. A 30-second window allows the keeper 7 block cycles before prices go stale. Tight enough to prevent oracle manipulation, loose enough that a single missed keeper cycle doesn't halt the protocol.

---

### 4.2 `dartRouterService.ts` (new)

Location: `rigawallet-/services/dartRouterService.ts`

**Responsibilities:**
- Wraps `@deflex/deflex-sdk-js` `DeflexOrderRouterClient`
- Exposes clean methods consumed by `swap.tsx` and the keeper

**Interface:**

```typescript
// Initialise Deflex client for testnet
initDeflexClient(algodUri: string, algodToken: string, senderAddr: string): Promise<void>

// Get a swap quote from Deflex — used by swap screen and oracle keeper
getFixedInputQuote(
  assetIn: number,    // 0 = ALGO
  assetOut: number,   // ASA ID
  amountIn: number    // in base units (μALGO or ASA smallest unit)
): Promise<DeflexQuote>

// Derive ALGO-denominated mid-price for an asset (for oracle)
// Quotes: fixed ALGO amount → assetId, inverts to get ALGO-per-asset price
// e.g. quote 1_000_000 μALGO → asset, price = 1_000_000 / amount_out * PRICE_PRECISION
getAssetPriceInAlgo(assetId: number): Promise<number>  // 8-decimal precision (1e8)

// Execute a swap via Deflex Order Router (for swap screen)
executeSwap(
  quote: DeflexQuote,
  slippageBps: number,
  senderAddr: string,
  signer: algosdk.TransactionSigner
): Promise<{ txId: string; amountOut: number }>

// Get prices for all ASA IDs in a bucket (for oracle keeper pre-check)
getBucketAssetPrices(assetIds: number[]): Promise<Record<number, number>>
```

**Error handling:**
- If Deflex quote fails (no liquidity, asset not found), throws `DeflexQuoteError` with the asset pair — caller decides whether to abort or use fallback
- No silent fallbacks to hardcoded prices

---

### 4.3 `oracleKeeperService.ts` (new)

Location: `rigawallet-/services/oracleKeeperService.ts`

**Responsibilities:**
- Runs on a 20-second interval
- Fetches current prices for all registered ASAs via `dartRouterService.getAssetPriceInAlgo()`
- Submits `update_oracle(asset_ids, prices)` to `CrescaBucketProtocol` on testnet
- Logs each oracle update with txId for auditability

**Interface:**

```typescript
class OracleKeeperService {
  start(trackedAssetIds: number[], intervalMs: number): void
  stop(): void
  getLastUpdateTimestamp(): number | null
  getLastUpdateTxId(): string | null
}
```

**Lifecycle:** Started when the app initialises (in `app/_layout.tsx`), stopped on teardown. Runs in the background — does not block UI.

---

### 4.4 Updated `swap.tsx`

Replace the current mock swap logic with:
1. Call `dartRouterService.getFixedInputQuote(assetIn, assetOut, amount)` to show live quote
2. Display: expected output, price impact, route (which venues Deflex uses), fee
3. On confirm: call `dartRouterService.executeSwap(quote, slippageBps, sender, signer)`
4. Show txId on success linking to Algorand testnet explorer

No mock returns. The quote displayed is what Deflex will execute.

---

### 4.5 Updated `algorandContractServices.ts`

Add:
- `CONTRACT_APP_IDS.DeflexOrderRouter` — the Deflex Order Router testnet app ID (fetched from Deflex SDK client at runtime, not hardcoded)
- Helper `callUpdateOracle(assetIds, prices)` — used by keeper
- Helper `callOpenPosition(bucketId, isLong, margin)` — unchanged except now depends on oracle being fresh

---

### 4.6 Updated `deploy.py`

- Deploys modified `CrescaBucketProtocol` to Algorand testnet
- Prints the new App ID
- Optionally: calls `update_oracle()` once post-deploy with initial Deflex prices so the oracle is immediately fresh

---

## 5. Data Flow

### Oracle Update (every 20s)

```
oracleKeeperService
  → dartRouterService.getAssetPriceInAlgo(assetId) × N assets
    → DeflexOrderRouterClient.getFixedInputSwapQuote(assetId, ALGO, 1_unit)
    → parse implied ALGO price from expected_amount_out
  → algorandContractServices.callUpdateOracle(asset_ids, prices)
    → ATC: CrescaBucketProtocol.update_oracle(asset_ids, prices)
    → sets oracle_updated_at = block timestamp
```

### Swap (user action)

```
swap.tsx
  → dartRouterService.getFixedInputQuote(assetIn, assetOut, amount)
    → DeflexOrderRouterClient.getFixedInputSwapQuote(...)
    → returns: expected_amount_out, route_venues, required_app_opt_ins
  → [user confirms]
  → dartRouterService.executeSwap(quote, slippageBps, sender, signer)
    → ATC group:
        [opt-in txns for required assets]
        [Deflex User_opt_into_assets(...)]
        [Deflex User_swap(...) × N legs]
        [Deflex User_swap_finalize(min_amount_out, beneficiary, ...)]
    → submits and awaits confirmation
    → returns { txId, amountOut }
```

### Open Position (user action)

```
bucket UI
  → check: dartRouterService.getBucketAssetPrices(bucket.assetIds)
    → warns user if any asset has no liquidity on Deflex testnet
  → check: oracle is fresh (oracleKeeperService.getLastUpdateTimestamp() < 30s ago)
    → if stale: UI shows "Prices updating…" and waits for next keeper cycle
  → algorandContractServices.callOpenPosition(bucketId, isLong, margin)
    → ATC: CrescaBucketProtocol.open_position(bucket_id, is_long, margin)
    → contract asserts oracle freshness internally (30s check)
    → emits PositionOpened with oracle price as entry price
```

---

## 6. Testnet Deployment Plan

| Contract | Action | Notes |
|---|---|---|
| `CrescaBucketProtocol` | Redeploy (modified) | New App ID, update `CONTRACT_APP_IDS` |
| `CrescaPayments` | No change | Existing testnet App ID stays |
| `CrescaCalendarPayments` | No change | Existing testnet App ID stays |
| Deflex Order Router | Use existing deployment | App ID from `DeflexOrderRouterClient` at runtime |

**Testnet ASAs to track in oracle (standard Algorand testnet assets):**
- `0` — ALGO (native, price = 1.0 in ALGO terms, 8-dec: `100_000_000`)
- `10458941` — USDC (testnet)
- Other ASAs discoverable via Deflex testnet liquidity

**Seeding:** No custom liquidity seeding required — Deflex routes through existing testnet DEX liquidity on Tinyman/Pact testnet deployments.

---

## 7. Out of Scope

- Limit orders (Deflex limit order SDK is separate — future work)
- Building custom AMM pool contracts (Deflex handles this)
- Mainnet deployment (testnet only per hackathon scope)
- Websocket price streaming (polling every 20s is sufficient)
- Position liquidation keeper (existing `liquidate_position()` method unchanged, caller still manual)

---

## 8. Files Changed / Created

| File | Status | Description |
|---|---|---|
| `cresca_bucket_protocol.py` | Modified | Add `oracle_updated_at`, staleness check on position open/close/liquidate |
| `rigawallet-/services/dartRouterService.ts` | New | Deflex SDK wrapper for quotes + swap execution |
| `rigawallet-/services/oracleKeeperService.ts` | New | Background keeper: Deflex prices → update_oracle() |
| `rigawallet-/services/algorandContractServices.ts` | Modified | Add `callUpdateOracle()`, `callOpenPosition()` helpers |
| `rigawallet-/app/swap.tsx` | Modified | Replace mock swap with Deflex live quote + execution |
| `rigawallet-/app/_layout.tsx` | Modified | Start/stop oracle keeper on app lifecycle |
| `rigawallet-/app/bucket.tsx` | Modified | Add oracle freshness indicator, Deflex price display |
| `deploy.py` | Modified | Redeploy BucketProtocol, post-deploy oracle seed |

**New dependency:** `@deflex/deflex-sdk-js` (npm)

---

## 9. Success Criteria

- [ ] `CrescaBucketProtocol` deployed on Algorand testnet with oracle freshness check
- [ ] Oracle keeper updates prices from Deflex every 20s with on-chain txId proof
- [ ] `open_position()` rejects with `oracle stale` if keeper has not run for >30s
- [ ] Swap screen shows live Deflex quote (expected output, venues, price impact)
- [ ] Swap screen executes real on-chain swaps via Deflex Order Router
- [ ] No hardcoded prices anywhere in the codebase
