"""
Create an Algorand deployer account for testnet deployments.

Outputs:
- Address (safe to share)
- Mnemonic (secret)
- Optional .env-style file with deployment variables

Usage:
    python3 create_deployer_account.py
    python3 create_deployer_account.py --show-mnemonic
    python3 create_deployer_account.py --write-env .env.deployer
"""

from __future__ import annotations

import argparse
from pathlib import Path

from algosdk import account, mnemonic


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Algorand deployer account")
    parser.add_argument(
        "--write-env",
        default=None,
        help="Write env vars to a file (example: .env.deployer)",
    )
    parser.add_argument(
        "--show-mnemonic",
        action="store_true",
        help="Print the 25-word mnemonic to stdout",
    )
    args = parser.parse_args()

    private_key, address = account.generate_account()
    words = mnemonic.from_private_key(private_key)

    print("\n=== Algorand Deployer Account Created ===")
    print(f"Address: {address}")
    if args.show_mnemonic:
        print(f"Mnemonic: {words}")
    else:
        print("Mnemonic: [hidden by default; use --show-mnemonic or --write-env]")
    print("\nFund this address from the Algorand testnet faucet:")
    print("https://bank.testnet.algorand.network/")

    env_text = "\n".join(
        [
            f"ALGO_DEPLOYER_ADDRESS={address}",
            f"ALGO_DEPLOYER_MNEMONIC='{words}'",
            "ALGO_NETWORK=testnet",
        ]
    ) + "\n"

    if args.write_env:
        out = Path(args.write_env)
        out.write_text(env_text)
        print(f"\nSaved deployer vars to: {out}")
        print("Keep this file private and never commit it.")
    else:
        print("\nSet this in your shell before deploy:")
        print("export ALGO_DEPLOYER_MNEMONIC='<your 25-word mnemonic>'")


if __name__ == "__main__":
    main()
