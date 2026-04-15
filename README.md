# Cresca Wallet

A mobile-first Algorand wallet and DeFi client built with Expo + React Native.

## Overview

Cresca Wallet is an Algorand-focused application for core payments and DeFi operations on testnet, including:

- Direct ALGO transfers (send and receive with QR)
- Recurring and one-time calendar payments
- Bundle trading with oracle-backed pricing
- Swap quoting and execution through a DART-style router
- App password lock and session unlock
- Unified in-app themed notifications

## Tech Stack

- Expo SDK 54
- React Native 0.81
- TypeScript
- Expo Router
- Algorand SDK (`algosdk`)
- Pyth Hermes client for market/oracle inputs

## Repository Layout

```text
wallet/
├── app/                    # Route screens (Expo Router)
├── assets/                 # Icons, logos, static media
├── components/             # Shared UI components
├── constants/              # Theme, baskets, static configuration
├── contracts/algorand/     # Smart contracts, deploy scripts, artifacts
├── docs/                   # Design/spec notes
├── services/               # Wallet, contracts, routing, notifications
└── utils/                  # Emitters and utility helpers
```

## Active Algorand Contracts

Current testnet app IDs used by the wallet:

- `CrescaPayments`: `758836614`
- `CrescaCalendarPayments`: `758836616`
- `CrescaBucketProtocol`: `758836627`
- `CrescaDartSwap`: `758849063`

References:

- `services/algorandContractServices.ts`
- `services/dartRouterService.ts`
- `contracts/algorand/deployed_contracts.json`

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Run the app

```bash
npm start
```

Platform shortcuts:

```bash
npm run android
npm run ios
npm run web
```

### 3) Type-check

```bash
npx tsc --noEmit
```

### 4) Lint

```bash
npm run lint
```

## Smart Contract Workflow

### Compile contracts

```bash
cd contracts/algorand
../../my_env/bin/puyapy \
  cresca_payments.py \
  cresca_calendar_payments.py \
  cresca_bucket_protocol.py \
  cresca_dart_swap.py \
  --out-dir artifacts \
  --output-arc32
```

### Deploy to testnet

```bash
cd contracts/algorand
set -a
source ../../../.env.deployer
set +a
../../my_env/bin/python deploy.py --network testnet
```

## Product Modules

- Home: portfolio, quick actions, activity
- Swap: quotes, route details, execution, storage updates
- Calendar: schedule creation/execution/cancel flows
- Bundles: open/monitor/close leveraged positions
- Profile/Settings: app controls and wallet identity

## Exact Execution Flows

### 1) Swap Flow (Exact Runtime Path)

Entry point:

- `app/swap.tsx`

Quote and preview flow:

1. User selects `from` token, `to` token, and input amount.
2. UI requests a quote through `dartRouterService.fetchQuote(...)`.
3. If route is `oracle-estimate`, app shows estimate and only allows local portfolio storage (no on-chain swap).
4. If route is live DART route, app shows preview with impact/route/savings and allows execution.

Execution flow (live route):

1. UI calls `dartRouterService.executeSwap(currentQuote, slippagePct)`.
2. Service ensures wallet/account is initialized.
3. For ALGO -> ASA:
  1. If needed, account opt-in to output ASA is submitted.
  2. Group is built with payment txn (user -> DART app address) + ARC4 app call `swap_exact_algo_for_asset`.
4. For ASA -> ALGO:
  1. Group is built with asset transfer txn (user -> DART app address) + ARC4 app call `swap_exact_asset_for_algo`.
5. AtomicTransactionComposer executes the group.
6. UI updates balances, local portfolio cache, and explorer link state.

Primary files:

- `app/swap.tsx`
- `services/dartRouterService.ts`
- `services/algorandService.ts`

### 2) Payment Flow (Quick Pay + Calendar)

#### 2.1 Quick Pay (Direct Wallet Transfer)

Entry point:

- `app/index.tsx` (Quick Pay modal)

Flow:

1. Validate recipient address and amount.
2. Call `algorandService.sendAlgo(toAddress, amountAlgo, note)`.
3. Service builds a native payment transaction from signer wallet to recipient.
4. Transaction is signed locally and submitted to Algod.
5. App waits for confirmation, refreshes balance/history, and shows success card.

Primary files:

- `app/index.tsx`
- `services/algorandService.ts`

#### 2.2 Calendar Payments (Contract Escrow)

Entry point:

- `app/calendar.tsx`

Create schedule flow:

1. User enters recipient, amount, interval, and execution time.
2. App calls `crescaCalendarService.createSchedule(...)` or wrapper methods.
3. Service creates pay-arg escrow funding + ARC4 app call in one atomic group.
4. Returned schedule id is persisted in local storage with notification metadata.

Execute schedule flow:

1. User taps Execute on active schedule.
2. App calls `crescaCalendarService.executeSchedule(payer, scheduleId, recipient)`.
3. On success, local schedule state is updated (`executedCount`, `active`, `next executeAt`).
4. App refreshes wallet balance and displays themed transaction result.

Cancel schedule flow:

1. User confirms cancellation.
2. App calls `crescaCalendarService.cancelSchedule(scheduleId)`.
3. Local schedule state flips to inactive and pending notification is cancelled.

Primary files:

- `app/calendar.tsx`
- `services/algorandContractServices.ts`
- `services/notificationService.ts`

### 3) Bundle Flow (Open and Close Position)

Entry points:

- Open: `app/bundleTrade.tsx`
- Manage/Close: `app/bucket.tsx`

Open position flow:

1. User selects basket, direction, margin, and leverage.
2. App loads oracle prices via `dartRouterService.getOraclePrices(...)`.
3. App updates contract oracle with `crescaBucketService.updateOracle(...)`.
4. App deposits collateral using `crescaBucketService.depositCollateral(...)`.
5. If no bucket exists for context, app creates one with `createBucket(...)`.
6. App opens position via `openPosition(...)` and receives tx/position ids.
7. Position is persisted locally via `positionStore.add(...)` for portfolio screen rendering.

Close position flow:

1. User selects Close on an active position.
2. App refreshes oracle on-chain (`updateOracle(...)`).
3. App calls `closePosition(...)`.
4. On success, local position entry is removed and P&L/result notice is shown.

Primary files:

- `app/bundleTrade.tsx`
- `app/bucket.tsx`
- `services/algorandContractServices.ts`
- `services/dartRouterService.ts`
- `services/positionStore.ts`

## Notification Behavior

- In-app operation messages use themed modals for consistency
- Expo Go does not provide full notification scheduling support
- For notification validation, prefer a development build

## Security Notes

- Wallet secrets are managed with secure local storage patterns
- App password is stored as salted hash and verified locally
- Session lock state is runtime-managed and broadcast through app emitters

## Troubleshooting

If UI changes do not appear after code updates:

```bash
npx expo start -c
```

Then fully restart the app client.

If transaction history or RPC data appears stale, refresh app state from the screen-level refresh controls.

## Status

This codebase is intentionally Algorand-first. Legacy non-Algorand stacks were removed to keep development and deployment focused.
