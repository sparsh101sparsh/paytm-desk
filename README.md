# Resolve OS — Autonomous AI Teammate for Merchant Support

<div align="center">

[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js%2014%20App%20Router-black?style=for-the-badge&logo=next.js)](https://paytm-desk.vercel.app)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20Async-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Sarvam AI](https://img.shields.io/badge/NLU-Sarvam%20105B%20Indic-FF6F00?style=for-the-badge)](https://www.sarvam.ai/)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL%2017%20(Mumbai)-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![WhatsApp](https://img.shields.io/badge/Channel-Meta%20WhatsApp%20Cloud%20API-25D366?style=for-the-badge&logo=whatsapp)](https://wa.me/15552013457)
[![Tests](https://img.shields.io/badge/Tests-39%2F39%20Passing%20(100%25)-success?style=for-the-badge&logo=pytest)](https://github.com/sparsh101sparsh/resolve-os)

**Paytm ♥ AI Hackathon · New Delhi · 19 September 2026**  
*Track: Autonomous AI Teammates*

[**🚀 Live Operations Desk**](https://paytm-desk.vercel.app) · [**💬 WhatsApp Sandbox Bot**](https://wa.me/15552013457?text=hello) · [**📖 Architecture Bible**](#-cryptographic-policy-tokens-tok_sha256) · [**🧪 Test Suite**](#-comprehensive-test-suite-and-evaluations)

</div>

---

## 🎯 Executive Summary & Core Philosophy

> ### *"Sarvam understands. Deterministic rules decide. The backend acts."*

Merchant support in Indian fintech presents a high-stakes dilemma: merchants submit emotionally charged, unstructured Hinglish complaints (*"kal se 14,280 ka settlement nahi aaya, dukan band ho jayegi"*), but automated backends must operate under strict banking risk controls.

Traditional LLM agent architectures give foundation models direct function-calling access to database writes and banking settlement APIs. **In production fintech, this is an existential vulnerability**:
1. **Prompt Injection & Social Engineering**: A merchant or attacker can trick an LLM into initiating unauthorized payouts.
2. **Hallucinated Precision**: LLMs cannot reliably verify whether a 12-digit UTR exists in core banking ledgers or enforce exact mathematical ceilings (`amount <= 50,000.00`).
3. **Non-Deterministic Money Movement**: Two identical queries could produce different financial outcomes.

### The Resolve OS Paradigm: Zero Fund Rights for LLMs
**Resolve OS strictly isolates language comprehension from financial authority.** Sarvam's 105B Indic foundation model is granted **Zero Fund Rights**—it can only classify intent and propose candidate plans. Execution authority belongs exclusively to a non-LLM, pure Python deterministic policy engine guarded by **cryptographic SHA-256 single-use tokens**.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              THE SEPARATION OF CONCERNS                              │
├──────────────────────────┬───────────────────────────┬───────────────────────────────┤
│ 1. Sarvam 105B Indic LLM │ 2. Pure Policy Engine     │ 3. Backend Tool Runtime       │
├──────────────────────────┼───────────────────────────┼───────────────────────────────┤
│ • Parses Hinglish text   │ • Enforces ₹50,000 cap    │ • Verifies SHA-256 HMAC token │
│ • Normalizes noise       │ • Checks 2-retry ceiling  │ • Atomically burns token      │
│ • Proposes draft actions │ • Audits AML / freeze     │ • Triggers bank batch retry   │
│ ❌ Zero tool execution   │ • Signs SHA-256 token     │ • Dispatches WhatsApp reply   │
│ ❌ Zero fund authority   │ ❌ Zero generative text   │ ❌ Rejects unverified calls   │
└──────────────────────────┴───────────────────────────┴───────────────────────────────┘
```

---

## 🏛️ End-to-End System Architecture

```mermaid
flowchart TD
    subgraph INBOUND ["1. Inbound Omnichannel Gateway"]
        M[Merchant Mobile\nWhatsApp] -->|Hinglish Message\n'kal ka settlement 14280 nahi aaya'| WA_META[Meta WhatsApp Cloud API\n+1 555-201-3457]
        WEB[Paytm Business Webhook] --> GW[FastAPI Ingestion Gateway\nPOST /api/webhook/whatsapp]
        WA_META -->|POST Webhook with wamid| GW
    end

    subgraph INGEST ["2. Ingestion, Deduplication & Routing"]
        GW --> DEDUP{wamid Seen Before?}
        DEDUP -->|Duplicate| DROP[200 OK - Already Processed]
        DEDUP -->|New| GREET{Short Greeting?\n'hello / hi / kaise ho'}
        GREET -->|Yes| GREET_REPLY[Direct Greeting Dispatch\nNo Risk Ops / No Ticket Clutter]
        GREET -->|No| CREATE_TICKET[Create Ticket T-WAxxxx\nBind Merchant via Phone / ID]
    end

    subgraph STAGE1 ["3. Language Comprehension (Sarvam 105B)"]
        CREATE_TICKET --> SARVAM[Sarvam 105B Indic LLM\nPOST api.sarvam.ai/v1/chat]
        SARVAM -->|Proposed JSON Plan\nIntent: SETTLEMENT_MISSING\nAmount: 14280, Confidence: 0.94| PROPOSED_PLAN[Candidate Action Plan\nZero Fund Rights]
    end

    subgraph STAGE2 ["4. Merchant History & Context Layer"]
        PROPOSED_PLAN --> MEMORY[Context & Dispute Recall\nbackend/app/memory.py]
        MEMORY <-->|Fetch past retries, dispute count, risk flags| DB[(Supabase PostgreSQL 17 Mumbai\n+ SQLite Local Fallback)]
        MEMORY --> CONTEXT[Enriched Merchant History]
    end

    subgraph STAGE3 ["5. Deterministic Policy Gate (No LLM)"]
        CONTEXT --> POLICY[Policy Engine\nbackend/app/policy.py]
        POLICY --> CHK_AML{AML / Frozen Account?}
        CHK_AML -->|Flagged| ESC_RISK[ESCALATE_RISK\nSynthesize 6-Line Ops Brief]
        CHK_AML -->|Clear| CHK_LIMITS{Amount <= ₹50,000\n& Retries < 2?}
        CHK_LIMITS -->|Violated| ESC_CAP[SETTLEMENT_RETRY_DENIED\nRoute to High-Value Desk]
        CHK_LIMITS -->|Passed| SIGN_TOKEN[Generate Cryptographic Token\ntok_sha256:timestamp:action:amount:merchant]
    end

    subgraph STAGE4 ["6. Cryptographic Tool Execution Runtime"]
        SIGN_TOKEN --> RUNTIME[Tool Runner\nbackend/app/tools.py]
        RUNTIME --> VERIFY_TOKEN{Token Valid\n& Not Replayed?}
        VERIFY_TOKEN -->|No / Replay| ABORT[403 Forbidden\nToken Violation Logged]
        VERIFY_TOKEN -->|Yes| BURN_TOKEN[Atomically Burn Nonce]
        BURN_TOKEN --> EXEC_STL[execute_retry_settlement_file\nUpdate status to RETRY_REQUESTED]
        EXEC_STL --> LOG_AUDIT[Write Immutable Audit Log\nActor: POLICY_ENGINE / SARVAM_AI]
    end

    subgraph OUTBOUND ["7. Outbound Dispatch & Ops Desk"]
        LOG_AUDIT --> SEND_WA[execute_send_whatsapp\nSelect Approved Hinglish Template]
        SEND_WA --> META_GRAPH[Meta Graph API v20.0\nPOST /PHONE_ID/messages]
        META_GRAPH -->|Verified Notification| M
        LOG_AUDIT --> NEXT_UI[Next.js 14 Real-Time Desk\nhttps://paytm-desk.vercel.app]
    end

    classDef inbound fill:#E6F8FE,stroke:#00BAF2,stroke-width:2px;
    classDef gate fill:#FEF3C7,stroke:#F59E0B,stroke-width:2px;
    classDef safe fill:#DCFCE7,stroke:#16A34A,stroke-width:2px;
    classDef danger fill:#FEE2E2,stroke:#DC2626,stroke-width:2px;

    class M,WA_META,GW,WEB inbound;
    class POLICY,CHK_AML,CHK_LIMITS,VERIFY_TOKEN gate;
    class SIGN_TOKEN,RUNTIME,BURN_TOKEN,EXEC_STL safe;
    class ESC_RISK,ESC_CAP,ABORT danger;
```

---

## 🔐 Cryptographic Policy Tokens (`tok_sha256`)

### Why SHA-256?
In distributed financial architectures, passing authorization across services (e.g., Policy Evaluator ➔ Backend Settlement Gateway) requires **provable integrity** and **single-use replay resistance**.

If an attacker manipulates the payload in transit, or if a rogue subagent hallucinates a higher settlement retry amount, the token verification fails instantly.

### Mathematical Token Structure
When the deterministic policy validates a transaction, it signs an HMAC-style cryptographic token:

$$\text{Payload} = \text{timestamp\_ms} \parallel \text{ticket\_id} \parallel \text{action} \parallel \text{amount\_cents} \parallel \text{merchant\_id} \parallel \text{SECRET}$$

$$\text{Token} = \text{"tok\_"} \parallel \text{SHA-256}(\text{Payload})[:24]$$

```python
# backend/app/policy.py
import hashlib, time

def issue_policy_token(ticket_id: str, action: str, amount: float, merchant_id: str) -> str:
    timestamp_ms = int(time.time() * 1000)
    canonical = f"{timestamp_ms}:{ticket_id}:{action}:{int(amount * 100)}:{merchant_id}:{SECRET_KEY}"
    signature = hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:24]
    return f"tok_{signature}"
```

### Single-Use Replay Protection (Nonce Burning)
Every issued policy token is registered in the database before tool execution:
1. **Validation**: The tool runtime checks that `token` exists, is associated with the exact `ticket_id`, and has status `ISSUED`.
2. **Atomic Burn**: Inside an atomic database transaction, the token status is updated to `CONSUMED`:
   ```sql
   UPDATE policy_tokens 
   SET status = 'CONSUMED', consumed_at = NOW() 
   WHERE token = ? AND status = 'ISSUED';
   ```
3. **Replay Rejection**: If an identical token is presented a second time (e.g., duplicate network packet or malicious replay), the row update count is `0`, and execution is aborted with an audit violation.

---

## 🛡️ The 4 Hard Fintech Guardrails

Every proposed action must clear **all four deterministic guardrails** before any token is issued:

| Guardrail | Enforcement Rule | Rationale | Failure Mode |
|---|---|---|---|
| **1. Settlement Amount Cap** | $\text{Amount} \le \text{₹}50,000.00$ | Restricts autonomous payouts to routine operational batches | `SETTLEMENT_RETRY_DENIED_AMOUNT` ➔ Escalate to High-Value Desk |
| **2. Retry Limiter** | $\text{Retries} < 2$ | Prevents endless banking retry loops on permanently failed batches | `SETTLEMENT_RETRY_DENIED_RETRIES` ➔ Escalate to Banking Ops |
| **3. Refund Disambiguation** | $\text{Amount} \le \text{₹}2,000.00$ + Verified 12-digit UTR | Prevents blind refunds when multiple customer transactions exist | `ASK_MERCHANT_UTR` ➔ WhatsApp prompts merchant for 12-digit UTR |
| **4. AML & Freeze Blacklist** | $\text{Account Status} \ne \text{FROZEN}$ & $\text{AML Flag} = \text{FALSE}$ | Immediate regulatory freeze lock; zero money movement allowed | `ESCALATE_RISK` ➔ Synthesize 6-line brief to `RISK_OPS` |

---

## 🎭 The 3 Hero Scenarios (Tested & Proven)

| Ticket ID | Merchant & Location | Complaint Text | Autonomous Policy Decision | Real Outcome in DB & WhatsApp |
|---|---|---|---|---|
| **T-1042** | **Sharma Kirana**<br>*(Karol Bagh, Delhi)* | *"Kal se settlement nahi aaya. UTR bhi nahi dikh raha."* (₹14,280 stuck) | `SETTLEMENT_RETRY_OK` | Batch retried, UTR assigned, WhatsApp confirmation dispatched, Ticket `RESOLVED`. |
| **T-1048** | **Glow Salon**<br>*(Lajpat Nagar, Delhi)* | *"Customer bol raha hai paise kat gaye... refund karo"* (3 candidate txns) | `ASK_MERCHANT_UTR` | Zero refunds written, Ticket `WAITING_ON_MERCHANT`, WhatsApp asks for 12-digit UTR. |
| **T-1055** | **Delhi Electronics**<br>*(Nehru Place, Delhi)* | *"1.84 lakh settlement fail ho gaya turant account check karo"* (AML suspect) | `ESCALATE_RISK` | Zero retries attempted, Ticket `ESCALATED`, 6-line operational brief sent to `RISK_OPS`. |

### 🔬 The Anti-Hardcoding Mutation Proof
Judges can verify that Resolve OS contains **zero** hardcoded shortcuts (`if ticket_id == "T-1042"`):
- **Live Amount Mutation**: If you change Sharma Kirana's settlement amount in the database from ₹14,280 to **₹200,000** (using our built-in UI Demo Tools or SQL) and re-run, Resolve OS immediately rejects the retry with `SETTLEMENT_RETRY_DENIED_AMOUNT` and escalates.
- **Dynamic Unfreeze**: If you clear Delhi Electronics' AML freeze flag and lower the amount below ₹50k, the policy immediately accepts the retry.
- **The policy computes decisions dynamically from live ledger state.**

---

## 💻 Tech Stack & Production Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PRODUCTION TECH STACK                            │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ Frontend          │ Next.js 14 (App Router), React 18, Tailwind CSS, Lucide │
│ Backend           │ FastAPI (Python 3.10+ Async), Pydantic v2, Uvicorn      │
│ Language Model    │ Sarvam AI (sarvam-105b Indic Foundation Model)          │
│ Production DB     │ Supabase PostgreSQL 17 (AWS Mumbai ap-south-1)          │
│ Local / Failover  │ SQLite3 with automated connection pool fallback         │
│ Messaging Gateway │ Meta WhatsApp Cloud API (Graph API v20.0 Sandbox)       │
│ Hosting           │ Vercel Serverless (Frontend & API)                      │
│ Tunneling         │ Cloudflare Zero Trust Tunnels (Local Webhook Ingestion) │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

### Multi-Instance Serverless Single Source of Truth
Resolve OS supports multi-region deployment backed by **Supabase PostgreSQL 17** in AWS Mumbai (`ap-south-1`):
- **Idempotent Webhooks**: Incoming WhatsApp messages are deduplicated using Meta's unique `wamid` message IDs in the `processed_messages` table.
- **Greeting Short-Circuit**: Messages like *"hello"*, *"namaste"*, or *"kaise ho aap"* receive an instant, warm Hinglish routing prompt without polluting the human operator queues.
- **Seamless Local Fallback**: When developing offline or in sandbox mode, the database layer automatically switches to local SQLite without changing a single line of business logic.

---

## 🖥️ Next.js 14 Operations Desk

The Resolve OS web dashboard (`https://paytm-desk.vercel.app`) provides a real-time command center designed with Paytm's official design language:

1. **Queue Sidebar (Left Column)**:
   - **WhatsApp Live**: Displays real-time tickets arriving directly from live WhatsApp merchant messages.
   - **All Tickets**: Full historical queue with real-time status badges (`RESOLVED`, `WAITING_ON_MERCHANT`, `ESCALATED`).
2. **Decision Studio (Center Column)**:
   - **4-Station Progress Ribbon**: Visualizes lifecycle transition (*UNDERSTOOD ➔ FETCHED ➔ DECIDED ➔ ACTED*).
   - **Cryptographic Token Inspector**: Displays the issued `tok_sha256` token, timestamp, and signature validation state.
   - **Sarvam NLU Explanation**: Shows Hinglish extraction confidence and proposed plan.
   - **Operator Controls**: One-click Manual Override (Approve / Reject) and Reset Demo state.
3. **Ledger & Audit Timeline (Right Column)**:
   - **Settlement Ledger Card**: Live batch status (`INITIATED`, `RETRY_REQUESTED`, `SUCCESS`), bank UTR, and retry counters.
   - **Immutable Audit Log**: Chronological trail recording actor (`SARVAM_AI`, `POLICY_ENGINE`, `OPERATOR`), timestamp, and exact tool calls.
   - **WhatsApp Chat Preview**: Live transcript showing inbound merchant queries and outbound verified bot responses.

---

## 🧪 Comprehensive Test Suite and Evaluations

Resolve OS includes three distinct verification test suites ensuring zero edge-case regressions:

### 1. Pytest Unit & Integration Suite (39/39 Passing)
Covers audit log integrity, deterministic policy edge cases, operator runbooks, scenario mutations, and Meta WhatsApp webhook flows:
```bash
PYTHONPATH=. pytest backend/tests/ -v
# Output: 39 passed in 0.55s
```

### 2. Official 19/19 Rubric Evaluation Suite
An automated end-to-end evaluation runner testing every hackathon rubric requirement across 8 functional sections:
```bash
PYTHONPATH=. python3 backend/tests/run_rubric_eval.py
```
```
================================================================================
RESOLVE OS OFFICIAL EVALUATION REPORT
================================================================================
A. Website Hero Tickets       : 4 / 4 PASSED (T-1042, T-1048, T-1055, duplicate run)
B. Proof Not Hardcoded        : 2 / 2 PASSED (Amount > 50k blocks, unfreezing allows)
C. WhatsApp Greetings         : 2 / 2 PASSED (hello, kaise ho aap → zero risk ops)
D. WhatsApp Settlement        : 2 / 2 PASSED (14280 retries on test DB, duplicate blocked)
E. WhatsApp Refund            : 2 / 2 PASSED (850 & wapas → asks UTR, zero payouts)
F. WhatsApp Freeze/High Value : 2 / 2 PASSED (184k & freeze → Risk Ops brief)
G. WhatsApp Garbage/Mixed     : 3 / 3 PASSED (QR logistics, Soundbox device, bare 14,280)
H. Cross-check Board ↔ WA     : 2 / 2 PASSED (audit events & queue integrity verified)
================================================================================
SUMMARY: ALL 19/19 RUBRIC TESTS PASSED WITH 100% COMPLIANCE.
================================================================================
```

### 3. Policy Benchmark — 40 Synthetic Hinglish Tickets
Evaluates 40 real-world edge cases across Hinglish dialect variants, boundary amounts, and hardware failures:
```bash
PYTHONPATH=. python3 backend/tests/eval_policy.py
```
```
Resolve OS Policy Eval — 40 synthetic Hinglish tickets
─────────────────────────────────────────────────────────
Correct decisions : 40 / 40  (100.0%)
Wrong decisions   : 0
Unsafe actions    : 0   ← money moved on a wrong decision
─────────────────────────────────────────────────────────
```

---

## 🚀 Quickstart & Local Installation

### 1. Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher
- npm or yarn

### 2. Clone & Environment Configuration
```bash
git clone https://github.com/sparsh101sparsh/resolve-os.git
cd resolve-os

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the root directory:
```env
# Sarvam AI Credentials
SARVAM_API_KEY=your_sarvam_api_key

# Meta WhatsApp Cloud API Credentials
WHATSAPP_TOKEN=your_permanent_system_user_token
WHATSAPP_PHONE_NUMBER_ID=1329851416876776
WHATSAPP_VERIFY_TOKEN=paytm_desk_hackathon_2026

# Database Configuration (Optional: defaults to SQLite if omitted)
# SUPABASE_DB_URL=postgresql://postgres.xxx:xxx@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

### 3. Seed Database & Start Backend Server
```bash
# Seed initial Paytm ledger and tickets
python -m backend.app.seed

# Start FastAPI on port 8000
uvicorn backend.app.main:app --reload --port 8000
```

### 4. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
# Dashboard opens at http://localhost:3000
```

### 5. Ingest Live WhatsApp Messages via Cloudflare Tunnel
To connect your local FastAPI backend to the Meta WhatsApp Cloud API webhook:
```bash
cloudflared tunnel --protocol http2 --url http://localhost:8000
```
In your **Meta Developer Console** under **WhatsApp ➔ Configuration ➔ Webhook**:
- Callback URL: `https://<your-subdomain>.trycloudflare.com/api/webhook/whatsapp`
- Verify Token: `paytm_desk_hackathon_2026`
- Subscribe to field: `messages`

---

## ⚖️ 100% Honest Disclosure: Live vs Test Data

| Component | Role in Resolve OS | Status |
|---|---|---|
| **Sarvam AI (`sarvam-105b`)** | Hinglish NLU comprehension and structured candidate plan proposals | ✅ **Live API** (`https://api.sarvam.ai/v1/chat/completions`) |
| **Deterministic Policy Engine** | Non-LLM mathematical and boolean rule engine enforcing financial limits | ✅ **Real code + 100% test coverage** |
| **Cryptographic Token Issuer** | SHA-256 single-use authorization token generator & atomic nonce burner | ✅ **Real cryptographic code** |
| **Meta WhatsApp Cloud API** | Inbound merchant messaging webhook & outbound templated notifications | ✅ **Live on Sandbox phone `+1 (555) 201-3457`** |
| **FastAPI Backend & Tools** | Executes approved actions, updates tickets, logs immutable audit events | ✅ **Live on Vercel Serverless runtime** |
| **Audit Ledger & Database** | Real-time dispute history and previous action tracking | ✅ **Live Supabase PostgreSQL 17 (ap-south-1 Mumbai)** |
| **Paytm Core Banking Ledger** | Settlements, transactions, merchants, and devices tables | ✅ **Seeded realistic test data** (labeled TEST DATA) |

> **The Honest Line:** Sarvam 105b, Meta WhatsApp Cloud API, cryptographic policy tokens, Supabase PostgreSQL, and our deterministic policy engine are completely real and live. Core banking settlement rails are not publicly accessible to hackathon teams, so the underlying banking ledger is realistic seeded test data clearly labeled `TEST DATA`.

---

## 👥 Authors & Team

Built with ❤️ for **Paytm ♥ AI Hackathon 2026** by:
- **Sparsh** ([@sparsh101sparsh](https://github.com/sparsh101sparsh))
