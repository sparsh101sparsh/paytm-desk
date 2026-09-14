# BUILD PROMPT — DESK (real system only)

You are a senior full-stack engineer. Build a **working product**, not a prototype theatre.

Read `/CONTEXT.md` if present. This prompt **overrides** it on one point:

> No fake data painted onto the UI. No hardcoded happy-path. No `setTimeout` fake agent. Every click must hit real code, real APIs, and a real database whose state you can inspect after the demo.

If CONTEXT.md and this prompt conflict, **this prompt wins**.

---

## Absolute bans

Do not:

- Hardcode ticket outcomes in the frontend
- Return canned JSON from a mock that ignores inputs
- Animate a fake timeline with `setTimeout` while the backend does nothing
- Show a WhatsApp bubble that was never written to a store
- Print “SARVAM” / “COGNEE” / “N8N” labels without calling those systems
- Invent UTRs, settlements, or policy decisions in React
- Use placeholder images of n8n instead of an imported workflow
- Ship a landing page instead of the product
- Use OpenAI as the primary planner (Sarvam only; local fixture planner only if Sarvam key is missing AND you log `planner=fixture` in the audit table)

Allowed seed: a **one-time database seed** that inserts merchants, tickets, settlements into SQLite. After seed, the app must only read/write that DB. Reset demo = re-run seed, not reload fixtures in memory.

---

## What “real” means here

You will not get production Paytm credentials. Do not pretend you did.

Real means:

1. **SQLite (or Postgres) is the source of truth.** Queue, ticket status, settlements, WhatsApp outbox, audit events all persist. Restart the server; the resolved ticket stays resolved until Reset.
2. **Sarvam API is actually called** when `SARVAM_API_KEY` is set. Store the raw request/response in `audit_events`.
3. **Cognee is actually called** (`add` / `remember` / `search` or equivalent). Memory chips on the UI are query results, not strings in React.
4. **n8n workflow is imported and triggered** via webhook. The UI run starts that webhook (or n8n calls your API). Export `n8n/desk-merchant-ticket.json` that another machine can import.
5. **Policy is Python/JS functions** with unit tests. The UI reason code is the function return value.
6. **Tools mutate rows.** `retry_settlement_file` updates `settlements.status` and writes an audit row. If you refresh, the new status is there.
7. **WhatsApp outbox is a table.** If you cannot send Meta Cloud / Twilio on the day, still insert a real `whatsapp_messages` row (`status=queued|sent|failed`). The bubble renders FROM THAT ROW.
8. Every timeline card is an `audit_events` row streamed or polled from the API. No card exists that the DB does not have.

---

## Product (do not change)

**DESK** — Paytm Intelligence teammate for merchant support.
Track: Autonomous AI Teammates.
Pitch line: *Sarvam proposes. Policy decides. n8n acts. Cognee remembers.*

One workflow only: settlement / payment-dispute tickets.

Three seeded tickets that the **engine** must handle by rules + tools, not by if-ticket-id branches in the UI:

| id | merchant | setup in DB | required outcome after Run |
|---|---|---|---|
| T-1042 | Sharma Kirana | settlement `stl_7781` INITIATED ₹14280, no risk | retry allowed → settlement updated, WhatsApp row, ticket RESOLVED, reason `SETTLEMENT_RETRY_OK` |
| T-1048 | Glow Salon | 3 SUCCESS txns, no single UTR provided | no refund row, ticket WAITING_ON_MERCHANT, WhatsApp ask-UTR, reason `ASK_MERCHANT_UTR` |
| T-1055 | Delhi Electronics | FAILED ₹184000 + `ACCOUNT_FROZEN_SUSPECT` + risk flag | no retry, ticket ESCALATED, human_briefs row, reason `ESCALATE_RISK` |

If someone edits the settlement amount in SQLite to ₹60,000, T-1042 must **stop auto-retrying**. If your code keys off `if ticket_id == "T-1042"`, you failed.

---

## Architecture you must implement

