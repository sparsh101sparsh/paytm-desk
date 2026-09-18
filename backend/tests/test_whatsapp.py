"""
Unit tests for Meta WhatsApp Cloud API Webhook integration.
Verifies GET verification challenge and POST message ingestion + automated policy run.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.seed import seed_database
from backend.app.db import get_db

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
    assert data["decision"] == "RESOLVED"
    assert data["reason_code"] == "SETTLEMENT_RETRY_OK"
    assert data["sender_phone"] == "919876543210"

    # Check ticket created in SQLite
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
    assert data["status"] == "success"
    assert data["decision"] == "RESOLVED"
    assert data["reason_code"] == "GREETING_ACK"

    # Check merchant Sparsh was created dynamically and NOT Sharma Kirana
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tickets WHERE id = ?", (data["ticket_id"],))
    ticket = cur.fetchone()
    assert ticket["merchant_id"] != "m_2041"
    cur.execute("SELECT name FROM merchants WHERE id = ?", (ticket["merchant_id"],))
    merchant = cur.fetchone()
    assert merchant["name"] == "Sparsh Singh"
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
    assert data["decision"] == "RESOLVED"
    assert data["reason_code"] == "SETTLEMENT_RETRY_OK"

    # Verify settlement batch amount was updated to ₹12,000 and status is SUCCESS
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT amount, status, utr FROM settlements WHERE merchant_id = 'm_me'")
    settlement = cur.fetchone()
    assert settlement is not None
    assert settlement["amount"] == 12000.0
    assert settlement["status"] == "SUCCESS"
    assert settlement["utr"] is not None
    conn.close()

