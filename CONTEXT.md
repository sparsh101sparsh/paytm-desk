# CONTEXT.md — DESK
Hand this single file to a coding AI.

Instruction to that AI:
> Read this whole file. Build DESK exactly as specified. Do not invent extra tracks, extra agents, real UPI, or a marketing site. Ship the 3 demo tickets + Paytm Business UI first.

---

# 1. Event

**Paytm ♥ AI Hackathon — Delhi — 19 September 2026**

Partners on the poster (using them is a judging advantage):
- **Sarvam** — Indian LLM, Hinglish, speech
- **n8n** — workflow / actions
- **Cognee** — agent memory / knowledge graph
- HackBriven — organiser

Track chosen: **Autonomous AI Teammates**

Track brief (from the portal):
> Build AI teammates that don't just respond; they get the job done.
> Design an AI teammate that can go beyond answering questions and deliver measurable outcomes in sales or customer service. The AI should understand context, make decisions, take actions, and work alongside human teams.
> Example — How might we build an AI teammate that can independently handle a customer-service or sales workflow end-to-end — resolving issues, taking actions across systems, and escalating to humans only when needed?

Other tracks exist (Merchant Growth AI, AI-Powered Financial Journeys). Do not build those. DESK is a CS teammate. Merchant growth can be a “next” slide only.

Constraint: this should feel like a **feature inside Paytm**, not a standalone startup.

---

# 2. Product

**Name:** DESK  
**Lockup:** Paytm Intelligence · DESK  
**One line:** An AI teammate that does not answer questions. It closes the job.

**Who it works for:** Paytm Merchant Support (ops sitting on settlement / payment disputes).

**Promise:** DESK reads a Hinglish merchant ticket, checks Paytm-like systems, takes the next *allowed* action, and only wakes a human when policy says so.

**The sentence you say on stage:**
> Sarvam proposes. Policy decides. n8n acts. Cognee remembers.

---

# 3. Non-goals

Do not build:
- A general chatbot / text box as the hero
- Real Paytm / UPI / bank APIs
- Auth, SSO, production deploy complexity
- Multi-agent swarm with 6 named agents
- Fine-tuned models
- Insurance / lending journeys
- Dark-mode cyber dashboards
- OpenAI as the primary brain (Sarvam is primary; fixture fallback if key missing)

---

# 4. Partner stack (mandatory)

| Partner | Role | Visible in demo |
|---|---|---|
| **Sarvam** | Brain + Indian language | `sarvam-105b` plans from Hinglish. Optional: Saaras on one voice note, Bulbul speaks one reply. |
| **Cognee** | Memory | Ingest this merchant’s tickets/settlements/SOPs. Recall on every run. Show graph chips. |
| **n8n** | Hands | Workflow executes tools. Keep the canvas open while judging so nodes go green. |

If a partner key is missing, the 3 scenes must still run on fixture plans. The demo cannot die.

### Sarvam
- Endpoint style: `https://api.sarvam.ai/v1/chat/completions`
- Header: `api-subscription-key`
- Model: `sarvam-105b`
- Output: structured Plan JSON only
- Language: merchant `preferred_lang = hi-en` → Hinglish WhatsApp
- Optional voice: one 8s clip “settlement nahi aaya” via Saaras for ticket T-1042

### Cognee
Ingest before demo:
- 6 merchant profiles
- ~30 days fake settlements + tickets
- short SOP text (when to retry / ask / escalate)
- reason codes as nodes

Every run:
- `recall(merchant_id, intent)`
- after action: `remember(ticket, action, outcome)`

Second look at Sharma Kirana must show memory of the first run.

### n8n
One workflow `DESK - Merchant Ticket` (~8 nodes, not 40):

1. Webhook `POST /desk/run` `{ ticket_id }`
2. Load ticket + merchant
3. HTTP Sarvam plan
4. HTTP Cognee recall
5. Function policy(plan, memory)
6. Switch allow / ask / escalate
7. HTTP mock tools
8. Cognee remember + return events to UI

