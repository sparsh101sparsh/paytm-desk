# DESK UI — copy Paytm Business, not a startup landing page

DESK should look like a new tab that already lives inside **Paytm for Business**.
If a Paytm PM walked in, they should think this shipped from Noida last sprint.

Reference the real merchant dashboard: white canvas, navy type, cyan CTA, left rail, card sections, no purple AI glow.

---

## Design tokens

```
--paytm-navy:        #002970
--paytm-navy-2:      #002E6E
--paytm-cyan:        #00BAF2
--paytm-cyan-hover:  #00A8DC
--paytm-cyan-soft:   #E6F8FE
--page-bg:           #F5F7FB
--surface:           #FFFFFF
--border:            #E6EAF0
--text:              #1B1F3B
--text-muted:        #6B7289
--success:           #14804A
--success-soft:      #E7F6EE
--warn:              #C47B00
--warn-soft:         #FFF4E0
--danger:            #D32F2F
--danger-soft:       #FDECEC
--radius:            12px
--radius-sm:         8px
--shadow:            0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)
```

Type: Inter or Paytm Sans-like. Headings 20–24 / semibold. Body 14. Meta 12 / muted.
Icons: thin line icons like the Business dashboard (home, rupee, refresh, device). Not 3D, not Sparkles-everywhere.

Primary button = filled cyan, white text, 8px radius.
Secondary = cyan text, no fill.
Danger = outline red, never cyan.

---

