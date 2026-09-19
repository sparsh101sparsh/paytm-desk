"""
FastAPI application for Resolve OS — Merchant Support Teammate.
Merchant support operations engine.
"Sarvam proposes. Policy decides. Python acts. SQLite remembers."
"""
import os
import json
import uuid
import hmac
import hashlib
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx

from .db import get_db, now_iso, is_postgres
from .seed import seed_database
from .schemas import RunResponse, SarvamPlan, PolicyDecision
from .policy import evaluate_policy
from .planner import generate_plan, SARVAM_API_KEY
from .memory import search_memory, remember_outcome
from .tools import (
    log_audit,
    execute_retry_settlement_file,
    execute_confirm_settlement,
    execute_send_whatsapp,
    execute_update_ticket,
    execute_assign_human,
    send_meta_whatsapp_message
)

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "")

app = FastAPI(title="Resolve OS — Merchant Support Teammate", version="1.0.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
@app.get("/api/health")
def health():
    db_type = "postgres:supabase" if is_postgres() else "sqlite:local"
    db_err = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        conn.close()
    except Exception as e:
        db_err = f"{type(e).__name__}: {str(e)}"
    return {
        "status": "healthy" if not db_err else "degraded",
        "database": db_type,
        "database_error": db_err,
        "sarvam": "active" if SARVAM_API_KEY else "fixture_fallback",
        "whatsapp": "meta_cloud_api",
        "policy_engine": "active",
        "ledger_memory": "active"
    }

@app.post("/demo/reset")
@app.post("/api/demo/reset")
def reset_demo(body: Dict[str, Any] = None):
    body = body or {}
    seed_hero = bool(body.get("seed_hero_tickets", False))
    seed_database(seed_hero_tickets=seed_hero)
    return {"status": "ok", "message": "Demo reset: tickets cleared, test ledger initialized to L-OK (₹14,280 INITIATED)."}

@app.post("/demo/preset")
@app.post("/api/demo/preset")
def set_demo_preset(body: Dict[str, Any] = None):
    body = body or {}
    preset = body.get("preset", "L-OK").upper().strip()
    merchant_id = body.get("merchant_id")
    conn = get_db()
    cur = conn.cursor()
    if not merchant_id:
        cur.execute("SELECT merchant_id FROM tickets ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        merchant_id = row["merchant_id"] if row else "m_me"

    now_ts = now_iso()

    if preset == "L-OK":
        cur.execute("UPDATE merchants SET risk_flag = NULL WHERE id = ?", (merchant_id,))
        cur.execute("DELETE FROM settlements WHERE merchant_id = ?", (merchant_id,))
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES ('stl_me_01', ?, NULL, 14280.0, 'INITIATED', 'BANK_FILE_PENDING', NULL, 0, ?)
        """, (merchant_id, now_ts))
    elif preset == "L-PAID":
        cur.execute("UPDATE merchants SET risk_flag = NULL WHERE id = ?", (merchant_id,))
        cur.execute("DELETE FROM settlements WHERE merchant_id = ?", (merchant_id,))
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES ('stl_me_01', ?, NULL, 14280.0, 'SUCCESS', 'SETTLED_TO_BANK', 'PAYTM1928374650', 1, ?)
        """, (merchant_id, now_ts))
    elif preset == "L-BIG":
        cur.execute("UPDATE merchants SET risk_flag = NULL WHERE id = ?", (merchant_id,))
        cur.execute("DELETE FROM settlements WHERE merchant_id = ?", (merchant_id,))
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES ('stl_me_01', ?, NULL, 200000.0, 'INITIATED', 'BANK_FILE_PENDING', NULL, 0, ?)
        """, (merchant_id, now_ts))
    elif preset == "L-FROZEN":
        cur.execute("UPDATE merchants SET risk_flag = 'ACCOUNT_FROZEN' WHERE id = ?", (merchant_id,))
        cur.execute("DELETE FROM settlements WHERE merchant_id = ?", (merchant_id,))
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES ('stl_me_01', ?, NULL, 14280.0, 'FAILED', 'ACCOUNT_FROZEN_COMPLIANCE', NULL, 0, ?)
        """, (merchant_id, now_ts))
    elif preset == "L-RISK":
        cur.execute("UPDATE merchants SET risk_flag = 'AML_FLAGGED' WHERE id = ?", (merchant_id,))
        cur.execute("DELETE FROM settlements WHERE merchant_id = ?", (merchant_id,))
        cur.execute("""
            INSERT INTO settlements (id, merchant_id, ticket_id, amount, status, reason, utr, retry_count, created_at)
            VALUES ('stl_me_01', ?, NULL, 14280.0, 'INITIATED', 'BANK_FILE_PENDING', NULL, 0, ?)
        """, (merchant_id, now_ts))
    elif preset == "L-REFUND-AMBIG":
        cur.execute("DELETE FROM transactions WHERE merchant_id = ?", (merchant_id,))
        cur.execute("INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at) VALUES ('tx_me_01', ?, NULL, 850.0, 'SUCCESS', NULL, ?)", (merchant_id, now_ts))
        cur.execute("INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at) VALUES ('tx_me_02', ?, NULL, 850.0, 'SUCCESS', NULL, ?)", (merchant_id, now_ts))
        cur.execute("INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at) VALUES ('tx_me_03', ?, NULL, 850.0, 'SUCCESS', NULL, ?)", (merchant_id, now_ts))
    elif preset == "L-REFUND-OK":
        cur.execute("DELETE FROM transactions WHERE merchant_id = ?", (merchant_id,))
        cur.execute("INSERT INTO transactions (id, merchant_id, ticket_id, amount, status, utr, created_at) VALUES ('tx_me_01', ?, NULL, 850.0, 'SUCCESS', 'PAYTM8472910384', ?)", (merchant_id, now_ts))
    else:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Unknown preset: {preset}")

    conn.commit()
    conn.close()
    return {"status": "ok", "preset": preset, "merchant_id": merchant_id}


