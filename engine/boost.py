"""Demand-based boost rate engine (SPEC 5.3).

bps = clip(round_to_50(k * slack * vulnerability * 10000), 0, 1500)
slack = max(0, 1 - predictedSales / baseline), baseline = mean of the top 25% of the same
(weekday, hour) slot over the last 8 weeks. Serving inputs come from the synthetic time series
(data/zone_hour_sales.csv) treated as history. `k` lives in the kv table (initial 0.5)."""

from __future__ import annotations

import logging
import random
import sqlite3
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd

from engine.boost_features import FEATURES, add_features, kst_dow_hour, load_zone_hour_sales
from engine.chain import kst_day
from engine.config import MODELS_DIR, get_settings
from engine.db import kv_get, kv_set

log = logging.getLogger("engine.boost")

MAX_BPS = 1500
K_INITIAL = 0.5
K_CLAMP = (0.5, 1.5)
EXPLORE_PROB = 0.10
EXPLORE_CHOICES = (0, 500, 1000, 1500)
BASELINE_WEEKS = 8
MODEL_PATH = MODELS_DIR / "boost.txt"


# ------------------------------------------------------------------ pure helpers (sim imports these)
def round_to_50(x: float) -> int:
    return int(round(x / 50.0)) * 50


def compute_bps(slack: float, vulnerability: float, k: float, max_bps: int = MAX_BPS) -> int:
    """clip(round_to_50(k * slack * vulnerability * 10000), 0, max_bps). `max_bps` follows the on-chain
    caps().maxRateBps so a lowered cap never makes setRates revert with RateTooHigh."""
    raw = k * max(0.0, slack) * vulnerability * 10000.0
    return int(min(int(max_bps), max(0, round_to_50(raw))))


def slack_of(predicted: int, baseline: int) -> float:
    if baseline <= 0:
        return 0.0
    return max(0.0, 1.0 - predicted / baseline)


def clamp_ratio(planned: float, actual: float) -> float:
    if actual <= 0:
        return K_CLAMP[1]
    return min(K_CLAMP[1], max(K_CLAMP[0], planned / actual))


# ------------------------------------------------------------------ history-backed inputs
@lru_cache(maxsize=1)
def _history() -> pd.DataFrame:
    return add_features(load_zone_hour_sales())


@lru_cache(maxsize=1)
def _booster():
    import lightgbm as lgb

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"{MODEL_PATH} not found; run make train")
    return lgb.Booster(model_file=str(MODEL_PATH))


def _slot_rows(zone_id: int, dow: int, hour: int) -> pd.DataFrame:
    h = _history()
    return h[(h["zoneId"] == zone_id) & (h["dow"] == dow) & (h["hour"] == hour)].sort_values("ts")


def baseline(zone_id: int, dow: int, hour: int) -> int:
    """Mean of the top 25% of the same slot's sales over the last 8 weeks (integer won)."""
    rows = _slot_rows(zone_id, dow, hour).tail(BASELINE_WEEKS)
    if rows.empty:
        return 0
    s = np.sort(rows["sales"].to_numpy(dtype=float))[::-1]
    top = s[: max(1, int(np.ceil(len(s) * 0.25)))]
    return int(round(float(top.mean())))


def slot_inputs(zone_id: int, ts: int) -> dict[str, Any]:
    """Latest history row for the same (weekday, hour) slot: calendar, weather and lag features."""
    dow, hour = kst_dow_hour(ts)
    rows = _slot_rows(zone_id, dow, hour)
    rows = rows.dropna(subset=["sales_lag_1h", "sales_same_slot_mean_4w"])
    if rows.empty:
        return {"dow": dow, "hour": hour, "is_holiday": 0, "temp": 20.0, "rain_mm": 0.0, "sales_lag_1h": 0.0, "sales_same_slot_mean_4w": 0.0}
    r = rows.iloc[-1]
    return {
        "dow": dow,
        "hour": hour,
        "is_holiday": int(r["is_holiday"]),
        "temp": float(r["temp"]),
        "rain_mm": float(r["rain_mm"]),
        "sales_lag_1h": float(r["sales_lag_1h"]),
        "sales_same_slot_mean_4w": float(r["sales_same_slot_mean_4w"]),
    }


def predict(zone_id: int, ts: int) -> int:
    x = slot_inputs(zone_id, ts)
    row = np.array([[float(x[f]) for f in FEATURES]])
    return int(max(0, round(float(_booster().predict(row)[0]))))


