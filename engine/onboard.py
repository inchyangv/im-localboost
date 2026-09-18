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


def _set_person(wallet: str, person_id: str) -> str:
    fn = chain.registry().functions.setPerson(wallet, bytes.fromhex(person_id.removeprefix("0x")))
    return chain.send_tx(fn, get_settings().bank_key)


def _mint(wallet: str, amount: int) -> str:
    return chain.send_tx(chain.token().functions.mint(wallet, int(amount)), get_settings().bank_key)


def _token_balance(wallet: str) -> int:
    return int(chain.token().functions.balanceOf(wallet).call())


def _native_balance(wallet: str) -> int:
    return int(chain.w3().eth.get_balance(wallet))


def _send_native(wallet: str, value_wei: int) -> str:
    return chain.send_native(wallet, int(value_wei), get_settings().bank_key)


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


def onboard(conn: sqlite3.Connection, wallet: str, now: int) -> dict[str, Any]:
    """Registers the wallet when needed, mints the daily starter amount once per KST day and tops
    up native gas when the wallet holds less than half of the top-up amount."""
    s = get_settings()
    day = chain.kst_day(now)
    with _lock:
        existing = _person_of(wallet)
        registered_before = existing != ZERO_PERSON
        person_tx: str | None = None
        if registered_before:
            person_id = _hex32(existing)
        else:
            person_id = person_id_for(wallet)
            person_tx = _set_person(wallet, person_id)

        prior = db.onboard_get(conn, wallet, day)
        mint_tx: str | None = None
        minted = 0
        if prior is None and s.onboard_imkrw > 0:
            mint_tx = _mint(wallet, s.onboard_imkrw)
            minted = s.onboard_imkrw

        gas_tx: str | None = None
        gas_sent = 0
        if s.onboard_gas_wei > 0 and _native_balance(wallet) < s.onboard_gas_wei // 2:
            gas_tx = _send_native(wallet, s.onboard_gas_wei)
            gas_sent = s.onboard_gas_wei

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
        "balance": _token_balance(wallet),
    }
