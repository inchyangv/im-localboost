import pytest

from engine import db
from engine.features import build_features
from engine.rules import evaluate_rules

P = "0x" + "a1" * 20  # payer under evaluation
M = "0x" + "b1" * 20  # merchant
A = "0x" + "c1" * 20  # intermediate wallets
B = "0x" + "c2" * 20
C = "0x" + "c3" * 20
D = "0x" + "c4" * 20
NOW = 1_789_700_000  # some ts; NOW % 3600 == 2000
OLD = NOW - 30 * 86400
CTX = {"rate_bps": 1000, "per_tx_boost": 3000, "slot_baseline": 100_000}


@pytest.fixture()
def conn(tmp_path):
    c = db.connect(tmp_path / "rules.db")
    # Wallets have been around for 30 days (old) so the new-wallet rule does not fire by default.
    for i, w in enumerate([P, M, A, B, C, D]):
        db.insert_transfer(c, {"tx_hash": f"0xseed{i}", "log_index": 0, "block": 1, "ts": OLD, "from_addr": "0x" + "00" * 20, "to_addr": w, "amount": 1000})
    c.commit()
    return c


def tr(c, idx, frm, to, ts, amount=9000):
    db.insert_transfer(c, {"tx_hash": f"0xt{idx}", "log_index": 0, "block": 2, "ts": ts, "from_addr": frm, "to_addr": to, "amount": amount})
    c.commit()


def pay(c, idx, payer, merchant, ts, amount=10000, boost=1000):
    db.insert_payment(c, {
        "tx_hash": f"0xp{idx}", "log_index": 0, "block": 3, "ts": ts, "payer": payer, "person_id": "0x" + "ee" * 32,
        "merchant": merchant, "zone_id": 4, "amount": amount, "use_credit": 0, "boost": boost, "tier": 0, "pending_id": 0,
    })
    c.commit()


# ---------------------------------------------------------------- backflow
def test_backflow_direct_1hop(conn):
    tr(conn, 1, M, P, NOW - 600)
    tier, reasons = evaluate_rules(conn, P, M, 10000, NOW, CTX)
    assert tier == 1 and reasons == ["backflow"]


def test_backflow_2hop(conn):
    tr(conn, 1, M, A, NOW - 1200)
    tr(conn, 2, A, P, NOW - 600)
    tier, reasons = evaluate_rules(conn, P, M, 10000, NOW, CTX)
    assert tier == 1 and "backflow" in reasons


def test_backflow_3hop_hits_but_4hop_does_not(conn):
    tr(conn, 1, M, A, NOW - 3000)
    tr(conn, 2, A, B, NOW - 2000)
    tr(conn, 3, B, C, NOW - 1500)
    tr(conn, 4, C, P, NOW - 1000)  # 4 hops: M->A->B->C->P
    tier, reasons = evaluate_rules(conn, P, M, 10000, NOW, CTX)
    assert tier == 0 and reasons == []
    tr(conn, 5, B, P, NOW - 500)  # now M->A->B->P is 3 hops
    tier, reasons = evaluate_rules(conn, P, M, 10000, NOW, CTX)
    assert tier == 1 and reasons == ["backflow"]


def test_backflow_ignores_transfers_older_than_24h_and_wrong_direction(conn):
    tr(conn, 1, M, P, NOW - 86400 - 10)  # too old
    tr(conn, 2, P, M, NOW - 100)  # payer -> merchant is a normal payment, not backflow
    tier, reasons = evaluate_rules(conn, P, M, 10000, NOW, CTX)
    assert tier == 0 and reasons == []


# ---------------------------------------------------------------- pair repeat
def test_pair_repeat_triggers_at_4_boosted(conn):
    for i in range(3):
        pay(conn, i, P, M, NOW - (i + 1) * 86400)
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (0, [])
    pay(conn, 10, P, M, NOW - 5 * 86400)
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (1, ["pair_repeat"])


def test_pair_repeat_ignores_zero_boost_and_old_payments(conn):
    for i in range(4):
        pay(conn, i, P, M, NOW - (i + 1) * 3600, boost=0)
    pay(conn, 20, P, M, NOW - 8 * 86400)  # outside 7 days
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (0, [])


# ---------------------------------------------------------------- new wallet cluster
def test_new_wallet_cluster_tier2(conn):
    fresh = ["0x" + f"d{i}" * 20 for i in range(1, 5)]
    for i, w in enumerate(fresh):
        tr(conn, 100 + i, "0x" + "00" * 20, w, NOW - 3600 * 10)  # first seen 10h ago
        pay(conn, 100 + i, w, M, NOW - 600 - i)
    # P is old (30 days) -> 4 young wallets only
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (0, [])
    # A brand-new payer makes it 5
    newp = "0x" + "f9" * 20
    tier, reasons = evaluate_rules(conn, newp, M, 10000, NOW, CTX)
    assert tier == 2 and reasons == ["new_wallet_cluster"]


def test_new_wallet_cluster_not_triggered_by_old_wallets(conn):
    for i, w in enumerate([A, B, C, D]):
        pay(conn, 200 + i, w, M, NOW - 300)
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (0, [])


# ---------------------------------------------------------------- sales spike
def test_sales_spike(conn):
    slot_start = (NOW // 3600) * 3600
    pay(conn, 300, A, M, slot_start + 10, amount=200_000)
    pay(conn, 301, B, M, slot_start + 20, amount=95_000)
    assert evaluate_rules(conn, P, M, 5_000, NOW, CTX) == (0, [])  # 300,000 == 3x, not above
    assert evaluate_rules(conn, P, M, 6_000, NOW, CTX) == (1, ["sales_spike"])


def test_sales_spike_ignores_previous_hour(conn):
    pay(conn, 300, A, M, NOW - 7200, amount=1_000_000)
    assert evaluate_rules(conn, P, M, 10000, NOW, CTX) == (0, [])


# ---------------------------------------------------------------- combination and features
def test_rules_combine_to_max_tier_with_all_reasons(conn):
    tr(conn, 1, M, P, NOW - 600)
    fresh = ["0x" + f"d{i}" * 20 for i in range(1, 5)]
    for i, w in enumerate(fresh):
        tr(conn, 100 + i, "0x" + "00" * 20, w, NOW - 3600)
        pay(conn, 100 + i, w, M, NOW - 300)
    newp = "0x" + "f9" * 20
    tr(conn, 999, M, newp, NOW - 100)
    tier, reasons = evaluate_rules(conn, newp, M, 10000, NOW, CTX)
    assert tier == 2
    assert reasons == ["backflow", "new_wallet_cluster"]


def test_build_features_shape(conn):
    tr(conn, 1, M, P, NOW - 600)
    pay(conn, 1, P, M, NOW - 3600 * 5)
    pay(conn, 2, P, A, NOW - 3600 * 30)
    f = build_features(conn, P, M, 20000, NOW, CTX)
    assert set(f) == {
        "pair_count_7d", "pair_count_1d", "amount", "amount_is_round", "amount_to_cap_ratio",
        "secs_since_rate_change", "payer_age_hours", "merchant_slot_ratio",
        "payer_distinct_merchants_7d", "merchant_distinct_payers_1h", "backflow_flag",
    }
    assert f["pair_count_7d"] == 1 and f["pair_count_1d"] == 1
    assert f["amount_is_round"] == 1
    assert f["amount_to_cap_ratio"] == pytest.approx(2000 / 3000)
    assert f["secs_since_rate_change"] == NOW % 3600
    assert f["payer_age_hours"] == pytest.approx(30 * 24)
    assert f["payer_distinct_merchants_7d"] == 2
    assert f["backflow_flag"] == 1