# ------------------------------------------------------------------ k
def get_k(conn: sqlite3.Connection) -> float:
    v = kv_get(conn, "k")
    return float(v) if v is not None else K_INITIAL


def set_k(conn: sqlite3.Connection, k: float) -> None:
    kv_set(conn, "k", repr(float(k)))


def update_k_if_new_day(conn: sqlite3.Connection, now_ts: int) -> bool:
    """Once per KST day: k *= clamp(planned_spend / actual_spend, 0.5, 1.5) using the previous
    day's published rates and Paid boosts. Skipped (only the day marker advances) when nothing was
    published the day before. Returns True when k changed."""
    today = kst_day(now_ts)
    marker = kv_get(conn, "k_updated_day")
    if marker is not None and int(marker) == today:
        return False
    yesterday = today - 1
    y_start = yesterday * 86400 - 9 * 3600
    y_end = y_start + 86400
    rows = conn.execute(
        "SELECT bps, predicted_sales FROM rates_published WHERE hour_epoch >= ? AND hour_epoch < ?",
        (y_start // 3600, y_end // 3600),
    ).fetchall()
    kv_set(conn, "k_updated_day", str(today))
    if not rows:
        return False
    planned = sum(int(r["bps"]) * int(r["predicted_sales"]) / 10000 for r in rows)
    actual = conn.execute(
        "SELECT coalesce(sum(boost), 0) FROM payments WHERE ts >= ? AND ts < ?", (y_start, y_end)
    ).fetchone()[0]
    ratio = clamp_ratio(planned, float(actual))
    k_old = get_k(conn)
    set_k(conn, k_old * ratio)
    log.info("k adjusted %.4f -> %.4f (planned %.0f, actual %d)", k_old, k_old * ratio, planned, actual)
    return True


# ------------------------------------------------------------------ rates
def rates_for(
    ts: int,
    k: float,
    explore: bool,
    overrides: dict[int, int] | None = None,
    rng: random.Random | None = None,
    max_bps: int = MAX_BPS,
) -> list[dict[str, Any]]:
    overrides = overrides or {}
    rng = rng or random.Random()
    max_bps = int(max_bps)
    dow, hour = kst_dow_hour(ts)
    out = []
    for z in get_settings().deployment.zones:
        zid = int(z["id"])
        pred = predict(zid, ts)
        base = baseline(zid, dow, hour)
        slack = slack_of(pred, base)
        bps = compute_bps(slack, float(z["vulnerability"]), k, max_bps)
        explored = False
        if zid in overrides:
            bps = min(int(overrides[zid]), max_bps)
        elif explore and rng.random() < EXPLORE_PROB:
            bps = min(rng.choice(EXPLORE_CHOICES), max_bps)
            explored = True
        out.append({
            "zoneId": zid,
            "name": z["name"],
            "bps": bps,
            "slack": round(slack, 4),
            "predictedSales": pred,
            "baseline": base,
            "explore": explored,
        })
    return out


def published_rates(conn: sqlite3.Connection, hour_epoch: int) -> list[dict[str, Any]]:
    names = {int(z["id"]): z["name"] for z in get_settings().deployment.zones}
    rows = conn.execute(
        "SELECT zone_id, bps, slack, predicted_sales, baseline FROM rates_published WHERE hour_epoch = ? ORDER BY zone_id",
        (hour_epoch,),
    ).fetchall()
    return [
        {"zoneId": r["zone_id"], "name": names.get(r["zone_id"], str(r["zone_id"])), "bps": r["bps"],
         "slack": r["slack"], "predictedSales": r["predicted_sales"], "baseline": r["baseline"]}
        for r in rows
    ]


def store_published(conn: sqlite3.Connection, hour_epoch: int, rates: list[dict[str, Any]], tx_hash: str) -> None:
    conn.executemany(
        """INSERT INTO rates_published (hour_epoch, zone_id, bps, slack, predicted_sales, baseline, explore, tx_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(hour_epoch, zone_id) DO UPDATE SET bps=excluded.bps, slack=excluded.slack,
             predicted_sales=excluded.predicted_sales, baseline=excluded.baseline, explore=excluded.explore, tx_hash=excluded.tx_hash""",
        [(hour_epoch, r["zoneId"], r["bps"], r["slack"], r["predictedSales"], r["baseline"], int(r.get("explore", False)), tx_hash) for r in rates],
    )
    conn.commit()
