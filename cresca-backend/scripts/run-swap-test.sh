#!/usr/bin/env bash

set -euo pipefail

echo "🧪 Cresca DART - Real Swap Integration Test"
echo "==========================================="
echo

if [[ -z "${TESTNET_MNEMONIC:-}" ]]; then
  echo "❌ Error: TESTNET_MNEMONIC not set"
  echo
  echo "Export a funded testnet wallet mnemonic first:"
  echo '  export TESTNET_MNEMONIC="word1 word2 ... word25"'
  echo
  echo "Fund a testnet account here if needed: https://bank.testnet.algorand.network"
  exit 1
fi

node --import tsx --test tests/integration/swap-execution.test.ts

echo
echo "✅ Test completed!"