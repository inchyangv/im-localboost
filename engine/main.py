"""FastAPI entrypoint for the iM-LocalBoost engine."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from web3 import Web3

from engine import chain
from engine.config import get_settings
from engine.signer import AttestationSigner, build_attestation

app = FastAPI(title="iM-LocalBoost engine")

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_settings.web_origin, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

_signer = AttestationSigner(
    _settings.attester_key, _settings.chain_id, _settings.deployment.contracts["LocalBoost"]
)


class AttestRequest(BaseModel):
    payer: str
    merchant: str
    amount: int = Field(gt=0)


def _checksum(name: str, value: str) -> str:
    if not Web3.is_address(value):
        raise HTTPException(status_code=422, detail=f"{name} is not a valid address")
    return Web3.to_checksum_address(value)


@app.get("/health")
async def health() -> dict[str, Any]:
    s = get_settings()
    try:
        last_block = chain.block_number()
        ok = True
    except Exception:  # noqa: BLE001 - report the chain as down instead of failing the endpoint
        last_block = None
        ok = False
    return {
        "ok": ok,
        "chainId": s.chain_id,
        "contract": s.deployment.contracts["LocalBoost"],
        "lastBlock": last_block,
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
    return {
        "tier": tier,
        "score": score,
        "reasons": reasons,
        "attestation": {**att, "nonce": str(att["nonce"])},
        "signature": signature,
    }