Mock Paytm systems = small FastAPI or n8n static data.

---

# 5. Architecture

```
Ticket / optional voice note
        │
        ▼
[Sarvam]   understand + propose Plan JSON
        │
        ▼
[Cognee]   recall merchant memory
        │
        ▼
[Policy]   deterministic rules  (NOT an LLM)
           allow | ask | escalate
           emits reason_code + PolicyToken
        │
        ▼
[n8n]      execute only allowed tools
           mock: merchant, settlements, txns, tickets, WhatsApp
        │
        ▼
DESK board (Paytm for Business UI)
```

**Hard rule:** the model never calls write tools directly. n8n runs writes only with a live PolicyToken for that action + args.

---

# 6. Policy (build this first)

Pure functions. Unit-test without any API key.

| Action | Allow | Else |
|---|---|---|
| All `get_*` reads | always | — |
| `retry_settlement_file` | status `INITIATED`, age < 48h, amount < ₹50,000, no risk flags, retries < 2 | `FAILED` + `ACCOUNT_FROZEN*` / AML / amount ≥ 50k → escalate |
| `request_refund` | exactly one SUCCESS txn, amount ≤ ₹2,000, age < 24h, UTR present | ambiguous → ask; else escalate |
| `send_whatsapp` | allowlisted templates only | no free-form |
| `update_ticket` → RESOLVED | a successful allowed write happened this run + no risk | else deny |
| `assign_human` | always | — |

Reason codes (show in UI, they look like production):

```
SETTLEMENT_RETRY_OK
SETTLEMENT_RETRY_DENIED_AMOUNT
SETTLEMENT_RETRY_DENIED_RISK
SETTLEMENT_RETRY_DENIED_STATUS
ASK_MERCHANT_UTR
REFUND_DENIED_AMBIGUOUS
ESCALATE_RISK
ESCALATE_AMOUNT
ESCALATE_UNKNOWN_INTENT
POLICY_OK_NOTIFY
```

---

# 7. Demo — three tickets, 90 seconds

Seed these exactly. One-click from the queue.

### T-1042 — Auto-close (money shot)
- Merchant: Sharma Kirana, Karol Bagh, `m_2041`
- Text: `Kal se settlement nahi aaya. UTR bhi nahi dikh raha. 14,280 rs.`
- Settlement `stl_7781` amount 14280 status `INITIATED` no UTR
- DESK: Sarvam intent SETTLEMENT_MISSING → Cognee finds batch → policy `SETTLEMENT_RETRY_OK` → n8n retries + WhatsApp + ticket RESOLVED
- Human is not pinged

WhatsApp template:
> Namaste Sharma ji, Paytm DESK here. Aapka settlement batch stl_7781 bank file mein atka tha. Humne dubara push kar diya hai. 2 ghante mein check karein. Ticket T-1042.

### T-1048 — Ask, don’t guess
- Merchant: Glow Salon
- Text: refund nahi aaya
- Three candidate txns
- Policy `ASK_MERCHANT_UTR` — no refund created
- Ticket → WAITING_ON_MERCHANT
- WhatsApp asks for UTR / last-4 / time

### T-1055 — Escalate with a brief
- Merchant: Delhi Electronics
- Amount ₹1,84,000 status `FAILED` reason `ACCOUNT_FROZEN_SUSPECT`
- Cognee already has a risk flag
- Policy `ESCALATE_RISK`
- Zero retries
- Human inbox gets a 6-line brief: what was checked, what was refused, recommended next step
- Queue `RISK_OPS`

Also seed 3–5 distractor tickets (Soundbox offline, vague “help”, QR issue) so the queue looks real. Do not spend time automating them until the three heroes work.

---

# 8. Planner contract (Sarvam)

Return JSON only:

