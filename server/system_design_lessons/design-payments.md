---
id: design-payments
category: casebook
skill: retries
title: Design a payment system
minutes: 22
summary: Payments combine every hard idea in this course with money attached. External processors time out with unknown outcomes, clients retry, webhooks arrive twice and out of order, and auditors expect every cent to be traceable. The design rests on idempotency at every hop, a persisted state machine around each external call, a double-entry append-only ledger, and reconciliation that assumes something will disagree.
objectives:
  - Make charges exactly-once in effect, with idempotency keys from client to service to processor
  - Model payments as a state machine persisted before external calls, and resolve unknown outcomes safely
  - Record money movement in a double-entry, append-only ledger, including refunds and payouts
  - Reconcile internal records with processor settlements, and handle webhooks safely
sources:
  - ['Stripe engineering: Designing robust and predictable APIs with idempotency', 'https://stripe.com/blog/idempotency']
  - ['Uber engineering: Payments platform — ledger and money movement (Gulfstream)', 'https://www.uber.com/blog/payments-platform/']
  - ['Martin Fowler: Accounting patterns (account, entry, transaction)', 'https://martinfowler.com/eaaDev/AccountingNarrative.html']
case: payments
---

## 1. Requirements

- A marketplace charges buyers through external payment processors (card networks via a processor such as Stripe or Adyen), holds funds, pays out sellers minus fees, and handles refunds.
- **10k payment attempts/s** at peak; processors respond in 200 ms – 30 s and sometimes time out.
- **A customer is never charged twice for one order**, even with retries and timeouts.
- Every movement of money is recorded in a **ledger whose entries always balance**, and is auditable.
- Daily **reconciliation** against processor reports surfaces any discrepancy.

```predict
prompt: The service sends "charge $40" to the processor and the call times out after 30 s. What should it do?
choices:
  - Retry the charge immediately with a new request
  - Mark the payment failed and tell the user to try again
  - Record the outcome as UNKNOWN, then resolve it by retrying with the same idempotency key, querying the processor, or waiting for the webhook — never by sending a new, unrelated charge
  - Assume it succeeded and ship the order
answer: 2
reveal: |
  A timeout is an unknown outcome — the charge may have succeeded. A new charge risks double-charging; declaring failure risks the user paying again elsewhere while the first charge also lands. Resolve it with the **same idempotency key** (the processor returns the original result), a status query, or the asynchronous webhook. Until then, show "processing".
```

## 2. The payment state machine

Each payment is a row that moves through explicit states, **persisted before** each external call so a crash never leaves you not knowing that a call might have happened:

```order
prompt: Order the states of a successful card payment.
items:
  - CREATED — order and payment intent recorded, with an idempotency key
  - AUTHORIZING — about to call the processor (persisted first)
  - AUTHORIZED — funds reserved on the card
  - CAPTURED — money actually taken (often when the order ships)
  - SETTLED — the processor's settlement report confirms the funds
explain: Branches include FAILED (declined), UNKNOWN (timeout — resolve, don't guess), CANCELED (authorisation released) and REFUNDED. Every transition is a conditional update from the expected state, so duplicate webhooks or retries can't move a payment backwards.
```

```timeline
title: Crash points around the processor call
lanes: [Payment service, Payments DB, Processor]
state: {Payment: none, 'Card charged': 'no'}
steps:
  - {lane: Payment service, to: Payments DB, text: "INSERT payment p-9 (CREATED, idem key order-551)", set: {Payment: CREATED}}
  - {lane: Payment service, to: Payments DB, text: "UPDATE p-9 → AUTHORIZING", set: {Payment: AUTHORIZING}}
  - {lane: Payment service, to: Processor, text: "authorize $40, Idempotency-Key: p-9", set: {'Card charged': 'yes (authorised)'}}
  - {lane: Payment service, to: Payments DB, text: "UPDATE p-9 → AUTHORIZED, processor_ref=ch_77", set: {Payment: AUTHORIZED}}
crashes:
  - after: 1
    label: crash in AUTHORIZING, before calling
    verdict: safe
    text: A recovery job finds p-9 stuck in AUTHORIZING and retries the call with the same idempotency key. If the call never happened, it happens now, once. Because the state was persisted *before* the call, we know a call might have happened.
  - after: 2
    label: crash after the processor authorised, before recording it
    verdict: safe
    text: The recovery job retries with Idempotency-Key p-9, and the processor returns the original result (ch_77) instead of authorising again. The authorisation webhook also arrives and is deduplicated. One authorisation, recorded.
  - after: 0
    label: crash right after CREATED
    verdict: safe
    text: Nothing was sent. The client's retry with idempotency key order-551 finds p-9 and continues it.
```

