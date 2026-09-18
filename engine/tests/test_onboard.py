"""POST /onboard and GET /onboard/status with the chain calls replaced by in-memory stand-ins."""

from __future__ import annotations

import pytest

WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"


@pytest.fixture()
def fake_chain(monkeypatch: pytest.MonkeyPatch):
    from engine import onboard

    state = {"person": {}, "token": {}, "native": {WALLET.lower(): 0}, "txs": []}

    def person_of(wallet):
        return bytes.fromhex(state["person"].get(wallet.lower(), "00" * 32))

    def set_person(wallet, pid):
        state["person"][wallet.lower()] = pid.removeprefix("0x")
        state["txs"].append(("setPerson", wallet, pid))
        return "0x" + "11" * 32

    def mint(wallet, amount):
        state["token"][wallet.lower()] = state["token"].get(wallet.lower(), 0) + amount
        state["txs"].append(("mint", wallet, amount))
        return "0x" + "22" * 32

    def send_native(wallet, value):
        state["native"][wallet.lower()] = state["native"].get(wallet.lower(), 0) + value
        state["txs"].append(("native", wallet, value))
        return "0x" + "33" * 32

    monkeypatch.setattr(onboard, "_person_of", person_of)
    monkeypatch.setattr(onboard, "_set_person", set_person)
    monkeypatch.setattr(onboard, "_mint", mint)
    monkeypatch.setattr(onboard, "_send_native", send_native)
    monkeypatch.setattr(onboard, "_token_balance", lambda w: state["token"].get(w.lower(), 0))
    monkeypatch.setattr(onboard, "_native_balance", lambda w: state["native"].get(w.lower(), 0))
    return state


def test_first_onboard_registers_mints_and_tops_up_gas(app_client, fake_settings, fake_chain):
    r = app_client.post("/onboard", json={"wallet": WALLET.lower()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wallet"] == WALLET
    assert body["registered"] is False
    assert body["personTx"] is not None
    assert body["minted"] == fake_settings.onboard_imkrw
    assert body["mintTx"] is not None
    assert body["gasTx"] is not None
    assert body["balance"] == fake_settings.onboard_imkrw
    assert [t[0] for t in fake_chain["txs"]] == ["setPerson", "mint", "native"]

    from engine.onboard import person_id_for

    assert body["personId"] == person_id_for(WALLET)
    assert body["personId"].startswith("0x") and len(body["personId"]) == 66


def test_second_onboard_same_day_only_checks(app_client, fake_settings, fake_chain):
    app_client.post("/onboard", json={"wallet": WALLET})
    fake_chain["txs"].clear()
    r = app_client.post("/onboard", json={"wallet": WALLET})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["registered"] is True
    assert body["personTx"] is None
    assert body["minted"] == 0
    assert body["mintTx"] is None
    assert body["mintedToday"] is True
    assert body["gasTx"] is None  # already topped up
    assert fake_chain["txs"] == []


def test_onboard_status(app_client, fake_settings, fake_chain):
    r = app_client.get("/onboard/status", params={"wallet": WALLET})
    assert r.status_code == 200
    assert r.json() == {
        "wallet": WALLET,
        "registered": False,
        "personId": None,
        "mintedToday": False,
        "mintAmount": fake_settings.onboard_imkrw,
        "gasWei": str(fake_settings.onboard_gas_wei),
    }
    app_client.post("/onboard", json={"wallet": WALLET})
    body = app_client.get("/onboard/status", params={"wallet": WALLET}).json()
    assert body["registered"] is True and body["mintedToday"] is True and body["personId"] is not None


def test_onboard_rejects_bad_address(app_client):
    assert app_client.post("/onboard", json={"wallet": "0x123"}).status_code == 422
    assert app_client.get("/onboard/status", params={"wallet": "nope"}).status_code == 422
