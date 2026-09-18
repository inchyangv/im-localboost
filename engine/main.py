"""FastAPI entrypoint. Endpoints are added ticket by ticket; /health is a placeholder here."""

from fastapi import FastAPI

app = FastAPI(title="iM-LocalBoost engine")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