```json
{
  "intent": "SETTLEMENT_MISSING | PAYMENT_NOT_RECEIVED | REFUND_STATUS | QR_DOWN | DEVICE_ISSUE | UNKNOWN",
  "confidence": 0.86,
  "summary_en": "",
  "summary_hi": "",
  "proposed_reads": [{ "tool": "get_settlements", "args": { "merchant_id": "m_2041" } }],
  "proposed_writes": [{ "action": "retry_settlement_file", "args": { "batch_id": "stl_7781" }, "why": "..." }],
  "needs_human": false,
  "human_reason": null
}
```

Max 4 planner turns. Timeout ~25s per ticket.

System rules:
- You are DESK, a Paytm ops teammate.
- Never invent UTRs.
- Never claim you transferred money.
- Prefer asking over guessing among multiple txns.
- Propose only. Policy executes.

If Sarvam is down, a fixture planner returns the known plan for T-1042 / 1048 / 1055.

---

# 9. Mock tools

```
get_merchant
get_ticket
list_open_tickets
get_settlements
get_transactions
get_device
retry_settlement_file
request_refund
send_whatsapp          # templates only
update_ticket
assign_human
search_knowledge       # 8 canned SOP snippets
```

WhatsApp allowlist:
- `settlement_retry_sent`
- `ask_utr`
- `refund_raised`
- `human_will_call`

Simulate 200–600ms latency so the timeline feels alive.

---

# 10. UI — clone Paytm for Business

DESK is a new sidebar item inside **Paytm for Business**. Not a consumer Paytm home, not a purple AI landing page.

### Tokens

```
navy         #002970
cyan         #00BAF2
cyan-soft    #E6F8FE
page         #F5F7FB
surface      #FFFFFF
border       #E6EAF0
text         #1B1F3B
muted        #6B7289
success      #14804A
warn         #C47B00
danger       #D32F2F
radius       12px
```

Type: Inter. Amounts: Indian grouping `₹14,280`.
Primary button: filled cyan, white text.
Active nav: cyan-soft + 3px cyan left bar.

### Shell

```
Top bar:  paytm for Business     TEST DATA ●     SUPPORT     [SS]
Left rail:
  DASHBOARD  Home / Payments / Settlements / Refunds
  ACCEPT     My QR
  INTELLIGENCE  ▸ DESK
```

`TEST DATA` toggle stays ON. You are on mock data; that is how their real dashboard looks in sandbox.

### The only app screen — 3 columns

**Left 280px — Queue**
- Pills: All / Open / Waiting / Escalated
- Rows: id, merchant, snippet, channel, age, status pill, amount
- Selected = cyan-soft + left bar

**Center — Workspace**
- Header: ticket id + intent + cyan button `Run DESK` + ghost `Reset demo`
- Timeline of work cards (NOT a chat input):
  1. SARVAM — intent + Hinglish quote
  2. COGNEE — 2–3 memory chips + “open graph”
  3. POLICY — big reason-code chip (green / amber / red)
  4. N8N — live checklist of tools with ms
  5. WhatsApp bubble (Hinglish)
- Cards appear every ~400ms when running
- Banners: Resolved green / Waiting amber / Escalated red

**Right 340px — Context**
- Merchant card: initials avatar, city, category, QR LIVE, Soundbox ONLINE, avg GMV
- Latest settlement row
- Cognee memory chips (Merchant → Batch → Last action)
- Human inbox (only on escalate)
- Audit log: time · type · reason_code · token id (12px mono)

Footer whisper: `Powered by Sarvam · Cognee · n8n`

### Must not look like
Dark cyber dashboards, purple gen-AI gradients, sparkles-as-logo, ChatGPT transcript, consumer Paytm icon grid.

### Motion
Cheap: 120ms row select, fade+8px rise on cards, checkmarks. No confetti.

---

# 11. Repo shape

