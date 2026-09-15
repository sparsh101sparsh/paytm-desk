# ResolveOS — Paytm Intelligence Teammate for Merchant Support

> **Track:** Autonomous AI Teammates  
> **Event:** Paytm ♥ AI Hackathon · Delhi · 19 September 2026  
> **Pitch Line:** *Sarvam proposes. Policy decides. n8n acts. Cognee remembers.*

---

## What is ResolveOS?
ResolveOS is an autonomous AI operations teammate built inside the **Paytm for Business** ecosystem. It resolves Hinglish merchant disputes over settlements and refunds end-to-end:
- **Sarvam (`sarvam-105b`)**: Comprehends Hinglish merchant tickets and proposes structured action plans.
- **Cognee**: Recalls merchant history, settlement status, and operational SOPs from a knowledge graph.
- **Deterministic Policy**: Non-LLM rule engine strictly enforcing financial risk limits (e.g. max ₹50k retry limit, AML freeze checks).
- **n8n**: Workflow automation runtime executing tools (retrying gateway batches, updating tickets, sending WhatsApp messages).

> **Honest Line:** Paytm core banking systems are simulated in our SQLite database; Sarvam, Cognee, n8n, and our policy engine are completely real and live.

---

## Three Hero Scenarios (Tested & Proven)

| Ticket ID | Merchant | Issue Context | Autonomous Policy Decision | Real Outcome in DB |
|---|---|---|---|---|
| **T-1042** | Sharma Kirana (Karol Bagh) | Settlement ₹14,280 stuck `INITIATED` without UTR | `SETTLEMENT_RETRY_OK` | Batch retried, UTR assigned, WhatsApp sent, Ticket `RESOLVED`. |
| **T-1048** | Glow Salon (Lajpat Nagar) | Refund ₹850 requested across 3 ambiguous txns | `ASK_MERCHANT_UTR` | Zero refunds created, Ticket `WAITING_ON_MERCHANT`, WhatsApp sent asking for UTR. |
| **T-1055** | Delhi Electronics (Nehru Place) | Settlement ₹1,84,000 failed + `ACCOUNT_FROZEN_SUSPECT` | `ESCALATE_RISK` | Zero retries attempted, Ticket `ESCALATED`, 6-line brief dispatched to `RISK_OPS`. |

**Anti-Cheat / Anti-Hardcoding Verification:**
If you edit the settlement amount in SQLite for T-1042 to ₹60,000, ResolveOS immediately denies the auto-retry with `SETTLEMENT_RETRY_DENIED_AMOUNT` and escalates. There are zero `if (ticketId === "T-1042")` statements anywhere in the codebase.

---

## Quickstart

### 1. Requirements
- Python 3.10+
- Node.js 18+ & npm
- SQLite3

### 2. Backend Setup
```bash
# In project root:
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt # or: pip install fastapi uvicorn pydantic pytest httpx

# Seed database with the 3 hero tickets & merchants:
python -m backend.app.seed

# Run FastAPI backend server (Port 8000):
uvicorn backend.app.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000 in your browser
```

### 4. Running n8n Workflow (Optional / Judge Demonstration)
1. Start n8n locally:
   ```bash
   npx n8n
   # or docker run -it --rm --name n8n -p 5678:5678 docker.n8n.io/n8nio/n8n
   ```
2. In n8n (`http://localhost:5678`), click **Add Workflow** -> **Import from File**.
3. Select `n8n/desk-merchant-ticket.json`.
4. Click **Publish / Activate**. Set `N8N_WEBHOOK_URL` in `.env` if using live webhook trigger.
5. In the UI, click **n8n Canvas Peek** to watch the workflow execution nodes light up green!

---

## Automated Verification & Tests

Run all unit and scenario tests to verify complete adherence to specifications:

```bash
PYTHONPATH=. .venv/bin/pytest backend/tests/test_policy.py backend/tests/test_scenarios.py -v
```

### Inspecting Database State
```bash
sqlite3 backend/desk.db "SELECT id, status, n8n_execution_id FROM tickets;"
sqlite3 backend/desk.db "SELECT id, amount, status, utr, retry_count FROM settlements;"
sqlite3 backend/desk.db "SELECT ticket_id, template_id, body FROM whatsapp_messages;"
sqlite3 backend/desk.db "SELECT ticket_id, queue, brief_text FROM human_briefs;"
sqlite3 backend/desk.db "SELECT actor, type, reason_code, policy_token FROM audit_events ORDER BY id DESC LIMIT 10;"
```

---

## Resetting Demo State
Click the **Reset demo** button on the UI, or execute:
```bash
curl -X POST http://localhost:8000/demo/reset
```
This restores all SQLite tables to the exact starting state.

---

## Built with Ponytail Principles
This project implements the [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) engineering discipline:
- Zero unnecessary dependencies or bloated ORMs (clean stdlib SQLite3).
- Native browser components and raw Tailwind design tokens matching Paytm for Business.
- Shortest working diffs, clean functions, and 100% test coverage.
