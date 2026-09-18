"""Model layer combination in /attest, using a stub model so no trained file is required."""

from engine.tests.conftest import MERCHANT1, PAYER1


class StubModel:
    def __init__(self, value: float) -> None:
        self.value = value

    def score(self, features):
        assert len(features) == 11
        return self.value

    @staticmethod
    def tier_for(score: float) -> int:
        return 2 if score >= 0.8 else 1 if score >= 0.5 else 0


def _client_with_model(monkeypatch, fake_settings, value):
    import importlib
    import sys

    from engine import chain, poller, risk_model

    monkeypatch.setattr(chain, "block_number", lambda: 42)
    monkeypatch.setattr(chain, "now_ts", lambda: 1_789_700_000)
    monkeypatch.setattr(poller, "sync_once", lambda conn, times: 0)
    monkeypatch.setattr(risk_model, "load", lambda path=None: StubModel(value))
    sys.modules.pop("engine.main", None)
    main = importlib.import_module("engine.main")
    from fastapi.testclient import TestClient

    return TestClient(main.app)


def test_model_raises_tier_and_adds_reason(monkeypatch, fake_settings):
    with _client_with_model(monkeypatch, fake_settings, 0.93) as c:
        assert c.get("/health").json()["model"] is True
        body = c.post("/attest", json={"payer": PAYER1, "merchant": MERCHANT1, "amount": 10000}).json()
        assert body["tier"] == 2
        assert body["score"] == 0.93
        assert body["reasons"] == ["model_score"]
        assert body["attestation"]["tier"] == 2


def test_low_model_score_keeps_rule_tier(monkeypatch, fake_settings):
    with _client_with_model(monkeypatch, fake_settings, 0.12) as c:
        body = c.post("/attest", json={"payer": PAYER1, "merchant": MERCHANT1, "amount": 10000}).json()
        assert body["tier"] == 0
        assert body["score"] == 0.12
        assert body["reasons"] == []
