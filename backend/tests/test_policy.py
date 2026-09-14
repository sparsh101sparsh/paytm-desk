"""
Unit tests for deterministic Policy Engine.
Runs without any API keys.
Verifies all policy branches and reason codes.
"""
import pytest
from backend.app.policy import evaluate_policy
from backend.app.schemas import SarvamPlan, PlanAction

def test_settlement_retry_allowed():
    plan = SarvamPlan(
        intent="SETTLEMENT_MISSING",
        summary_en="Settlement delayed",
        summary_hi="Settlement nahi aaya",
        proposed_writes=[PlanAction(action="retry_settlement_file", args={"batch_id": "stl_001"})]
    )
    db_state = {
        "ticket": {"id": "T-TEST", "text": "Settlement nahi aaya 14280"},
        "merchant": {"id": "m_01", "risk_flag": None},
        "settlements": [{"id": "stl_001", "amount": 14280.0, "status": "INITIATED", "retry_count": 0, "reason": None}],
        "transactions": []
    }
    decision = evaluate_policy(plan, db_state)
    assert decision.allowed is True
    assert decision.reason_code == "SETTLEMENT_RETRY_OK"
    assert decision.next_ticket_status == "RESOLVED"
    assert "stl_001" in decision.args.get("batch_id")

def test_settlement_denied_over_amount():
    plan = SarvamPlan(
        intent="SETTLEMENT_MISSING",
        summary_en="Settlement delayed",
        summary_hi="Settlement nahi aaya",
        proposed_writes=[PlanAction(action="retry_settlement_file", args={"batch_id": "stl_002"})]
    )
    db_state = {
        "ticket": {"id": "T-TEST", "text": "Settlement nahi aaya 60000"},
        "merchant": {"id": "m_01", "risk_flag": None},
        "settlements": [{"id": "stl_002", "amount": 60000.0, "status": "INITIATED", "retry_count": 0}],
        "transactions": []
    }
    decision = evaluate_policy(plan, db_state)
    assert decision.allowed is False
    assert decision.reason_code == "SETTLEMENT_RETRY_DENIED_AMOUNT"
    assert decision.next_ticket_status == "ESCALATED"

def test_settlement_denied_frozen_account():
    plan = SarvamPlan(
        intent="SETTLEMENT_MISSING",
        summary_en="Settlement failed",
        summary_hi="Settlement fail ho gaya",
        proposed_writes=[PlanAction(action="retry_settlement_file", args={"batch_id": "stl_003"})]
    )
    db_state = {
        "ticket": {"id": "T-TEST", "text": "Bhaiya 184000 clear karo"},
        "merchant": {"id": "m_01", "risk_flag": None},
        "settlements": [{"id": "stl_003", "amount": 184000.0, "status": "FAILED", "reason": "ACCOUNT_FROZEN_SUSPECT", "retry_count": 0}],
        "transactions": []
    }
    decision = evaluate_policy(plan, db_state)
    assert decision.allowed is False
    assert decision.reason_code == "ESCALATE_RISK"
    assert decision.next_ticket_status == "ESCALATED"

def test_settlement_denied_merchant_risk_flag():
    plan = SarvamPlan(
        intent="SETTLEMENT_MISSING",
        summary_en="Settlement delayed",
        summary_hi="Settlement delay",
        proposed_writes=[PlanAction(action="retry_settlement_file", args={"batch_id": "stl_004"})]
    )
    db_state = {
        "ticket": {"id": "T-TEST", "text": "Settlement delayed 5000"},
        "merchant": {"id": "m_01", "risk_flag": "SUSPECT_ACCOUNT_FREEZE_AML"},
        "settlements": [{"id": "stl_004", "amount": 5000.0, "status": "INITIATED", "retry_count": 0}],
        "transactions": []
    }
    decision = evaluate_policy(plan, db_state)
    assert decision.allowed is False
    assert decision.reason_code == "ESCALATE_RISK"
    assert decision.next_ticket_status == "ESCALATED"

def test_refund_ambiguity_asks_utr():
    plan = SarvamPlan(
        intent="REFUND_STATUS",
        summary_en="Customer refund",
        summary_hi="Refund chahiye",
        proposed_writes=[PlanAction(action="request_refund", args={})]
    )
    db_state = {
        "ticket": {"id": "T-TEST", "text": "customer refund nahi aaya 850 rs"},
        "merchant": {"id": "m_02", "risk_flag": None},
        "settlements": [],
        "transactions": [
            {"id": "tx1", "amount": 850.0, "status": "SUCCESS", "utr": "UTR101"},
            {"id": "tx2", "amount": 850.0, "status": "SUCCESS", "utr": "UTR102"},
            {"id": "tx3", "amount": 850.0, "status": "SUCCESS", "utr": "UTR103"}
        ]
    }
    decision = evaluate_policy(plan, db_state)
    assert decision.allowed is False
    assert decision.reason_code == "ASK_MERCHANT_UTR"
    assert decision.next_ticket_status == "WAITING_ON_MERCHANT"
