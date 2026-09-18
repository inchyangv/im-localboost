"""Feature computation shared by training (synth CSV loaded into SQLite) and serving (live SQLite).

All queries are "as-of" `ts`: payments strictly before `ts` and transfers up to `ts`, so the
payment being evaluated is never counted. Amounts are integers; ratios are floats."""

from __future__ import annotations

import sqlite3
from typing import Any, TypedDict

import networkx as nx

from engine.chain import hour_epoch

DAY = 86400
HOUR = 3600
WEEK = 7 * DAY
NEW_WALLET_HOURS = 48
BACKFLOW_HOPS = 3

FEATURE_NAMES = [
    "pair_count_7d",
    "pair_count_1d",
    "amount",
    "amount_is_round",
    "amount_to_cap_ratio",
    "secs_since_rate_change",
    "payer_age_hours",
    "merchant_slot_ratio",
    "payer_distinct_merchants_7d",
    "merchant_distinct_payers_1h",
    "backflow_flag",
]


class Ctx(TypedDict):
    rate_bps: int
    per_tx_boost: int
    slot_baseline: int


def pair_count(conn: sqlite3.Connection, payer: str, merchant: str, ts: int, window: int, boosted_only: bool = False) -> int:
    extra = " AND boost > 0" if boosted_only else ""
    row = conn.execute(
        f"SELECT count(*) FROM payments WHERE payer = ? AND merchant = ? AND ts >= ? AND ts < ?{extra}",
        (payer, merchant, ts - window, ts),
    ).fetchone()
    return int(row[0])


def first_seen(conn: sqlite3.Connection, wallet: str) -> int | None:
    """Earliest timestamp the wallet appears in transfers (either side) or payments (as payer)."""
    row = conn.execute(
        """SELECT min(t) FROM (
             SELECT min(ts) AS t FROM transfers WHERE from_addr = ? OR to_addr = ?
             UNION ALL SELECT min(ts) FROM payments WHERE payer = ?)""",
        (wallet, wallet, wallet),
    ).fetchone()
    return int(row[0]) if row and row[0] is not None else None


def payer_age_hours(conn: sqlite3.Connection, payer: str, ts: int) -> float:
    seen = first_seen(conn, payer)
    if seen is None or seen > ts:
        return 0.0
    return (ts - seen) / HOUR


def merchant_slot_sales(conn: sqlite3.Connection, merchant: str, ts: int) -> int:
    epoch = hour_epoch(ts)
    row = conn.execute(
        "SELECT coalesce(sum(amount), 0) FROM payments WHERE merchant = ? AND ts >= ? AND ts < ?",
        (merchant, epoch * HOUR, ts),
    ).fetchone()
    return int(row[0])


def payer_distinct_merchants(conn: sqlite3.Connection, payer: str, ts: int, window: int = WEEK) -> int:
    row = conn.execute(
        "SELECT count(DISTINCT merchant) FROM payments WHERE payer = ? AND ts >= ? AND ts < ?",
        (payer, ts - window, ts),
    ).fetchone()
    return int(row[0])


def merchant_recent_payers(conn: sqlite3.Connection, merchant: str, ts: int, window: int = HOUR) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT payer FROM payments WHERE merchant = ? AND ts >= ? AND ts < ?",
        (merchant, ts - window, ts),
    ).fetchall()
    return [r[0] for r in rows]


def transfer_graph(conn: sqlite3.Connection, ts: int, window: int = DAY) -> nx.DiGraph:
    g = nx.DiGraph()
    for frm, to in conn.execute(
        "SELECT from_addr, to_addr FROM transfers WHERE ts >= ? AND ts <= ?", (ts - window, ts)
    ):
        g.add_edge(frm, to)
    return g


def has_backflow(conn: sqlite3.Connection, payer: str, merchant: str, ts: int) -> bool:
    """True when merchant -> ... -> payer exists within BACKFLOW_HOPS hops in the last 24h of transfers."""
    if payer == merchant:
        return False
    g = transfer_graph(conn, ts)
    if merchant not in g:
        return False
    reach = nx.single_source_shortest_path_length(g, merchant, cutoff=BACKFLOW_HOPS)
    return payer in reach and reach[payer] > 0


def build_features(
    conn: sqlite3.Connection, payer: str, merchant: str, amount: int, ts: int, ctx: Ctx
) -> dict[str, Any]:
    payer = payer.lower()
    merchant = merchant.lower()
    amount = int(amount)
    rate = int(ctx["rate_bps"])
    per_tx = int(ctx["per_tx_boost"])
    baseline = int(ctx["slot_baseline"])

    if rate == 0 or per_tx == 0:
        cap_ratio = 0.0
    else:
        cap_ratio = min(2.0, (amount * rate / 10000) / per_tx)

    slot_sales = merchant_slot_sales(conn, merchant, ts)
    return {
        "pair_count_7d": pair_count(conn, payer, merchant, ts, WEEK),
        "pair_count_1d": pair_count(conn, payer, merchant, ts, DAY),
        "amount": amount,
        "amount_is_round": int(amount % 10000 == 0),
        "amount_to_cap_ratio": cap_ratio,
        "secs_since_rate_change": ts % HOUR,
        "payer_age_hours": payer_age_hours(conn, payer, ts),
        "merchant_slot_ratio": (slot_sales / baseline) if baseline > 0 else 0.0,
        "payer_distinct_merchants_7d": payer_distinct_merchants(conn, payer, ts),
        "merchant_distinct_payers_1h": len(merchant_recent_payers(conn, merchant, ts)),
        "backflow_flag": int(has_backflow(conn, payer, merchant, ts)),
    }
