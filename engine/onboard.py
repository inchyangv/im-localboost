"""Wallet onboarding: the bank links a personId to a wallet, issues starter iMKRW and tops up
gas so a freshly connected browser wallet can pay right away.

All chain writes are signed with BANK_KEY and serialised with a lock so the bank nonce never
collides. Issuance is limited to once per wallet per KST day (SQLite `onboard` table)."""

from __future__ import annotations

import sqlite3
import threading
from typing import Any

from web3 import Web3

from engine import chain, db
from engine.config import get_settings

ZERO_PERSON = b"\x00" * 32
# Native coin the bank keeps back for its own setPerson/mint fees before it gives gas away.
BANK_GAS_RESERVE_WEI = 2 * 10**16
# Public faucets per chain. The faucet is captcha protected, so an operator refills by hand.
FAUCET_URLS = {1001: "https://faucet.kaia.io"}
_lock = threading.Lock()


def person_id_for(wallet: str) -> str:
    """Deterministic personId for a self-onboarded wallet: keccak256("person-<wallet lowercase>")."""
    return _hex32(bytes(Web3.keccak(text=f"person-{wallet.lower()}")))


def _hex32(value: bytes | str) -> str:
    raw = value if isinstance(value, bytes) else bytes.fromhex(str(value).removeprefix("0x"))
    return "0x" + raw.hex()


# --------------------------------------------------------------------------- chain access
# Kept as module-level functions so unit tests can replace them without a node.
def _person_of(wallet: str) -> bytes:
    return bytes(chain.registry().functions.personOf(wallet).call())


def _set_person(wallet: str, person_id: str, nonce: int) -> str:
    fn = chain.registry().functions.setPerson(wallet, bytes.fromhex(person_id.removeprefix("0x")))
    return chain.submit_tx(fn, get_settings().bank_key, nonce)


def _mint(wallet: str, amount: int, nonce: int) -> str:
    return chain.submit_tx(chain.token().functions.mint(wallet, int(amount)), get_settings().bank_key, nonce)


def _token_balance(wallet: str) -> int:
    return int(chain.token().functions.balanceOf(wallet).call())


def _native_balance(wallet: str) -> int:
    return int(chain.w3().eth.get_balance(wallet))


def _send_native(wallet: str, value_wei: int, nonce: int) -> str:
    return chain.submit_native(wallet, int(value_wei), get_settings().bank_key, nonce)


def _address_of(private_key: str) -> str:
    from eth_account import Account

    return Account.from_key(private_key).address


def _next_nonce() -> int:
    return chain.next_nonce(get_settings().bank_key)


def _wait_all(tx_hashes: list[str]) -> None:
    chain.wait_all(tx_hashes)


# --------------------------------------------------------------------------- api
def status(conn: sqlite3.Connection, wallet: str, now: int) -> dict[str, Any]:
    s = get_settings()
    existing = _person_of(wallet)
    registered = existing != ZERO_PERSON
    prior = db.onboard_get(conn, wallet, chain.kst_day(now))
    return {
        "wallet": wallet,
        "registered": registered,
        "personId": _hex32(existing) if registered else None,
        "mintedToday": prior is not None,
        "mintAmount": s.onboard_imkrw,
        "gasWei": str(s.onboard_gas_wei),
    }


def funds() -> dict[str, Any]:
    """Native gas held by the accounts the engine signs with, so an operator sees when to refill."""
    s = get_settings()
    accounts = []
    for role, key in (("bank", s.bank_key), ("oracle", s.oracle_key)):
        address = _address_of(key)
        accounts.append({"role": role, "address": address, "gasWei": str(_native_balance(address))})
    bank_wei = int(accounts[0]["gasWei"])
    spendable = max(0, bank_wei - BANK_GAS_RESERVE_WEI)
    return {
        "accounts": accounts,
        "gasPerOnboardWei": str(s.onboard_gas_wei),
        "onboardsLeft": spendable // s.onboard_gas_wei if s.onboard_gas_wei > 0 else None,
        "low": s.onboard_gas_wei > 0 and bank_wei < s.onboard_gas_wei + BANK_GAS_RESERVE_WEI,
        "faucetUrl": FAUCET_URLS.get(s.chain_id),
    }


def onboard(conn: sqlite3.Connection, wallet: str, now: int) -> dict[str, Any]:
    """Registers the wallet when needed, mints the daily starter amount once per KST day and tops
    up native gas when the wallet holds less than half of the top-up amount."""
    s = get_settings()
    day = chain.kst_day(now)
    with _lock:
        existing = _person_of(wallet)
        registered_before = existing != ZERO_PERSON
        prior = db.onboard_get(conn, wallet, day)
        need_gas = s.onboard_gas_wei > 0 and _native_balance(wallet) < s.onboard_gas_wei // 2
        # A drained bank still registers and mints; only the gas gift is dropped and the web
        # points the wallet to the faucet instead.
        gas_skipped = need_gas and _native_balance(_address_of(s.bank_key)) < s.onboard_gas_wei + BANK_GAS_RESERVE_WEI
        if gas_skipped:
            need_gas = False

        # Queue every needed transaction back to back (explicit nonces) and wait once, so the
        # wallet is ready in one block on Hardhat and a few seconds on Kairos.
        nonce = _next_nonce() if (not registered_before or prior is None or need_gas) else 0
        pending: list[str] = []
        person_tx: str | None = None
        if registered_before:
            person_id = _hex32(existing)
        else:
            person_id = person_id_for(wallet)
            person_tx = _set_person(wallet, person_id, nonce)
            nonce += 1
            pending.append(person_tx)

        mint_tx: str | None = None
        minted = 0
        if prior is None and s.onboard_imkrw > 0:
            mint_tx = _mint(wallet, s.onboard_imkrw, nonce)
            nonce += 1
            minted = s.onboard_imkrw
            pending.append(mint_tx)

        gas_tx: str | None = None
        gas_sent = 0
        if need_gas:
            gas_tx = _send_native(wallet, s.onboard_gas_wei, nonce)
            nonce += 1
            gas_sent = s.onboard_gas_wei
            pending.append(gas_tx)

        if pending:
            _wait_all(pending)
        if prior is None:
            db.onboard_insert(conn, wallet, day, now, person_tx, mint_tx, gas_tx, minted)

    return {
        "wallet": wallet,
        "personId": person_id,
        "registered": registered_before,
        "personTx": person_tx,
        "minted": minted,
        "mintTx": mint_tx,
        "mintedToday": prior is not None,
        "mintAmount": s.onboard_imkrw,
        "gasSentWei": str(gas_sent),
        "gasTx": gas_tx,
        "gasSkipped": gas_skipped,
        "balance": _token_balance(wallet),
    }
