import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db import get_db, now_iso
from backend.app.seed import seed_database

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean_db():
    seed_database(seed_hero_tickets=True)

def test_token_replay_protection():
    """Point 22: Verify that a policy token cannot be replayed twice."""
    # Run T-1042 once to issue a token and execute
    res = client.post("/api/tickets/T-1042/run")
    assert res.status_code == 200

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT policy_token FROM audit_events WHERE ticket_id = 'T-1042' AND type = 'DECIDED' ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    assert row is not None
    token = row["policy_token"]
    conn.close()

    # Attempting to call /api/tools/retry_settlement_file directly with this already-consumed token must fail with 409
    replay_res = client.post(
        "/api/tools/retry_settlement_file",
        json={"ticket_id": "T-1042", "policy_token": token, "batch_id": "stl_7781"}
    )
    assert replay_res.status_code == 409
    assert "already consumed" in replay_res.json()["detail"]

def test_refund_db_insertion_and_audit():
    """Point 21: Verify request_refund properly inserts into refunds table and logs POLICY_ENGINE audit."""
    conn = get_db()
    cur = conn.cursor()
    # Create ticket for refund
    cur.execute("INSERT INTO tickets (id, merchant_id, text, channel, status, amount, priority, created_at) VALUES ('T-REF-1', 'm_me', 'Customer refund 500', 'WhatsApp', 'OPEN', 500.0, 'HIGH', ?)", (now_iso(),))
    # Fake a DECIDED event with token
    fake_token = "tok_test_refund_123"
    cur.execute("INSERT INTO audit_events (ticket_id, ts, actor, type, payload_json, reason_code, policy_token, latency_ms) VALUES ('T-REF-1', ?, 'POLICY_ENGINE', 'DECIDED', '{}', 'REFUND_ELIGIBLE', ?, 50)", (now_iso(), fake_token))
    conn.commit()
    conn.close()

    # Execute refund tool
    res = client.post(
        "/api/tools/request_refund",
        json={"ticket_id": "T-REF-1", "policy_token": fake_token, "amount": 500.0}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"

    # Verify refunds table has row
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM refunds WHERE ticket_id = 'T-REF-1'")
    ref_row = cur.fetchone()
    assert ref_row is not None
    assert ref_row["amount"] == 500.0
    assert ref_row["status"] == "SUCCESS"

    # Verify audit event has ACTED from POLICY_ENGINE
    cur.execute("SELECT * FROM audit_events WHERE ticket_id = 'T-REF-1' AND type = 'ACTED'")
    audit_row = cur.fetchone()
    assert audit_row is not None
    assert audit_row["actor"] == "POLICY_ENGINE"
    conn.close()

def test_no_fake_settlement_injected_on_whatsapp():
    """Points 5, 14: Verify incoming complaint text doesn't invent a ₹12,000 settlement batch in the ledger."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM settlements WHERE merchant_id = 'm_me'")
    conn.commit()
    conn.close()

    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456789",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15550234567", "phone_number_id": "10001"},
                    "contacts": [{"profile": {"name": "Sparsh"}, "wa_id": "919876543210"}],
                    "messages": [{
                        "from": "919876543210",
                        "id": "wamid.NO_FAKE_STL_01",
                        "timestamp": "1726700000",
                        "text": {"body": "mera 5000 ka settlement nahi aaya"},
                        "type": "text"
                    }]
                },
                "field": "messages"
            }]
        }]
    }

    res = client.post("/api/webhook/whatsapp", json=payload)
    assert res.status_code == 200

    conn = get_db()
    cur = conn.cursor()
    # Settlements must still be empty for m_me; ledger was NOT fabricated!
    cur.execute("SELECT * FROM settlements WHERE merchant_id = 'm_me'")
    rows = cur.fetchall()
    assert len(rows) == 0

    # But the ticket was created honestly
    cur.execute("SELECT * FROM tickets WHERE id = ?", (res.json()["ticket_id"],))
    t = cur.fetchone()
    assert t is not None
    assert t["amount"] == 5000.0
    conn.close()
