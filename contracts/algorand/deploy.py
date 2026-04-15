"""
Cresca Algorand — Deploy Script
================================
Deploys all three Cresca contracts to Algorand Testnet using algokit-utils.

Prerequisites:
    pip install algokit-utils algopy
    algokit localnet start          # or point to testnet below
    algokit compile python cresca_payments.py
    algokit compile python cresca_calendar_payments.py
    algokit compile python cresca_bucket_protocol.py

Usage:
    python deploy.py --network testnet
    python deploy.py --network localnet
"""

import argparse
import json
import os
from pathlib import Path

from algokit_utils import (
    ApplicationClient,
    ApplicationSpecification,
    AlgorandClient,
    Account,
)
from algosdk.logic import get_application_address
from algosdk.v2client import algod


# ---------------------------------------------------------------------------
# Network configs
# ---------------------------------------------------------------------------

NETWORKS = {
    "localnet": {
        "algod_url": "http://localhost:4001",
        "algod_token": "a" * 64,
    },
    "testnet": {
        "algod_url": "https://testnet-api.algonode.cloud",
        "algod_token": "",
    },
}


def get_algod_client(network: str) -> algod.AlgodClient:
    cfg = NETWORKS[network]
    return algod.AlgodClient(cfg["algod_token"], cfg["algod_url"])


def load_app_spec(artifact_dir: Path, contract_name: str) -> ApplicationSpecification:
    """Load the compiled ARC-32 app spec JSON produced by `algokit compile`."""
    spec_path = artifact_dir / f"{contract_name}.arc32.json"
    if not spec_path.exists():
        raise FileNotFoundError(
            f"App spec not found: {spec_path}\n"
            f"Run: algokit compile python {contract_name.lower()}.py"
        )
    return ApplicationSpecification.from_json(spec_path.read_text())


def deploy_contract(
    algod_client: algod.AlgodClient,
    deployer: Account,
    contract_name: str,
    artifact_dir: Path,
) -> int:
    """Deploy a contract and return the app ID."""
    print(f"\n[{contract_name}] Deploying...")
    spec = load_app_spec(artifact_dir, contract_name)

    client = ApplicationClient(
        algod_client=algod_client,
        app_spec=spec,
        signer=deployer,
        sender=deployer.address,
    )

    # Fund the contract with minimum balance for Box storage
    # ~0.1 ALGO covers a handful of boxes; increase for production
    response = client.create()

    app_id = getattr(response, "app_id", None) or getattr(response, "application_id", None)
    if not app_id:
        tx_id = getattr(response, "tx_id", None) or getattr(response, "txid", None)
        if not tx_id:
            raise RuntimeError("Could not resolve app ID: missing app_id and tx_id in create() response")
        pending = algod_client.pending_transaction_info(tx_id)
        app_id = pending.get("application-index") or pending.get("applicationIndex")
        if not app_id:
            raise RuntimeError(f"Could not resolve app ID from pending transaction {tx_id}")

    app_addr = get_application_address(int(app_id))

    print(f"  App ID  : {app_id}")
    print(f"  App Addr: {app_addr}")

    # Skip automatic funding here so deployments do not fail when the deployer
    # is only slightly above the minimum required balance.
    # Fund the contract later via the app's fundContract flow if needed.
    print(f"  Funded  : skipped (manual funding later if needed)")

    return app_id


def main():
    parser = argparse.ArgumentParser(description="Deploy Cresca contracts to Algorand")
    parser.add_argument(
        "--network",
        choices=["localnet", "testnet"],
        default="localnet",
        help="Target network (default: localnet)",
    )
    parser.add_argument(
        "--mnemonic",
        default=None,
        help="25-word deployer mnemonic (if omitted, reads ALGO_DEPLOYER_MNEMONIC or uses localnet default account)",
    )
    args = parser.parse_args()

    algod_client = get_algod_client(args.network)

    deployer_mnemonic = args.mnemonic or os.getenv("ALGO_DEPLOYER_MNEMONIC")

    if deployer_mnemonic:
        from algosdk import mnemonic as mnm
        private_key = mnm.to_private_key(deployer_mnemonic)
        from algosdk.account import address_from_private_key
        deployer = Account(private_key=private_key, address=address_from_private_key(private_key))
    else:
        # localnet: use the pre-funded account from `algokit localnet`
        from algokit_utils import get_localnet_default_account
        deployer = get_localnet_default_account(algod_client)

    print(f"Deployer: {deployer.address}")
    print(f"Network : {args.network}")

    artifact_dir = Path(__file__).parent / "artifacts"
    artifact_dir.mkdir(exist_ok=True)

    contracts = [
        "CrescaPayments",
        "CrescaCalendarPayments",
        "CrescaBucketProtocol",
        "CrescaDartSwap",
    ]

    deployed = {}
    for name in contracts:
        try:
            app_id = deploy_contract(algod_client, deployer, name, artifact_dir)
            deployed[name] = app_id
        except FileNotFoundError as e:
            print(f"  SKIP: {e}")

    # Save deployed addresses
    output = Path(__file__).parent / "deployed_contracts.json"
    output.write_text(json.dumps(deployed, indent=2))
    print(f"\nDeployed contract IDs saved to {output}")
    print(json.dumps(deployed, indent=2))


if __name__ == "__main__":
    main()
