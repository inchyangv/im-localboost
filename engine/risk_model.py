"""LightGBM risk model wrapper. The model file is optional: without it the model layer is off."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from engine.config import MODELS_DIR
from engine.features import FEATURE_NAMES

log = logging.getLogger("engine.risk_model")

MODEL_PATH = MODELS_DIR / "risk.txt"
TIER1_THRESHOLD = 0.5
TIER2_THRESHOLD = 0.8


class RiskModel:
    def __init__(self, booster: Any) -> None:
        self._booster = booster

    def score(self, features: dict[str, Any]) -> float:
        row = np.array([[float(features[name]) for name in FEATURE_NAMES]])
        return float(self._booster.predict(row)[0])

    @staticmethod
    def tier_for(score: float) -> int:
        if score >= TIER2_THRESHOLD:
            return 2
        if score >= TIER1_THRESHOLD:
            return 1
        return 0


def load(path: Path = MODEL_PATH) -> RiskModel | None:
    if not path.exists():
        log.warning("risk model %s not found; model layer disabled (run make train)", path)
        return None
    try:
        import lightgbm as lgb

        return RiskModel(lgb.Booster(model_file=str(path)))
    except Exception as exc:  # noqa: BLE001
        log.warning("failed to load risk model %s: %s; model layer disabled", path, exc)
        return None
