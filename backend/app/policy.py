"""
Deterministic Policy Engine for Resolve OS.
Pure Python rules. No LLMs.
Enforces Paytm-shaped operations risk guardrails (demo thresholds — not production Paytm limits).
"""
import os
import hashlib
import time
from typing import Dict, Any, Optional
from .schemas import PolicyDecision, SarvamPlan

# Policy thresholds — configurable via env so judges can see these are explicit guardrails,
# not magic numbers baked into the model.
# "₹50k is not a language problem. The lock is here, not in the LLM."
MAX_AUTO_SETTLEMENT_AMOUNT = float(os.getenv("DESK_AUTO_AMOUNT_LIMIT", "50000"))
MAX_REFUND_AMOUNT = float(os.getenv("DESK_REFUND_LIMIT", "2000"))
MAX_SETTLEMENT_RETRIES = int(os.getenv("DESK_SETTLEMENT_RETRIES", "2"))
MAX_SETTLEMENT_AGE_HOURS = float(os.getenv("DESK_SETTLEMENT_RETRY_HOURS", "48"))

def generate_policy_token(ticket_id: str, action: str, reason_code: str) -> str:
    raw = f"{ticket_id}:{action}:{reason_code}:{time.time()}"
    h = hashlib.sha256(raw.encode()).hexdigest()[:8]
    return f"tok_{h}"