## Shell (steal this layout)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ paytm for Business          TEST DATA ●   SUPPORT   NEED HELP?   [SS]    │
├────────────┬─────────────────────────────────────────────────────────────┤
│ DASHBOARD  │  DESK                                                       │
│  Home      │  Merchant Support teammate                                  │
│  Payments  │                                                             │
│  Settlements│ ┌─────────┬──────────────────────┬───────────────────────┐ │
│  Refunds   │  │ QUEUE   │  WORKSPACE           │  CONTEXT              │ │
│  Reports   │  │ 280px   │  flex                │  340px                │ │
│            │  │         │                      │                       │ │
│ ACCEPT     │  │         │                      │                       │ │
│  My QR     │  │         │                      │                       │ │
│            │  └─────────┴──────────────────────┴───────────────────────┘ │
│ INTELLIGENCE│                                                             │
│  ▸ DESK    │  status bar: Sarvam · Cognee · n8n                          │
└────────────┴─────────────────────────────────────────────────────────────┘
```

Left rail: exact Paytm Business pattern. Active item gets a 3px cyan bar on the left + cyan-soft background.
Logo top-left: wordmark style “paytm” navy + “for Business” tiny. Under Intelligence, **DESK** is selected.

Top bar: light, 56px, “TEST DATA” green toggle like their dashboard (you are on mock data — lean into it).

Do not build a custom marketing header. The shell *is* the product.

---

## Screen 1 — The only screen you need

### A. Queue (left)

Header: `Tickets` + count chip + filter pills `All · Open · Waiting · Escalated`

Each row:
```
T-1042                    HIGH
Sharma Kirana · Karol Bagh
“Kal se settlement nahi aaya…”
WhatsApp · 2m ago                    OPEN
```

- Selected row: cyan-soft bg + 3px navy/cyan left border
- Status pill:
  - OPEN = cyan-soft + cyan text
  - IN PROGRESS = navy-soft
  - WAITING = warn-soft
  - RESOLVED = success-soft
  - ESCALATED = danger-soft
- Amount if present, right aligned, ₹ with Indian grouping (`₹14,280`)
- Channel icon: WhatsApp green is ok as a 16px glyph only

### B. Workspace (center) — the demo stage

Top of pane:
```
T-1042 · Settlement missing          [ Run DESK ] [ Reset ]
Sharma Kirana · MID m_2041
```

Run DESK = primary cyan button. This is the only loud CTA.

Then a vertical **timeline**, not a chat thread.

Each step is a white card:

1. **Understood** (Sarvam)
   - Small label `SARVAM`
   - “Intent: SETTLEMENT_MISSING · hi-en”
   - One line Hinglish quote from the ticket

2. **Remembered** (Cognee)
   - Label `COGNEE`
   - 2–3 memory chips: `stl_7781 INITIATED` `retry_count 0` `no risk flag`
   - Tiny “open graph” link

3. **Decided** (Policy)
   - Label `POLICY`
   - Big reason-code chip
     - green `SETTLEMENT_RETRY_OK`
     - amber `ASK_MERCHANT_UTR`
     - red `ESCALATE_RISK`
   - One sentence in plain English under it

4. **Acted** (n8n)
   - Label `N8N`
   - Checklist that ticks live:
     - retry_settlement_file(stl_7781)  ✓ 412ms
     - send_whatsapp(settlement_retry_sent)  ✓
     - update_ticket(RESOLVED)  ✓
   - While running: cyan spinner on the current node name

5. **WhatsApp preview**
   - Green-tinted bubble, left aligned like merchant received it
   - Hinglish body
   - Timestamp + “via DESK”

Do not stream tokens like ChatGPT. Animate cards appearing top-to-bottom every ~400ms. That reads as “work happening,” not “chatbot thinking.”

### C. Context (right)

Stacked cards, Paytm Business style (white, 1px border, 12px radius, 16px pad).

**Merchant**
- Avatar circle with initials (SK) on cyan-soft
- Sharma Kirana
- Karol Bagh · Kirana · ACTIVE
- QR LIVE · Soundbox ONLINE (green dots)
- Avg GMV ₹18,400 / day

**Latest settlement**
- Batch id, amount, status pill, UTR or “—”
- Mini table, not a chart

**Memory (Cognee)**
- 3 connected chips: Merchant → Batch → Last action
- “Seen 1 similar ticket · 13 Sep”

**Human inbox** (only populated on escalate)
- Title `RISK_OPS`
- 6-line brief
- `Assign` ghost button (doesn’t need to work)

**Audit**
- Compact log
- `14:02:11  POLICY  SETTLEMENT_RETRY_OK  tok_8f2`
- Monospace 12px for codes, navy for labels

---

## Motion (keep cheap)

- Queue row select: 120ms background
- Timeline cards: fade + 8px rise
- Policy chip: pop scale 0.96 → 1
- n8n checks: draw check, no confetti
- Reset: snap back, no page reload spinner over the whole app

---

## States you must design

| State | What the center shows |
|---|---|
| Idle | Empty timeline, “Select a ticket and press Run DESK” |
| Running | Cards append, Run button disabled + “Working…” |
| Resolved | Green banner under header: `Closed by DESK · 6.2s` |
| Waiting | Amber banner: `Waiting on merchant for UTR` + WhatsApp ask |
| Escalated | Red banner + human brief slides into right pane |
| Error | “Sarvam timeout · used fixture plan” — still finish the ticket |

Never a blank white failure.

---

## What it must NOT look like

- Dark mode cyber agent dashboards
- Purple / violet “GenAI” gradients
- Inter + glassmorphism + blobs
- A chatbot with a text box as the hero
- Big Sparkles icon as the logo
- Custom illustrated onboarding

Paytm Business is white, boxed, cyan buttons, navy titles. Copy that density.

---

## Component recipe (shadcn / raw Tailwind)

- Page `bg-[#F5F7FB]`
- Cards `bg-white border border-[#E6EAF0] rounded-xl`
- Sidebar `w-56 bg-white border-r`
- Active nav `bg-[#E6F8FE] text-[#002970] border-l-[3px] border-[#00BAF2]`
- Primary `bg-[#00BAF2] hover:bg-[#00A8DC] text-white rounded-lg h-9 px-4 text-sm font-medium`
- Status dots 8px circles
- Tables: 13px, row hover `#F5F7FB`
- Rupee amounts: `font-medium tabular-nums`

Logo lockup in sidebar:
```
paytm                 (navy #002970)
for Business          (cyan #00BAF2, 10px)
────────
Intelligence
  DESK                (active)
```

Footer whisper: `Powered by Sarvam · Cognee · n8n` in muted 11px. Partners get credit without stealing the chrome.

---

## Type scale

- App title DESK: 22px / 700 / navy
- Section: 13px / 600 / muted uppercase tracking
- Ticket id: 13px / 600
- Body: 14px / 400 / #1B1F3B
- Meta: 12px / #6B7289
- Reason code: 12px / 600 / tracking-wide / font-mono

---

## Copy voice

UI chrome in English (Paytm Business is English).
Merchant messages in Hinglish.
Buttons: `Run DESK`, `Reset demo`, `Open graph` — not `Execute agentic workflow`.

---

## Optional second view (only if time)

**Graph drawer** from the right: Cognee nodes as simple navy circles + cyan edges. Merchant in the center. Close with X. Do not build a full graph explorer.

**n8n peek**: a small “View workflow” link that opens a screenshot or embedded n8n editor on a second tab. Don’t iframe it inside the Paytm shell if it breaks the look.

---

## Build checklist for the UI AI

- One page, three columns, Paytm Business shell
- Cyan primary, navy text, white cards, #F5F7FB page
- Timeline of work cards, not a chat input
- Reason-code chips in success / warn / danger
- WhatsApp bubble after actions
- TEST DATA toggle in the top bar
- Works at 1440×900 (projector) and 1280×720
)
