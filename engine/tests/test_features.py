import pytest

from engine import db
from engine.features import FEATURE_NAMES, build_features

P = "0x" + "a1" * 20
M = "0x" + "b1" * 20
M2 = "0x" + "b2" * 20
X = "0x" + "c1" * 20
Y = "0x" + "c2" * 20
NOW = 1_789_700_000
CTX = {"rate_bps": 1000, "per_tx_boost": 3000, "slot_baseline": 100_000}


def _tr(c, i, frm, to, ts, amount=1000):
    db.insert_transfer(c, {"tx_hash": f"0xt{i}", "log_index": 0, "block": 1, "ts": ts, "from_addr": frm, "to_addr": to, "amount": amount})


def _pay(c, i, payer, merchant, ts, amount=10000):
    db.insert_payment(c, {
        "tx_hash": f"0xp{i}", "log_index": 0, "block": 2, "ts": ts, "payer": payer, "person_id": "0x" + "ee" * 32,
        "merchant": merchant, "zone_id": 4, "amount": amount, "use_credit": 0, "boost": 1000, "tier": 0, "pending_id": 0,
    })


@pytest.fixture()
def conn(tmp_path):
    c = db.connect(tmp_path / "f.db")
    _tr(c, 0, "0x" + "00" * 20, P, NOW - 240 * 3600)  # payer minted 10 days ago (first appearance)
    _pay(c, 1, P, M, NOW - 2 * 86400)                 # pair, within 7d, outside 1d
    _pay(c, 2, P, M, NOW - 3600 * 5)                  # pair, within 1d
    _pay(c, 3, P, M, NOW - 8 * 86400)                 # pair, outside 7d
    _pay(c, 4, P, M2, NOW - 3 * 86400)                # other merchant within 7d
    slot = (NOW // 3600) * 3600
    _pay(c, 5, X, M, slot + 5, amount=40_000)         # this hour, other payer
    _pay(c, 6, Y, M, slot + 10, amount=10_000)        # this hour, other payer
    _pay(c, 7, X, M, NOW - 3600 - 5, amount=1)        # just outside 1h window
    c.commit()
    return c


def test_feature_values(conn):
    f = build_features(conn, P, M, 20_000, NOW, CTX)
    assert list(f) == FEATURE_NAMES
    assert f["pair_count_7d"] == 2
    assert f["pair_count_1d"] == 1
    assert f["amount"] == 20_000
    assert f["amount_is_round"] == 1
    assert f["amount_to_cap_ratio"] == pytest.approx(2000 / 3000)
    assert f["secs_since_rate_change"] == NOW % 3600
    assert f["payer_age_hours"] == pytest.approx(240.0)
    assert f["merchant_slot_ratio"] == pytest.approx(50_000 / 100_000)
    assert f["payer_distinct_merchants_7d"] == 2
    assert f["merchant_distinct_payers_1h"] == 2
    assert f["backflow_flag"] == 0


def test_cap_ratio_clips_and_zero_rate(conn):
    assert build_features(conn, P, M, 100_000, NOW, CTX)["amount_to_cap_ratio"] == 2.0
    assert build_features(conn, P, M, 100_000, NOW, {**CTX, "rate_bps": 0})["amount_to_cap_ratio"] == 0.0
    assert build_features(conn, P, M, 7_500, NOW, CTX)["amount_is_round"] == 0


def test_payer_age_from_payments_when_no_transfer(conn):
    f = build_features(conn, X, M, 1000, NOW, CTX)  # X only appears as a payer, first at NOW-3605
    assert f["payer_age_hours"] == pytest.approx(3605 / 3600)


def test_unknown_payer_age_is_zero_and_zero_baseline(conn):
    f = build_features(conn, "0x" + "ff" * 20, M, 1000, NOW, {**CTX, "slot_baseline": 0})
    assert f["payer_age_hours"] == 0.0
    assert f["merchant_slot_ratio"] == 0.0
    assert f["pair_count_7d"] == 0


def test_backflow_flag_matches_rule(conn):
    _tr(conn, 9, M, P, NOW - 100)
    conn.commit()
    assert build_features(conn, P, M, 1000, NOW, CTX)["backflow_flag"] == 1