```
desk/
  CONTEXT.md              (this file)
  README.md
  backend/                FastAPI mock systems + policy + optional planner proxy
    app/policy.py
    app/tools.py
    app/schemas.py
    app/seed.py
    tests/test_policy.py
    tests/test_scenarios.py
  n8n/
    desk-merchant-ticket.json
  frontend/               Next.js App Router + Tailwind
    app/page.tsx          the board
  data/
    merchants.json
    tickets.json
    settlements.json
    transactions.json
    sops.md
  demo/
    SCRIPT.md
```

Stack:
- Frontend: Next.js 14 + Tailwind
- Backend: Python 3.11 FastAPI + SQLite + Pydantic
- Orchestration: n8n webhook
- LLM: Sarvam
- Memory: Cognee (local default ok)

UI talks to FastAPI and/or n8n webhook. Either is fine as long as `Run DESK` plays the timeline.

---

# 12. Env

```
SARVAM_API_KEY=
SARVAM_MODEL=sarvam-105b
N8N_WEBHOOK_URL=
COGNEE_... (local defaults)
DESK_MAX_TURNS=4
DESK_AUTO_AMOUNT_LIMIT=50000
DESK_REFUND_LIMIT=2000
DESK_SETTLEMENT_RETRY_HOURS=48
```

Boot with empty keys. Fixture planner serves the 3 scenes.

---

# 13. Build order

1. `policy.py` + tests (green with no keys)
2. Seed JSON for T-1042 / 1048 / 1055
3. Mock tools + `/tickets/{id}/run` or n8n webhook that returns ordered events
4. Paytm Business shell + 3-column board
5. Wire Sarvam planner
6. Cognee ingest + recall chips
7. WhatsApp Hinglish templates
8. Only then: Saaras voice note, graph drawer

Never start with auth, Docker polish, or a landing page.

---

# 14. Definition of done

- [ ] Looks like Paytm for Business (white / navy / cyan / left rail / TEST DATA)
- [ ] T-1042 auto-resolves with tool cards + Hinglish WhatsApp + `SETTLEMENT_RETRY_OK`
- [ ] T-1048 asks for UTR, zero refunds
- [ ] T-1055 escalates with a human brief, zero retries
- [ ] Policy tests pass with no API key
- [ ] Sarvam is the planner when a key exists
- [ ] Cognee recall is visible on a repeat / related ticket
- [ ] n8n workflow exists and can be shown executing
- [ ] No invented UTR
- [ ] Reset demo restores seed
- [ ] Usable on a projector at 1280×720

---

# 15. Pitch (60s)

Paytm merchant support is a queue of Hinglish messages about settlements and UTRs. Bots reply. Humans close.

DESK is the teammate that does the next step across systems.

Sarvam reads the merchant. Cognee remembers this merchant. Policy decides what is allowed. n8n retries the file, sends WhatsApp, or files a risk brief.

Three live tickets. One closed. One waiting on a UTR. One on a human desk. Full audit. Zero unsupervised money movement.

This is a Paytm Intelligence feature, not a new app.

---

# 16. Voice and copy

- Chrome: English (Paytm Business is English)
- Merchant channel: Hinglish
- Buttons: `Run DESK` `Reset demo` `Open graph`
- Never: “Execute agentic workflow”, “unleash autonomy”

Human brief example (T-1055):

```
Merchant: Delhi Electronics (m_2099)
Amount: ₹1,84,000  Status: FAILED
Reason: ACCOUNT_FROZEN_SUSPECT
Checks: settlement fetched, risk flag present in Cognee, retry blocked.
Not done: no retry, no refund, no WhatsApp promise of money.
Recommend: Risk Ops review freeze + call merchant.
Ticket: T-1055
```

---

# 17. What “win” means

Judges have seen chatbots. They have not seen:
1. A ticket arrive
2. Partner models + memory + workflow actually fire
3. A policy chip that can say NO
4. A WhatsApp the kirana would understand
5. A UI that already looks like Paytm shipped it

Build that. Stop.
)
