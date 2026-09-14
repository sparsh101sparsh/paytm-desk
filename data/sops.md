# Paytm Merchant Support SOP (Settlements & Refunds)

## SOP-1: Settlement Auto-Retry Rules
- Batches in `INITIATED` status with age < 48 hours.
- Maximum auto-retry settlement amount is ₹50,000.
- No risk, AML, or frozen account flags on the merchant profile.
- Maximum allowed retries: 2.
- Upon retry approval: push batch to bank gateway, generate system tracking UTR, notify merchant on WhatsApp with ticket ID.

## SOP-2: Refund Processing Rules
- Customer refund requested by merchant requires an unambiguous single matching `SUCCESS` transaction.
- If multiple matching transactions exist without an exact 12-digit UTR in the merchant's message, DO NOT process any refund.
- Ticket must be transitioned to `WAITING_ON_MERCHANT` and a WhatsApp message must be dispatched requesting the 12-digit UTR or timestamp.

## SOP-3: Risk & AML Escalation
- Any settlement in `FAILED` status with reason `ACCOUNT_FROZEN_SUSPECT` or amounts >= ₹50,000 must NOT be retried.
- Zero unsupervised money movement.
- A 6-line structured operational brief must be dispatched to `RISK_OPS` with recommended next steps.
