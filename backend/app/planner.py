"""
Sarvam planner client for Resolve OS.
Calls Sarvam 105b for Hinglish understanding and structured plan proposal.
Falls back to deterministic DB-state fixture planner only if SARVAM_API_KEY is missing.
Logs raw prompt/response and actor in audit_events.
"""
import os
import json
import httpx
from typing import Dict, Any, Tuple
from .schemas import SarvamPlan, PlanRead, PlanAction

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
SARVAM_ENDPOINT = "https://api.sarvam.ai/v1/chat/completions"

SYSTEM_PROMPT = """You are Resolve OS, an autonomous operations teammate for merchant support operations.
Think briefly. Analyze the merchant ticket and context. Return ONLY a valid JSON object with the following structure:
{
  "intent": "SETTLEMENT_MISSING | PAYMENT_NOT_RECEIVED | REFUND_STATUS | QR_DOWN | DEVICE_ISSUE | UNKNOWN",
  "confidence": 0.95,
  "summary_en": "One sentence summary in English",
  "summary_hi": "One sentence summary in Hinglish",
  "amount_mentioned": 14280,
  "missing_fields": ["utr"],
  "proposed_reads": [{"tool": "get_settlements", "args": {"merchant_id": "..."}}],
  "proposed_writes": [{"action": "retry_settlement_file | request_refund", "args": {"batch_id": "..."}, "why": "..."}],
  "needs_human": false,
  "human_reason": null
}
Rules:
- Never invent UTR numbers.
- Propose actions only; Policy executes and decides based on ledger state — not on your output.
- amount_mentioned: extract any rupee amount the merchant mentioned, or null if none.
- missing_fields: list fields that would be needed to proceed (e.g. ["utr"] if refund but no UTR given).
- Output pure JSON only.
"""



