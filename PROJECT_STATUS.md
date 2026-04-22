# Cresca Project Status

## Current Repository Layout

The wallet repository is now organized around an Algorand-only architecture.

```
wallet/
├── app/
├── assets/
├── components/
├── constants/
├── contracts/
│   └── algorand/
│       ├── cresca_payments.py
│       ├── cresca_calendar_payments.py
│       ├── cresca_bucket_protocol.py
│       ├── cresca_dart_swap.py
│       ├── deploy.py
│       ├── create_deployer_account.py
│       ├── deployed_contracts.json
│       └── artifacts/
├── services/
└── utils/
```

## Active Smart Contracts (Algorand Testnet)

Configured in `services/algorandContractServices.ts` and `services/dartRouterService.ts`:

1. `CrescaPayments`: `758849047`
2. `CrescaCalendarPayments`: `758849049`
3. `CrescaBucketProtocol`: `758849061`
4. `CrescaDartSwap`: `758849063`

## Mobile App Status

- Expo React Native app is in this repository (`wallet/`)
- Home quick actions are `Send`, `Receive`, `Swap`
- Transaction/trade/onboarding notifications are theme-unified
- App password setup and unlock flow is active
- Swap execution uses live DART contract for configured pools

## Commands

Run app:

```bash
npm install
npm start
```

Compile contracts:

```bash
cd contracts/algorand
../../my_env/bin/puyapy cresca_payments.py cresca_calendar_payments.py cresca_bucket_protocol.py cresca_dart_swap.py --out-dir artifacts --output-arc32
```

Deploy contracts:

```bash
cd contracts/algorand
set -a
source ../../../.env.deployer
set +a
../../my_env/bin/python deploy.py --network testnet
```
