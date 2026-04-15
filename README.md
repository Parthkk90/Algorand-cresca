# Cresca Wallet

Cresca is a React Native Expo wallet focused on Algorand testnet DeFi workflows:

- Direct ALGO send and receive (QR)
- Calendar-based payments
- Bundle trading via CrescaBucketProtocol
- Swap routing via CrescaDartSwap
- App-level password lock and themed in-app notifications

## Repository Structure

```
wallet/
├── app/                      # Expo Router screens
├── assets/                   # Images and static assets
├── components/               # Reusable UI components
├── constants/                # Theme and app constants
├── contracts/algorand/       # Active Algorand contracts + deploy tooling
├── services/                 # Wallet, contract, oracle, and storage services
└── utils/                    # Shared utility modules
```

## Active Contract Services

Configured in source:

- `services/algorandContractServices.ts`
  - `CrescaPayments` app id: `758836614`
  - `CrescaCalendarPayments` app id: `758836616`
  - `CrescaBucketProtocol` app id: `758836627`
- `services/dartRouterService.ts`
  - `CrescaDartSwap` app id: `758849063`

## Run the App

```bash
npm install
npm start
```

## Type Check

```bash
npx tsc --noEmit
```

## Compile Contracts

```bash
cd contracts/algorand
../../my_env/bin/puyapy cresca_payments.py cresca_calendar_payments.py cresca_bucket_protocol.py cresca_dart_swap.py --out-dir artifacts --output-arc32
```

## Deploy Contracts (Testnet)

```bash
cd contracts/algorand
set -a
source ../../../.env.deployer
set +a
../../my_env/bin/python deploy.py --network testnet
```

## Notes

- Expo Go does not support full notification scheduling. Use a dev client for notification testing.
- This repository is intentionally Algorand-first; legacy EVM service files were removed.
