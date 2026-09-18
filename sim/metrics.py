"""Scenario metrics. Definitions (also written into results.json):

vulnerable_slot_sales_uplift  For each zone, the (day, slot) cells whose `none` sales fall in the
                              bottom 25% of that zone; uplift = (scenario sales - none sales) / none sales
                              summed over those cells.
net_sales_per_won             (scenario total sales - none total sales) / scenario total boost.
deadweight_ratio              Boost paid on payments whose consumer also bought in the same zone and
                              (day, slot) under `none` / total boost. Common random numbers make this a
                              per-consumer comparison.
farming_leakage               Boost paid to ring payments and not recovered / total boost (C scenarios only).
detection_precision/recall    In C_on: rule verdict tier >= 1 versus the ring label over all payments."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

METRIC_DEFINITIONS = {
    "vulnerable_slot_sales_uplift": "per zone, bottom-25% (day,slot) cells by `none` sales: (scenario - none) / none",
    "net_sales_per_won": "(total_sales - none.total_sales) / total_boost",
    "deadweight_ratio": "boost paid to consumers who bought in the same zone and (day,slot) under `none` / total_boost",
    "farming_leakage": "boost paid to ring payments and not recovered / total_boost (C scenarios)",
    "detection_precision": "C_on: precision of (rule tier >= 1) against the ring label, all payments",
    "detection_recall": "C_on: recall of (rule tier >= 1) against the ring label, all payments",
}


def _cell_sales(p: pd.DataFrame) -> pd.Series:
    return p.groupby(["zone", "day", "slot"])["amount"].sum()


def vulnerable_slot_uplift(none: pd.DataFrame, scen: pd.DataFrame) -> float | None:
    base = _cell_sales(none[none["ring"] == 0])
    if base.empty:
        return None
    cells = []
    for zone, s in base.groupby(level=0):
        cutoff = np.percentile(s.values, 25)
        cells.extend([idx for idx, v in s.items() if v <= cutoff])
    if not cells:
        return None
    idx = pd.MultiIndex.from_tuples(cells, names=["zone", "day", "slot"])
    b = base.reindex(idx).fillna(0).sum()
    sc = _cell_sales(scen[scen["ring"] == 0]).reindex(idx).fillna(0).sum()
    return float((sc - b) / b) if b > 0 else None


def net_sales_per_won(none: pd.DataFrame, scen: pd.DataFrame) -> float | None:
    boost = int(scen["boost"].sum())
    if boost == 0:
        return None
    return float((int(scen["amount"].sum()) - int(none["amount"].sum())) / boost)


def deadweight_ratio(none: pd.DataFrame, scen: pd.DataFrame) -> float | None:
    boost = int(scen["boost"].sum())
    if boost == 0:
        return None
    baseline_keys = set(zip(none.loc[none["ring"] == 0, "person"], none.loc[none["ring"] == 0, "zone"], none.loc[none["ring"] == 0, "day"], none.loc[none["ring"] == 0, "slot"]))
    s = scen[(scen["ring"] == 0) & (scen["boost"] > 0)]
    dead = sum(int(b) for p, z, d, sl, b in zip(s["person"], s["zone"], s["day"], s["slot"], s["boost"]) if (p, z, d, sl) in baseline_keys)
    return float(dead / boost)


def farming_leakage(scen: pd.DataFrame) -> float | None:
    if int(scen["ring"].sum()) == 0:
        return None
    boost = int(scen["boost"].sum())
    if boost == 0:
        return None
    leaked = int(scen.loc[scen["ring"] == 1, "boost"].sum())
    return float(leaked / boost)


def detection(scen: pd.DataFrame) -> tuple[float | None, float | None]:
    if "tier" not in scen or int(scen["ring"].sum()) == 0:
        return None, None
    pred = scen["tier"] >= 1
    label = scen["ring"] == 1
    tp = int((pred & label).sum())
    fp = int((pred & ~label).sum())
    fn = int((~pred & label).sum())
    precision = tp / (tp + fp) if tp + fp > 0 else None
    recall = tp / (tp + fn) if tp + fn > 0 else None
    return (float(precision) if precision is not None else None, float(recall) if recall is not None else None)


def summarize(name: str, none: pd.DataFrame, scen: pd.DataFrame, k: float | None) -> dict[str, Any]:
    prec, rec = detection(scen) if name == "C_on" else (None, None)
    return {
        "vulnerable_slot_sales_uplift": vulnerable_slot_uplift(none, scen) if name != "none" else 0.0,
        "net_sales_per_won": net_sales_per_won(none, scen) if name != "none" else None,
        "deadweight_ratio": deadweight_ratio(none, scen) if name != "none" else None,
        "farming_leakage": farming_leakage(scen),
        "detection_precision": prec,
        "detection_recall": rec,
        "total_sales": int(scen["amount"].sum()),
        "total_boost": int(scen["boost"].sum()),
        "k": k,
        "n_payments": int(len(scen)),
        "n_ring_payments": int(scen["ring"].sum()),
    }