## 3. Idempotency at every hop

- **Client → API:** the checkout carries an idempotency key (per order). The API stores it with the payment (unique constraint) and returns the same payment on retries; a different payload with the same key → 422.
- **Service → processor:** pass a deterministic key derived from the payment (for example `p-9`, or `p-9:capture`), so retries after timeouts return the original result.
- **Processor → us (webhooks):** verify signatures, dedupe by event ID, and apply transitions conditionally (an `authorized` event for a payment already `captured` is a no-op).

```bug
title: A charge endpoint
prompt: Which lines can double-charge or corrupt balances?
lang: python
code: |
  @app.post("/v1/checkout")
  def checkout(user, order_id, amount: float):
      try:
          result = processor.charge(user.card, amount)         # no idempotency key
      except Timeout:
          result = processor.charge(user.card, amount)         # retry
      db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", amount, MERCHANT)
      db.insert_payment(order_id, result.id)
bug: [2, 6, 7]
explain: |
  **Line 2** represents money as a float: binary floating point can't represent amounts like 0.10 exactly, so rounding errors accumulate. Use integer minor units (cents) plus a currency. **Line 6** retries a timed-out charge as a *new* charge with no idempotency key, so if the first succeeded the customer pays twice. Persist the payment state before calling, pass a stable idempotency key, and resolve timeouts by retrying with the same key or querying. **Line 7** mutates a balance column in place: there's no record of why the balance changed, so it can't be audited or reconciled, and it's updated before the payment is even recorded. Write balanced ledger entries in the same transaction as the payment state change.
```

## 4. The ledger

A **double-entry ledger** records every movement as a transaction of two or more entries that **sum to zero**: money leaving one account enters another. Entries are **append-only** — corrections are new entries, never edits — and balances are derived (with periodic snapshots for speed).

```faded
title: Ledger entries for a $100 sale with a 10% marketplace fee
prompt: Fill in the entries (positive = debit, negative = credit, in cents).
text: |
  **Capture** of the buyer's $100 at the processor:
  `processor_receivable  +10000` and `seller_payable  −9000` and `marketplace_revenue  [[−1000|+1000|−10000]]`. The entries sum to [[zero|10000|−1000]].

  **Payout** of the seller's share to their bank:
  `seller_payable  +9000` and `cash  [[−9000|+9000|−10000]]`.

  **Refund** of the full $100 a week later is recorded as [[new reversing entries (not edits to the old ones)|deleting the original entries|editing the original amounts to zero]], and the fee policy decides whether `marketplace_revenue` is reversed too.
explain: Because every transaction balances, the sum of all balances is always zero — a cheap integrity check. Append-only history makes every balance explainable, entry by entry, which is exactly what auditors and reconciliation need.
```

```sort
prompt: Good or bad ledger practice?
buckets: [Good practice, Bad practice]
items:
  - {text: 'Amounts stored as integer minor units with a currency code', bucket: 0, why: 'No floating-point rounding, and no ambiguity about currency.'}
  - {text: 'Fixing a wrong entry by UPDATE-ing its amount', bucket: 1, why: 'That destroys audit history. Post a correcting entry instead.'}
  - {text: 'Writing ledger entries in the same transaction as the payment state change', bucket: 0, why: 'State and money can never disagree after a crash.'}
  - {text: 'Each transaction''s entries summing to zero, enforced by a check', bucket: 0, why: 'That invariant catches bugs immediately.'}
  - {text: 'Computing balances by summing billions of entries on every page view', bucket: 1, why: 'Use maintained balances or periodic snapshots plus deltas, still derived from entries.'}
```

## 5. Reconciliation

Even with perfect code, your records and the processor's will sometimes disagree — missed webhooks, processor-side reversals, chargebacks, currency adjustments, bugs. Every day:

