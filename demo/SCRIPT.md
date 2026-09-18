# Resolve OS Demo Script (90 Seconds on Stage)

## Opening Pitch (15s)
> *"Judges, Paytm merchant support handles thousands of Hinglish tickets every hour about delayed settlements and missing UTRs. Today, bots reply with FAQs and humans are forced to manually push files.*
> 
> *This is **Resolve OS** — an autonomous Paytm Intelligence teammate that doesn't answer questions; it gets the job done.*
> 
> *Our core architecture:* **Sarvam proposes. Policy decides. n8n acts. Cognee remembers.**"

---

## Scene 1: Ticket T-1042 — The Auto-Close (Money Shot) (30s)
1. **Action**: Click `T-1042` (Sharma Kirana) in the Queue.
2. **Narration**:
   > *"Here is Sharma ji from Karol Bagh: 'Kal se settlement nahi aaya. 14,280 rs.'*
   > *Watch the timeline when I click **Run Resolve OS**."*
3. **Action**: Click `Run Resolve OS`.
4. **Narration**:
   > *"1. **Sarvam 105b** parses the Hinglish message and understands intent `SETTLEMENT_MISSING`.*
   > *2. **Cognee** retrieves merchant memory: Sharma Kirana's batch `stl_7781` has 0 retries and clean AML history.*
   > *3. **Deterministic Policy** validates the rules: amount is ₹14,280 (&lt; ₹50,000 threshold), status is INITIATED, age &lt; 48 hours. Policy issues green token `SETTLEMENT_RETRY_OK`.*
   > *4. **n8n** executes the tools: pushes the batch to the bank gateway, generates a real UTR, and transitions the ticket to RESOLVED.*
   > *5. Dispatches a natural Hinglish WhatsApp notification to Sharma ji.*
   > *Zero human intervention. Ticket closed in seconds."*

---

## Scene 2: Ticket T-1048 — Ask, Don't Guess (20s)
1. **Action**: Click `T-1048` (Glow Salon).
2. **Narration**:
   > *"Now Glow Salon asks for a customer refund of ₹850, but did not specify which customer transaction.*
   > *A naive AI chatbot might guess or blindly process money. Watch Resolve OS."*
3. **Action**: Click `Run Resolve OS`.
4. **Narration**:
   > *"Our database has three candidate transactions for ₹850. Policy immediately triggers rule `ASK_MERCHANT_UTR`. Zero refunds are created. The ticket status shifts to `WAITING_ON_MERCHANT`, and a WhatsApp message asks for the 12-digit UTR. Safe and compliant."*

---

## Scene 3: Ticket T-1055 — Escalate with Memory & Brief (25s)
1. **Action**: Click `T-1055` (Delhi Electronics).
2. **Narration**:
   > *"Finally, Delhi Electronics demands clearance on a ₹1,84,000 settlement that failed.*
   > *Click **Run Resolve OS**."*
3. **Action**: Click `Run Resolve OS`.
4. **Narration**:
   > *"Look at the policy chip: `ESCALATE_RISK`. Cognee flagged an active suspect account freeze, and the amount exceeds ₹50,000. Zero retries were attempted.*
   > *Instead, Resolve OS synthesized a 6-line operational brief directly into the Risk Ops queue with exact verification checks and recommendations.*
   > *Full auditability. Zero unsupervised money movement."*

---

## Closing Line (5s)
> *"Sarvam proposes. Policy decides. n8n acts. Cognee remembers. Thank you!"*