```
UI (Next.js) 
  POST /api/tickets/:id/run
        → n8n webhook  (or orchestrator that n8n also uses)
              → load ticket+merchant from DB
              → Sarvam chat completions (structured Plan JSON)
              → Cognee search/remember
              → policy.decide(plan, db_state)   # no LLM
              → tools.* only if PolicyToken.allowed
              → persist audit + ticket + settlement + whatsapp + memory
  GET  /api/tickets/:id/events   (poll 300ms or SSE)
```

Policy sits in-process. n8n may call `POST /api/policy/decide` and `POST /api/tools/:name`. Do not duplicate policy in n8n Function nodes except as a pass-through.

---

## Schema (minimum)

Implement these tables. Names can vary; columns cannot be fake.

- merchants
- tickets (status: OPEN | IN_PROGRESS | WAITING_ON_MERCHANT | RESOLVED | ESCALATED)
- settlements
- transactions
- devices
- whatsapp_messages (ticket_id, template_id, body, status, created_at)
- human_briefs
- audit_events (ticket_id, ts, actor, type, payload_json, reason_code, policy_token, latency_ms)
- cognee_sync_log (what was added/searched, query, hit count)

`POST /demo/reset` truncates and re-seeds. That is the only “fake” allowed.

---

## Partner wiring (must be live code)

### Sarvam
```
POST https://api.sarvam.ai/v1/chat/completions
Header: api-subscription-key: $SARVAM_API_KEY
model: sarvam-105b
```
Force JSON plan. Temperature ≤ 0.3. Save usage tokens in audit.

If key missing: use `planner.py` fixture that reads **DB state** (not ticket id) and emits a plan. Log `actor=FIXTURE`.

### Cognee
On boot after seed: `add` merchants + last settlements + SOP markdown.
On each run: search by merchant_id + intent; render top hits.
After action: remember outcome text.
If Cognee isn’t installed, fail the `/health` check with `cognee: down` — do not silently skip and invent chips. Optional env `COGNEE_OPTIONAL=1` to skip only in local emergency; default is required.

### n8n
Commit the workflow JSON.
README: import steps + webhook path.
`Run DESK` must trigger it. Prove with an n8n execution id stored on the ticket or audit row (`n8n_execution_id`).

---

## UI

Paytm for Business clone: white `#F5F7FB`, navy `#002970`, cyan `#00BAF2`, left rail, TEST DATA badge.

Three columns: queue | timeline | context.

Timeline cards = mapped `audit_events`.
WhatsApp bubble = latest `whatsapp_messages` row.
Policy chip = last policy audit reason_code.
Merchant panel = SQL merchant + latest settlement.

No chat input as the hero. Button: `Run DESK`.

---

## Tests that must pass without lying

```
pytest backend/tests/test_policy.py
pytest backend/tests/test_scenarios.py
```

`test_scenarios.py` must:

1. seed DB
2. call the same `/run` the UI uses (or orchestrator function)
3. assert T-1042 settlement status changed in DB
4. assert T-1048 refunds table empty
5. assert T-1055 human_briefs has a row
6. mutate T-1042 amount to 60000, run again on a fresh OPEN clone, assert NO retry

Frontend: Playwright optional. Not a substitute for backend tests.

---

## README must include

- How to run backend, frontend, n8n
- How to put real keys in `.env`
- How to import the n8n workflow
- How to verify: `sqlite3 desk.db "select status from tickets"`
- Demo script for the 3 tickets
- Honest line: Paytm systems are simulated in OUR database; Sarvam/Cognee/n8n are real

---

## Definition of done

A reviewer can:

1. Start stack with documented commands
2. Open the board, click T-1042, watch events appear from the API
3. Query SQLite and see the same resolution
4. Change a row, click Run, see policy behave differently
5. Import n8n JSON on a clean n8n and point the webhook
6. With a Sarvam key, see a real HTTP 200 in audit payload
7. Reset demo and repeat

If any step is “we just hardcoded it for the pitch,” delete that code and do it properly.

Build now. Start with schema + policy + seed + /run. Then n8n. Then Sarvam. Then Cognee. Then UI bound only to APIs.
)
