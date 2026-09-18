"""FastAPI entrypoint for the iM-LocalBoost engine."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from web3 import Web3

from engine import chain, db, poller
from engine.config import get_settings
from engine.signer import AttestationSigner, build_attestation

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

_settings = get_settings()
_signer = AttestationSigner(
    _settings.attester_key, _settings.chain_id, _settings.deployment.contracts["LocalBoost"]
)


class State:
    conn = None  # sqlite3.Connection, opened in lifespan
    stop: asyncio.Event | None = None
    task: asyncio.Task | None = None


state = State()


@asynccontextmanager
async def lifespan(_: FastAPI):
    state.conn = db.connect(_settings.db_path)
    state.stop = asyncio.Event()
    state.task = asyncio.create_task(poller.run(state.conn, state.stop))
    try:
        yield
    finally:
        state.stop.set()
        if state.task is not None:
            try:
                await asyncio.wait_for(state.task, timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                state.task.cancel()
        state.conn.close()


app = FastAPI(title="iM-LocalBoost engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_settings.web_origin, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


class AttestRequest(BaseModel):
    payer: str
    merchant: str
    amount: int = Field(gt=0)


def _checksum(name: str, value: str) -> str:
    if not Web3.is_address(value):
        raise HTTPException(status_code=422, detail=f"{name} is not a valid address")
    return Web3.to_checksum_address(value)


def _conn():
    if state.conn is None:
        raise HTTPException(status_code=503, detail="database not ready")
    return state.conn


@app.get("/health")
async def health() -> dict[str, Any]:
    s = get_settings()
    try:
        chain.block_number()
        ok = True
    except Exception:  # noqa: BLE001 - report the chain as down instead of failing the endpoint
        ok = False
    last_block = db.kv_get(state.conn, "last_block") if state.conn is not None else None
    return {
        "ok": ok,
        "chainId": s.chain_id,
        "contract": s.deployment.contracts["LocalBoost"],
        "lastBlock": int(last_block) if last_block is not None else None,
        "dbPath": str(s.db_path),
    }


@app.post("/attest")
async def attest(req: AttestRequest) -> dict[str, Any]:
    payer = _checksum("payer", req.payer)
    merchant = _checksum("merchant", req.merchant)
    # Risk scoring is attached in later milestones; tier 0 for now.
    tier, score, reasons = 0, 0.0, []
    att = build_attestation(payer, merchant, req.amount, tier)
    signature = _signer.sign_attestation(att)
    db.insert_risk_log(_conn(), int(time.time()), payer, merchant, req.amount, tier, score, reasons, att["nonce"])
    return {
        "tier": tier,
        "score": score,
        "reasons": reasons,
        "attestation": {**att, "nonce": str(att["nonce"])},
        "signature": signature,
    }


@app.get("/risk/log")
async def risk_log(limit: int = Query(50, ge=1, le=500)) -> list[dict[str, Any]]:
    return db.list_risk_log(_conn(), limit)


@app.get("/payments")
async def payments(
    merchant: str | None = None, payer: str | None = None, limit: int = Query(50, ge=1, le=500)
) -> list[dict[str, Any]]:
    return db.list_payments(_conn(), merchant=merchant, payer=payer, limit=limit)
