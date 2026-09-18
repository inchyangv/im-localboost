import random

import pytest

from engine import boost, db
from engine.boost import clamp_ratio, compute_bps, round_to_50, slack_of


def test_compute_bps_boundaries():
    assert compute_bps(0.0, 1.0, 0.5) == 0
    assert compute_bps(1.0, 1.0, 0.5) == 1500  # 5000 -> clipped
    assert compute_bps(0.3, 1.0, 0.5) == 1500  # 1500 exactly
    assert compute_bps(0.2, 1.0, 0.5) == 1000
    assert compute_bps(0.1, 0.3, 0.5) == 150
    assert compute_bps(-0.5, 1.0, 0.5) == 0


def test_round_to_50():
    assert round_to_50(0) == 0
    assert round_to_50(24) == 0
    assert round_to_50(25) == 0 or round_to_50(25) == 50  # banker's rounding at the midpoint
    assert round_to_50(26) == 50
    assert round_to_50(174) == 150
    assert round_to_50(176) == 200
    assert compute_bps(0.0333, 1.0, 0.5) == 150  # 166.5 -> 150


def test_slack():
    assert slack_of(80, 100) == pytest.approx(0.2)
    assert slack_of(120, 100) == 0.0
    assert slack_of(50, 0) == 0.0


def test_clamp_ratio():
    assert clamp_ratio(100, 0) == 1.5
    assert clamp_ratio(300, 100) == 1.5
    assert clamp_ratio(10, 100) == 0.5
    assert clamp_ratio(120, 100) == pytest.approx(1.2)


def test_rates_for_overrides_and_explore(fake_settings, monkeypatch):
    monkeypatch.setattr(boost, "predict", lambda zid, ts: 80)
    monkeypatch.setattr(boost, "baseline", lambda zid, dow, hour: 100)
    ts = 1_789_700_000
    plain = boost.rates_for(ts, 0.5, explore=False)
    assert [r["zoneId"] for r in plain] == [1, 2, 3, 4, 5]
    assert all(r["slack"] == pytest.approx(0.2) and r["predictedSales"] == 80 and r["baseline"] == 100 for r in plain)
    # slack 0.2 * k 0.5 * vulnerability * 10000 -> 300, 600, 800, 1000, 700
    assert [r["bps"] for r in plain] == [300, 600, 800, 1000, 700]
    assert all(r["explore"] is False for r in plain)

    over = boost.rates_for(ts, 0.5, explore=False, overrides={4: 1000, 1: 0})
    assert {r["zoneId"]: r["bps"] for r in over}[4] == 1000
    assert {r["zoneId"]: r["bps"] for r in over}[1] == 0

    # Force exploration everywhere except the overridden zone.
    class AlwaysExplore(random.Random):
        def random(self):
            return 0.0

        def choice(self, seq):
            return 1500

    rng = AlwaysExplore()
    ex = boost.rates_for(ts, 0.5, explore=True, overrides={4: 1000}, rng=rng)
    by = {r["zoneId"]: r for r in ex}
    assert by[4]["bps"] == 1000 and by[4]["explore"] is False
    for zid in (1, 2, 3, 5):
        assert by[zid]["bps"] == 1500 and by[zid]["explore"] is True


def test_k_daily_update(tmp_path, fake_settings):
    conn = db.connect(tmp_path / "k.db")
    assert boost.get_k(conn) == 0.5
    day_start = (20_713 * 86400) - 9 * 3600  # some KST day start
    now = day_start + 86400 + 3600  # next day 01:00 KST

    # Nothing published yesterday: marker advances, k unchanged.
    assert boost.update_k_if_new_day(conn, now) is False
    assert boost.get_k(conn) == 0.5
    assert boost.update_k_if_new_day(conn, now) is False  # same day: no-op

    # Yesterday: planned 0.1 * 100,000 = 10,000 spend; actual boost 5,000 -> ratio 2 -> clamp 1.5
    y = day_start + 86400  # the day before `later`
    conn.execute("INSERT INTO rates_published VALUES (?, 4, 1000, 0.3, 100000, 150000, 0, '0x')", (y // 3600 + 12,))
    conn.execute("INSERT INTO payments VALUES ('0xa', 0, 1, ?, 'p', 'x', 'm', 4, 50000, 0, 5000, 0, 0)", (y + 13 * 3600,))
    conn.commit()
    later = now + 86400
    assert boost.update_k_if_new_day(conn, later) is True
    assert boost.get_k(conn) == pytest.approx(0.75)

    # Next day: actual 0 -> ratio 1.5 again
    conn.execute("INSERT INTO rates_published VALUES (?, 4, 1000, 0.3, 100000, 150000, 0, '0x')", (later // 3600,))
    conn.commit()
    assert boost.update_k_if_new_day(conn, later + 86400) is True
    assert boost.get_k(conn) == pytest.approx(1.125)

    # Planned far below actual -> clamp 0.5
    conn.execute("INSERT INTO rates_published VALUES (?, 4, 100, 0.3, 1000, 150000, 0, '0x')", ((later + 86400) // 3600,))
    conn.execute("INSERT INTO payments VALUES ('0xb', 0, 1, ?, 'p', 'x', 'm', 4, 50000, 0, 5000, 0, 0)", (later + 86400 + 60,))
    conn.commit()
    assert boost.update_k_if_new_day(conn, later + 2 * 86400) is True
    assert boost.get_k(conn) == pytest.approx(0.5625)