@app.post("/api/demo/set-amount")
def demo_set_amount(body: Dict[str, Any]):
    merchant_id = body.get("merchant_id")
    conn = get_db()
    cur = conn.cursor()
    if not merchant_id:
        cur.execute("SELECT merchant_id FROM tickets ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        merchant_id = row["merchant_id"] if row else "m_me"
    amount = float(body.get("amount", 200000.0))
    cur.execute("UPDATE settlements SET amount = ? WHERE merchant_id = ?", (amount, merchant_id))
    cur.execute("UPDATE tickets SET amount = ? WHERE merchant_id = ?", (amount, merchant_id))
    conn.commit()
    conn.close()
    return {"status": "ok", "merchant_id": merchant_id, "new_amount": amount}

@app.post("/api/demo/toggle-freeze")
def demo_toggle_freeze(body: Dict[str, Any]):
    merchant_id = body.get("merchant_id")
    conn = get_db()
    cur = conn.cursor()
    if not merchant_id:
        cur.execute("SELECT merchant_id FROM tickets ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        merchant_id = row["merchant_id"] if row else "m_me"
    cur.execute("SELECT risk_flag FROM merchants WHERE id = ?", (merchant_id,))
    row = cur.fetchone()
    current_flag = row["risk_flag"] if row else None
    if current_flag:
        new_flag = None
        new_stl_status = "INITIATED"
        new_stl_reason = "BANK_FILE_PENDING"
    else:
        new_flag = "AML_SUSPECT"
        new_stl_status = "FAILED"
        new_stl_reason = "ACCOUNT_FROZEN_AML"
    cur.execute("UPDATE merchants SET risk_flag = ? WHERE id = ?", (new_flag, merchant_id))
    cur.execute("SELECT id FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 1", (merchant_id,))
    latest_stl = cur.fetchone()
    if latest_stl:
        cur.execute("UPDATE settlements SET status = ?, reason = ? WHERE id = ?", (new_stl_status, new_stl_reason, latest_stl["id"]))
    conn.commit()
    conn.close()
    return {"status": "ok", "merchant_id": merchant_id, "risk_flag": new_flag, "settlement_status": new_stl_status}

@app.post("/api/demo/reset-merchant")
def demo_reset_merchant(body: Dict[str, Any]):
    merchant_id = body.get("merchant_id")
    conn = get_db()
    cur = conn.cursor()
    if not merchant_id:
        cur.execute("SELECT merchant_id FROM tickets ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        merchant_id = row["merchant_id"] if row else "m_me"
    cur.execute("UPDATE merchants SET risk_flag = NULL WHERE id = ?", (merchant_id,))
    cur.execute("UPDATE settlements SET amount = 14280.0, status = 'INITIATED', reason = 'BANK_FILE_PENDING', utr = NULL, retry_count = 0 WHERE merchant_id = ?", (merchant_id,))
    cur.execute("UPDATE tickets SET status = 'OPEN', amount = 14280.0 WHERE merchant_id = ?", (merchant_id,))
    cur.execute("DELETE FROM refunds WHERE ticket_id IN (SELECT id FROM tickets WHERE merchant_id = ?)", (merchant_id,))
    cur.execute("DELETE FROM human_briefs WHERE ticket_id IN (SELECT id FROM tickets WHERE merchant_id = ?)", (merchant_id,))
    cur.execute("DELETE FROM audit_events WHERE ticket_id IN (SELECT id FROM tickets WHERE merchant_id = ?)", (merchant_id,))
    cur.execute("DELETE FROM whatsapp_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE merchant_id = ?)", (merchant_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "merchant_id": merchant_id}

@app.get("/api/demo/ledger")
def get_demo_ledger(merchant_id: Optional[str] = None):
    conn = get_db()
    cur = conn.cursor()
    if not merchant_id:
        cur.execute("SELECT merchant_id FROM tickets ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        merchant_id = row["merchant_id"] if row else "m_me"
    cur.execute("SELECT * FROM merchants WHERE id = ?", (merchant_id,))
    merchant = cur.fetchone()
    cur.execute("SELECT * FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC", (merchant_id,))
    settlements = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {
        "merchant": dict(merchant) if merchant else None,
        "settlements": settlements
    }


@app.get("/api/tickets")
def get_tickets():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.*, m.name as merchant_name, m.phone as merchant_phone, m.city as merchant_city, m.category as merchant_category
        FROM tickets t
        LEFT JOIN merchants m ON t.merchant_id = m.id
        ORDER BY t.created_at DESC
    """)
    tickets = [dict(r) for r in cur.fetchall()]
    conn.close()
    return tickets

@app.get("/api/tickets/{ticket_id}")
def get_ticket_detail(ticket_id: str):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    ticket = cur.fetchone()
    if not ticket:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    cur.execute("SELECT * FROM merchants WHERE id = ?", (ticket["merchant_id"],))
    merchant = cur.fetchone()

    cur.execute("SELECT * FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    settlements = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    transactions = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM devices WHERE merchant_id = ?", (ticket["merchant_id"],))
    devices = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM whatsapp_messages WHERE ticket_id = ? ORDER BY id DESC LIMIT 1", (ticket_id,))
    whatsapp = cur.fetchone()

    cur.execute("SELECT * FROM human_briefs WHERE ticket_id = ? ORDER BY id DESC LIMIT 1", (ticket_id,))
    human_brief = cur.fetchone()

    conn.close()

    ticket_dict = dict(ticket)
    # Cognee memory chips
    memory_chips = search_memory(ticket["merchant_id"], ticket_dict.get("intent") or "")

    return {
        "ticket": ticket_dict,
        "merchant": dict(merchant) if merchant else None,
        "settlements": settlements,
        "transactions": transactions,
        "devices": devices,
        "latest_whatsapp": dict(whatsapp) if whatsapp else None,
        "human_brief": dict(human_brief) if human_brief else None,
        "memory_chips": memory_chips
    }

@app.get("/api/tickets/{ticket_id}/events")
def get_ticket_events(ticket_id: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM audit_events WHERE ticket_id = ? ORDER BY id ASC", (ticket_id,))
    events = []
    for r in cur.fetchall():
        d = dict(r)
        try:
            d["payload"] = json.loads(d["payload_json"])
        except Exception:
            d["payload"] = {}
        events.append(d)
    conn.close()
    return events

@app.post("/api/tickets/{ticket_id}/run", response_model=RunResponse)
def run_desk(ticket_id: str, request: Request = None, recipient_phone: Optional[str] = None):
    """
    Runs the full Resolve OS lifecycle:
    1. Check N8N_WEBHOOK_URL if external orchestrator is active
    2. Sarvam / Fixture planner (Intent & Plan proposal) -> Audit: UNDERSTOOD
    3. Ledger memory search -> Audit: RECALLED
    4. Deterministic Policy decision -> Audit: DECIDED
    5. Action execution of allowed tools -> Audit: ACTED / NOTIFIED
    6. Ledger outcome remember
    """
    # If N8N_WEBHOOK_URL is set and request didn't come from n8n itself, attempt webhook trigger
    if N8N_WEBHOOK_URL and request and request.headers.get("x-n8n-trigger") != "true":
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.post(
                    N8N_WEBHOOK_URL,
                    json={"ticket_id": ticket_id},
                    headers={"x-trigger-source": "desk-ui"}
                )
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, dict) and data.get("n8n_execution_id"):
                        return RunResponse(**data)
        except Exception:
            pass  # Fall back to in-process pipeline

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    ticket_row = cur.fetchone()
    if not ticket_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket = dict(ticket_row)

    cur.execute("SELECT * FROM merchants WHERE id = ?", (ticket["merchant_id"],))
    merchant_row = cur.fetchone()
    merchant = dict(merchant_row) if merchant_row else {}

    # Auto-resolve recipient phone if not explicitly provided
    if not recipient_phone:
        if merchant.get("phone"):
            recipient_phone = merchant["phone"]
        elif ticket.get("merchant_id", "").startswith("m_"):
            cand = "".join(filter(str.isdigit, ticket["merchant_id"]))
            if len(cand) >= 10:
                recipient_phone = cand

    cur.execute("SELECT * FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    settlements = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    transactions = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM devices WHERE merchant_id = ?", (ticket["merchant_id"],))
    devices = [dict(r) for r in cur.fetchall()]

    conn.close()

    db_state = {
        "ticket": ticket,
        "merchant": merchant,
        "settlements": settlements,
        "transactions": transactions,
        "devices": devices
    }

    # Generate an execution id for this run
    ros_exec_id = f"ros_exec_{uuid.uuid4().hex[:10]}"

    # 1. SARVAM Planner
    plan, planner_actor, planner_latency = generate_plan(db_state)
    conn_t = get_db()
    if plan.amount_mentioned and not ticket.get("amount"):
        conn_t.execute("UPDATE tickets SET intent = ?, amount = ? WHERE id = ?", (plan.intent, float(plan.amount_mentioned), ticket_id))
    else:
        conn_t.execute("UPDATE tickets SET intent = ? WHERE id = ?", (plan.intent, ticket_id))
    conn_t.commit()
    conn_t.close()

    log_audit(
        ticket_id=ticket_id,
        actor=planner_actor,
        event_type="UNDERSTOOD",
        payload={
            "intent": plan.intent,
            "confidence": plan.confidence,
            "summary_en": plan.summary_en,
            "summary_hi": plan.summary_hi,
            "proposed_writes": [w.model_dump() for w in plan.proposed_writes]
        },
        latency_ms=planner_latency
    )

    # 2. Ledger Memory Recall
    memory_chips = search_memory(merchant.get("id", ""), plan.intent)
    db_state["memory_risk_flags"] = [c["label"] for c in memory_chips if c["type"] == "RISK"]
    log_audit(
        ticket_id=ticket_id,
        actor="LEDGER_MEMORY",
        event_type="RECALLED",
        payload={
            "chips": memory_chips,
            "query": f"merchant {merchant.get('id')} {plan.intent}"
        },
        latency_ms=120
    )

    # 3. DETERMINISTIC POLICY DECISION (Pure Python rules - NO LLM)
    decision = evaluate_policy(plan, db_state)
    log_audit(
        ticket_id=ticket_id,
        actor="POLICY_ENGINE",
        event_type="DECIDED",
        payload={
            "allowed": decision.allowed,
            "action": decision.action,
            "explanation": decision.explanation,
            "next_status": decision.next_ticket_status,
            "token_id": decision.policy_token
        },
        reason_code=decision.reason_code,
        policy_token=decision.policy_token,
        latency_ms=45
    )

    # 4. ACTION RUNTIME
    if decision.action == "reply_greeting":
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="greeting_ack",
            variables={
                "merchant_name": merchant.get("name", "Merchant Partner"),
                "ticket_id": ticket_id
            },
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "RESOLVED", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "reply_greeting", "RESOLVED_GREETING")

    elif decision.action == "ask_clarification":
        amt = decision.args.get("amount", 0)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="ask_clarification",
            variables={
                "merchant_name": merchant.get("name", "Merchant"),
                "amount": f"{amt:,.0f}" if amt else "0",
                "ticket_id": ticket_id
            },
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "WAITING_ON_MERCHANT", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "ask_clarification", "WAITING_ON_MERCHANT")

    elif decision.action == "escalate_device":
        brief_info = {
            "merchant_name": merchant.get("name", "Unknown"),
            "merchant_id": merchant.get("id", ""),
            "amount": 0,
            "reason": "SOUNDBOX_DEVICE_OFFLINE",
            "checks": "Soundbox ping failed or announcement offline reported.",
            "not_done": "No financial retry or refund.",
            "recommendation": "Field Ops hardware inspection / replace Soundbox unit."
        }
        execute_assign_human(ticket_id, "FIELD_OPS", brief_info, decision.policy_token)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="escalate_device",
            variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "ESCALATED", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "escalate_device", "ESCALATED_FIELD_OPS")

    elif decision.action == "escalate_qr":
        brief_info = {
            "merchant_name": merchant.get("name", "Unknown"),
            "merchant_id": merchant.get("id", ""),
            "amount": 0,
            "reason": "QR_STANDEE_DAMAGED",
            "checks": "Merchant reported QR scanning failure or damaged standee.",
            "not_done": "No financial retry or refund.",
            "recommendation": "Logistics dispatch replacement Paytm QR standee kit."
        }
        execute_assign_human(ticket_id, "LOGISTICS", brief_info, decision.policy_token)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="escalate_qr",
            variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "ESCALATED", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "escalate_qr", "ESCALATED_LOGISTICS")

    elif decision.allowed and decision.action == "retry_settlement_file":
        batch_id = decision.args.get("batch_id")
        execute_retry_settlement_file(ticket_id, batch_id, decision.policy_token)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="settlement_retry_sent",
            variables={
                "merchant_name": merchant.get("name", "Merchant"),
                "batch_id": batch_id,
                "ticket_id": ticket_id
            },
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "RESOLVED", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "retry_settlement_file", "RESOLVED_SUCCESS")

    elif decision.action == "ask_merchant_utr":
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="ask_utr",
            variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
            recipient_phone=recipient_phone
        )
        execute_update_ticket(ticket_id, "WAITING_ON_MERCHANT", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "ask_merchant_utr", "WAITING_ON_MERCHANT")

    elif decision.allowed and decision.action == "request_refund":
        ref_id = f"ref_{uuid.uuid4().hex[:8]}"
        ref_amt = float(decision.args.get("amount", ticket.get("amount", 0.0) or 0.0))
        tx_id = decision.args.get("transaction_id") or (transactions[0]["id"] if transactions else None)
        conn_ref = get_db()
        conn_ref.execute(
            "INSERT INTO refunds (id, ticket_id, merchant_id, transaction_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)",
            (ref_id, ticket_id, merchant.get("id"), tx_id, ref_amt, now_iso())
        )
        conn_ref.commit()
        conn_ref.close()
        log_audit(
            ticket_id=ticket_id,
            actor="POLICY_ENGINE",
            event_type="ACTED",
            payload={"tool": "request_refund", "refund_id": ref_id, "amount": ref_amt, "transaction_id": tx_id},
            reason_code=decision.reason_code,
            policy_token=decision.policy_token,
            latency_ms=65
        )
        execute_update_ticket(ticket_id, "RESOLVED", decision.policy_token)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="refund_initiated",
            variables={
                "merchant_name": merchant.get("name", "Merchant"),
                "ticket_id": ticket_id,
                "amount": f"{ref_amt:,.0f}"
            },
            recipient_phone=recipient_phone
        )
        remember_outcome(ticket_id, merchant.get("id"), "request_refund", "REFUND_OK")

    elif decision.reason_code == "SETTLEMENT_ALREADY_SUCCESS":
        execute_update_ticket(ticket_id, "RESOLVED", decision.policy_token)
        batch_id = decision.args.get("batch_id", "batch")
        amt = decision.args.get("amount", 0)
        utr = decision.args.get("utr") or "PAYTM1928374650"
        if recipient_phone:
            execute_send_whatsapp(
                ticket_id=ticket_id,
                template_id="settlement_already_settled",
                variables={
                    "merchant_name": merchant.get("name", "Merchant"),
                    "batch_id": batch_id,
                    "amount": f"{amt:,.0f}",
                    "utr": utr,
                    "ticket_id": ticket_id
                },
                recipient_phone=recipient_phone
            )
        remember_outcome(ticket_id, merchant.get("id"), "inform_already_settled", "SETTLEMENT_ALREADY_SUCCESS")

    elif decision.reason_code == "ESCALATE_UNKNOWN_INTENT":
        execute_update_ticket(ticket_id, "WAITING_ON_MERCHANT", decision.policy_token)
        if recipient_phone:
            execute_send_whatsapp(
                ticket_id=ticket_id,
                template_id="clarify_unknown_intent",
                variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
                recipient_phone=recipient_phone
            )
        remember_outcome(ticket_id, merchant.get("id"), "clarify_unknown", "WAITING_ON_MERCHANT")

    elif decision.next_ticket_status == "ESCALATED":
        brief_info = {
            "merchant_name": merchant.get("name", "Unknown"),
            "merchant_id": merchant.get("id", ""),
            "amount": settlements[0].get("amount") if settlements else ticket.get("amount", 0),
            "reason": decision.reason_code,
            "checks": "Settlement verified in DB, risk/AML flag checked, automated retry blocked.",
            "not_done": "No funds moved, manual supervisor review required.",
            "recommendation": "Review merchant account and approve override or close ticket."
        }
        execute_assign_human(ticket_id, "RISK_OPS", brief_info, decision.policy_token)
        if recipient_phone:
            if decision.reason_code == "SETTLEMENT_NOT_FOUND":
                execute_send_whatsapp(
                    ticket_id=ticket_id,
                    template_id="settlement_not_found",
                    variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
                    recipient_phone=recipient_phone
                )
            else:
                execute_send_whatsapp(
                    ticket_id=ticket_id,
                    template_id="escalated_risk",
                    variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id},
                    recipient_phone=recipient_phone
                )
        remember_outcome(ticket_id, merchant.get("id"), "escalate_risk", "ESCALATED_RISK_OPS")

    # Update ticket with execution id
    conn = get_db()
    conn.execute("UPDATE tickets SET n8n_execution_id = ? WHERE id = ?", (ros_exec_id, ticket_id))
    cur = conn.cursor()
    cur.execute("SELECT status FROM tickets WHERE id = ?", (ticket_id,))
    final_status = cur.fetchone()["status"]
    cur.execute("SELECT count(*) as cnt FROM audit_events WHERE ticket_id = ?", (ticket_id,))
    events_count = cur.fetchone()["cnt"]
    conn.commit()
    conn.close()

    return RunResponse(
        ticket_id=ticket_id,
        status=final_status,
        reason_code=decision.reason_code,
        n8n_execution_id=ros_exec_id,
        events_count=events_count
    )

@app.post("/api/policy/decide", response_model=PolicyDecision)
def decide_policy(body: Dict[str, Any]):
    """
    Direct endpoint for n8n to call in-process policy evaluation.
    """
    plan = SarvamPlan(**body.get("plan", {}))
    db_state = body.get("db_state", {})
    return evaluate_policy(plan, db_state)

@app.post("/api/tools/{tool_name}")
def execute_tool(tool_name: str, body: Dict[str, Any]):
    """
    Direct endpoint for execution runtime to execute verified tools with policy tokens.
    SECURITY: Money-moving tools (retry_settlement_file, request_refund) require a
    valid policy_token that was genuinely issued by evaluate_policy() in this session,
    and single-use replay protection prevents reusing consumed tokens.
    """
    ticket_id = body.get("ticket_id", "")
    policy_token = body.get("policy_token", "")

    # SECURITY GATE: For money-moving tools, verify the policy_token was actually
    # issued by our policy engine (must exist in audit_events for this ticket).
    MONEY_TOOLS = {"retry_settlement_file", "request_refund"}
    if tool_name in MONEY_TOOLS:
        if not policy_token or not ticket_id:
            raise HTTPException(
                status_code=403,
                detail="Money-moving tools require a valid policy_token issued by evaluate_policy(). Use POST /api/tickets/{id}/run instead."
            )
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM audit_events WHERE ticket_id = ? AND policy_token = ? AND type = 'DECIDED'",
            (ticket_id, policy_token)
        )
        valid = cur.fetchone()
        if not valid:
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="policy_token not recognized. Token must be issued by evaluate_policy() for this ticket."
            )

        # Single-use check: has this token already been consumed by an ACTED event?
        cur.execute(
            "SELECT id FROM audit_events WHERE ticket_id = ? AND policy_token = ? AND type = 'ACTED'",
            (ticket_id, policy_token)
        )
        already_used = cur.fetchone()
        conn.close()
        if already_used:
            raise HTTPException(
                status_code=409,
                detail="policy_token already consumed. Replay rejected."
            )

    if tool_name == "retry_settlement_file":
        batch_id = body.get("batch_id") or body.get("args", {}).get("batch_id")
        return execute_retry_settlement_file(ticket_id, batch_id, policy_token)

    elif tool_name == "request_refund":
        ref_amt = body.get("amount") or body.get("args", {}).get("amount", 0.0)
        tx_id = body.get("transaction_id") or body.get("args", {}).get("transaction_id")
        ref_id = f"ref_{uuid.uuid4().hex[:8]}"
        conn_ref = get_db()
        cur_ref = conn_ref.cursor()
        cur_ref.execute("SELECT merchant_id FROM tickets WHERE id = ?", (ticket_id,))
        t_row = cur_ref.fetchone()
        m_id = t_row["merchant_id"] if t_row else None
        conn_ref.execute(
            "INSERT INTO refunds (id, ticket_id, merchant_id, transaction_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)",
            (ref_id, ticket_id, m_id, tx_id, float(ref_amt), now_iso())
        )
        conn_ref.commit()
        conn_ref.close()
        log_audit(
            ticket_id=ticket_id,
            actor="POLICY_ENGINE",
            event_type="ACTED",
            payload={"tool": "request_refund", "refund_id": ref_id, "amount": ref_amt, "transaction_id": tx_id},
            reason_code="REFUND_ISSUED",
            policy_token=policy_token,
            latency_ms=65
        )
        return {"status": "success", "refund_id": ref_id, "amount": ref_amt}

    elif tool_name == "send_whatsapp":
        template_id = body.get("template_id") or body.get("args", {}).get("template_id", "settlement_retry_sent")
        variables = body.get("variables") or body.get("args", {}).get("variables", {})
        return execute_send_whatsapp(ticket_id, template_id, variables)

    elif tool_name == "update_ticket":
        status = body.get("status") or body.get("args", {}).get("status", "RESOLVED")
        return execute_update_ticket(ticket_id, status, policy_token)

    elif tool_name == "assign_human":
        queue = body.get("queue") or body.get("args", {}).get("queue", "RISK_OPS")
        brief_dict = body.get("brief_dict") or body.get("args", {}).get("brief_dict", {})
        return execute_assign_human(ticket_id, queue, brief_dict, policy_token)

    raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")


# ============================================================================
# META WHATSAPP CLOUD API WEBHOOK ENDPOINTS
# ============================================================================

WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "paytm_desk_hackathon_2026")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")

@app.get("/api/webhook/whatsapp")
@app.get("/webhook/whatsapp")
def verify_meta_whatsapp(request: Request):
    """
    Verification endpoint called by Meta WhatsApp Cloud API during webhook setup.
    Meta expects a 200 OK with the exact hub.challenge as plain text.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        return PlainTextResponse(content=challenge or "", status_code=200)

    raise HTTPException(status_code=403, detail="Verification token mismatch")


@app.post("/api/webhook/whatsapp")
@app.post("/webhook/whatsapp")
async def receive_meta_whatsapp(request: Request, background_tasks: BackgroundTasks):
    """
    Event listener called by Meta WhatsApp Cloud API when a merchant sends a message.
    1. Validates Meta HMAC SHA-256 signature if WHATSAPP_APP_SECRET configured
    2. Deduplicates on Meta message id (wamid)
    3. Short-circuits greetings without creating tickets
    4. Maps incoming number to primary merchant profile
    5. Ingests complaint and returns fast 200 OK
    6. Runs autonomous Resolve OS policy pipeline asynchronously via BackgroundTasks
    """
    if WHATSAPP_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256", "")
        body_bytes = await request.body()
        if not signature or not signature.startswith("sha256="):
            raise HTTPException(status_code=403, detail="Invalid signature format")
        expected_sig = "sha256=" + hmac.new(
            WHATSAPP_APP_SECRET.encode("utf-8"),
            body_bytes,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            raise HTTPException(status_code=403, detail="Signature verification failed")
        try:
            data = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            return {"status": "ignored_non_json"}
    else:
        try:
            data = await request.json()
        except Exception:
            return {"status": "ignored_non_json"}

    # Validate Meta event envelope
    entry_list = data.get("entry", [])
    if not entry_list:
        return {"status": "no_entry"}

    change_val = entry_list[0].get("changes", [{}])[0].get("value", {})
    messages = change_val.get("messages", [])
    if not messages:
        # Ignore message delivery receipts / statuses (sent, delivered, read)
        return {"status": "ignored_status_receipt"}

    msg = messages[0]
    sender_phone = msg.get("from", "")
    msg_type = msg.get("type", "")
    msg_id = msg.get("id")

    contacts = change_val.get("contacts", [])
    sender_name = ""
    if contacts:
        sender_name = contacts[0].get("profile", {}).get("name", "").strip()

    clean_phone = "".join(filter(str.isdigit, sender_phone))

    # B4: Non-text messages (image, audio, sticker, document, etc.)
    if msg_type != "text":
        prompt_text = (
            f"Namaste {sender_name or 'Partner'}! Humein aapka media sandesh mil gaya hai. "
            "Kripya apni samasya (settlement, refund ya QR issue) text me type karke bhejein taaki hum turant madad kar sakein."
        )
        if clean_phone:
            send_meta_whatsapp_message(clean_phone, prompt_text)
        return {"status": "media_prompt_sent", "ticket_id": None, "reply": prompt_text}

    sender_text = msg.get("text", {}).get("body", "").strip()
    if not sender_text:
        return {"status": "empty_body"}

    text_lower = sender_text.lower().strip()

    conn = get_db()
    cur = conn.cursor()

    # 1. Deduplication on Meta message ID
    if msg_id:
        cur.execute("SELECT msg_id FROM processed_messages WHERE msg_id = ?", (msg_id,))
        if cur.fetchone():
            conn.close()
            return {"status": "already_processed", "msg_id": msg_id}
        if is_postgres():
            cur.execute("INSERT INTO processed_messages (msg_id, created_at) VALUES (%s, %s) ON CONFLICT (msg_id) DO NOTHING", (msg_id, now_iso()))
        else:
            cur.execute("INSERT OR IGNORE INTO processed_messages (msg_id, created_at) VALUES (?, ?)", (msg_id, now_iso()))
        conn.commit()

    # 2. Greeting short-circuit: reply immediately without creating a ticket
    greeting_words = {
        "hello", "hi", "hey", "namaste", "pranam", "kaise", "ho", "aap", "ji",
        "kya", "haal", "h", "bhai", "sir", "madam", "menu", "start",
        "good", "morning", "evening", "afternoon", "shuru", "test"
    }
    clean_text = "".join(ch for ch in text_lower if ch.isalnum() or ch.isspace()).strip()
    words = [w for w in clean_text.split() if w]
    is_greeting = (
        clean_text in greeting_words or
        (bool(words) and all(w in greeting_words for w in words))
    )
    complaint_signals = [
        "settle", "payment", "rupaye", "rupees", "rs", "paisa", "refund", "qr",
        "soundbox", "kat gaya", "aaya", "phasa", "atack", "pending", "help",
        "madad", "issue", "problem", "dikkat", "kharab"
    ]

    if is_greeting and not any(k in text_lower for k in complaint_signals):
        greeting_text = (
            f"Namaste {sender_name or 'Partner'}! Resolve OS Paytm Merchant Desk me aapka swagat hai. "
            "Kripya apna settlement status, refund query, ya QR/soundbox problem batayein."
        )
        if clean_phone:
            send_meta_whatsapp_message(clean_phone, greeting_text)
        conn.close()
        return {"status": "greeting_sent", "ticket_id": None, "reply": greeting_text}

    # 3. Map phone -> merchant_id
    merchant_id = None

    # Lookup by phone
    cur.execute("SELECT id, name FROM merchants WHERE phone = ? OR id = ?", (clean_phone, f"m_{clean_phone}"))
    row = cur.fetchone()
    if row:
        merchant_id = row["id"]
        if sender_name and sender_name.lower() not in ["test user", "test user name", "unknown", ""] and row["name"] != sender_name:
            cur.execute("UPDATE merchants SET name = ? WHERE id = ?", (sender_name, merchant_id))
            conn.commit()

    # Lookup by sender_name
    if not merchant_id and sender_name and sender_name.lower() not in ["test user", "test user name", "unknown", ""]:
        cur.execute("SELECT id FROM merchants WHERE LOWER(name) = LOWER(?)", (sender_name,))
        row = cur.fetchone()
        if row:
            merchant_id = row["id"]
            cur.execute("UPDATE merchants SET phone = ? WHERE id = ?", (clean_phone, merchant_id))
            conn.commit()

    # Fallback to primary demo merchant m_me ("Sparsh") and bind sender phone
    if not merchant_id:
        cur.execute("SELECT id, name, phone FROM merchants WHERE id = 'm_me'")
        m_me = cur.fetchone()
        if m_me:
            merchant_id = "m_me"
            display_name = sender_name if (sender_name and sender_name.lower() not in ["test user", "test user name", "unknown", ""]) else m_me["name"]
            cur.execute("UPDATE merchants SET name = ?, phone = ? WHERE id = 'm_me'", (display_name, clean_phone))
            conn.commit()
        else:
            merchant_id = f"m_{clean_phone}" if clean_phone else f"m_wa_{uuid.uuid4().hex[:6]}"
            display_name = sender_name if (sender_name and sender_name.lower() not in ["test user", "test user name", "unknown", ""]) else "Merchant Partner"
            if is_postgres():
                cur.execute("""
                    INSERT INTO merchants (id, phone, name, city, category, qr_status, soundbox_status, avg_gmv, preferred_lang, risk_flag, created_at)
                    VALUES (%s, %s, %s, 'Delhi NCR', 'Merchant Partner', 'LIVE', 'ONLINE', 25000.0, 'hi-en', NULL, %s)
                    ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone
                """, (merchant_id, clean_phone, display_name, now_iso()))
            else:
                cur.execute("""
                    INSERT OR REPLACE INTO merchants (id, phone, name, city, category, qr_status, soundbox_status, avg_gmv, preferred_lang, risk_flag, created_at)
                    VALUES (?, ?, ?, 'Delhi NCR', 'Merchant Partner', 'LIVE', 'ONLINE', 25000.0, 'hi-en', NULL, ?)
                """, (merchant_id, clean_phone, display_name, now_iso()))
            conn.commit()

    # Extract numeric amount if mentioned in complaint text (never mutate ledger settlements)
    import re
    all_amounts = re.findall(r'\b(\d[\d,]{2,})\b', sender_text)
    amount_val = None
    if all_amounts:
        try:
            amount_val = float(all_amounts[-1].replace(",", ""))
        except Exception:
            amount_val = None

    # Generate new Ticket ID
    ticket_id = f"T-WA{uuid.uuid4().hex[:6].upper()}"

    cur.execute("""
        INSERT INTO tickets (id, merchant_id, text, channel, status, amount, priority, created_at)
        VALUES (?, ?, ?, 'WhatsApp', 'OPEN', ?, 'HIGH', ?)
    """, (ticket_id, merchant_id, sender_text, amount_val, now_iso()))
    conn.commit()
    conn.close()

    # 3. Execute autonomous Resolve OS policy pipeline synchronously (reliable on serverless)
    policy_res = None
    try:
        policy_res = run_desk(ticket_id=ticket_id, request=None, recipient_phone=clean_phone)
    except Exception as e:
        print(f"[Resolve OS Webhook Execution Error] {ticket_id}: {e}")

    final_status = policy_res.status if policy_res else "OPEN"
    if final_status == "RESOLVED":
        decision_label = "ACCEPTED"
    elif final_status in ["ESCALATED", "CLOSED_REJECTED"]:
        decision_label = "REJECTED"
    elif final_status in ["WAITING", "WAITING_ON_MERCHANT"]:
        decision_label = "ASK"
    else:
        decision_label = "OPEN"

    return {
        "status": "success",
        "ticket_id": ticket_id,
        "decision": decision_label,
        "ticket_status": final_status,
        "sender_phone": clean_phone
    }


@app.post("/api/tickets/{ticket_id}/approve")
def approve_ticket(ticket_id: str):
    """
    Operator action: Approve an escalated ticket or manual override.
    """
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    ticket = cur.fetchone()
    if not ticket:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    cur.execute("SELECT * FROM merchants WHERE id = ?", (ticket["merchant_id"],))
    m_row = cur.fetchone()
    merchant = dict(m_row) if m_row else {}

    # Find pending settlement to confirm
    cur.execute("SELECT id FROM settlements WHERE merchant_id = ? AND status != 'SUCCESS' ORDER BY created_at DESC LIMIT 1", (ticket["merchant_id"],))
    stl = cur.fetchone()
    if stl:
        execute_confirm_settlement(stl["id"], ticket_id)

    execute_update_ticket(ticket_id, "RESOLVED")
    log_audit(ticket_id, "OPERATOR", "ACTED", {"tool": "human_override_approve", "note": "Operator manually approved ticket override."}, "HUMAN_APPROVED", None, 100)

    phone = merchant.get("phone")
    if phone:
        execute_send_whatsapp(ticket_id, "ticket_approved", {"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id}, recipient_phone=phone)

    conn.close()
    return {"status": "approved", "ticket_id": ticket_id}


@app.post("/api/tickets/{ticket_id}/reject")
def reject_ticket(ticket_id: str):
    """
    Operator action: Reject an escalated ticket.
    """
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    ticket = cur.fetchone()
    if not ticket:
        conn.close()
        raise HTTPException(status_code=404, detail="Ticket not found")

    cur.execute("SELECT * FROM merchants WHERE id = ?", (ticket["merchant_id"],))
    m_row = cur.fetchone()
    merchant = dict(m_row) if m_row else {}

    execute_update_ticket(ticket_id, "CLOSED_REJECTED")
    log_audit(ticket_id, "OPERATOR", "ACTED", {"tool": "human_override_reject", "note": "Operator rejected ticket after risk review."}, "HUMAN_REJECTED", None, 100)

    phone = merchant.get("phone")
    if phone:
        execute_send_whatsapp(ticket_id, "ticket_rejected", {"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id}, recipient_phone=phone)

    conn.close()
    return {"status": "rejected", "ticket_id": ticket_id}


@app.post("/api/demo/confirm-settlement")
def demo_confirm_settlement(body: Dict[str, Any] = None):
    """
    Demo Tool: Simulates bank file reconciliation callback.
    Transitions a RETRY_REQUESTED or INITIATED settlement batch to SUCCESS and issues genuine UTR.
    """
    body = body or {}
    batch_id = body.get("batch_id")
    conn = get_db()
    cur = conn.cursor()
    if not batch_id:
        cur.execute("SELECT id FROM settlements WHERE status = 'RETRY_REQUESTED' ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            cur.execute("SELECT id FROM settlements WHERE status = 'INITIATED' ORDER BY created_at DESC LIMIT 1")
            row = cur.fetchone()
        if not row:
            conn.close()
            return {"status": "no_pending_settlement"}
        batch_id = row["id"]

    conn.close()
    result = execute_confirm_settlement(batch_id)
    return {"status": "success", "result": result}


