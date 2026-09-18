"""SQLite store: schema, connection helpers and small typed accessors.

Addresses are stored as lowercase hex. Amounts are integers (won)."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS payments (
    tx_hash    TEXT NOT NULL,
    log_index  INTEGER NOT NULL,
    block      INTEGER NOT NULL,
    ts         INTEGER NOT NULL,
    payer      TEXT NOT NULL,
    person_id  TEXT NOT NULL,
    merchant   TEXT NOT NULL,
    zone_id    INTEGER NOT NULL,
    amount     INTEGER NOT NULL,
    use_credit INTEGER NOT NULL,
    boost      INTEGER NOT NULL,
    tier       INTEGER NOT NULL,
    pending_id INTEGER NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_payments_pair ON payments(payer, merchant, ts);
CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant, ts);

CREATE TABLE IF NOT EXISTS transfers (
    tx_hash   TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    block     INTEGER NOT NULL,
    ts        INTEGER NOT NULL,
    from_addr TEXT NOT NULL,
    to_addr   TEXT NOT NULL,
    amount    INTEGER NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_addr, ts);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_addr, ts);

CREATE TABLE IF NOT EXISTS risk_log (
    id       INTEGER PRIMARY KEY,
    ts       INTEGER NOT NULL,
    payer    TEXT NOT NULL,
    merchant TEXT NOT NULL,
    amount   INTEGER NOT NULL,
    tier     INTEGER NOT NULL,
    score    REAL NOT NULL,
    reasons  TEXT NOT NULL,
    nonce    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rates_published (
    hour_epoch      INTEGER NOT NULL,
    zone_id         INTEGER NOT NULL,
    bps             INTEGER NOT NULL,
    slack           REAL NOT NULL,
    predicted_sales INTEGER NOT NULL,
    baseline        INTEGER NOT NULL,
    explore         INTEGER NOT NULL,
    tx_hash         TEXT,
    PRIMARY KEY (hour_epoch, zone_id)
);

CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    """Opens (and creates) the database at `path`, applying the schema. `:memory:` is allowed."""
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript(SCHEMA)
    return conn


# --------------------------------------------------------------------------- kv
def kv_get(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def kv_set(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


# --------------------------------------------------------------------------- writes
def insert_payment(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO payments
           (tx_hash, log_index, block, ts, payer, person_id, merchant, zone_id, amount, use_credit, boost, tier, pending_id)
           VALUES (:tx_hash, :log_index, :block, :ts, :payer, :person_id, :merchant, :zone_id, :amount, :use_credit, :boost, :tier, :pending_id)""",
        {
            **row,
            "payer": row["payer"].lower(),
            "merchant": row["merchant"].lower(),
            "person_id": row["person_id"].lower(),
        },
    )


def insert_transfer(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO transfers (tx_hash, log_index, block, ts, from_addr, to_addr, amount)
           VALUES (:tx_hash, :log_index, :block, :ts, :from_addr, :to_addr, :amount)""",
        {**row, "from_addr": row["from_addr"].lower(), "to_addr": row["to_addr"].lower()},
    )


def insert_risk_log(
    conn: sqlite3.Connection,
    ts: int,
    payer: str,
    merchant: str,
    amount: int,
    tier: int,
    score: float,
    reasons: list[str],
    nonce: int | str,
) -> int:
    cur = conn.execute(
        "INSERT INTO risk_log (ts, payer, merchant, amount, tier, score, reasons, nonce) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (ts, payer.lower(), merchant.lower(), int(amount), int(tier), float(score), json.dumps(reasons), str(nonce)),
    )
    conn.commit()
    return int(cur.lastrowid or 0)


# --------------------------------------------------------------------------- reads
def list_payments(
    conn: sqlite3.Connection, merchant: str | None = None, payer: str | None = None, limit: int = 50
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if merchant:
        clauses.append("merchant = ?")
        params.append(merchant.lower())
    if payer:
        clauses.append("payer = ?")
        params.append(payer.lower())
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        f"SELECT * FROM payments {where} ORDER BY block DESC, log_index DESC LIMIT ?", (*params, int(limit))
    ).fetchall()
    return [
        {
            "ts": r["ts"],
            "txHash": r["tx_hash"],
            "blockNumber": r["block"],
            "payer": r["payer"],
            "personId": r["person_id"],
            "merchant": r["merchant"],
            "zoneId": r["zone_id"],
            "amount": r["amount"],
            "useCredit": r["use_credit"],
            "boost": r["boost"],
            "tier": r["tier"],
            "pendingId": r["pending_id"],
        }
        for r in rows
    ]


def list_risk_log(conn: sqlite3.Connection, limit: int = 50) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT * FROM risk_log ORDER BY id DESC LIMIT ?", (int(limit),)).fetchall()
    return [
        {
            "ts": r["ts"],
            "payer": r["payer"],
            "merchant": r["merchant"],
            "amount": r["amount"],
            "tier": r["tier"],
            "score": r["score"],
            "reasons": json.loads(r["reasons"]),
        }
        for r in rows
    ]