1. Import the processor's settlement report (every captured, refunded and charged-back transaction, plus fees).
2. Match each line to internal payments by processor reference and amount.
3. Flag **missing on our side** (the processor captured, we think it failed), **missing on theirs**, and **amount mismatches**.
4. Resolve automatically where safe (apply a missed webhook's transition) and queue the rest for humans.

```calc
title: Ledger growth
prompt: 'Each completed payment produces on average **6** ledger entries (capture, fee, payout share, and later settlement). At **4 million** completed payments per day, how many ledger entries are written per year, in **billions**?'
answer: 8.76
unit: billion entries/year
tolerance: 1.03
steps: |
  4M × 6 = 24M entries/day × 365 ≈ **8.76 billion** per year. At ~200 bytes each that's under 2 TB a year — manageable in a partitioned relational database (by account and time) with balance snapshots. The constraint is correctness and auditability, not volume.
```

## 6. Architecture

```arch
title: Payments platform
nodes:
  - {id: client, label: Checkout, kind: client, x: 0, y: 1}
  - {id: pay, label: Payment service, kind: service, x: 1, y: 1, note: 'state machine'}
  - {id: db, label: Payments + ledger DB, kind: db, x: 2, y: 1, note: 'one transaction'}
  - {id: proc, label: Processor, kind: external, x: 2, y: 0}
  - {id: hook, label: Webhook receiver, kind: service, x: 3, y: 0, note: 'verify + dedupe'}
  - {id: bus, label: Events (outbox), kind: stream, x: 3, y: 1}
  - {id: recon, label: Reconciliation, kind: worker, x: 3, y: 2, note: daily}
edges:
  - [client, pay, 'POST /payments (idem key)']
  - [pay, db, 'state + entries']
  - [pay, proc, 'authorize / capture (idem key)']
  - [proc, hook, 'webhooks']
  - [hook, db, 'conditional transition']
  - [db, bus, 'PaymentCaptured …']
  - [recon, db, 'match settlement']
paths:
  - label: Checkout
    steps:
      - [client, pay, 'POST /payments with idempotency key order-551 → payment p-9 CREATED']
      - [pay, db, 'Persist AUTHORIZING before calling out']
      - [pay, proc, 'authorize with Idempotency-Key p-9']
      - [pay, db, 'AUTHORIZED + ledger entries + outbox event, in one transaction']
      - [proc, hook, 'Later webhooks (captured, disputed) are verified, deduplicated by event ID, and applied as conditional transitions']
      - [recon, db, 'Nightly: match the processor settlement file against payments and the ledger; flag mismatches']
```

```interview
say: |
  "Each payment is a state machine persisted before every external call: CREATED → AUTHORIZING → AUTHORIZED → CAPTURED, plus FAILED, UNKNOWN and REFUNDED. Checkout carries an idempotency key unique per order; calls to the processor carry a deterministic key per payment step, so a timeout is resolved by retrying with the same key, querying, or the webhook — never by charging again. Every state change writes balanced double-entry ledger rows in integer cents in the same transaction, plus an outbox event. Webhooks are signature-verified, deduplicated and applied as conditional transitions. A recovery job sweeps stuck AUTHORIZING and UNKNOWN payments, and nightly reconciliation matches processor settlement files against the ledger."
followups:
  - q: The processor call timed out. Now what?
    a: Mark the payment UNKNOWN, tell the user it's processing, and resolve by retrying with the same idempotency key or querying the processor; the webhook also arrives. Never issue a fresh charge.
  - q: Why a ledger instead of a balance column?
    a: An append-only, balanced ledger records why every cent moved, makes corrections auditable as new entries, enables reconciliation and catches bugs through the zero-sum invariant. A mutable balance loses history.
  - q: How do order placement and payment stay consistent?
    a: As a saga — reserve inventory, authorise payment, confirm the order, capture at shipment — with compensations (void the authorisation, release inventory, refund) when a later step fails.
weak: |
  Charges synchronously with retries but no idempotency, floats for money, a mutable balance column, trusts webhooks blindly, no reconciliation.
strong: |
  End-to-end idempotency, a persisted state machine with unknown-outcome handling, a double-entry append-only ledger in minor units written atomically with state, verified deduplicated webhooks, sagas and daily reconciliation.
```

```recall
prompt: Explain how a payment system makes sure a customer is charged exactly once when the call to the processor times out.
points:
  - The payment is persisted (state AUTHORIZING) before calling the processor, so the system knows a call may have happened
  - The call carries a deterministic idempotency key tied to that payment, so a retry returns the original result rather than charging again
  - A timeout is treated as UNKNOWN and resolved by retrying with the same key, querying the processor, or applying the webhook — never by a new charge
  - Webhooks are verified and deduplicated, transitions are conditional, and daily reconciliation catches anything still inconsistent
model: |
  Before calling out, the service writes the payment as AUTHORIZING with a stable key, say p-9. The processor call includes Idempotency-Key p-9. If it times out, the payment becomes UNKNOWN and the user sees "processing". A recovery job then retries with the same key: if the first attempt succeeded, the processor returns that original charge; if it never arrived, it runs now, once. The processor's webhook for p-9 may arrive too; it's verified, deduplicated by event ID, and applied only if the state transition is still valid. Anything that still disagrees shows up in the nightly reconciliation against the processor's settlement report.
```

```questions
- kind: check
  prompt: A processor call times out. What's the correct immediate handling?
  choices:
    - text: Record the payment as UNKNOWN and resolve it with the same idempotency key, a status query, or the webhook
      correct: true
    - text: Send a new charge request
      why: If the first succeeded, the customer pays twice.
    - text: Mark it failed
      why: It may have succeeded, so you'd lose track of the money.
    - text: Mark it succeeded
      why: It may have failed, so you'd ship unpaid orders.
  explanation: Unknown outcomes are resolved, never guessed.
- kind: check
  type: multi
  prompt: Which properties should a payments ledger have? Select all that apply.
  choices:
    - text: Each transaction's entries sum to zero (double entry)
      correct: true
    - text: Append-only — corrections are new entries
      correct: true
    - text: Amounts in integer minor units with a currency
      correct: true
    - text: Written atomically with the payment state change
      correct: true
    - text: Floating-point amounts for flexibility
      why: Floats introduce rounding errors.
  explanation: These make the ledger auditable, consistent and correct by construction.
- kind: check
  prompt: Why persist the AUTHORIZING state before calling the processor?
  choices:
    - text: So that after a crash the system knows a call may have happened and can resolve it, instead of losing track
      correct: true
    - text: Processors require it
      why: It's your recovery requirement, not theirs.
    - text: To make the call faster
      why: It adds a write. Correctness is the point.
    - text: To skip idempotency keys
      why: Both are needed.
  explanation: Write-ahead state around external calls makes every crash point recoverable.
- kind: check
  type: numeric
  prompt: 2 million payments a day each create 5 ledger entries. How many entries per year, in billions?
  answer: 3.65
  unit: billion
  tolerance: 0.02
  explanation: 10M per day × 365 = 3.65 billion. Volume is manageable; correctness is the hard part.
- kind: fire
  prompt: How should a full refund appear in the ledger?
  choices:
    - text: As new reversing entries in a new transaction
      correct: true
    - text: By deleting the original entries
      why: That destroys the audit trail.
    - text: By editing the original amounts to zero
      why: Same problem — history is lost.
    - text: Only in the processor's records
      why: Your ledger must reflect every movement of money.
  explanation: Append-only accounting records what happened, including reversals.
- kind: fire
  prompt: A "payment_captured" webhook arrives twice. What prevents double recording?
  choices:
    - text: Deduplicating by event ID and applying a conditional transition (AUTHORIZED → CAPTURED only)
      correct: true
    - text: Trusting that providers send each webhook once
      why: Providers retry, so duplicates are normal.
    - text: Responding 500 to the second one
      why: That causes more retries.
    - text: Ignoring all webhooks
      why: They carry essential updates such as captures and disputes.
  explanation: Webhooks are at-least-once. Make processing idempotent.
- kind: fire
  prompt: What does daily reconciliation catch?
  choices:
    - text: Disagreements between internal records and the processor's settlement report, such as missed webhooks, reversals and amount mismatches
      correct: true
    - text: Slow API responses
      why: That's monitoring.
    - text: Duplicate user accounts
      why: Unrelated.
    - text: Nothing, if the code is correct
      why: External systems change state on their own, so disagreements still happen.
  explanation: Reconciliation assumes divergence and finds it systematically.
- kind: fire
  level: advanced
  prompt: Order creation, payment authorisation and inventory reservation must stay consistent across services. What's the standard approach?
  choices:
    - text: A saga with idempotent steps and compensations (release inventory, void the authorisation, refund) on failure
      correct: true
    - text: A distributed two-phase commit including the card processor
      why: Processors don't participate in your 2PC.
    - text: Charge first, create the order later in a batch
      why: That risks charging for orders that are never created.
    - text: Put everything in one microservice's local variables
      why: That isn't durable.
  explanation: Cross-system workflows use orchestrated or choreographed sagas with compensating actions.
- kind: fire
  type: order
  prompt: Order the steps of a safe checkout charge.
  items:
    - Create the payment with the client's idempotency key (CREATED)
    - Persist AUTHORIZING
    - Call the processor with a deterministic idempotency key
    - Record AUTHORIZED with ledger entries and an outbox event in one transaction
    - Apply later webhooks conditionally and reconcile nightly
  explanation: State is written before every external call, effects are idempotent, and records are atomic and continuously checked.
```
