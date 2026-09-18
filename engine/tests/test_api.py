import time

from eth_account import Account
from eth_account.messages import encode_typed_data

from engine.signer import ATTESTATION_TYPES, domain
from engine.tests.conftest import MERCHANT1, PAYER1


def test_health(app_client, fake_settings):
    r = app_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["chainId"] == 31337
    assert body["contract"] == fake_settings.deployment.contracts["LocalBoost"]
    assert body["lastBlock"] is None  # poller stubbed: nothing ingested yet
    assert body["dbPath"].endswith("engine.db")


def test_attest_returns_valid_signature(app_client, fake_settings):
    r = app_client.post("/attest", json={"payer": PAYER1.lower(), "merchant": MERCHANT1, "amount": 10000})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tier"] == 0
    assert body["reasons"] == []
    att = body["attestation"]
    assert att["payer"] == PAYER1  # checksummed
    assert att["merchant"] == MERCHANT1
    assert att["amount"] == 10000
    assert att["tier"] == 0
    nonce = int(att["nonce"])
    assert 0 <= nonce < 2**256
    assert len(att["nonce"]) <= 78
    assert 0 < att["deadline"] - int(time.time()) <= 120
    sig = body["signature"]
    assert sig.startswith("0x") and len(sig) == 132

    recovered = Account.recover_message(
        encode_typed_data(domain_data=domain(31337, fake_settings.deployment.contracts["LocalBoost"]), message_types=ATTESTATION_TYPES, message_data={**att, "nonce": nonce}),
        signature=sig,
    )
    assert recovered == Account.from_key(fake_settings.attester_key).address


def test_attest_rejects_bad_input(app_client):
    assert app_client.post("/attest", json={"payer": "0x123", "merchant": MERCHANT1, "amount": 1}).status_code == 422
    assert app_client.post("/attest", json={"payer": PAYER1, "merchant": MERCHANT1, "amount": 0}).status_code == 422
    assert app_client.post("/attest", json={"payer": PAYER1, "merchant": MERCHANT1, "amount": -5}).status_code == 422


def test_cors_preflight(app_client):
    r = app_client.options(
        "/attest",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
    r2 = app_client.options(
        "/attest",
        headers={"Origin": "https://anything.vercel.app", "Access-Control-Request-Method": "POST"},
    )
    assert r2.headers.get("access-control-allow-origin") == "https://anything.vercel.app"
