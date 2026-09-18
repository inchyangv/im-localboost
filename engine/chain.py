"""web3 connection and contract handles. Time helpers mirror the Solidity definitions."""

from __future__ import annotations

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
def local_boost() -> Contract:
    return _contract("LocalBoost")


def block_number() -> int:
    return int(w3().eth.block_number)


def chain_id() -> int:
    return int(w3().eth.chain_id)
