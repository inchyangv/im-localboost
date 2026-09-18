"""Background poller: copies Paid (LocalBoost) and Transfer (MockIMKRW) logs into SQLite.

Runs every POLL_INTERVAL seconds from kv.last_block + 1 to the latest block in chunks of
CHUNK_BLOCKS. Errors are logged and retried on the next tick. Block timestamps are cached."""

from __future__ import annotations

import asyncio
import logging
import sqlite3
from typing import Any, Callable

from engine import chain
from engine.config import get_settings
from engine.db import insert_payment, insert_transfer, kv_get, kv_set

log = logging.getLogger("engine.poller")

POLL_INTERVAL = 2.0
CHUNK_BLOCKS = 1000

# Hooks other modules may register to run once per tick (e.g. daily k adjustment). Kept simple on purpose.
tick_hooks: list[Callable[[sqlite3.Connection], None]] = []


class BlockTimeCache:
    def __init__(self, max_size: int = 4096) -> None:
        self._cache: dict[int, int] = {}
        self._max = max_size

    def get(self, block_number: int) -> int:
        ts = self._cache.get(block_number)
        if ts is None:
            ts = int(chain.w3().eth.get_block(block_number)["timestamp"])
            if len(self._cache) >= self._max:
                self._cache.clear()
            self._cache[block_number] = ts
        return ts


def _hex(value: Any) -> str:
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    s = str(value)
    return s if s.startswith("0x") else "0x" + s


def sync_once(conn: sqlite3.Connection, times: BlockTimeCache) -> int:
    """Ingests new logs. Returns the last block now recorded in kv. Raises on RPC failure."""
    s = get_settings()
    latest = chain.block_number()
    start_raw = kv_get(conn, "last_block")
    start = int(start_raw) + 1 if start_raw is not None else s.deployment.start_block
    if start > latest:
        return latest if start_raw is None else int(start_raw)

    boost = chain.local_boost()
    token = chain.token()
    last_done = start - 1
    while last_done < latest:
        lo = last_done + 1
        hi = min(lo + CHUNK_BLOCKS - 1, latest)
        paid = boost.events.Paid.get_logs(from_block=lo, to_block=hi)
        transfers = token.events.Transfer.get_logs(from_block=lo, to_block=hi)
        for ev in paid:
            a = ev["args"]
            insert_payment(
                conn,
                {
                    "tx_hash": _hex(ev["transactionHash"]),
                    "log_index": int(ev["logIndex"]),
                    "block": int(ev["blockNumber"]),
                    "ts": times.get(int(ev["blockNumber"])),
                    "payer": a["payer"],
                    "person_id": _hex(a["personId"]),
                    "merchant": a["merchant"],
                    "zone_id": int(a["zoneId"]),
                    "amount": int(a["amount"]),
                    "use_credit": int(a["useCredit"]),
                    "boost": int(a["boost"]),
                    "tier": int(a["tier"]),
                    "pending_id": int(a["pendingId"]),
                },
            )
        for ev in transfers:
            a = ev["args"]
            insert_transfer(
                conn,
                {
                    "tx_hash": _hex(ev["transactionHash"]),
                    "log_index": int(ev["logIndex"]),
                    "block": int(ev["blockNumber"]),
                    "ts": times.get(int(ev["blockNumber"])),
                    "from_addr": a["from"],
                    "to_addr": a["to"],
                    "amount": int(a["value"]),
                },
            )
        conn.commit()
        kv_set(conn, "last_block", str(hi))
        last_done = hi
        if paid or transfers:
            log.info("ingested blocks %d-%d: %d Paid, %d Transfer", lo, hi, len(paid), len(transfers))
    return last_done


async def run(conn: sqlite3.Connection, stop: asyncio.Event) -> None:
    times = BlockTimeCache()
    while not stop.is_set():
        try:
            await asyncio.to_thread(sync_once, conn, times)
            for hook in list(tick_hooks):
                try:
                    await asyncio.to_thread(hook, conn)
                except Exception:  # noqa: BLE001
                    log.exception("tick hook failed")
        except Exception as exc:  # noqa: BLE001 - keep polling after transient RPC errors
            log.warning("poll failed: %s", exc)
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass
