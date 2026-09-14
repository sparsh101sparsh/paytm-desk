"""
Deterministic Policy Engine for DESK.
Pure Python rules. No LLMs.
Enforces Paytm operations risk guardrails.
"""
import hashlib
import time
from typing import Dict, Any, Optional
from .schemas import PolicyDecision, SarvamPlan

MAX_AUTO_SETTLEMENT_AMOUNT = 50000.0
MAX_REFUND_AMOUNT = 2000.0
MAX_SETTLEMENT_RETRIES = 2
MAX_SETTLEMENT_AGE_HOURS = 48.0

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
    # Check if plan proposes retry_settlement_file OR if intent is SETTLEMENT_MISSING
    proposed_write_actions = [w.action for w in plan.proposed_writes]
    is_settlement_case = "retry_settlement_file" in proposed_write_actions or plan.intent == "SETTLEMENT_MISSING"

    if is_settlement_case and settlements:
        settlement = settlements[0] # primary relevant settlement
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

        # Check status (must be INITIATED)
        if status != "INITIATED":
            token = generate_policy_token(ticket_id, "escalate_status", "SETTLEMENT_RETRY_DENIED_STATUS")
            return PolicyDecision(
                allowed=False,
                action="escalate_status",
                reason_code="SETTLEMENT_RETRY_DENIED_STATUS",
                policy_token=token,
                explanation=f"Settlement status '{status}' is ineligible for auto-retry (must be INITIATED).",
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

    # 4. Unknown or general escalation
    token = generate_policy_token(ticket_id, "escalate_unknown", "ESCALATE_UNKNOWN_INTENT")
    return PolicyDecision(
        allowed=False,
        action="escalate_unknown",
        reason_code="ESCALATE_UNKNOWN_INTENT",
        policy_token=token,
        explanation=f"Intent '{plan.intent}' cannot be handled autonomously. Routing to human ops.",
        next_ticket_status="ESCALATED",
        args={"intent": plan.intent}
    )
