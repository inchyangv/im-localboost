"""FastAPI entrypoint for the 달구벌페이 engine."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from web3 import Web3

from engine import boost, chain, db, onboard as onboarding, poller
from engine.config import get_settings
from engine import risk_model
from engine.features import Ctx, build_features
from engine.rules import evaluate_rules, rule_score
from engine.signer import AttestationSigner, build_attestation

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("engine.main")

_settings = get_settings()
_signer = AttestationSigner(
    _settings.attester_key, _settings.chain_id, _settings.deployment.contracts["DalgubeolPay"]
)
_model = risk_model.load()


class State:
    conn = None  # sqlite3.Connection, opened in lifespan
    stop: asyncio.Event | None = None
    task: asyncio.Task | None = None


state = State()


def _daily_k_hook(conn) -> None:
    boost.update_k_if_new_day(conn, chain.now_ts())


@asynccontextmanager
async def lifespan(_: FastAPI):
    state.conn = db.connect(_settings.db_path)
    state.stop = asyncio.Event()
    if _daily_k_hook not in poller.tick_hooks:
        poller.tick_hooks.append(_daily_k_hook)
    if _auto_republish_hook not in poller.tick_hooks:
        poller.tick_hooks.append(_auto_republish_hook)
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


app = FastAPI(title="달구벌페이 engine", lifespan=lifespan)
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


class PublishRequest(BaseModel):
    overrides: dict[str, int] = Field(default_factory=dict)


class OnboardRequest(BaseModel):
    wallet: str


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
        "contract": s.deployment.contracts["DalgubeolPay"],
        "lastBlock": int(last_block) if last_block is not None else None,
        "dbPath": str(s.db_path),
        "model": _model is not None,
    }


def _risk_context(merchant: str) -> Ctx:
    """Reads rate, per-tx cap and slot baseline from chain. Falls back to deployment caps and 0
    when the RPC is unavailable so that attestation still works (rules then see rate 0)."""
    s = get_settings()
    try:
        m = chain.registry().functions.get(merchant).call()
        zone_id = int(m[0])
        slot_baseline = int(m[3])
        rate = int(chain.dalgubeol_pay().functions.currentRate(zone_id).call())
        per_tx = int(chain.dalgubeol_pay().functions.caps().call()[1])
    except Exception as exc:  # noqa: BLE001
        log.warning("risk context from chain failed, using fallback: %s", exc)
        fallback = next((x for x in s.deployment.merchants if x["address"].lower() == merchant.lower()), None)
        slot_baseline = int(fallback["slotBaseline"]) if fallback else 0
        rate = 0
        per_tx = int(s.deployment.caps["perTxBoost"])
    return {"rate_bps": rate, "per_tx_boost": per_tx, "slot_baseline": slot_baseline}


def assess_risk(conn, payer: str, merchant: str, amount: int, ts: int) -> tuple[int, float, list[str]]:
    """Final tier = max(rule tier, model tier). Score is the model's when loaded, else the rule score.
    A model failure never blocks attestation: it falls back to rules only."""
    ctx = _risk_context(merchant)
    rule_tier, reasons = evaluate_rules(conn, payer, merchant, amount, ts, ctx)
    tier, score = rule_tier, rule_score(rule_tier)
    if _model is not None:
        try:
            score = _model.score(build_features(conn, payer, merchant, amount, ts, ctx))
            model_tier = _model.tier_for(score)
            if model_tier > rule_tier:
                tier = model_tier
                reasons = [*reasons, "model_score"]
        except Exception as exc:  # noqa: BLE001
            log.warning("model scoring failed, rules only: %s", exc)
            score = rule_score(rule_tier)
    return tier, score, reasons


@app.post("/attest")
async def attest(req: AttestRequest) -> dict[str, Any]:
    payer = _checksum("payer", req.payer)
    merchant = _checksum("merchant", req.merchant)
    now = await asyncio.to_thread(chain.now_ts)
    tier, score, reasons = await asyncio.to_thread(assess_risk, _conn(), payer, merchant, req.amount, now)
    att = build_attestation(payer, merchant, req.amount, tier, now=now)
    signature = _signer.sign_attestation(att)
    db.insert_risk_log(_conn(), now, payer, merchant, req.amount, tier, score, reasons, att["nonce"])
    return {
        "tier": tier,
        "score": score,
        "reasons": reasons,
        "attestation": {**att, "nonce": str(att["nonce"])},
        "signature": signature,
    }


@app.get("/onboard/status")
async def onboard_status(wallet: str) -> dict[str, Any]:
    """Whether the wallet is linked to a personId and whether it already received today's iMKRW."""
    addr = _checksum("wallet", wallet)
    now = await asyncio.to_thread(chain.now_ts)
    try:
        return await asyncio.to_thread(onboarding.status, _conn(), addr, now)
    except Exception as exc:  # noqa: BLE001
        log.warning("onboard status failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"onboard status failed: {exc}")


@app.post("/onboard")
async def onboard(req: OnboardRequest) -> dict[str, Any]:
    """Bank-side onboarding for a browser wallet: setPerson (once), starter iMKRW (once per KST day)
    and a native gas top-up when the wallet is nearly empty. Signed with BANK_KEY."""
    addr = _checksum("wallet", req.wallet)
    now = await asyncio.to_thread(chain.now_ts)
    try:
        return await asyncio.to_thread(onboarding.onboard, _conn(), addr, now)
    except Exception as exc:  # noqa: BLE001
        log.exception("onboard failed")
        raise HTTPException(status_code=502, detail=f"onboard failed: {exc}")


@app.get("/risk/log")
async def risk_log(limit: int = Query(50, ge=1, le=500)) -> list[dict[str, Any]]:
    return db.list_risk_log(_conn(), limit)


@app.get("/payments")
async def payments(
    merchant: str | None = None, payer: str | None = None, limit: int = Query(50, ge=1, le=500)
) -> list[dict[str, Any]]:
    return db.list_payments(_conn(), merchant=merchant, payer=payer, limit=limit)


def _strip_explore(rates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in r.items() if k != "explore"} for r in rates]


