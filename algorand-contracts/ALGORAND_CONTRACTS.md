# Cresca Algorand Smart Contracts

Python smart contracts for the Algorand Hackathon — direct port of the Algorand
EVM (`CrescaPayments`, `CrescaCalendarPayments`, `CrescaBucketProtocol`) using
**algopy (Puya)**, Algorand's official Python smart-contract framework.

---

## Files

| File | Solidity Equivalent | Purpose |
|------|---------------------|---------|
| `cresca_payments.py` | `CrescaPayments.sol` | Instant P2P transfers, tap-to-pay, batch send |
| `cresca_calendar_payments.py` | `CrescaCalendarPayments.sol` | Scheduled & recurring payments with escrow |
| `cresca_bucket_protocol.py` | `CrescaBucketProtocol.sol` | Leveraged basket trading (1-150x) |
| `deploy.py` | — | Deploy script (algokit-utils) |

---

## Quick Start

Run all commands below from the `algorand-contracts/` directory.

### 1. Install tooling

```bash
cd algorand-contracts
pip install algokit-utils algopy
brew install algorand/homebrew-algorand/algokit   # or pip install algokit
```

### 2. Start localnet

```bash
algokit localnet start
```

### 3. Compile contracts

```bash
cd algorand-contracts
algokit compile python cresca_payments.py
algokit compile python cresca_calendar_payments.py
algokit compile python cresca_bucket_protocol.py
```

Compiled ARC-32 app specs are placed in `./artifacts/`.

### 4. Deploy

```bash
cd algorand-contracts
# Localnet (uses pre-funded account automatically)
python deploy.py --network localnet

# Testnet (option A: pass mnemonic directly)
python deploy.py --network testnet --mnemonic "word1 word2 ... word25"

# Testnet (option B: env var, recommended)
export ALGO_DEPLOYER_MNEMONIC="word1 word2 ... word25"
python deploy.py --network testnet
```

### 5. Create a fresh deployer account (optional)

```bash
# Generate a new Algorand account and save env vars
cd algorand-contracts
python3 create_deployer_account.py --write-env .env.deployer

# Load into shell, then deploy
set -a
source .env.deployer
set +a
python deploy.py --network testnet
```

Fund the generated address with testnet ALGO first:
https://bank.testnet.algorand.network/

---

## Key Differences: Algorand EVM → Algorand

| Aspect | Algorand EVM | Algorand |
|--------|-----------|----------|
| Language | Solidity | Python (algopy / Puya) |
| Native token unit | wei (1e18) | μALGO (1e6) |
| Asset IDs | ERC-20 addresses | Algorand ASA uint64 IDs |
| Storage | Contract mappings | AVM Boxes (keyed by user+id) |
| Events | `emit Event(...)` | `arc4.emit(...)` → ARC-28 logs |
| Scheduled execution | `block.timestamp` check | Same, but requires keeper bot |
| Oracle | Chainlink / mock | Pyth Algorand (mock in dev) |
| Fee model | Gas (wei-based) | Flat 1000 μALGO + byte cost |
| Batch inner txns | Unlimited loops | Max 256 inner txns per call |

---

## Contract Notes

### CrescaPayments

- All amounts in **μALGO** (multiply ALGO × 1_000_000).
- Caller attaches a `PaymentTransaction` to the contract in the same atomic
  group; the contract immediately forwards it to the recipient via an inner txn.
- Payment history is emitted as **ARC-28 events** — query via Algorand Indexer.
- Batch send is capped at **~8 recipients** per ATC call due to inner-txn budget.

### CrescaCalendarPayments

- Schedules stored in **AVM Boxes** (key = payer_address + schedule_id).
- Escrow funds held by the contract account — fund it with ≥ 0.5 ALGO for
  box min-balance before creating schedules.
- A **keeper bot** must call `execute_schedule()` when payments are due
  (Algorand has no on-chain cron — same keeper pattern as EVM automation).
- Call `fund_contract()` with extra ALGO whenever new boxes are needed.

### CrescaBucketProtocol

- Asset IDs are **Algorand ASA uint64 IDs** (use `0` for native ALGO).
- Supports up to **8 assets per bucket** (expand structs to increase).
- Oracle prices updated via `update_oracle()` — **swap for Pyth** in production.
- P&L settled back to the user's on-contract collateral balance in μALGO.
- Liquidation is open to any caller (keeper/bot pattern).

---

## Testnet Faucet

Get testnet ALGO at: https://bank.testnet.algorand.network/
