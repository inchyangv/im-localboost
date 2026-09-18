"""Trains the LightGBM demand regressor on data/zone_hour_sales.csv.

    python -m engine.train_boost

Last 7 days are the validation split. Prints MAE and MAPE (MAPE over hours with non-zero sales)
and saves engine/models/boost.txt + boost_metrics.json."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np

from engine.boost_features import FEATURES, add_features, load_zone_hour_sales
from engine.config import MODELS_DIR

PARAMS = {
    "objective": "regression",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.9,
    "seed": 42,
    "verbose": -1,
}
ROUNDS = 200
VALID_DAYS = 7


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=MODELS_DIR)
    args = ap.parse_args()
    t0 = time.time()

    df = add_features(load_zone_hour_sales())
    df = df.dropna(subset=["sales_lag_1h", "sales_same_slot_mean_4w"]).reset_index(drop=True)
    cutoff = df["ts"].max() - VALID_DAYS * 86400 + 1
    train, valid = df[df["ts"] < cutoff], df[df["ts"] >= cutoff]
    print(f"zone-hour rows: train {len(train)}, valid {len(valid)} (last {VALID_DAYS} days)")

    booster = lgb.train(PARAMS, lgb.Dataset(train[FEATURES], label=train["sales"]), num_boost_round=ROUNDS)
    pred = np.clip(booster.predict(valid[FEATURES]), 0, None)
    y = valid["sales"].to_numpy(dtype=float)
    mae = float(np.mean(np.abs(pred - y)))
    nz = y > 0
    mape = float(np.mean(np.abs(pred[nz] - y[nz]) / y[nz])) if nz.any() else None
    daytime = valid["hour"].between(8, 21).to_numpy() & nz
    mape_day = float(np.mean(np.abs(pred[daytime] - y[daytime]) / y[daytime])) if daytime.any() else None

    metrics = {
        "mae": mae,
        "mape_nonzero": mape,
        "mape_hours_8_21_nonzero": mape_day,
        "n_train": int(len(train)),
        "n_valid": int(len(valid)),
        "rounds": ROUNDS,
        "features": FEATURES,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(args.out / "boost.txt"))
    with (args.out / "boost_metrics.json").open("w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)

    print("boost model metrics (validation, last 7 days):")
    print(f"  mae: {mae:.1f} won")
    print(f"  mape_nonzero: {mape:.4f}" if mape is not None else "  mape_nonzero: None")
    print(f"  mape_hours_8_21_nonzero: {mape_day:.4f}" if mape_day is not None else "  mape_hours_8_21_nonzero: None")
    imp = sorted(zip(FEATURES, booster.feature_importance("gain")), key=lambda x: -x[1])
    print("feature importance (gain):", ", ".join(f"{n}={g:.0f}" for n, g in imp))
    print(f"saved {args.out / 'boost.txt'} and boost_metrics.json in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
