"""Integration test: engine attestation -> on-chain payWithBoost -> replay rejected.

Requires a running node (RPC_URL), a deployed+seeded chain (shared/deployments.json[CHAIN_ID])
and a running engine (ENGINE_URL). Run with `make test-integration`.
Safe to run repeatedly: a same-day repeat for the same pair simply yields boost 0."""

from __future__ import annotations

import os

import httpx
import pytest
from eth_account import Account
from web3 import Web3
from web3.exceptions import ContractCustomError, ContractLogicError

from engine import chain
from engine.config import get_settings

pytestmark = pytest.mark.integration


def _keys(name: str) -> list[str]:
    return [k.strip() for k in os.environ.get(name, "").split(",") if k.strip()]


def _revert_selector(err: Exception) -> str:
    """Extracts the 4-byte selector from a web3 revert error. Hardhat puts it in data['data'];
    other nodes return the hex string directly in data."""
    data = getattr(err, "data", None)
    if isinstance(data, dict):
        data = data.get("data") or data.get("originalError", {}).get("data", "")
    if not isinstance(data, str):
        data = ""
    return data.removeprefix("0x")[:8]


def _send(w3: Web3, fn, key: str) -> dict:
    acct = Account.from_key(key)
    tx = fn.build_transaction(
        {
            "from": acct.address,
            "nonce": w3.eth.get_transaction_count(acct.address),
            "chainId": w3.eth.chain_id,
        }
    )
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    assert receipt["status"] == 1, f"tx {tx_hash.hex()} failed"
    return receipt


@pytest.fixture(scope="module")
def env():
    s = get_settings()
    engine_url = os.environ.get("ENGINE_URL", "http://127.0.0.1:8000").rstrip("/")
    payer_keys = _keys("PAYER_KEYS")
    assert payer_keys, "PAYER_KEYS missing"
    w3 = chain.w3()
    assert w3.is_connected(), f"RPC {s.rpc_url} not reachable"
    health = httpx.get(f"{engine_url}/health", timeout=10).json()
    assert health["ok"] is True and health["chainId"] == s.chain_id, health
    return {
        "s": s,
        "w3": w3,
        "engine_url": engine_url,
        "payer_key": payer_keys[0],
        "city_key": os.environ["CITY_KEY"],
        "oracle_key": os.environ["ORACLE_KEY"],
        "merchant": Web3.to_checksum_address(s.deployment.merchants[0]["address"]),
        "zone_id": int(s.deployment.merchants[0]["zoneId"]),
    }


def _ensure_budget_and_rate(env: dict) -> None:
    w3, boost, token = env["w3"], chain.local_boost(), chain.token()
    zone = env["zone_id"]
    if boost.functions.zoneBudget(zone).call() == 0:
        city = Account.from_key(env["city_key"]).address
        if token.functions.allowance(city, boost.address).call() < 100_000:
            _send(w3, token.functions.approve(boost.address, 2**256 - 1), env["city_key"])
        _send(w3, boost.functions.depositBudget(zone, 100_000), env["city_key"])
    if boost.functions.currentRate(zone).call() == 0:
        epoch = chain.now_ts() // 3600
        for e in (epoch, epoch + 1):
            _send(w3, boost.functions.setRates(e, [zone], [1000]), env["oracle_key"])


def test_attest_pay_and_replay(env: dict, capsys):
    w3, boost = env["w3"], chain.local_boost()
    payer = Account.from_key(env["payer_key"]).address
    merchant = env["merchant"]
    amount = 10_000
    _ensure_budget_and_rate(env)

    # (1) attestation from the engine
    r = httpx.post(
        f"{env['engine_url']}/attest",
        json={"payer": payer, "merchant": merchant, "amount": amount},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    att = body["attestation"]
    att_tuple = (
        Web3.to_checksum_address(att["payer"]),
        Web3.to_checksum_address(att["merchant"]),
        int(att["amount"]),
        int(att["tier"]),
        int(att["nonce"]),
        int(att["deadline"]),
    )
    sig = bytes.fromhex(body["signature"][2:])

    # (2) payWithBoost succeeds and Paid.boost equals quoteBoost taken just before
    quote = boost.functions.quoteBoost(payer, merchant, amount, 0).call()
    receipt = _send(w3, boost.functions.payWithBoost(merchant, amount, 0, att_tuple, sig), env["payer_key"])
    paid = boost.events.Paid().process_receipt(receipt)
    assert len(paid) == 1
    ev = paid[0]["args"]
    tx_hash = "0x" + receipt["transactionHash"].hex().removeprefix("0x")
    print(f"\nfirst payment txHash={tx_hash} boost={ev['boost']} tier={ev['tier']} quote={quote}")
    assert ev["amount"] == amount
    assert int(ev["tier"]) == int(att["tier"])
    if int(att["tier"]) == 0:
        assert ev["boost"] == quote
    # Tier 2: boost 0 regardless of quote. Tier 1: boost equals quote but goes to Pending.
    if int(att["tier"]) >= 2:
        assert ev["boost"] == 0

    # (3) replay of the same attestation reverts with NonceUsed()
    selector = Web3.keccak(text="NonceUsed()")[:4].hex()
    with pytest.raises((ContractCustomError, ContractLogicError)) as exc:
        boost.functions.payWithBoost(merchant, amount, 0, att_tuple, sig).call({"from": payer})
    got = _revert_selector(exc.value)
    print(f"replay reverted with selector 0x{got} (NonceUsed()=0x{selector}) -> {'NonceUsed' if got == selector else 'OTHER'}")
    assert got == selector