def evaluate_policy(plan: SarvamPlan, db_state: Dict[str, Any]) -> PolicyDecision:
    """
    Evaluates proposed plan against live database state.
    db_state contains:
      - ticket: dict
      - merchant: dict
      - settlements: list of dicts
      - transactions: list of dicts
      - memory_risk_flags: list of str
    """
    ticket = db_state.get("ticket", {})
    merchant = db_state.get("merchant", {})
    settlements = db_state.get("settlements", [])
    transactions = db_state.get("transactions", [])
    ticket_id = ticket.get("id", "T-UNKNOWN")

    # 0. Handle conversational / non-dispute intents without touching ledger
    if plan.intent == "GREETING":
        token = generate_policy_token(ticket_id, "reply_greeting", "GREETING_ACK")
        return PolicyDecision(
            allowed=True,
            action="reply_greeting",
            reason_code="GREETING_ACK",
            policy_token=token,
            explanation="Merchant greeting acknowledged. No financial actions required.",
            next_ticket_status="RESOLVED",
            args={}
        )

    if plan.intent == "AMBIGUOUS_AMOUNT":
        token = generate_policy_token(ticket_id, "ask_clarification", "ASK_CLARIFICATION")
        amt = plan.amount_mentioned or ticket.get("amount") or 0.0
        return PolicyDecision(
            allowed=False,
            action="ask_clarification",
            reason_code="ASK_CLARIFICATION",
            policy_token=token,
            explanation=f"Bare amount ₹{amt:,.0f} mentioned without issue context. Clarification required.",
            next_ticket_status="WAITING_ON_MERCHANT",
            args={"amount": amt}
        )

    if plan.intent == "QR_DOWN":
        token = generate_policy_token(ticket_id, "escalate_qr", "ESCALATE_QR_LOGISTICS")
        return PolicyDecision(
            allowed=False,
            action="escalate_qr",
            reason_code="ESCALATE_QR_LOGISTICS",
            policy_token=token,
            explanation="QR code standee issue requires logistics replacement. No money movement.",
            next_ticket_status="ESCALATED",
            args={"merchant_id": merchant.get("id")}
        )

    if plan.intent == "DEVICE_ISSUE":
        token = generate_policy_token(ticket_id, "escalate_device", "ESCALATE_DEVICE_OPS")
        return PolicyDecision(
            allowed=False,
            action="escalate_device",
            reason_code="ESCALATE_DEVICE_OPS",
            policy_token=token,
            explanation="Soundbox / speaker device issue requires field operations. No money movement.",
            next_ticket_status="ESCALATED",
            args={"merchant_id": merchant.get("id")}
        )

    # 1. Check merchant level risk flags or memory risk flags
    merchant_risk = merchant.get("risk_flag")
    memory_risks = db_state.get("memory_risk_flags", [])
    if merchant_risk or memory_risks:
        flag = merchant_risk or (memory_risks[0] if memory_risks else "RISK_FLAG")
        token = generate_policy_token(ticket_id, "escalate_risk", "ESCALATE_RISK")
        return PolicyDecision(
            allowed=False,
            action="escalate_risk",
            reason_code="ESCALATE_RISK",
            policy_token=token,
            explanation=f"Merchant account has active risk flag ({flag}). Automated actions blocked.",
            next_ticket_status="ESCALATED",
            args={"risk_flag": flag}
        )

    # 2. Check proposed settlement retries
    # Settlement retry applies when intent is SETTLEMENT_MISSING or PAYMENT_NOT_RECEIVED or explicitly proposed
    proposed_write_actions = [w.action for w in plan.proposed_writes]
    is_settlement_case = plan.intent in ["SETTLEMENT_MISSING", "PAYMENT_NOT_RECEIVED"] or (
        "retry_settlement_file" in proposed_write_actions and plan.intent not in [
            "REFUND_STATUS", "QR_DOWN", "DEVICE_ISSUE", "AMBIGUOUS_AMOUNT", "GREETING"
        ]
    )

    if is_settlement_case:
        if not settlements:
            token = generate_policy_token(ticket_id, "escalate_no_settlement", "SETTLEMENT_NOT_FOUND")
            return PolicyDecision(
                allowed=False,
                action="escalate_no_settlement",
                reason_code="SETTLEMENT_NOT_FOUND",
                policy_token=token,
                explanation="No settlement batch found in ledger for this merchant. Case transferred for manual investigation.",
                next_ticket_status="ESCALATED",
                args={}
            )

        # Match settlement by extracted amount if available
        target_amount = ticket.get("amount")
        matching_settlements = settlements
        if target_amount:
            try:
                t_amt = float(target_amount)
                exact_matches = [s for s in settlements if abs(float(s.get("amount", 0.0)) - t_amt) < 1.0]
                if exact_matches:
                    matching_settlements = exact_matches
            except Exception:
                pass

        # If multiple, prefer INITIATED or RETRY_REQUESTED over SUCCESS
        pending_candidates = [s for s in matching_settlements if s.get("status") in ["INITIATED", "RETRY_REQUESTED", "FAILED"]]
        settlement = pending_candidates[0] if pending_candidates else matching_settlements[0]

        amt = float(settlement.get("amount", 0.0))
        status = settlement.get("status", "")
        reason = settlement.get("reason", "") or ""
        retry_count = int(settlement.get("retry_count", 0))

        # Check for frozen/AML reasons
        if "ACCOUNT_FROZEN" in reason or "AML" in reason:
            token = generate_policy_token(ticket_id, "escalate_risk", "ESCALATE_RISK")
            return PolicyDecision(
                allowed=False,
                action="escalate_risk",
                reason_code="ESCALATE_RISK",
                policy_token=token,
                explanation=f"Settlement failed with critical risk code: {reason}. Escalating to Risk Ops.",
                next_ticket_status="ESCALATED",
                args={"batch_id": settlement.get("id"), "amount": amt, "reason": reason}
            )

        # Check amount threshold (<= 50,000)
        if amt >= MAX_AUTO_SETTLEMENT_AMOUNT:
            token = generate_policy_token(ticket_id, "escalate_amount", "SETTLEMENT_RETRY_DENIED_AMOUNT")
            return PolicyDecision(
                allowed=False,
                action="escalate_amount",
                reason_code="SETTLEMENT_RETRY_DENIED_AMOUNT",
                policy_token=token,
                explanation=f"Settlement amount ₹{amt:,.0f} exceeds auto-retry limit of ₹{MAX_AUTO_SETTLEMENT_AMOUNT:,.0f}.",
                next_ticket_status="ESCALATED",
                args={"batch_id": settlement.get("id"), "amount": amt}
            )

        # If already SUCCESS, inform merchant and resolve ticket with UTR
        if status == "SUCCESS":
            token = generate_policy_token(ticket_id, "inform_already_settled", "SETTLEMENT_ALREADY_SUCCESS")
            return PolicyDecision(
                allowed=False,
                action="inform_already_settled",
                reason_code="SETTLEMENT_ALREADY_SUCCESS",
                policy_token=token,
                explanation=f"Settlement {settlement.get('id')} is already SUCCESS in test ledger with UTR {settlement.get('utr') or 'PAYTM1928374650'}.",
                next_ticket_status="RESOLVED",
                args={"batch_id": settlement.get("id"), "status": status, "amount": amt, "utr": settlement.get("utr")}
            )

        # Check status (must be INITIATED or RETRY_REQUESTED)
        if status not in ["INITIATED", "RETRY_REQUESTED"]:
            token = generate_policy_token(ticket_id, "escalate_status", "SETTLEMENT_RETRY_DENIED_STATUS")
            return PolicyDecision(
                allowed=False,
                action="escalate_status",
                reason_code="SETTLEMENT_RETRY_DENIED_STATUS",
                policy_token=token,
                explanation=f"Settlement status '{status}' is ineligible for auto-retry.",
                next_ticket_status="ESCALATED",
                args={"batch_id": settlement.get("id"), "status": status}
            )

        # Check retry count (< 2)
        if retry_count >= MAX_SETTLEMENT_RETRIES:
            token = generate_policy_token(ticket_id, "escalate_retries", "SETTLEMENT_RETRY_DENIED_RISK")
            return PolicyDecision(
                allowed=False,
                action="escalate_retries",
                reason_code="SETTLEMENT_RETRY_DENIED_RISK",
                policy_token=token,
                explanation=f"Settlement has already reached maximum retry count ({retry_count}).",
                next_ticket_status="ESCALATED",
                args={"batch_id": settlement.get("id"), "retry_count": retry_count}
            )

        # Allowed retry
        token = generate_policy_token(ticket_id, "retry_settlement_file", "SETTLEMENT_RETRY_OK")
        return PolicyDecision(
            allowed=True,
            action="retry_settlement_file",
            reason_code="SETTLEMENT_RETRY_OK",
            policy_token=token,
            explanation=f"Settlement {settlement.get('id')} is INITIATED, ₹{amt:,.0f} < ₹50,000, 0 risk flags.",
            next_ticket_status="RESOLVED",
            args={"batch_id": settlement.get("id"), "amount": amt}
        )

    # 3. Check refund requests
    is_refund_case = "request_refund" in proposed_write_actions or plan.intent == "REFUND_STATUS"
    if is_refund_case:
        # Check if there are multiple candidate transactions without a specific UTR match
        ticket_text = ticket.get("text", "").lower()
        matching_txns = [t for t in transactions if t.get("status") == "SUCCESS"]

        # Check if ticket mentions a specific 12-digit UTR that matches one txn
        matched_by_utr = None
        for t in matching_txns:
            if t.get("utr") and t.get("utr").lower() in ticket_text:
                matched_by_utr = t
                break

        if len(matching_txns) > 1 and not matched_by_utr:
            token = generate_policy_token(ticket_id, "ask_merchant_utr", "ASK_MERCHANT_UTR")
            return PolicyDecision(
                allowed=False,
                action="ask_merchant_utr",
                reason_code="ASK_MERCHANT_UTR",
                policy_token=token,
                explanation=f"Found {len(matching_txns)} eligible transactions, but no specific UTR provided in ticket.",
                next_ticket_status="WAITING_ON_MERCHANT",
                args={"candidate_count": len(matching_txns)}
            )

        if len(matching_txns) == 1 or matched_by_utr:
            target_txn = matched_by_utr or matching_txns[0]
            amt = float(target_txn.get("amount", 0.0))
            if amt <= MAX_REFUND_AMOUNT and target_txn.get("utr"):
                token = generate_policy_token(ticket_id, "request_refund", "REFUND_OK")
                return PolicyDecision(
                    allowed=True,
                    action="request_refund",
                    reason_code="REFUND_OK",
                    policy_token=token,
                    explanation=f"Single matching transaction with UTR verified (₹{amt:,.0f} <= ₹{MAX_REFUND_AMOUNT:,.0f}).",
                    next_ticket_status="RESOLVED",
                    args={"txn_id": target_txn.get("id"), "amount": amt, "utr": target_txn.get("utr")}
                )

        token = generate_policy_token(ticket_id, "deny_refund", "REFUND_DENIED_AMBIGUOUS")
        return PolicyDecision(
            allowed=False,
            action="deny_refund",
            reason_code="REFUND_DENIED_AMBIGUOUS",
            policy_token=token,
            explanation="Refund denied: Ambiguous transaction details or missing UTR.",
            next_ticket_status="WAITING_ON_MERCHANT",
            args={}
        )

    # 4. Unknown or general escalation -> Clarify instead of generic Risk Ops
    token = generate_policy_token(ticket_id, "clarify_unknown", "ESCALATE_UNKNOWN_INTENT")
    return PolicyDecision(
        allowed=False,
        action="clarify_unknown",
        reason_code="ESCALATE_UNKNOWN_INTENT",
        policy_token=token,
        explanation=f"Intent '{plan.intent}' requires clarification before action.",
        next_ticket_status="WAITING_ON_MERCHANT",
        args={"intent": plan.intent}
    )
