"""EIP-712 attestation signing (domain DalgubeolPay/1, type string from SPEC 4.3)."""

from __future__ import annotations

import secrets
import time
from typing import Any

from eth_account import Account
from eth_account.signers.local import LocalAccount

ATTESTATION_TYPES: dict[str, list[dict[str, str]]] = {
    "Attestation": [
        {"name": "payer", "type": "address"},
        {"name": "merchant", "type": "address"},
        {"name": "amount", "type": "uint256"},
        {"name": "tier", "type": "uint8"},
        {"name": "nonce", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
    ]
}

DEADLINE_SECONDS = 120


def domain(chain_id: int, verifying_contract: str) -> dict[str, Any]:
    return {"name": "DalgubeolPay", "version": "1", "chainId": chain_id, "verifyingContract": verifying_contract}


def new_nonce() -> int:
    return secrets.randbits(256)


def build_attestation(payer: str, merchant: str, amount: int, tier: int, now: int | None = None) -> dict[str, Any]:
    ts = int(time.time()) if now is None else now
    return {
        "payer": payer,
        "merchant": merchant,
        "amount": int(amount),
        "tier": int(tier),
        "nonce": new_nonce(),
        "deadline": ts + DEADLINE_SECONDS,
    }


def sign_attestation_with(
    private_key: str, chain_id: int, verifying_contract: str, att: dict[str, Any]
) -> str:
    """Signs `att` with the given key and returns the 65-byte signature as 0x-hex."""
    signed = Account.sign_typed_data(
        private_key,
        domain_data=domain(chain_id, verifying_contract),
        message_types=ATTESTATION_TYPES,
        message_data=att,
    )
    return "0x" + signed.signature.hex().removeprefix("0x")


class AttestationSigner:
    def __init__(self, private_key: str, chain_id: int, verifying_contract: str) -> None:
        self._key = private_key
        self.account: LocalAccount = Account.from_key(private_key)
        self.chain_id = chain_id
        self.verifying_contract = verifying_contract

    @property
    def address(self) -> str:
        return self.account.address

    def sign_attestation(self, att: dict[str, Any]) -> str:
        return sign_attestation_with(self._key, self.chain_id, self.verifying_contract, att)