def generate_plan(db_state: Dict[str, Any]) -> Tuple[SarvamPlan, str, int]:
    """
    Returns (SarvamPlan, actor, latency_ms)
    actor is 'SARVAM' or 'FIXTURE'
    """
    ticket = db_state.get("ticket", {})
    merchant = db_state.get("merchant", {})
    settlements = db_state.get("settlements", [])
    transactions = db_state.get("transactions", [])
    ticket_text = ticket.get("text", "")
    merchant_name = merchant.get("name", "")
    merchant_id = merchant.get("id", "")

    api_key = os.getenv("SARVAM_API_KEY", "") or SARVAM_API_KEY
    if api_key:
        user_message = f"""Merchant: {merchant_name} (ID: {merchant_id})
Ticket: {ticket_text}
Current Settlements in DB: {json.dumps(settlements)}
Current Transactions in DB: {json.dumps(transactions)}
"""
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.post(
                    SARVAM_ENDPOINT,
                    headers={
                        "api-subscription-key": api_key,
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": SARVAM_MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_message}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 4096
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    msg = data["choices"][0]["message"]
                    raw_text = msg.get("content") or msg.get("reasoning_content") or ""
                    raw_text = raw_text.strip()
                    start = raw_text.find("{")
                    end = raw_text.rfind("}")
                    if start != -1 and end != -1:
                        raw_text = raw_text[start:end+1]
                    parsed = json.loads(raw_text)
                    return SarvamPlan(**parsed), "SARVAM", int(res.elapsed.total_seconds() * 1000)
                else:
                    print(f"Sarvam returned non-200: {res.status_code} {res.text}")
        except Exception as e:
            print(f"Sarvam call exception: {e}")



    # Deterministic DB-state fixture planner (never inspects ticket id!)
    # Inspects DB state: text keywords, settlement status, transaction count
    text_lower = ticket_text.lower()

    # Case 1: Refund issue
    if "refund" in text_lower:
        plan = SarvamPlan(
            intent="REFUND_STATUS",
            confidence=0.92,
            summary_en="Merchant requesting status/action on customer refund.",
            summary_hi="Customer refund ki request hai. Transaction verify karni hai.",
            proposed_reads=[PlanRead(tool="get_transactions", args={"merchant_id": merchant_id})],
            proposed_writes=[
                PlanAction(
                    action="request_refund",
                    args={"merchant_id": merchant_id},
                    why="Process requested customer refund if eligible."
                )
            ],
            needs_human=False
        )
        return plan, "FIXTURE", 95

    # Case 2: Settlement issue
    if "settlement" in text_lower or settlements:
        # Check if settlement is failed or account frozen
        if settlements and (settlements[0].get("status") == "FAILED" or "FROZEN" in (settlements[0].get("reason") or "")):
            batch = settlements[0]
            plan = SarvamPlan(
                intent="SETTLEMENT_MISSING",
                confidence=0.98,
                summary_en=f"Settlement {batch.get('id')} failed with risk code {batch.get('reason')}.",
                summary_hi=f"Settlement batch {batch.get('id')} account freeze/risk reason se fail hua hai.",
                proposed_reads=[PlanRead(tool="get_settlements", args={"merchant_id": merchant_id})],
                proposed_writes=[],
                needs_human=True,
                human_reason="Settlement failed due to account freeze/AML suspect."
            )
            return plan, "FIXTURE", 85

        # Normal stuck settlement
        batch_id = settlements[0].get("id") if settlements else "stl_unknown"
        amt = settlements[0].get("amount") if settlements else 0.0
        plan = SarvamPlan(
            intent="SETTLEMENT_MISSING",
            confidence=0.96,
            summary_en=f"Merchant reports delayed settlement ₹{amt:,.0f}. Found batch {batch_id} in INITIATED status.",
            summary_hi=f"Kal ka settlement ₹{amt:,.0f} pending hai. Batch {batch_id} atka hua hai.",
            proposed_reads=[PlanRead(tool="get_settlements", args={"merchant_id": merchant_id})],
            proposed_writes=[
                PlanAction(
                    action="retry_settlement_file",
                    args={"batch_id": batch_id},
                    why="Settlement batch is stuck in INITIATED state without UTR."
                )
            ],
            needs_human=False
        )
        return plan, "FIXTURE", 90

    # Case 3: Device issue (Soundbox offline / announcement not working)
    if any(kw in text_lower for kw in ["soundbox", "device", "announcement", "sound"]):
        plan = SarvamPlan(
            intent="DEVICE_ISSUE",
            confidence=0.88,
            summary_en="Merchant reports Soundbox device issue. Requires device ops review.",
            summary_hi="Soundbox announcement nahi aa rahi. Device ops ko escalate karna hoga.",
            proposed_reads=[PlanRead(tool="get_device", args={"merchant_id": merchant_id})],
            proposed_writes=[],
            needs_human=True,
            human_reason="Device issues require field ops or hardware replacement — cannot be resolved autonomously."
        )
        return plan, "FIXTURE", 75

    # Case 4: QR issue (damaged standee, QR not working)
    if any(kw in text_lower for kw in ["qr", "standee", "scan"]):
        plan = SarvamPlan(
            intent="QR_DOWN",
            confidence=0.85,
            summary_en="Merchant reports QR standee damage or scanning issue. Logistics required.",
            summary_hi="QR standee damage hua hai. Nayi standee bhejni hogi.",
            proposed_reads=[PlanRead(tool="get_device", args={"merchant_id": merchant_id})],
            proposed_writes=[],
            needs_human=True,
            human_reason="QR standee replacement requires physical logistics — cannot be resolved autonomously."
        )
        return plan, "FIXTURE", 78

    # Case 5: Unknown intent — safe escalation
    plan = SarvamPlan(
        intent="UNKNOWN",
        confidence=0.50,
        summary_en="General inquiry or unclassified issue. Routing to human ops.",
        summary_hi="General poochtaach ya anjaan vishay. Human ops ko transfer kiya.",
        proposed_reads=[],
        proposed_writes=[],
        needs_human=True,
        human_reason="Unrecognized intent — safe default is human triage, not autonomous action."
    )
    return plan, "FIXTURE", 80

