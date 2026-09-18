"""Engine configuration.

Reads the environment file selected by ENV_FILE (default: repo-root .env) without overriding
variables that are already set (Railway injects variables directly, with no file). Then picks the
CHAIN_ID entry from shared/deployments.json for addresses, zones, merchants and caps.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "shared"
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "engine" / "models"

_env_file = os.environ.get("ENV_FILE", ".env")
_env_path = Path(_env_file) if os.path.isabs(_env_file) else ROOT / _env_file
if _env_path.exists():
    load_dotenv(_env_path, override=False)


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"engine config: missing environment variable {name}")
    return value


@dataclass(frozen=True)
class Deployment:
    chain_id: int
    explorer: str | None
    start_block: int
    contracts: dict[str, str]
    zones: list[dict[str, Any]]
    merchants: list[dict[str, Any]]
    caps: dict[str, int]


@dataclass(frozen=True)
class Settings:
    rpc_url: str
    chain_id: int
    oracle_key: str
    attester_key: str
    db_path: Path
    web_origin: str
    port: int
    deployment: Deployment = field(repr=False)


def load_deployment(chain_id: int) -> Deployment:
    path = SHARED / "deployments.json"
    if not path.exists():
        raise SystemExit(f"engine config: {path} not found; run make deploy-local first")
    with path.open("r", encoding="utf-8") as fh:
        all_entries = json.load(fh)
    entry = all_entries.get(str(chain_id))
    if entry is None:
        raise SystemExit(
            f"engine config: no entry for chainId {chain_id} in {path} "
            f"(available: {', '.join(all_entries.keys()) or 'none'})"
        )
    return Deployment(
        chain_id=int(entry["chainId"]),
        explorer=entry.get("explorer"),
        start_block=int(entry["startBlock"]),
        contracts=dict(entry["contracts"]),
        zones=list(entry["zones"]),
        merchants=list(entry["merchants"]),
        caps={k: int(v) for k, v in entry["caps"].items()},
    )


def load_settings() -> Settings:
    chain_id = int(_env("CHAIN_ID", "31337"))
    db_raw = _env("DB_PATH", "./engine/engine.db")
    db_path = Path(db_raw) if os.path.isabs(db_raw) else ROOT / db_raw
    return Settings(
        rpc_url=_env("RPC_URL", "http://127.0.0.1:8545"),
        chain_id=chain_id,
        oracle_key=_env("ORACLE_KEY"),
        attester_key=_env("ATTESTER_KEY"),
        db_path=db_path,
        web_origin=_env("WEB_ORIGIN", "http://localhost:3000"),
        port=int(_env("PORT", "8000")),
        deployment=load_deployment(chain_id),
    )


def load_abi(name: str) -> list[dict[str, Any]]:
    with (SHARED / "abi" / f"{name}.json").open("r", encoding="utf-8") as fh:
        return json.load(fh)


settings: Settings | None = None


def get_settings() -> Settings:
    """Lazily loads settings so importing modules for unit tests does not require a chain."""
    global settings
    if settings is None:
        try:
            settings = load_settings()
        except SystemExit as exc:
            print(str(exc), file=sys.stderr)
            raise
    return settings
