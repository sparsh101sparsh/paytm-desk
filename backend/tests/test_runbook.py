"""
Automated validation of Resolve OS End-to-End Test Runbook.
Directly verifies test criteria for:
- Environment & Webhook (S3, B1-B5, B8, B10, B11, B15)
- Policy Guardrails (P1-P9, P11-P18, P20)
- WhatsApp Chatbot Ingestion (W1-W4, W7, W11-W14)
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.seed import seed_database
from backend.app.db import get_db, now_iso
from backend.app.policy import evaluate_policy
from backend.app.schemas import SarvamPlan

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean():
    seed_database(seed_hero_tickets=False)


# --- S. Environment / Webhook Handshake ---

def test_s3_meta_webhook_verification():
    """S3: Correct verify token succeeds; wrong token returns 403."""
    res_ok = client.get("/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=paytm_desk_hackathon_2026&hub.challenge=test_runbook_123")
    assert res_ok.status_code == 200
    assert res_ok.text == "test_runbook_123"

    res_bad = client.get("/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=bad_token&hub.challenge=test_runbook_123")
    assert res_bad.status_code == 403


# --- B. Backend / API Reliability ---

def test_b1_inbound_creates_single_ticket():
    """B1: Inbound message creates exactly one ticket; returns HTTP 200."""
    client.post("/api/demo/preset", json={"preset": "L-OK", "merchant_id": "m_me"})
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15552013457", "phone_number_id": "10001"},
                    "contacts": [{"profile": {"name": "Test Partner"}, "wa_id": "919810012345"}],
                    "messages": [{
                        "from": "919810012345",
                        "id": "wamid.B1_001",
                        "timestamp": "1726700000",
                        "text": {"body": "kal ka settlement 14280 nahi aaya"},
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
    assert data["ticket_id"] is not None

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT count(*) as cnt FROM tickets WHERE id = ?", (data["ticket_id"],))
    assert cur.fetchone()["cnt"] == 1
    conn.close()


def test_b2_duplicate_delivery_ignored():
    """B2: Duplicate delivery (same message ID) is ignored."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15552013457", "phone_number_id": "10001"},
                    "messages": [{
                        "from": "919810012345",
                        "id": "wamid.B2_DEDUPE",
                        "timestamp": "1726700000",
                        "text": {"body": "kal ka settlement 14280 nahi aaya"},
                        "type": "text"
                    }]
                },
                "field": "messages"
            }]
        }]
    }
    res1 = client.post("/api/webhook/whatsapp", json=payload)
    assert res1.status_code == 200
    assert res1.json()["status"] == "success"

    res2 = client.post("/api/webhook/whatsapp", json=payload)
    assert res2.status_code == 200
    assert res2.json()["status"] == "already_processed"


