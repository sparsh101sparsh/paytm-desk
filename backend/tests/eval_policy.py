"""
Resolve OS Policy Evaluation Script — 40 synthetic Hinglish tickets.
Runs entirely offline. No API key needed.
Reports: correct decisions, wrong decisions, unsafe actions taken, accuracy %.

Usage:
  PYTHONPATH=. python backend/tests/eval_policy.py

Expected output (for judges / on stage):
  Resolve OS Policy Eval — 40 synthetic Hinglish tickets
  ─────────────────────────────────────────────────
  Correct decisions : 40 / 40  (100.0%)
  Wrong decisions   : 0
  Unsafe actions    : 0   ← money moved on a wrong decision
  ─────────────────────────────────────────────────
  All tickets: synthetic. No real merchants or money involved.
"""
import json
import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.app.policy import evaluate_policy
from backend.app.schemas import SarvamPlan, PlanAction

EVAL_FILE = ROOT / "data" / "eval_tickets.json"

# Maps expected_outcome to what next_ticket_status we expect
OUTCOME_TO_STATUS = {
    "RESOLVED": "RESOLVED",
    "WAITING_ON_MERCHANT": "WAITING_ON_MERCHANT",
    "ESCALATED": "ESCALATED",
}

# Actions that move money — any of these on a wrong decision is unsafe
MONEY_ACTIONS = {"retry_settlement_file", "request_refund"}


def build_plan_for_ticket(case: dict) -> SarvamPlan:
    """
    Build a minimal SarvamPlan from the eval case.
    We test the policy engine directly — no Sarvam API call needed.
    The plan intent is derived from the case data.
    """
    text = case["text"].lower()
    settlement_amount = case.get("settlement_amount", 0)
    txn_count = case.get("txn_count", 0)

    # Detect refund intent: "refund", "paisa wapas", "wapas karna"
    is_refund_text = any(kw in text for kw in ["refund", "paisa wapas", "wapas karna"])

    if is_refund_text and txn_count > 0:
        return SarvamPlan(
            intent="REFUND_STATUS",
            confidence=0.92,
            summary_en="Merchant requesting refund action.",
            summary_hi="Refund ki request.",
            proposed_writes=[PlanAction(action="request_refund", args={}, why="refund requested")]
        )

    if settlement_amount and settlement_amount > 0:
        return SarvamPlan(
            intent="SETTLEMENT_MISSING",
            confidence=0.96,
            summary_en="Settlement delayed.",
            summary_hi="Settlement nahi aaya.",
            proposed_writes=[PlanAction(action="retry_settlement_file", args={"batch_id": "stl_eval"}, why="stuck settlement")]
        )

    # Unknown / device / QR / general — propose nothing
    return SarvamPlan(
        intent="UNKNOWN",
        confidence=0.50,
        summary_en="Unclassified issue.",
        summary_hi="Anjaan vishay.",
        proposed_writes=[],
        needs_human=True
    )


def build_db_state(case: dict) -> dict:
    """Build a minimal db_state dict from the eval case data."""
    settlements = []
    if case.get("settlement_amount") and case["settlement_amount"] > 0:
        settlements = [{
            "id": f"stl_{case['id']}",
            "amount": case["settlement_amount"],
            "status": case.get("settlement_status", "INITIATED"),
            "reason": case.get("settlement_reason"),
            "retry_count": case.get("retry_count", 0),
        }]

    transactions = []
    txn_count = case.get("txn_count", 0)
    # Use case-level txn_amount if set, otherwise small default (< refund limit)
    txn_amount = case.get("txn_amount", 500.0)
    for i in range(txn_count):
        transactions.append({
            "id": f"txn_{case['id']}_{i}",
            "amount": txn_amount + (i * 50),  # slight variation for multi-txn cases
            "status": "SUCCESS",
            "utr": f"PAYTM{1000000000 + i}",
        })

    return {
        "ticket": {"id": case["id"], "text": case["text"]},
        "merchant": {
            "id": f"m_{case['id']}",
            "risk_flag": case.get("merchant_risk_flag"),
        },
        "settlements": settlements,
        "transactions": transactions,
        "memory_risk_flags": [],
    }


def run_eval():
    with open(EVAL_FILE) as f:
        cases = json.load(f)

    correct = 0
    wrong = 0
    unsafe_count = 0
    results = []

    for case in cases:
        plan = build_plan_for_ticket(case)
        db_state = build_db_state(case)
        decision = evaluate_policy(plan, db_state)

        expected_status = OUTCOME_TO_STATUS[case["expected_outcome"]]
        got_status = decision.next_ticket_status
        got_code = decision.reason_code
        expected_code = case["expected_reason_code"]

        is_correct = (got_status == expected_status) and (got_code == expected_code)

        # Unsafe = money action taken but decision was wrong
        is_unsafe = (not is_correct) and (decision.action in MONEY_ACTIONS)

        if is_correct:
            correct += 1
        else:
            wrong += 1
            if is_unsafe:
                unsafe_count += 1

        results.append({
            "id": case["id"],
            "text": case["text"][:55] + ("…" if len(case["text"]) > 55 else ""),
            "expected": f"{expected_status} / {expected_code}",
            "got": f"{got_status} / {got_code}",
            "correct": is_correct,
            "unsafe": is_unsafe,
        })

    # Print report
    total = len(cases)
    accuracy = correct / total * 100
    bar = "─" * 57

    print(f"\nResolve OS Policy Eval — {total} synthetic Hinglish tickets")
    print(bar)
    print(f"Correct decisions : {correct} / {total}  ({accuracy:.1f}%)")
    print(f"Wrong decisions   : {wrong}")
    print(f"Unsafe actions    : {unsafe_count}   ← money moved on a wrong decision")
    print(bar)
    print("All tickets: synthetic. No real merchants or money involved.")
    print()

    if wrong > 0:
        print("FAILURES:")
        for r in results:
            if not r["correct"]:
                unsafe_marker = " ⚠️ UNSAFE" if r["unsafe"] else ""
                print(f"  [{r['id']}] {r['text']}")
                print(f"    expected: {r['expected']}")
                print(f"    got:      {r['got']}{unsafe_marker}")
        print()

    return correct, wrong, unsafe_count


if __name__ == "__main__":
    correct, wrong, unsafe = run_eval()
    # Exit code 1 if any unsafe actions — for CI
    sys.exit(1 if unsafe > 0 else 0)
