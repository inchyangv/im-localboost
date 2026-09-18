"""Rule layer of the collusion detector (SPEC 5.2). Any triggered rule sets a minimum tier.

Reason codes are English identifiers; the web maps them to Korean:
backflow -> 환류, pair_repeat -> 쌍 반복, new_wallet_cluster -> 신규 지갑 군집, sales_spike -> 매출 이탈."""

from __future__ import annotations

import sqlite3

from engine.features import (
    DAY,
    HOUR,
    NEW_WALLET_HOURS,
    WEEK,
    Ctx,
    has_backflow,
    merchant_recent_payers,
    merchant_slot_sales,
    pair_count,
    payer_age_hours,
)

PAIR_REPEAT_MIN = 4
NEW_WALLET_CLUSTER_MIN = 5
SALES_SPIKE_MULTIPLIER = 3

RULE_SCORES = {0: 0.0, 1: 0.6, 2: 0.9}


def evaluate_rules(
    conn: sqlite3.Connection, payer: str, merchant: str, amount: int, ts: int, ctx: Ctx
) -> tuple[int, list[str]]:
    payer = payer.lower()
    merchant = merchant.lower()
    tier = 0
    reasons: list[str] = []

    # 환류: merchant -> payer path within 3 hops over the last 24h of transfers.
    if has_backflow(conn, payer, merchant, ts):
        tier = max(tier, 1)
        reasons.append("backflow")

    # 쌍 반복: >= 4 boosted payments for the same pair in 7 days.
    if pair_count(conn, payer, merchant, ts, WEEK, boosted_only=True) >= PAIR_REPEAT_MIN:
        tier = max(tier, 1)
        reasons.append("pair_repeat")

    # 신규 지갑 군집: >= 5 wallets younger than 48h (incl. this payer) paid this merchant within 1h.
    recent = set(merchant_recent_payers(conn, merchant, ts, HOUR))
    recent.add(payer)
    young = sum(1 for w in recent if payer_age_hours(conn, w, ts) < NEW_WALLET_HOURS)
    if young >= NEW_WALLET_CLUSTER_MIN:
        tier = max(tier, 2)
        reasons.append("new_wallet_cluster")

    # 매출 이탈: this hour's merchant sales incl. this payment exceed 3x the baseline.
    baseline = int(ctx["slot_baseline"])
    if baseline > 0 and merchant_slot_sales(conn, merchant, ts) + int(amount) > baseline * SALES_SPIKE_MULTIPLIER:
        tier = max(tier, 1)
        reasons.append("sales_spike")

    return tier, reasons


def rule_score(tier: int) -> float:
    return RULE_SCORES.get(tier, 0.9)


__all__ = ["evaluate_rules", "rule_score", "DAY", "HOUR", "WEEK"]