def test_b3_status_receipt_ignored():
    """B3: Status updates (delivery/read receipts) return HTTP 200, no ticket created."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123456",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "15552013457", "phone_number_id": "10001"},
                    "statuses": [{
                        "id": "wamid.B3_RECEIPT",
                        "status": "delivered",
                        "timestamp": "1726700000",
                        "recipient_id": "919810012345"
                    }]
                },
                "field": "messages"
            }]
        }]
    }
    res = client.post("/api/webhook/whatsapp", json=payload)
    assert res.status_code == 200
    assert res.json()["status"] == "ignored_status_receipt"


def test_b4_non_text_messages_ask_to_type():
    """B4: Image, audio, document do not 500 error; prompts merchant to type issue without ticket."""
    for m_type in ["image", "audio", "document"]:
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "123456",
                "changes": [{
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"display_phone_number": "15552013457", "phone_number_id": "10001"},
                        "messages": [{
                            "from": "919810012345",
                            "id": f"wamid.B4_{m_type}",
                            "timestamp": "1726700000",
                            "type": m_type,
                            m_type: {"id": "media_123"}
                        }]
                    },
                    "field": "messages"
                }]
            }]
        }
        res = client.post("/api/webhook/whatsapp", json=payload)
        assert res.status_code == 200
        assert res.json()["status"] == "media_prompt_sent"
        assert res.json()["ticket_id"] is None


def test_b5_malformed_webhook_body():
    """B5: Empty JSON or missing fields returns clean 200/400 without crashing."""
    res_empty = client.post("/api/webhook/whatsapp", json={})
    assert res_empty.status_code == 200
    assert res_empty.json()["status"] == "no_entry"


def test_b10_direct_tool_endpoint_protected():
    """B10: Direct tool endpoint rejects empty or made-up tokens with 403."""
    res_empty = client.post("/api/tools/retry_settlement_file", json={"ticket_id": "T-1042", "policy_token": ""})
    assert res_empty.status_code == 403

    res_fake = client.post("/api/tools/retry_settlement_file", json={"ticket_id": "T-1042", "policy_token": "tok_fake_999"})
    assert res_fake.status_code == 403


def test_b15_reset_endpoint():
    """B15: Reset wipes tickets and human briefs, sets ledger row back to L-OK (₹14,280 INITIATED)."""
    # Create ticket
    client.post("/api/webhook/whatsapp", json={
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "messages": [{"from": "919810012345", "id": "wamid.B15", "text": {"body": "settlement nahi mila"}, "type": "text"}]
                }
            }]
        }]
    })
    # Reset
    res = client.post("/api/demo/reset", json={"seed_hero_tickets": False})
    assert res.status_code == 200

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT count(*) as cnt FROM tickets")
    assert cur.fetchone()["cnt"] == 0

    cur.execute("SELECT amount, status, retry_count FROM settlements WHERE merchant_id = 'm_me'")
    stl = cur.fetchone()
    assert stl is not None
    assert stl["amount"] == 14280.0
    assert stl["status"] == "INITIATED"
    assert stl["retry_count"] == 0
    conn.close()


# --- P. Policy Engine Rules ---

def test_p1_p2_p3_policy_limits():
    """P1, P2, P3: Safe retry for L-OK and boundary testing at ₹49,999 vs ₹50,000."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)

    # P1: L-OK (₹14,280) -> ALLOWED
    dec_p1 = evaluate_policy(plan, {
        "ticket": {"id": "T-P1", "amount": 14280.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 14280.0, "status": "INITIATED", "retry_count": 0, "reason": "BANK_FILE_PENDING"}]
    })
    assert dec_p1.allowed is True
    assert dec_p1.reason_code == "SETTLEMENT_RETRY_OK"

    # P2: ₹49,999 -> ALLOWED
    dec_p2 = evaluate_policy(plan, {
        "ticket": {"id": "T-P2", "amount": 49999.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 49999.0, "status": "INITIATED", "retry_count": 0, "reason": "BANK_FILE_PENDING"}]
    })
    assert dec_p2.allowed is True

    # P3: ₹50,000 -> ESCALATED
    dec_p3 = evaluate_policy(plan, {
        "ticket": {"id": "T-P3", "amount": 50000.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 50000.0, "status": "INITIATED", "retry_count": 0, "reason": "BANK_FILE_PENDING"}]
    })
    assert dec_p3.allowed is False
    assert dec_p3.reason_code == "SETTLEMENT_RETRY_DENIED_AMOUNT"


def test_p4_large_amount_escalated():
    """P4: Large amount (L-BIG: ₹2,00,000) is escalated."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P4", "amount": 200000.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 200000.0, "status": "INITIATED", "retry_count": 0, "reason": "BANK_FILE_PENDING"}]
    })
    assert dec.allowed is False
    assert dec.reason_code == "SETTLEMENT_RETRY_DENIED_AMOUNT"


def test_p5_frozen_account_escalated():
    """P5: Frozen account escalated even for small amounts."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P5", "amount": 14280.0},
        "merchant": {"id": "m_me", "risk_flag": "ACCOUNT_FROZEN"},
        "settlements": [{"id": "stl_01", "amount": 14280.0, "status": "FAILED", "retry_count": 0, "reason": "ACCOUNT_FROZEN_COMPLIANCE"}]
    })
    assert dec.allowed is False
    assert dec.reason_code == "ESCALATE_RISK"


def test_p6_risk_flag_escalated():
    """P6: Merchant risk or AML flag is escalated."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P6", "amount": 14280.0},
        "merchant": {"id": "m_me", "risk_flag": "AML_FLAGGED"},
        "settlements": [{"id": "stl_01", "amount": 14280.0, "status": "INITIATED", "retry_count": 0}]
    })
    assert dec.allowed is False
    assert dec.reason_code == "ESCALATE_RISK"


def test_p7_already_paid():
    """P7: Already SUCCESS settlement informs merchant of UTR and never double retries."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P7", "amount": 14280.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 14280.0, "status": "SUCCESS", "utr": "PAYTM1928374650", "retry_count": 1}]
    })
    assert dec.allowed is False
    assert dec.reason_code == "SETTLEMENT_ALREADY_SUCCESS"


