# DESK — Paytm Intelligence Teammate for Merchant Support

> **Track:** Autonomous AI Teammates  
> **Event:** Paytm ♥ AI Hackathon · Delhi · 19 September 2026  
> **Pitch Line:** *Sarvam proposes. Policy decides. n8n acts. Cognee remembers.*  
> **Live:** https://paytm-desk.vercel.app  
> **GitHub:** https://github.com/sparsh101sparsh/paytm-desk

---

## What is DESK?

DESK is an autonomous AI operations teammate built inside the **Paytm for Business** ecosystem. When a merchant sends a Hinglish WhatsApp message about a stuck settlement or missing refund, DESK reads it, checks whether acting is safe using fixed rules, and either fixes it, asks for missing info, or escalates to a human. The AI suggests. The rules decide. It never moves money on its own.

### Stack (Honest)

| Component | Role | Status |
|---|---|---|
| **Sarvam (`sarvam-105b`)** | Understands Hinglish tickets, proposes structured action plans | ✅ Live API |
| **Deterministic Policy Engine** | Non-LLM rule engine enforcing financial risk limits (₹50k cap, AML freeze checks, retry guards) | ✅ Real code + tests |
| **FastAPI + SQLite backend** | Executes approved tools, writes every action to audit log | ✅ Live on Vercel |
| **n8n workflow** | Importable workflow JSON showing the execution graph (`n8n/desk-merchant-ticket.json`) | ✅ JSON importable (not wired to Vercel — run locally to see live nodes) |
| **Cognee memory** | Merchant history recalled per-run via SQLite audit history (`COGNEE_OPTIONAL=1`) | ⚠️ Simulated in SQLite |
| **Paytm ledger** | Settlement, refund, transaction data | ✅ Seeded test data (labeled TEST DATA) |

> **Honest Line:** Sarvam and the policy engine are live. n8n ships as an importable workflow JSON — import it locally to watch nodes execute. Cognee is simulated using our own audit history (real Cognee integration is the next step). Paytm core banking APIs are not accessible, so the ledger is SQLite test data.

---

## Three Hero Scenarios (Tested & Proven)

| Ticket ID | Merchant | Issue | Policy Decision | DB Outcome |
|---|---|---|---|---|
| **T-1042** | Sharma Kirana (Karol Bagh) | Settlement ₹14,280 stuck `INITIATED` without UTR | `SETTLEMENT_RETRY_OK` | Batch retried, UTR assigned, WhatsApp sent, Ticket `RESOLVED` |
| **T-1048** | Glow Salon (Lajpat Nagar) | Refund ₹850 across 3 ambiguous txns, no UTR | `ASK_MERCHANT_UTR` | Zero refunds created, Ticket `WAITING_ON_MERCHANT`, WhatsApp asks for UTR |
| **T-1055** | Delhi Electronics (Nehru Place) | Settlement ₹1,84,000 + `ACCOUNT_FROZEN_SUSPECT` | `ESCALATE_RISK` | Zero retries, Ticket `ESCALATED`, 6-line brief dispatched to `RISK_OPS` |

**Anti-Hardcoding Verification:**  
Edit the settlement amount in SQLite for T-1042 to ₹60,000, run it again → DESK denies with `SETTLEMENT_RETRY_DENIED_AMOUNT` and escalates. Zero `if (ticketId === "T-1042")` anywhere in the codebase. The decision comes from data, not ticket ID.

---

## Policy Eval — 40 Synthetic Hinglish Tickets

```
DESK Policy Eval — 40 synthetic Hinglish tickets
─────────────────────────────────────────────────────────
Correct decisions : 40 / 40  (100.0%)
Wrong decisions   : 0
Unsafe actions    : 0   ← money moved on a wrong decision
─────────────────────────────────────────────────────────
All tickets: synthetic. No real merchants or money involved.
```

**Run it yourself:**
```bash
PYTHONPATH=. python backend/tests/eval_policy.py
```

The 40 tickets cover: settlement retry (allow/deny amount/deny frozen/deny retries/deny status), refund (single UTR match, ambiguous ask, over-limit deny), device/QR escalation, merchant risk flag blocks, and boundary cases (exactly ₹50k, exactly ₹2k, retry count 1 vs 2). All Hinglish. No API key required — tests the policy engine directly.

---

## Quickstart (Local)

### 1. Requirements
- Python 3.10+
- Node.js 18+ & npm
- SQLite3

### 2. Backend
```bash
# In project root:
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Seed database:
python -m backend.app.seed

# Run FastAPI (Port 8000):
uvicorn backend.app.main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 4. n8n Workflow (Judge Demo — Import Locally)
```bash
# Start n8n:
npx n8n
# or: docker run -it --rm --name n8n -p 5678:5678 docker.n8n.io/n8nio/n8n
```
1. In n8n (`http://localhost:5678`), click **Add Workflow → Import from File**
2. Select `n8n/desk-merchant-ticket.json`
3. Activate the workflow — nodes will go green as tickets are processed
4. Set `N8N_WEBHOOK_URL=http://localhost:5678/webhook/desk-run` in `.env` to wire it to the backend

### 5. Sarvam API Key
Create a `.env` file (copy `.env.example`) and add your key:
```
SARVAM_API_KEY=your_key_here
```
Without a key, DESK falls back to a deterministic fixture planner — all 3 demo tickets still work.

---

## Run Tests

```bash
PYTHONPATH=. .venv/bin/pytest backend/tests/test_policy.py backend/tests/test_scenarios.py -v
```

Tests cover: all policy branches, T-1042 auto-resolve, T-1048 ask-for-UTR, T-1055 escalate, and the anti-hardcoding mutation proof.

### Inspect Database State
```bash
sqlite3 backend/desk.db "SELECT id, status, n8n_execution_id FROM tickets;"
sqlite3 backend/desk.db "SELECT id, amount, status, utr, retry_count FROM settlements;"
sqlite3 backend/desk.db "SELECT ticket_id, template_id, body FROM whatsapp_messages;"
sqlite3 backend/desk.db "SELECT ticket_id, queue, brief_text FROM human_briefs;"
sqlite3 backend/desk.db "SELECT actor, type, reason_code, policy_token FROM audit_events ORDER BY id DESC LIMIT 10;"
```

---

## Reset Demo State
Click **Reset demo** in the UI, or:
```bash
curl -X POST http://localhost:8000/demo/reset
# or on Vercel:
curl -X POST https://paytm-desk.vercel.app/api/demo/reset
```

---

## Built with Ponytail Principles
- Zero unnecessary dependencies or bloated ORMs (clean stdlib SQLite3).
- Native browser components and raw Tailwind design tokens matching Paytm for Business.
- Shortest working diffs, clean functions, test coverage across all 3 hero scenarios.
