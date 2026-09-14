"""
Scenario integration tests for DESK.
Tests the 3 hero scenarios end-to-end against real SQLite DB.
Verifies dynamic state-based execution: editing settlement amount to 60,000 blocks retry.
"""
import pytest
import sqlite3
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.seed import seed_database
from backend.app.db import get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean_db():
    seed_database()

def test_scenario_t1042_autoclose():
    # 1. Run T-1042
    res = client.post("/api/tickets/T-1042/run")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "RESOLVED"
    assert data["reason_code"] == "SETTLEMENT_RETRY_OK"
    assert "n8n_exec_" in data["n8n_execution_id"]

    # 2. Inspect SQLite
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT status, n8n_execution_id FROM tickets WHERE id = 'T-1042'")
    ticket = cur.fetchone()
    assert ticket["status"] == "RESOLVED"
    assert ticket["n8n_execution_id"] is not None

    cur.execute("SELECT status, utr, retry_count FROM settlements WHERE id = 'stl_7781'")
    settlement = cur.fetchone()
    assert settlement["status"] == "SUCCESS"
    assert settlement["utr"] is not None and "PAYTM" in settlement["utr"]
    assert settlement["retry_count"] == 1

    cur.execute("SELECT template_id, body FROM whatsapp_messages WHERE ticket_id = 'T-1042'")
    msg = cur.fetchone()
    assert msg is not None
    assert msg["template_id"] == "settlement_retry_sent"
    assert "stl_7781" in msg["body"]

    cur.execute("SELECT count(*) as cnt FROM audit_events WHERE ticket_id = 'T-1042'")
    assert cur.fetchone()["cnt"] >= 4

    conn.close()

def test_scenario_t1048_ask_merchant_utr():
    # 1. Run T-1048
    res = client.post("/api/tickets/T-1048/run")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "WAITING_ON_MERCHANT"
    assert data["reason_code"] == "ASK_MERCHANT_UTR"

    # 2. Inspect SQLite
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT status FROM tickets WHERE id = 'T-1048'")
    assert cur.fetchone()["status"] == "WAITING_ON_MERCHANT"

    cur.execute("SELECT template_id, body FROM whatsapp_messages WHERE ticket_id = 'T-1048'")
    msg = cur.fetchone()
    assert msg is not None
    assert msg["template_id"] == "ask_utr"
    assert "UTR" in msg["body"]

    conn.close()

def test_scenario_t1055_escalate_risk():
    # 1. Run T-1055
    res = client.post("/api/tickets/T-1055/run")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ESCALATED"
    assert data["reason_code"] == "ESCALATE_RISK"

    # 2. Inspect SQLite
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT status FROM tickets WHERE id = 'T-1055'")
    assert cur.fetchone()["status"] == "ESCALATED"

    # Verify settlement was NOT retried
    cur.execute("SELECT status, retry_count FROM settlements WHERE id = 'stl_9902'")
    settlement = cur.fetchone()
    assert settlement["status"] == "FAILED"
    assert settlement["retry_count"] == 0

    # Verify human brief exists
    cur.execute("SELECT queue, brief_text FROM human_briefs WHERE ticket_id = 'T-1055'")
    brief = cur.fetchone()
    assert brief is not None
    assert brief["queue"] == "RISK_OPS"
    assert "184,000" in brief["brief_text"]
    assert "Delhi Electronics" in brief["brief_text"]

    conn.close()

def test_mutation_amount_blocks_retry():
    """
    Crucial anti-hardcoding test from BUILD-PROMPT.md:
    Mutate T-1042 settlement amount to 60,000 in SQLite.
    Run on a fresh OPEN state.
    Assert NO auto-retry, settlement stays unchanged, and ticket escalates.
    """
    conn = get_db()
    conn.execute("UPDATE settlements SET amount = 60000.0, status = 'INITIATED', retry_count = 0 WHERE id = 'stl_7781'")
    conn.execute("UPDATE tickets SET status = 'OPEN', amount = 60000.0 WHERE id = 'T-1042'")
    conn.commit()
    conn.close()

    res = client.post("/api/tickets/T-1042/run")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "ESCALATED"
    assert data["reason_code"] == "SETTLEMENT_RETRY_DENIED_AMOUNT"

    # Settlement must NOT be retried
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT status, retry_count FROM settlements WHERE id = 'stl_7781'")
    s = cur.fetchone()
    assert s["status"] == "INITIATED"
    assert s["retry_count"] == 0
    conn.close()