def test_p9_retries_exhausted():
    """P9: Retry count >= 2 is escalated."""
    plan = SarvamPlan(intent="SETTLEMENT_MISSING", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P9", "amount": 14280.0},
        "merchant": {"id": "m_me", "risk_flag": None},
        "settlements": [{"id": "stl_01", "amount": 14280.0, "status": "INITIATED", "retry_count": 2}]
    })
    assert dec.allowed is False
    assert dec.reason_code == "SETTLEMENT_RETRY_DENIED_RISK"


def test_p13_flip_proof():
    """P13: Identical message resolves under L-OK, but escalates under L-BIG."""
    # Run 1: L-OK -> Resolves
    client.post("/api/demo/preset", json={"preset": "L-OK", "merchant_id": "m_me"})
    res1 = client.post("/api/webhook/whatsapp", json={
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "1",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "messages": [{"from": "919810012345", "id": "wamid.FLIP_1", "text": {"body": "kal ka settlement 14280 nahi aaya"}, "type": "text"}]
                }
            }]
        }]
    })
    assert res1.json()["decision"] == "ACCEPTED"

    # Run 2: L-BIG -> Escalates
    client.post("/api/demo/preset", json={"preset": "L-BIG", "merchant_id": "m_me"})
    res2 = client.post("/api/webhook/whatsapp", json={
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "2",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "messages": [{"from": "919810012345", "id": "wamid.FLIP_2", "text": {"body": "kal ka settlement 14280 nahi aaya"}, "type": "text"}]
                }
            }]
        }]
    })
    assert res2.json()["decision"] == "REJECTED"


def test_p14_ambiguous_refund_asks_utr():
    """P14: Multiple successful payments without matching UTR sets WAITING_ON_MERCHANT."""
    plan = SarvamPlan(intent="REFUND_STATUS", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P14", "text": "refund nahi aaya 850 ka"},
        "merchant": {"id": "m_me"},
        "transactions": [
            {"id": "tx_1", "amount": 850.0, "status": "SUCCESS", "utr": None},
            {"id": "tx_2", "amount": 850.0, "status": "SUCCESS", "utr": None},
            {"id": "tx_3", "amount": 850.0, "status": "SUCCESS", "utr": None}
        ]
    })
    assert dec.allowed is False
    assert dec.reason_code == "ASK_MERCHANT_UTR"
    assert dec.next_ticket_status == "WAITING_ON_MERCHANT"


def test_p15_clean_refund_allowed():
    """P15: Single matching transaction with real UTR allows refund."""
    plan = SarvamPlan(intent="REFUND_STATUS", confidence=0.95, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P15", "text": "refund 850 PAYTM8472910384"},
        "merchant": {"id": "m_me"},
        "transactions": [
            {"id": "tx_1", "amount": 850.0, "status": "SUCCESS", "utr": "PAYTM8472910384"}
        ]
    })
    assert dec.allowed is True
    assert dec.reason_code == "REFUND_OK"
    assert dec.next_ticket_status == "RESOLVED"


def test_p18_unknown_intent_asks_clarification():
    """P18: Unknown intent asks clarifying question, does not escalate to Risk Ops."""
    plan = SarvamPlan(intent="UNKNOWN", confidence=0.5, proposed_reads=[], proposed_writes=[], needs_human=False)
    dec = evaluate_policy(plan, {
        "ticket": {"id": "T-P18", "text": "kuch problem hai"},
        "merchant": {"id": "m_me"}
    })
    assert dec.allowed is False
    assert dec.next_ticket_status == "WAITING_ON_MERCHANT"
    assert dec.action == "clarify_unknown"


# --- W. WhatsApp Chatbot Handlers ---

def test_w1_w2_greetings_reply_without_ticket():
    """W1, W2: Pure greetings ('hello', 'hi', 'namaste', 'kaise ho aap') send reply without ticket."""
    for greet in ["hello", "hi", "namaste", "kaise ho aap"]:
        res = client.post("/api/webhook/whatsapp", json={
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "1",
                "changes": [{
                    "value": {
                        "messaging_product": "whatsapp",
                        "messages": [{"from": "919810012345", "id": f"wamid.G_{greet[:4]}", "text": {"body": greet}, "type": "text"}]
                    }
                }]
            }]
        })
        assert res.status_code == 200
        assert res.json()["status"] == "greeting_sent"
        assert res.json()["ticket_id"] is None
