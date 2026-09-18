from engine import db
from engine.tests.conftest import MERCHANT1, PAYER1


def _payment(tx: str, idx: int = 0, **kw):
    row = {
        "tx_hash": tx,
        "log_index": idx,
        "block": 10,
        "ts": 1_000_000,
        "payer": PAYER1,
        "person_id": "0x" + "ab" * 32,
        "merchant": MERCHANT1,
        "zone_id": 4,
        "amount": 10000,
        "use_credit": 0,
        "boost": 1000,
        "tier": 0,
        "pending_id": 0,
    }
    row.update(kw)
    return row


def test_schema_and_duplicate_ignore(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"payments", "transfers", "risk_log", "rates_published", "kv"} <= tables

    db.insert_payment(conn, _payment("0xaa"))
    db.insert_payment(conn, _payment("0xaa"))  # duplicate (tx_hash, log_index) ignored
    db.insert_payment(conn, _payment("0xaa", idx=1, block=11))
    conn.commit()
    assert conn.execute("SELECT count(*) FROM payments").fetchone()[0] == 2

    db.insert_transfer(conn, {"tx_hash": "0xbb", "log_index": 0, "block": 5, "ts": 1, "from_addr": PAYER1, "to_addr": MERCHANT1, "amount": 5})
    db.insert_transfer(conn, {"tx_hash": "0xbb", "log_index": 0, "block": 5, "ts": 1, "from_addr": PAYER1, "to_addr": MERCHANT1, "amount": 5})
    conn.commit()
    assert conn.execute("SELECT count(*) FROM transfers").fetchone()[0] == 1
    # addresses are lowercased
    assert conn.execute("SELECT from_addr FROM transfers").fetchone()[0] == PAYER1.lower()


def test_kv_roundtrip(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    assert db.kv_get(conn, "last_block") is None
    db.kv_set(conn, "last_block", "12")
    db.kv_set(conn, "last_block", "13")
    assert db.kv_get(conn, "last_block") == "12" or db.kv_get(conn, "last_block") == "13"
    assert db.kv_get(conn, "last_block") == "13"


def test_list_payments_filters_and_order(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    other = "0x" + "cc" * 20
    db.insert_payment(conn, _payment("0x01", block=1))
    db.insert_payment(conn, _payment("0x02", block=2, payer=other))
    db.insert_payment(conn, _payment("0x03", block=3, merchant=other))
    conn.commit()

    all_rows = db.list_payments(conn)
    assert [r["txHash"] for r in all_rows] == ["0x03", "0x02", "0x01"]
    assert set(all_rows[0]) == {
        "ts", "txHash", "blockNumber", "payer", "personId", "merchant", "zoneId",
        "amount", "useCredit", "boost", "tier", "pendingId",
    }
    assert [r["txHash"] for r in db.list_payments(conn, merchant=MERCHANT1)] == ["0x02", "0x01"]
    assert [r["txHash"] for r in db.list_payments(conn, payer=PAYER1.upper().replace("0X", "0x"))] == ["0x03", "0x01"]
    assert [r["txHash"] for r in db.list_payments(conn, merchant=MERCHANT1, payer=PAYER1)] == ["0x01"]
    assert len(db.list_payments(conn, limit=1)) == 1


def test_risk_log_roundtrip(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    db.insert_risk_log(conn, 1, PAYER1, MERCHANT1, 10000, 1, 0.6, ["backflow"], 12345)
    db.insert_risk_log(conn, 2, PAYER1, MERCHANT1, 20000, 0, 0.0, [], 999)
    rows = db.list_risk_log(conn, 50)
    assert rows[0]["amount"] == 20000 and rows[0]["reasons"] == []
    assert rows[1]["tier"] == 1 and rows[1]["reasons"] == ["backflow"] and rows[1]["score"] == 0.6


def test_api_payments_and_risk_log(app_client):
    r = app_client.post("/attest", json={"payer": PAYER1, "merchant": MERCHANT1, "amount": 10000})
    assert r.status_code == 200
    log = app_client.get("/risk/log?limit=1").json()
    assert len(log) == 1 and log[0]["payer"] == PAYER1.lower() and log[0]["tier"] == 0
    assert app_client.get("/payments?limit=5").json() == []
    assert app_client.get("/health").json()["lastBlock"] is None
