"""Trains the LightGBM collusion classifier from the synthetic CSVs.

    python -m engine.train_risk [--data data/] [--out engine/models/]

Loads payments.csv / transfers.csv into a temporary SQLite with the serving schema, computes the
11 features as-of each payment's timestamp with engine.features.build_features, trains a binary
classifier and reports precision/recall at 0.5 and 0.8 plus AUC on a time-ordered 20% holdout.
Metrics are printed as they come out."""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import precision_score, recall_score, roc_auc_score

from engine import db
from engine.config import DATA_DIR, MODELS_DIR
from engine.features import FEATURE_NAMES, build_features

RATE_BPS_ASSUMED = 1000  # 10% assumed for the training-time boost column and cap ratio
PER_TX_BOOST = 3000
N_NORMAL_SAMPLE = 20_000
SEED = 42
PARAMS = {
    "objective": "binary",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "seed": SEED,
    "verbose": -1,
}
ROUNDS = 200


def load_into_sqlite(data_dir: Path) -> tuple[sqlite3.Connection, pd.DataFrame]:
    payments = pd.read_csv(data_dir / "payments.csv")
    transfers = pd.read_csv(data_dir / "transfers.csv")
    conn = db.connect(":memory:")
    payments = payments.sort_values("ts", kind="mergesort").reset_index(drop=True)
    conn.executemany(
        "INSERT OR IGNORE INTO payments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (f"0xp{i}", 0, i, int(r.ts), r.payer.lower(), "0x" + "00" * 32, r.merchant.lower(), int(r.zoneId),
             int(r.amount), 0, int(r.amount) * RATE_BPS_ASSUMED // 10000, 0, 0)
            for i, r in enumerate(payments.itertuples(index=False))
        ],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO transfers VALUES (?,?,?,?,?,?,?)",
        [
            (f"0xt{i}", 0, i, int(ts), str(frm).lower(), str(to).lower(), int(amount))
            for i, (ts, frm, to, amount) in enumerate(transfers[["ts", "from", "to", "amount"]].itertuples(index=False, name=None))
        ],
    )
    conn.commit()
    return conn, payments


def merchant_baselines(payments: pd.DataFrame) -> dict[str, int]:
    """Per-merchant slot baseline: 75th percentile of non-zero hourly sales in the data."""
    hourly = payments.assign(h=payments["ts"] // 3600).groupby(["merchant", "h"])["amount"].sum()
    out: dict[str, int] = {}
    for m, s in hourly.groupby(level=0):
        out[m.lower()] = int(np.percentile(s.values, 75))
    return out


def build_dataset(conn: sqlite3.Connection, payments: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    coll = payments.index[payments["is_collusion"] == 1]
    norm = payments.index[payments["is_collusion"] == 0]
    sample = np.sort(np.concatenate([coll.values, rng.choice(norm.values, size=min(N_NORMAL_SAMPLE, len(norm)), replace=False)]))
    baselines = merchant_baselines(payments)
    rows = []
    t0 = time.time()
    for k, i in enumerate(sample):
        r = payments.iloc[i]
        ctx = {"rate_bps": RATE_BPS_ASSUMED, "per_tx_boost": PER_TX_BOOST, "slot_baseline": baselines.get(r.merchant.lower(), 0)}
        f = build_features(conn, r.payer, r.merchant, int(r.amount), int(r.ts), ctx)
        f["ts"] = int(r.ts)
        f["label"] = int(r.is_collusion)
        f["ring_type"] = r.ring_type if isinstance(r.ring_type, str) else ""
        rows.append(f)
        if (k + 1) % 5000 == 0:
            print(f"  features {k + 1}/{len(sample)} ({time.time() - t0:.0f}s)")
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=DATA_DIR)
    ap.add_argument("--out", type=Path, default=MODELS_DIR)
    args = ap.parse_args()
    t0 = time.time()

    conn, payments = load_into_sqlite(args.data)
    print(f"loaded {len(payments)} payments ({int(payments['is_collusion'].sum())} collusion)")
    ds = build_dataset(conn, payments).sort_values("ts", kind="mergesort").reset_index(drop=True)
    split = int(len(ds) * 0.8)
    train, valid = ds.iloc[:split], ds.iloc[split:]
    print(f"dataset {len(ds)} rows: train {len(train)} (pos {int(train.label.sum())}), valid {len(valid)} (pos {int(valid.label.sum())})")

    dtrain = lgb.Dataset(train[FEATURE_NAMES], label=train["label"])
    booster = lgb.train(PARAMS, dtrain, num_boost_round=ROUNDS)
    pred = booster.predict(valid[FEATURE_NAMES])
    y = valid["label"].values

    metrics = {
        "precision_at_0_5": float(precision_score(y, pred >= 0.5, zero_division=0)),
        "recall_at_0_5": float(recall_score(y, pred >= 0.5, zero_division=0)),
        "precision_at_0_8": float(precision_score(y, pred >= 0.8, zero_division=0)),
        "recall_at_0_8": float(recall_score(y, pred >= 0.8, zero_division=0)),
        "auc": float(roc_auc_score(y, pred)) if len(set(y)) > 1 else None,
        "n_train": int(len(train)),
        "n_valid": int(len(valid)),
        "n_valid_positive": int(y.sum()),
        "rounds": ROUNDS,
        "features": FEATURE_NAMES,
    }
    for rt in sorted(set(valid["ring_type"]) - {""}):
        mask = (valid["ring_type"] == rt).values
        metrics[f"recall_at_0_5_{rt}"] = float((pred[mask] >= 0.5).mean()) if mask.any() else None

    args.out.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(args.out / "risk.txt"))
    with (args.out / "risk_metrics.json").open("w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)

    print("risk model metrics (validation, time-ordered last 20%):")
    for k in ("precision_at_0_5", "recall_at_0_5", "precision_at_0_8", "recall_at_0_8", "auc"):
        v = metrics[k]
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")
    for k, v in metrics.items():
        if k.startswith("recall_at_0_5_"):
            print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")
    imp = sorted(zip(FEATURE_NAMES, booster.feature_importance("gain")), key=lambda x: -x[1])[:5]
    print("top-5 feature importance (gain):", ", ".join(f"{n}={g:.0f}" for n, g in imp))
    print(f"saved {args.out / 'risk.txt'} and risk_metrics.json in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
