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
    health = app_client.get("/health").json()
    assert health["lastBlock"] is None
    assert health["model"] is False


def _transfer(tx: str, idx: int = 0, **kw):
    row = {
        "tx_hash": tx,
        "log_index": idx,
        "block": 10,
        "ts": 1_000_000,
        "from_addr": PAYER1,
        "to_addr": MERCHANT1,
        "amount": 10000,
    }
    row.update(kw)
    return row


def test_list_transfers_filters_and_order(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    bank = "0x" + "bb" * 20
    sink = "0x000000000000000000000000000000000000dEaD"
    db.insert_transfer(conn, _transfer("0x01", block=1))  # payer -> merchant (payment)
    db.insert_transfer(conn, _transfer("0x02", block=2, from_addr=MERCHANT1, to_addr=bank))  # settlement request
    db.insert_transfer(conn, _transfer("0x03", block=3, from_addr=bank, to_addr=sink))  # payout
    db.insert_transfer(conn, _transfer("0x03", idx=1, block=3, from_addr=bank, to_addr=sink, amount=5))
    conn.commit()

    rows = db.list_transfers(conn)
    assert [(r["txHash"], r["amount"]) for r in rows] == [("0x03", 5), ("0x03", 10000), ("0x02", 10000), ("0x01", 10000)]
    assert set(rows[0]) == {"ts", "txHash", "blockNumber", "from", "to", "amount"}
    assert rows[0]["from"] == bank and rows[0]["to"] == sink.lower() and rows[0]["blockNumber"] == 3
    assert [r["txHash"] for r in db.list_transfers(conn, to_addr=bank.upper().replace("0X", "0x"))] == ["0x02"]
    assert [r["txHash"] for r in db.list_transfers(conn, from_addr=bank, to_addr=sink)] == ["0x03", "0x03"]
    assert db.list_transfers(conn, from_addr=bank, to_addr=MERCHANT1) == []
    assert len(db.list_transfers(conn, limit=1)) == 1


def test_api_transfers(app_client):
    from engine import main

    sink = "0x000000000000000000000000000000000000dEaD"
    assert app_client.get("/transfers").json() == []
    db.insert_transfer(main.state.conn, _transfer("0x0a", block=1, from_addr=MERCHANT1, to_addr=sink))
    db.insert_transfer(main.state.conn, _transfer("0x0b", block=2))
    main.state.conn.commit()

    rows = app_client.get("/transfers?limit=5").json()
    assert [r["txHash"] for r in rows] == ["0x0b", "0x0a"]
    assert rows[1] == {"ts": 1_000_000, "txHash": "0x0a", "blockNumber": 1, "from": MERCHANT1.lower(), "to": sink.lower(), "amount": 10000}
    assert [r["txHash"] for r in app_client.get(f"/transfers?to={sink.upper().replace('0X', '0x')}").json()] == ["0x0a"]
    assert [r["txHash"] for r in app_client.get(f"/transfers?from={PAYER1}").json()] == ["0x0b"]
    assert app_client.get(f"/transfers?from={PAYER1}&to={sink}").json() == []
    assert app_client.get("/transfers?limit=0").status_code == 422
    assert app_client.get("/transfers?limit=501").status_code == 422
