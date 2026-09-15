"""
Cognee Merchant Memory client for ResolveOS.
Manages merchant history, past settlements, SOP knowledge graph, and recall chips.
Logs all searches and memory additions to cognee_sync_log table.
"""
import os
import json
import sqlite3
from typing import List, Dict, Any
from .db import get_db, now_iso

COGNEE_API_URL = os.getenv("COGNEE_API_URL", "http://localhost:8000")
COGNEE_OPTIONAL = os.getenv("COGNEE_OPTIONAL", "1")

# Standard Operating Procedures for Paytm Settlement & Refund Desk
SOPS = [
    {
        "id": "sop_settlement_retry",
        "title": "Settlement Auto-Retry Policy",
        "rule": "Batches in INITIATED state under 48 hours old and amount < ₹50,000 can be retried automatically if retry_count < 2 and no AML/Risk freeze flags exist."
    },
    {
        "id": "sop_refund_ambiguity",
        "title": "Refund Ambiguity & UTR Verification",
        "rule": "Never process automated refund if multiple candidate transactions match without a specific 12-digit UTR from merchant. Ask merchant for UTR."
    },
    {
        "id": "sop_account_frozen",
        "title": "Account Freeze & AML Escalation",
        "rule": "Any failure with ACCOUNT_FROZEN_SUSPECT or amount >= ₹50,000 must immediately escalate to Risk Ops with 6-line brief. No automated money movement."
    }
]

def log_cognee_sync(merchant_id: str, action: str, query: str, hit_count: int, payload: dict):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO cognee_sync_log (merchant_id, action, query, hit_count, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (merchant_id, action, query, hit_count, json.dumps(payload), now_iso()))
    conn.commit()
    conn.close()

def search_memory(merchant_id: str, intent: str, query: str = "") -> List[Dict[str, Any]]:
    """
    Recalls merchant context, past settlements, known risk flags, and relevant SOPs.
    Returns memory nodes/chips to be rendered in UI and fed into policy.
    """
    conn = get_db()
    cur = conn.cursor()

    # Load merchant info
    cur.execute("SELECT * FROM merchants WHERE id = ?", (merchant_id,))
    merchant = cur.fetchone()

    # Load settlements for this merchant
    cur.execute("SELECT * FROM settlements WHERE merchant_id = ? ORDER BY created_at DESC", (merchant_id,))
    settlements = [dict(row) for row in cur.fetchall()]

    # Load recent audit events for this merchant's tickets
    cur.execute("""
        SELECT a.reason_code, a.actor, a.type, a.payload_json, t.id as ticket_id
        FROM audit_events a
        JOIN tickets t ON a.ticket_id = t.id
        WHERE t.merchant_id = ?
        ORDER BY a.id DESC LIMIT 5
    """, (merchant_id,))
    past_events = [dict(row) for row in cur.fetchall()]

    chips = []
    risk_flags = []

    if merchant:
        if merchant["risk_flag"]:
            chips.append({
                "type": "RISK",
                "label": f"Risk Flag: {merchant['risk_flag']}",
                "severity": "danger"
            })
            risk_flags.append(merchant["risk_flag"])

    if settlements:
        latest = settlements[0]
        chips.append({
            "type": "SETTLEMENT",
            "label": f"{latest['id']} · {latest['status']} (₹{latest['amount']:,.0f})",
            "severity": "success" if latest['status'] == "SUCCESS" else ("danger" if latest['status'] == "FAILED" else "warn")
        })
        chips.append({
            "type": "METRIC",
            "label": f"Retries: {latest['retry_count']}/2",
            "severity": "neutral"
        })
        if "FROZEN" in (latest.get("reason") or ""):
            risk_flags.append(latest["reason"])

    # Match relevant SOP
    for sop in SOPS:
        if intent == "SETTLEMENT_MISSING" and "settlement" in sop["id"]:
            chips.append({"type": "SOP", "label": "SOP: Settlement Retry Limit ₹50k", "severity": "info"})
            break
        elif intent == "REFUND_STATUS" and "refund" in sop["id"]:
            chips.append({"type": "SOP", "label": "SOP: UTR Required for Refunds", "severity": "info"})
            break

    # Prior actions
    for pe in past_events:
        if pe.get("reason_code"):
            chips.append({
                "type": "PAST_ACTION",
                "label": f"Past Ticket {pe['ticket_id']}: {pe['reason_code']}",
                "severity": "neutral"
            })
            break

    conn.close()

    log_cognee_sync(merchant_id, "SEARCH", f"{intent} {query}", len(chips), {"chips": chips, "risk_flags": risk_flags})
    return chips

def remember_outcome(ticket_id: str, merchant_id: str, action: str, outcome: str):
    """
    Stores the completed action and outcome in Cognee memory for future recall.
    """
    payload = {
        "ticket_id": ticket_id,
        "action": action,
        "outcome": outcome,
        "timestamp": now_iso()
    }
    log_cognee_sync(merchant_id, "REMEMBER", f"Ticket {ticket_id} action {action}", 1, payload)
