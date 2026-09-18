"""Feature construction for the demand model, shared by train_boost.py and boost.py.

Slots are zone x hour. Calendar fields are KST. `sales_lag_1h` is the previous hour's sales for the
zone; `sales_same_slot_mean_4w` is the mean of the same weekday/hour over the previous four weeks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache

import pandas as pd

from engine.config import DATA_DIR

KST = timezone(timedelta(hours=9))
FEATURES = ["dow", "hour", "is_holiday", "temp", "rain_mm", "sales_lag_1h", "sales_same_slot_mean_4w"]
WEEK = 7 * 86400


def kst_dow_hour(ts: int) -> tuple[int, int]:
    d = datetime.fromtimestamp(ts, tz=KST)
    return d.weekday(), d.hour


@lru_cache(maxsize=1)
def load_zone_hour_sales() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "zone_hour_sales.csv")
    df = df.sort_values(["zoneId", "ts"], kind="mergesort").reset_index(drop=True)
    dh = df["ts"].map(kst_dow_hour)
    df["dow"] = [x[0] for x in dh]
    df["hour"] = [x[1] for x in dh]
    return df


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Adds lag features to a zone-hour frame (sorted by zoneId, ts). Rows without any prior
    same-slot week get NaN for the 4w mean."""
    df = df.copy()
    df["sales_lag_1h"] = df.groupby("zoneId")["sales"].shift(1)
    key = df.set_index(["zoneId", "ts"])["sales"]
    cols = []
    for w in range(1, 5):
        idx = pd.MultiIndex.from_arrays([df["zoneId"], df["ts"] - w * WEEK])
        cols.append(key.reindex(idx).to_numpy())
    stacked = pd.DataFrame(cols).T
    df["sales_same_slot_mean_4w"] = stacked.mean(axis=1, skipna=True).to_numpy()
    return df
