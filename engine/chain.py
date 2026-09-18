"""web3 connection and contract handles. Time helpers mirror the Solidity definitions."""

from __future__ import annotations

import time
from functools import lru_cache

from web3 import Web3
from web3.contract import Contract

from engine.config import get_settings, load_abi

KST_OFFSET = 9 * 3600


def hour_epoch(ts: int) -> int:
    """hourEpoch = timestamp / 3600 (same as the contract)."""
    return ts // 3600


def kst_day(ts: int) -> int:
    """day = (timestamp + 9h) / 1 day (KST day boundary, same as the contract)."""
    return (ts + KST_OFFSET) // 86400


@lru_cache(maxsize=1)
def w3() -> Web3:
    s = get_settings()
    return Web3(Web3.HTTPProvider(s.rpc_url, request_kwargs={"timeout": 30}))


def _contract(name: str) -> Contract:
    s = get_settings()
    return w3().eth.contract(address=Web3.to_checksum_address(s.deployment.contracts[name]), abi=load_abi(name))


@lru_cache(maxsize=1)
def token() -> Contract:
    return _contract("MockIMKRW")


@lru_cache(maxsize=1)
def registry() -> Contract:
    return _contract("MerchantRegistry")


@lru_cache(maxsize=1)
def dalgubeol_pay() -> Contract:
    return _contract("DalgubeolPay")


def block_number() -> int:
    return int(w3().eth.block_number)


def now_ts() -> int:
    """Reference time for risk evaluation and attestation deadlines: the later of wall clock and the
    latest block timestamp. Hardhat automine drifts ahead of wall clock by one second per block, and
    an idle node lags behind it; the max covers both."""
    wall = int(time.time())
    try:
        return max(wall, int(w3().eth.get_block("latest")["timestamp"]))
    except Exception:  # noqa: BLE001
        return wall


def chain_id() -> int:
    return int(w3().eth.chain_id)


def send_tx(fn, private_key: str, timeout: int = 120) -> str:
    """Signs a contract function call with `private_key`, sends it and waits for the receipt.
    Returns the tx hash (0x-hex). Raises if the receipt status is 0."""
    from eth_account import Account

    acct = Account.from_key(private_key)
    tx = fn.build_transaction(
        {
            "from": acct.address,
            "nonce": w3().eth.get_transaction_count(acct.address, "pending"),
            "chainId": chain_id(),
        }
    )
    signed = acct.sign_transaction(tx)
    tx_hash = w3().eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3().eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
    if int(receipt["status"]) != 1:
        raise RuntimeError(f"transaction {tx_hash.hex()} reverted")
    return "0x" + tx_hash.hex().removeprefix("0x")
