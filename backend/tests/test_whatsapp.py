"""
Unit tests for Meta WhatsApp Cloud API Webhook integration.
Verifies GET verification challenge and POST message ingestion + automated policy run.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.seed import seed_database
from backend.app.db import get_db, now_iso

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean():
    seed_database()

def test_meta_whatsapp_verification():
    # 1. Success verification
    res = client.get("/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=paytm_desk_hackathon_2026&hub.challenge=1122334455")
    assert res.status_code == 200
    assert res.text == "1122334455"

    # 2. Failed verification (wrong token)
    res_bad = client.get("/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1122334455")
    assert res_bad.status_code == 403

def test_meta_whatsapp_incoming_message():
    meta_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123456789",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550234567",
                                "phone_number_id": "10001"
                            },
                            "messages": [
                                {
                                    "from": "919876543210",
                                    "id": "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgWM0VCMDFGMzM4",
                                    "timestamp": "1726700000",
                                    "text": {
                                        "body": "Kal ka settlement nahi aaya 14280"
                                    },
                                    "type": "text"
                                }
                            ]
                        },
                        "field": "messages"
                    }
                ]
            }
        ]
    }

    res = client.post("/api/webhook/whatsapp", json=meta_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["ticket_id"] is not None
    assert data["sender_phone"] == "919876543210"

    # Check ticket created and processed to RESOLVED in SQLite via BackgroundTasks
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tickets WHERE id = ?", (data["ticket_id"],))
    ticket = cur.fetchone()
    assert ticket is not None
    assert ticket["channel"] == "WhatsApp"
    assert ticket["status"] == "RESOLVED"
    conn.close()


def test_meta_whatsapp_greeting_message():
    greeting_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123456789",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550234567",
                                "phone_number_id": "10001"
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Sparsh Singh"},
                                    "wa_id": "919988776655"
                                }
                            ],
                            "messages": [
                                {
                                    "from": "919988776655",
                                    "id": "wamid.GREET_01",
                                    "timestamp": "1726700000",
                                    "text": {
                                        "body": "hello kaise ho aap"
                                    },
                                    "type": "text"
                                }
                            ]
                        },
                        "field": "messages"
                    }
                ]
            }
        ]
    }

    res = client.post("/api/webhook/whatsapp", json=greeting_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "greeting_sent"
    assert data["ticket_id"] is None
    assert "Namaste" in data["reply"]

    # Check that NO ticket was inserted in SQLite for pure greeting
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT count(*) as cnt FROM tickets WHERE text LIKE '%hello kaise ho aap%'")
    assert cur.fetchone()["cnt"] == 0
    conn.close()


def test_meta_whatsapp_payment_not_received_hinglish():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "123456789",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550234567",
                                "phone_number_id": "10001"
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Sparsh"},
                                    "wa_id": "919876543210"
                                }
                            ],
                            "messages": [
                                {
                                    "from": "919876543210",
                                    "id": "wamid.PAY12K_01",
                                    "timestamp": "1726700000",
                                    "text": {
                                        "body": "mera 12000 k payment phasa hua h aaya nai aaj aajana chaiye tha"
                                    },
                                    "type": "text"
                                }
                            ]
                        },
                        "field": "messages"
                    }
                ]
            }
        ]
    }

    res = client.post("/api/webhook/whatsapp", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["ticket_id"] is not None

    # Verify ticket was resolved in SQLite
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT status FROM tickets WHERE id = ?", (data["ticket_id"],))
    t = cur.fetchone()
    assert t is not None
    assert t["status"] == "RESOLVED"

    # Verify settlement batch amount was updated to ₹12,000 and status is SUCCESS
    cur.execute("SELECT amount, status, utr FROM settlements WHERE merchant_id = 'm_me' AND amount = 12000.0")
    settlement = cur.fetchone()
    assert settlement is not None
    assert settlement["status"] == "SUCCESS"
    assert settlement["utr"] is not None
    conn.close()


def test_meta_whatsapp_deduplication():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456789",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15550234567", "phone_number_id": "10001"},
                    "messages": [{
                        "from": "919876543210",
                        "id": "wamid.DEDUPE_TEST_999",
                        "timestamp": "1726700000",
                        "text": {"body": "mera settlement nahi aaya 12000"},
                        "type": "text"
                    }]
                },
                "field": "messages"
            }]
        }]
    }

    # First delivery -> Accepted
    res1 = client.post("/api/webhook/whatsapp", json=payload)
    assert res1.status_code == 200
    assert res1.json()["status"] == "success"

    # Second delivery (same wamid) -> Ignored as already_processed
    res2 = client.post("/api/webhook/whatsapp", json=payload)
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_processed"
    assert res2.json()["msg_id"] == "wamid.DEDUPE_TEST_999"


def test_meta_whatsapp_already_settled_no_risk_ops():
    # Inquire about ₹14,280 which is already SUCCESS in seeded DB
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456789",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15550234567", "phone_number_id": "10001"},
                    "messages": [{
                        "from": "919810012345",
                        "id": "wamid.SUCCESS_TEST_01",
                        "timestamp": "1726700000",
                        "text": {"body": "mera 14280 ka settlement check karo"},
                        "type": "text"
                    }]
                },
                "field": "messages"
            }]
        }]
    }

    res = client.post("/api/webhook/whatsapp", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT status FROM tickets WHERE id = ?", (data["ticket_id"],))
    ticket = cur.fetchone()
    # Must be RESOLVED, NOT ESCALATED to Risk Ops!
    assert ticket["status"] == "RESOLVED"

    # Verify outbound WhatsApp message confirms already SUCCESS with UTR
    cur.execute("SELECT template_id, body FROM whatsapp_messages WHERE ticket_id = ?", (data["ticket_id"],))
    wa_msg = cur.fetchone()
    assert wa_msg is not None
    assert wa_msg["template_id"] == "settlement_already_settled"
    assert "SUCCESS" in wa_msg["body"] or "pehle hi" in wa_msg["body"]
    conn.close()


def test_operator_approve_and_reject():
    conn = get_db()
    cur = conn.cursor()
    # Create an escalated ticket
    cur.execute("""
        INSERT INTO tickets (id, merchant_id, text, channel, status, amount, priority, created_at)
        VALUES ('T-ESC-01', 'm_me', 'Large amount settlement', 'WhatsApp', 'ESCALATED', 75000.0, 'HIGH', ?)
    """, (now_iso(),))
    conn.commit()

    # 1. Approve
    res_app = client.post("/api/tickets/T-ESC-01/approve")
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "approved"

    cur.execute("SELECT status FROM tickets WHERE id = 'T-ESC-01'")
    assert cur.fetchone()["status"] == "RESOLVED"

    # 2. Reject
    cur.execute("""
        INSERT INTO tickets (id, merchant_id, text, channel, status, amount, priority, created_at)
        VALUES ('T-ESC-02', 'm_me', 'Suspicious refund claim', 'WhatsApp', 'ESCALATED', 10000.0, 'HIGH', ?)
    """, (now_iso(),))
    conn.commit()

    res_rej = client.post("/api/tickets/T-ESC-02/reject")
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "rejected"

    cur.execute("SELECT status FROM tickets WHERE id = 'T-ESC-02'")
    assert cur.fetchone()["status"] == "CLOSED_REJECTED"
    conn.close()


def test_demo_bank_confirm_settlement():
    res = client.post("/api/demo/confirm-settlement")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["result"]["new_status"] == "SUCCESS"
    assert "PAYTM" in data["result"]["utr"]


