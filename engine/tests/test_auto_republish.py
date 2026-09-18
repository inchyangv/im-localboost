"""Demo guard: after a manual publish the poller re-publishes at every hour boundary with the last overrides."""
from __future__ import annotations

import importlib
import sys

from engine import boost, chain, db


def _load_main(monkeypatch, sent: list[tuple[int, list[int]]], now: list[int]):
    monkeypatch.setattr(chain, "now_ts", lambda: now[0])
    monkeypatch.setattr(boost, "predict", lambda zid, ts: 80)
    monkeypatch.setattr(boost, "baseline", lambda zid, dow, hour: 100)

    class _Fn:
        def __init__(self, epoch, zones, bps):
            self.args = (epoch, list(zones), list(bps))

    class _Functions:
        def setRates(self, epoch, zones, bps):
            return _Fn(epoch, zones, bps)

        def caps(self):
            class _Call:
                def call(self_inner):
                    return (800, 3000, 5000, 15000, 60, 60)
            return _Call()

    class _Contract:
        functions = _Functions()

    monkeypatch.setattr(chain, "dalgubeol_pay", lambda: _Contract())

    def send_tx(fn, key, timeout=120):
        sent.append((fn.args[0], fn.args[2]))
        return "0x" + "ab" * 32

    monkeypatch.setattr(chain, "send_tx", send_tx)
    sys.modules.pop("engine.main", None)
    return importlib.import_module("engine.main")


def test_manual_publish_then_hourly_auto_republish(fake_settings, monkeypatch):
    sent: list[tuple[int, list[int]]] = []
    now = [1_789_700_000]
    main = _load_main(monkeypatch, sent, now)
    conn = db.connect(":memory:")

    # Nothing published yet: the hook stays silent.
    main._auto_republish_hook(conn)
    assert sent == []

    # Manual publish with the demo override; the on-chain max (800) clips everything.
    out = main.publish_rates(conn, {4: 1000})
    epoch = chain.hour_epoch(now[0])
    assert [e for e, _ in sent] == [epoch, epoch + 1]
    assert all(b <= 800 for _, bps in sent for b in bps)
    assert {r["zoneId"]: r["bps"] for r in out["rates"]}[4] == 800

    # Same hour: already covered, no extra transactions.
    main._auto_republish_hook(conn)
    assert len(sent) == 2

    # Next hour: current+next are re-published with the remembered override.
    now[0] += 3600
    main._auto_republish_hook(conn)
    assert [e for e, _ in sent][2:] == [epoch + 1, epoch + 2]
    assert sent[2][1][3] == 800  # zone 4 override kept (clipped to the chain max)

    # A failing RPC is retried at most once per epoch.
    now[0] += 3600
    monkeypatch.setattr(chain, "send_tx", lambda fn, key, timeout=120: (_ for _ in ()).throw(RuntimeError("rpc down")))
    main._auto_republish_hook(conn)
    main._auto_republish_hook(conn)
    assert db.kv_get(conn, main.AUTO_PUBLISH_FAILED_KEY) == str(epoch + 2)
