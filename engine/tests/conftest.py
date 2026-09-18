"""Shared fixtures. Unit tests must not need a running chain: the settings and web3 access
are replaced with in-memory stand-ins before engine.main is imported."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

# Hardhat default accounts (public), the same ones .env.example uses.
ATTESTER_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
ORACLE_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
PAYER1 = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
MERCHANT1 = "0xBcd4042DE499D14e55001CcbB24a551F3b954096"


@pytest.fixture()
def fake_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from engine import config

    deployment = config.Deployment(
        chain_id=31337,
        explorer=None,
        start_block=1,
        contracts={
            "MockIMKRW": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
            "MerchantRegistry": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
            "LocalBoost": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        },
        zones=[
            {"id": 1, "name": "동성로", "vulnerability": 0.3},
            {"id": 2, "name": "들안길", "vulnerability": 0.6},
            {"id": 3, "name": "안지랑", "vulnerability": 0.8},
            {"id": 4, "name": "북성로", "vulnerability": 1.0},
            {"id": 5, "name": "서문시장", "vulnerability": 0.7},
        ],
        merchants=[
            {"address": MERCHANT1, "name": "북성로 한식당", "zoneId": 4, "categoryId": 1, "slotBaseline": 100000, "keyIndex": 0}
        ],
        caps={
            "maxRateBps": 1500,
            "perTxBoost": 3000,
            "personDailyBoost": 5000,
            "slotCapBps": 15000,
            "pendingDelay": 60,
            "capsDelay": 60,
        },
    )
    s = config.Settings(
        rpc_url="http://127.0.0.1:9",
        chain_id=31337,
        oracle_key=ORACLE_KEY,
        attester_key=ATTESTER_KEY,
        db_path=tmp_path / "engine.db",
        web_origin="http://localhost:3000",
        port=8000,
        deployment=deployment,
    )
    monkeypatch.setattr(config, "settings", s)
    monkeypatch.setattr(config, "load_settings", lambda: s)
    return s


@pytest.fixture()
def app_client(fake_settings, monkeypatch: pytest.MonkeyPatch):
    """TestClient for engine.main with chain access stubbed out."""
    import importlib
    import sys

    from engine import chain

    monkeypatch.setattr(chain, "block_number", lambda: 42)
    monkeypatch.setattr(chain, "chain_id", lambda: 31337)

    # The poller must not touch the RPC in unit tests.
    from engine import poller

    monkeypatch.setattr(poller, "sync_once", lambda conn, times: 0)

    sys.modules.pop("engine.main", None)
    main = importlib.import_module("engine.main")
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        yield client
