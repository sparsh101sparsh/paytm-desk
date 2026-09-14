# DESK — Paytm Autonomous Teammate
## Track: Autonomous AI Teammates
## Event: Paytm ♥ AI Hackathon · Delhi · 19 Sep 2026
## Stack: Sarvam + Cognee + n8n (use all three or you leave points on the table)

Give this file to another AI. Say: "Build DESK. Partner stack is mandatory. Demo the 3 tickets first."

---

## Pitch in 4 lines

Paytm merchant tickets are Hinglish. Bots reply. Humans close.

DESK is the teammate that closes.

Sarvam understands the merchant. Cognee remembers this merchant. n8n does the work. A small policy file decides what is allowed.

---

## Why partners win here

Judges from Sarvam / Cognee / n8n sit in the room. They score "used our product for a real job," not "mentioned the logo."

| Partner | Job in DESK | What they see in the demo |
|---|---|---|
| **Sarvam** | Brain + Indian language | Hinglish ticket in → Hinglish WhatsApp out. Model `sarvam-105b`. Optional: Saaras on a voice note, Bulbul speaks the resolution. |
| **Cognee** | Memory | Same merchant, second ticket: DESK already knows last settlement failed and Soundbox was flaky. Graph on screen. |
| **n8n** | Hands | Visible workflow: classify → recall memory → policy → retry settlement / WhatsApp / escalate. Nodes light up live. |

Do not use OpenAI as the primary brain. Sarvam is the planner. Fallback only if the key dies mid-demo.

---

## What DESK does (one job)

Merchant Support teammate for **settlements + payment disputes**.

Three live tickets. That is the whole product.

1. **Auto-close** — Sharma Kirana, ₹14,280 settlement stuck `INITIATED` → n8n retries file + WhatsApp + ticket RESOLVED.
2. **Ask, don't guess** — Glow Salon refund, 3 possible txns → WhatsApp asks for UTR. No refund.
3. **Escalate with memory** — Delhi Electronics ₹1.84L + `ACCOUNT_FROZEN` → Cognee already has a prior risk flag → human brief, no retry.

Second ticket from Sharma Kirana later in the demo: Cognee recall ("last time we retried batch stl_7781") is the partner flex.

---

## Architecture (keep this small)

```
Merchant ticket / voice note
        │
        ▼
[Sarvam]  Saaras if audio → text
          sarvam-105b proposes a Plan JSON
        │
        ▼
[Cognee]  recall(merchant_id, intent)
          remember(ticket, actions, outcome)
        │
        ▼
[Policy]  tiny Python/JS rules  (not an LLM)
          allow | ask | escalate
        │
        ▼
[n8n]     execute allowed tools
          mock Paytm: merchant, settlements, tickets, WhatsApp
        │
        ▼
DESK board  = n8n timeline + Cognee subgraph + audit chips
```

Rule: Sarvam never calls Paytm systems directly. n8n does. Policy sits between them.

---

## Partner implementation notes

### Sarvam
- Chat: `sarvam-105b` via `https://api.sarvam.ai/v1/chat/completions` header `api-subscription-key`.
- Structured plan JSON only: intent, tools to read, proposed write actions, needs_human.
- Language: merchant `preferred_lang = hi-en` → replies in Hinglish. Use Mayura only if you must translate a canned SOP.
- Voice (if time): Saaras on a 8-second "settlement nahi aaya" clip for ticket 1. Bulbul reads the WhatsApp out loud. One clip is enough. Do not build a call center.

### Cognee
Ingest before demo (`cognee.add` / `remember`):
- merchant profiles
- last 30 days settlements + tickets (fake but consistent)
- Paytm SOP snippets (when to retry, when to escalate)
- policy reason codes as nodes

On every ticket:
- `recall("merchant m_2041 settlement")` → past batches, past outcomes
- after action: `remember` the event so ticket 1 teaches ticket 1b

Show the graph in the UI (merchant → ticket → batch → reason_code). Screenshot this for the deck.

### n8n
One workflow `DESK - Merchant Ticket`.

Nodes (keep ~8, not 40):
1. Webhook `POST /desk/run` (ticket_id)
2. Function: load ticket + merchant
3. HTTP: Sarvam plan
4. HTTP: Cognee recall
5. Function: policy(plan, memory)
6. Switch: allow / ask / escalate
7. HTTP mock tools (retry, whatsapp, update ticket)
8. HTTP: Cognee remember + respond to UI

Put the n8n canvas on a second monitor during judging. Execute ticket 1 with the editor open so nodes go green.

Mock Paytm APIs can be a 50-line FastAPI or even n8n static data. Do not chase real Paytm credentials.

---

## Policy (the thing that is not a partner, but wins trust)

Hard rules, no model:

- retry settlement only if status=INITIATED, age<48h, amount<50000, no risk flag
- refund only if exactly one matching SUCCESS txn ≤2000 with UTR
- amount≥50000 or ACCOUNT_FROZEN / AML → escalate
- ambiguous txns → ask merchant

Print reason codes on the board: `SETTLEMENT_RETRY_OK`, `ASK_MERCHANT_UTR`, `ESCALATE_RISK`.

Say this line: "Sarvam proposes. Policy decides. n8n acts. Cognee remembers."

---

## UI

One screen. Internal tool, Paytm navy + green.

- Left: ticket queue
- Center: live steps (Sarvam plan → Cognee hits → policy chip → n8n actions)
- Right: merchant card + memory chips + audit
- Bottom: WhatsApp bubble in Hinglish

Buttons: Run selected · Reset demo · Show graph

No landing page. No auth.

---

## Build order (Delhi one-day)

1. Seed JSON for 3 merchants + 3 hero tickets + SOP text.
2. n8n workflow with fixture plan (no Sarvam yet) so Scene 1 runs.
3. Policy function + reason codes.
4. Wire Sarvam planner.
5. Cognee ingest + recall on merchant id. Show memory on ticket 1 replay.
6. Board UI.
7. If time: Saaras voice note on ticket 1.

---

## Demo script (90 seconds)

"This is DESK, a Paytm Intelligence teammate. Not a chatbot."

Click T-1042. Watch n8n. "Sarvam read Hinglish. Cognee found the stuck batch. Policy allowed retry. n8n pushed the file and messaged Sharma ji."

Click T-1048. "Three payments. Policy refused a refund. It asked for the UTR."

Click T-1055. "Cognee already had a freeze flag. DESK did not touch money. Risk ops got a brief."

"Same teammate pattern clones to sales and collections. Today it closes settlements."

---

## What not to do

- Don't wrap GPT-4 and slap partner logos on the slide.
- Don't build 6 agents with names.
- Don't integrate real UPI.
- Don't ingest Wikipedia into Cognee. Ingest *this merchant*.
- Don't hide n8n. The canvas is part of the product.

---

## Env

```
SARVAM_API_KEY=
COGNEE_... (local default is fine)
N8N_WEBHOOK_URL=
```

If Sarvam is down, n8n fixture plan still plays the 3 scenes.

---

## Done when

- All three partner logos appear on the architecture slide *and* in the live path
- T-1042 / 1048 / 1055 behave as above
- Cognee recall is visible on a repeat ticket
- n8n canvas can be shown executing
- WhatsApp text is Hinglish via Sarvam, not a hardcoded English string only
)