@app.get("/rates/current")
async def rates_current() -> list[dict[str, Any]]:
    """Published rates for the current hour when present, otherwise a preview without exploration."""
    conn = _conn()
    now = await asyncio.to_thread(chain.now_ts)
    epoch = chain.hour_epoch(now)
    published = boost.published_rates(conn, epoch)
    if published:
        return published
    try:
        preview = await asyncio.to_thread(boost.rates_for, now, boost.get_k(conn), False, {})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return _strip_explore(preview)


LAST_OVERRIDES_KEY = "last_overrides"
AUTO_PUBLISH_FAILED_KEY = "auto_publish_failed_epoch"


def _chain_max_bps() -> int:
    """On-chain caps().maxRateBps; falls back to the seeded value when the RPC is unreachable."""
    try:
        return int(chain.dalgubeol_pay().functions.caps().call()[0])
    except Exception as exc:  # noqa: BLE001
        log.warning("caps() read failed, using seeded maxRateBps: %s", exc)
        return int(_settings.deployment.caps.get("maxRateBps", boost.MAX_BPS))


def publish_rates(conn, overrides: dict[int, int]) -> dict[str, Any]:
    """Computes rates for the current and the next hour and publishes both via setRates (sync).
    Remembers `overrides` so the poller can re-publish them at the next hour boundary."""
    now = chain.now_ts()
    epoch = chain.hour_epoch(now)
    k = boost.get_k(conn)
    max_bps = _chain_max_bps()
    current = boost.rates_for(now, k, True, overrides, max_bps=max_bps)
    nxt = boost.rates_for((epoch + 1) * 3600, k, False, overrides, max_bps=max_bps)

    def publish(hour_epoch: int, rates: list[dict[str, Any]]) -> str:
        fn = chain.dalgubeol_pay().functions.setRates(hour_epoch, [r["zoneId"] for r in rates], [r["bps"] for r in rates])
        return chain.send_tx(fn, _settings.oracle_key)

    tx_hash = publish(epoch, current)
    next_tx_hash = publish(epoch + 1, nxt)
    boost.store_published(conn, epoch, current, tx_hash)
    boost.store_published(conn, epoch + 1, nxt, next_tx_hash)
    db.kv_set(conn, LAST_OVERRIDES_KEY, json.dumps({str(z): b for z, b in overrides.items()}))
    log.info("published rates epoch=%d %s explore=%s", epoch, [(r["zoneId"], r["bps"]) for r in current], [r["zoneId"] for r in current if r["explore"]])
    return {"txHash": tx_hash, "nextTxHash": next_tx_hash, "rates": _strip_explore(current)}


def _auto_republish_hook(conn) -> None:
    """Demo guard: once rates have been published manually, keep the current and next hour covered
    after every hour boundary, reusing the last overrides (e.g. the fixed 북성로 10%). Retries at most
    once per hour epoch so a failing RPC does not spam setRates."""
    raw = db.kv_get(conn, LAST_OVERRIDES_KEY)
    if raw is None:
        return
    epoch = chain.hour_epoch(chain.now_ts())
    if boost.published_rates(conn, epoch + 1):
        return
    failed = db.kv_get(conn, AUTO_PUBLISH_FAILED_KEY)
    if failed is not None and int(failed) == epoch:
        return
    overrides = {int(z): int(b) for z, b in json.loads(raw).items()}
    try:
        publish_rates(conn, overrides)
        log.info("auto re-published rates for epoch %d and %d", epoch, epoch + 1)
    except Exception as exc:  # noqa: BLE001
        db.kv_set(conn, AUTO_PUBLISH_FAILED_KEY, str(epoch))
        log.warning("auto re-publish failed for epoch %d: %s", epoch, exc)


@app.post("/rates/publish")
async def rates_publish(req: PublishRequest | None = None) -> dict[str, Any]:
    """Computes rates for the current and the next hour and publishes both via setRates."""
    conn = _conn()
    overrides: dict[int, int] = {}
    for zid, bps in (req.overrides if req else {}).items():
        if not (0 <= int(bps) <= boost.MAX_BPS):
            raise HTTPException(status_code=422, detail=f"bps for zone {zid} must be within 0..{boost.MAX_BPS}")
        overrides[int(zid)] = int(bps)
    try:
        return await asyncio.to_thread(publish_rates, conn, overrides)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        log.exception("rates publish failed")
        raise HTTPException(status_code=502, detail=f"setRates failed: {exc}")
