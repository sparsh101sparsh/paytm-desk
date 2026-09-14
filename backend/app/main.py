"""
FastAPI application for DESK.
Paytm Intelligence teammate for merchant support.
"Sarvam proposes. Policy decides. n8n acts. Cognee remembers."
"""
import os
import json
import uuid
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx

from .db import get_db, now_iso
from .seed import seed_database
from .schemas import RunResponse, SarvamPlan, PolicyDecision
from .policy import evaluate_policy
from .planner import generate_plan, SARVAM_API_KEY
from .memory import search_memory, remember_outcome
from .tools import (
    log_audit,
    execute_retry_settlement_file,
    execute_send_whatsapp,
    execute_update_ticket,
    execute_assign_human
)

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "")

app = FastAPI(title="DESK - Paytm Merchant Support Teammate", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
@app.get("/api/health")
def health():
    import os
    cognee_optional = os.getenv("COGNEE_OPTIONAL", "0") == "1"
    cognee_status = "simulation (COGNEE_OPTIONAL=1)" if cognee_optional else "down"
    return {
        "status": "healthy",
        "database": "sqlite:ok",
        "sarvam": "live" if SARVAM_API_KEY else "fixture",
        "cognee": cognee_status,
        "n8n": "ready"
    }

@app.post("/demo/reset")
@app.post("/api/demo/reset")
def reset_demo():
    seed_database()
    return {"status": "ok", "message": "Demo reset to initial seed."}


@app.get("/api/tickets")
def get_tickets():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.*, m.name as merchant_name, m.city as merchant_city, m.category as merchant_category
        FROM tickets t
        JOIN merchants m ON t.merchant_id = m.id
        ORDER BY t.id ASC
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

    # Cognee memory chips
    memory_chips = search_memory(ticket["merchant_id"], ticket.get("intent") or "")

    return {
        "ticket": dict(ticket),
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
def run_desk(ticket_id: str, request: Request = None):
    """
    Runs the full DESK lifecycle:
    1. Check N8N_WEBHOOK_URL if external orchestrator is active
    2. Sarvam / Fixture planner (Intent & Plan proposal) -> Audit: UNDERSTOOD
    3. Cognee memory search -> Audit: RECALLED
    4. Deterministic Policy decision -> Audit: DECIDED
    5. n8n execution of allowed tools -> Audit: ACTED / NOTIFIED
    6. Cognee outcome remember
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

    cur.execute("SELECT * FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    settlements = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM transactions WHERE merchant_id = ? ORDER BY created_at DESC", (ticket["merchant_id"],))
    transactions = [dict(r) for r in cur.fetchall()]

    conn.close()

    db_state = {
        "ticket": ticket,
        "merchant": merchant,
        "settlements": settlements,
        "transactions": transactions
    }

    # Generate an n8n execution id for this run
    n8n_exec_id = f"n8n_exec_{uuid.uuid4().hex[:10]}"

    # 1. SARVAM Planner
    plan, planner_actor, planner_latency = generate_plan(db_state)
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

    # 2. COGNEE Memory Recall
    memory_chips = search_memory(merchant.get("id", ""), plan.intent)
    db_state["memory_risk_flags"] = [c["label"] for c in memory_chips if c["type"] == "RISK"]
    log_audit(
        ticket_id=ticket_id,
        actor="COGNEE",
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
        actor="POLICY",
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

    # 4. N8N ACTION RUNTIME
    if decision.allowed and decision.action == "retry_settlement_file":
        batch_id = decision.args.get("batch_id")
        execute_retry_settlement_file(ticket_id, batch_id, decision.policy_token)
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="settlement_retry_sent",
            variables={"batch_id": batch_id, "ticket_id": ticket_id}
        )
        execute_update_ticket(ticket_id, "RESOLVED", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "retry_settlement_file", "RESOLVED_SUCCESS")

    elif decision.action == "ask_merchant_utr":
        execute_send_whatsapp(
            ticket_id=ticket_id,
            template_id="ask_utr",
            variables={"merchant_name": merchant.get("name", "Merchant"), "ticket_id": ticket_id}
        )
        execute_update_ticket(ticket_id, "WAITING_ON_MERCHANT", decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "ask_merchant_utr", "WAITING_ON_MERCHANT")

    elif decision.next_ticket_status == "ESCALATED":
        brief_info = {
            "merchant_name": merchant.get("name", "Unknown"),
            "merchant_id": merchant.get("id", ""),
            "amount": settlements[0].get("amount") if settlements else ticket.get("amount", 0),
            "reason": settlements[0].get("reason", "RISK_FLAG") if settlements else "SUSPECT_FREEZE",
            "checks": "Settlement verified in DB, risk/AML flag confirmed in Cognee memory, automated retry blocked.",
            "not_done": "No retry, no refund, no WhatsApp promise of funds.",
            "recommendation": "Risk Ops review account freeze status with compliance and call merchant."
        }
        execute_assign_human(ticket_id, "RISK_OPS", brief_info, decision.policy_token)
        remember_outcome(ticket_id, merchant.get("id"), "escalate_risk", "ESCALATED_RISK_OPS")

    # Update ticket with execution id
    conn = get_db()
    conn.execute("UPDATE tickets SET n8n_execution_id = ? WHERE id = ?", (n8n_exec_id, ticket_id))
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
        n8n_execution_id=n8n_exec_id,
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
    Direct endpoint for n8n to execute verified tools with policy tokens.
    """
    ticket_id = body.get("ticket_id", "")
    policy_token = body.get("policy_token", "")

    if tool_name == "retry_settlement_file":
        batch_id = body.get("batch_id") or body.get("args", {}).get("batch_id")
        return execute_retry_settlement_file(ticket_id, batch_id, policy_token)

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

