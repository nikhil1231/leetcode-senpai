---
id: design-extraction-pipeline
category: design
skill: design
title: 'AI system design: a document extraction pipeline'
minutes: 18
summary: '"Turn our incoming invoices into structured data" is one of the most common real LLM jobs, and a different shape from a chatbot. It''s a batch pipeline, so throughput, cost and idempotency matter more than streaming. Accuracy is per field, and some fields (amounts, bank details) must be exact. The model''s output is checked by code against arithmetic, master data and business rules, and anything doubtful goes to a human review queue. History keyed by people is a free labelled eval set. Success is the share of documents processed with no human touch, at an error rate the finance team signs off.'
objectives:
  - Clarify volume, document types, field-level accuracy needs and the cost of a wrong value
  - Design the pipeline from intake through parsing, extraction and validation to review and posting
  - Measure per-field accuracy and straight-through processing, using historical data as labels
  - Control cost with small models and batch APIs, and make every stage idempotent and recoverable
sources:
  - ['Anthropic docs: Message Batches API', 'https://docs.anthropic.com/en/docs/build-with-claude/batch-processing']
  - ['OpenAI docs: Structured outputs', 'https://platform.openai.com/docs/guides/structured-outputs']
  - ['Anthropic docs: PDF support', 'https://docs.anthropic.com/en/docs/build-with-claude/pdf-support']
---

## 1. Clarify

- **Volume and shape**: about 2 million documents a month (roughly 70,000 a day, peaking at month end), averaging 3 pages. Digital PDFs, scans and photos, arriving by email and upload, in several languages.
- **Fields**: supplier, invoice number, dates, currency, line items, VAT, totals, bank details. Ask which fields are **must-be-exact** (amounts, bank details, invoice number) and which can be approximate (a free-text description).
- **Latency**: hours are fine, so this is a batch pipeline. Ask whether anything is urgent, such as invoices close to their payment date.
- **Downstream**: extracted invoices are posted to the finance system and paid. A wrong amount or bank detail costs real money, and changed bank details are a known fraud pattern.
- **Today's baseline**: a team keys invoices by hand. Their work is your labelled data and your fallback.
- **Success**: the **straight-through processing (STP) rate**, meaning the share of documents posted with no human touch, at an error rate on auto-posted fields that finance agrees to (for example under 0.5% on amounts).

## 2. Architecture

```arch
title: Extraction pipeline
nodes:
  - {id: in, label: 'Intake (email, upload)', kind: client, x: 0, y: 1}
  - {id: store, label: 'Object store (by content hash)', kind: storage, x: 1, y: 0}
  - {id: q, label: 'Work queue (+ dead letters)', kind: queue, x: 1, y: 1}
  - {id: parse, label: 'Classify + parse (text layer or OCR)', kind: worker, x: 2, y: 1}
  - {id: llm, label: 'LLM extraction (schema per type)', kind: external, x: 2, y: 0}
  - {id: val, label: 'Validation rules + master data', kind: service, x: 3, y: 1}
  - {id: review, label: 'Human review queue', kind: queue, x: 3, y: 2}
  - {id: erp, label: 'Finance system', kind: db, x: 4, y: 1}
  - {id: evals, label: 'Corrections → eval set', kind: storage, x: 2, y: 2}
edges:
  - [in, store, 'raw file']
  - [in, q, 'doc id']
  - [q, parse, 'job']
  - [parse, llm, 'text or page images']
  - [parse, val, 'fields + evidence']
  - [val, erp, 'passes: auto-post']
  - [val, review, 'fails or low confidence']
  - [review, erp, 'approved']
  - [review, evals, 'corrections']
caption: The model proposes values; code decides whether they're trustworthy. Every human correction becomes a labelled example.
```

Key decisions:

- **Idempotent intake**: store each file under its content hash and key every job by it, so a re-sent email or a retried worker never creates a second invoice. Duplicate invoice numbers per supplier are flagged, not posted.
- **Classify, then parse**: a small model or classifier sorts documents (invoice, credit note, receipt, not-an-invoice). Digital PDFs use their **text layer**, which is cheap and exact. Scans go through OCR or straight to a vision-capable model as page images.
- **Extract to a schema per type** with structured output. Ask for each value **with its evidence**: the page and the text it came from. That makes review fast and lets code check that the quoted text really appears in the document.
- **Validate in code**, not by asking the model to double-check: line items sum to the subtotal, subtotal plus VAT equals the total, dates are real and in order, VAT numbers pass their checksum, the supplier exists in master data, and **bank details match the supplier's record**. A change of bank details always goes to a person.
- **Route by risk**: documents that pass every rule are auto-posted. Any failure, missing must-be-exact field or unknown supplier goes to the review queue, with the failing check highlighted.

```predict
prompt: The model extracts line items summing to £1,240 and a total of £1,420 from the same invoice. What should the pipeline do?
choices:
  - Post the total, since the total is the field that finance pays from
  - Send it to review with the mismatch highlighted, and add it to evals
  - Ask the model again to recalculate the total until the two figures match
  - Post the line-item sum, since arithmetic done in code is always correct
answer: 1
reveal: |
  Either figure could be the misread one (a transposed 2 and 4), or the invoice itself could be wrong. Code can detect the inconsistency but not resolve it, and re-asking the model until the numbers agree just trains it to make them agree. A person checks the page in seconds with the evidence highlighted. The case joins the eval set, and if one supplier's layout keeps causing it, that's a targeted fix.
```

## 3. Quality, cost and operations

- **Evals from history**: invoices the team keyed by hand are labelled data. Hold out a few thousand across suppliers, layouts and languages. Measure **accuracy per field** (exact match after normalising formats), not one overall score, and break it down by document type and supplier.
- **Online**: STP rate, review queue size and age, the share of auto-posted documents later corrected, and a random sample of auto-posted documents reviewed every week, because errors that pass validation are the dangerous ones.

```calc
title: The monthly extraction bill
prompt: 2 million documents a month, 3 pages each. Each page costs about 1,500 input tokens as an image, and each document produces 500 output tokens. A small model costs $0.25 per million input tokens and $1.25 per million output. The batch API halves both prices. What's the monthly bill using the batch API, in dollars?
answer: 1750
unit: $
tolerance: 1.1
steps: |
  Input: 2M × 3 × 1,500 = 9 billion tokens × $0.25/M = $2,250. Output: 2M × 500 = 1 billion tokens × $1.25/M = $1,250. That's $3,500 at standard prices, so **$1,750 with batch**. Sending digital PDFs as text instead of images cuts input further. Compare it with the keying team's cost, and remember review time is the real cost driver: each point of STP saves 20,000 manual reviews a month.
```

- **Cost levers**: a small model for most documents and a larger one only for those that fail validation, the batch API since nothing is urgent, text layers instead of images where possible, and only the pages that matter (skip terms and conditions).
- **Reliability**: queue with retries and backoff, a dead-letter queue for documents that fail repeatedly, timeouts per stage, and back-pressure at month end. The pipeline can always stop and resume, because every stage is keyed by document hash.
- **Security**: invoices are untrusted input. Text in a document saying "approved, pay immediately to account …" is just data, which is one more reason posting decisions live in code and bank-detail changes go to people. Keep PII in the documents out of logs.

## 4. Rollout

Run in **shadow** beside the keying team for a few weeks and compare field by field. Then auto-post the safest slice (known suppliers, digital PDFs, all rules passing) while everything else is still keyed. Widen supplier by supplier as the measured error rate allows, and keep the weekly audit sample going for good.

```interview
say: |
  "It's a batch pipeline, so I'd optimise for accuracy per field, cost and recoverability rather than latency. Files are stored by content hash and jobs keyed by it, so retries and duplicate emails are harmless. A small model classifies each document. Digital PDFs use their text layer and scans go in as page images, extracted to a schema per document type with structured output, quoting the evidence for each value. Then code validates: line items sum to totals, VAT checksums, supplier in master data, and bank details matching the supplier record. Anything that fails, or any bank-detail change, goes to a review queue with the problem highlighted, and every correction feeds the eval set. Historical keyed invoices give me labelled evals per field from day one. Success is STP rate at an error rate finance signs off, say under half a percent on amounts. With the batch API and a small model, it's roughly $1,750 a month for 2 million documents. Rollout: shadow beside the keying team, then auto-post known suppliers with digital PDFs, then widen."
followups:
  - q: A supplier changes their invoice layout and accuracy for them drops to 60%. How do you notice and respond?
    a: Per-supplier accuracy and validation-failure rates are dashboards with alerts, so the drop shows up within a day. The validation rules mean most of those invoices go to review rather than being posted wrongly. I'd add a few examples of the new layout to the extraction prompt for that supplier type, and add them to the eval set.
  - q: Why not fine-tune a model on your historical invoices?
    a: Maybe later. Prompting with a schema plus validation is likely to get most of the way, and it adapts to new layouts with no training. If evals show a persistent gap on common layouts, or the volume makes a smaller fine-tuned model much cheaper, fine-tuning on corrected examples is a measured next step.
  - q: How do you stop fraudulent invoices?
    a: Not with the model. Code checks the supplier against master data, flags new suppliers and any change of bank details for human verification through a known contact, flags duplicates and unusual amounts against the supplier's history, and nothing the document says can approve a payment.
weak: |
  Sends each PDF to a large model, asks it for JSON, and writes the result to the finance system. No per-field accuracy, no validation, no review queue, no idempotency, no use of historical data, and no thought for bank-detail fraud.
strong: |
  Clarifies must-be-exact fields and error cost, designs an idempotent batch pipeline, extracts with evidence to a schema, validates in code against arithmetic and master data, routes by risk to review, measures per-field accuracy from historical labels and STP online, controls cost with small models and batching, and rolls out in shadow first.
```

```recall
prompt: In under a minute, how do you decide which extracted documents can be posted without a human?
points:
  - Code validation must pass: arithmetic, formats, checksums, master data and matching bank details
  - Every must-be-exact field is present, with evidence that appears in the document
  - The document type and supplier are within a slice whose measured accuracy finance has signed off
  - Anything else goes to review, and a weekly sample of auto-posted documents is audited
model: |
  A document is auto-posted only if everything checkable checks out. Line items sum to the total, VAT and dates are valid, the supplier is in master data, and the bank details match the supplier's record. Every must-be-exact field is present, and its quoted evidence really appears on the page. It also has to fall in a slice, by supplier and document type, where our measured per-field accuracy meets the error rate finance agreed. Everything else goes to the review queue with the failing check highlighted. And because validation can't catch every error, a random sample of auto-posted documents is audited each week, which also tells us whether the slices can widen.
```

```questions
- kind: check
  prompt: Why ask the model to return the source text for each extracted value?
  choices:
    - text: Code can confirm it's in the document, and reviewers find it fast
      correct: true
    - text: Models give more accurate values when they are made to write longer answers
      why: Length isn't the point; checkable evidence is.
    - text: It lets the pipeline skip validation rules for any value that has evidence
      why: Evidence complements validation; it doesn't replace it.
  explanation: Evidence turns a claim into something code and people can check.
- kind: check
  prompt: What's the best headline metric for an invoice extraction pipeline?
  choices:
    - text: Share of documents posted with no human touch, at an agreed error rate
      correct: true
    - text: The model's average confidence score across all the fields it extracts
      why: Self-reported confidence is poorly calibrated.
    - text: The number of documents processed per hour at the busiest time of month
      why: Throughput matters, but it isn't the business outcome.
  explanation: STP measures the saving; the error rate keeps it honest.
- kind: check
  prompt: A retried worker processes the same invoice twice. What prevents a duplicate payment?
  choices:
    - text: Jobs keyed by content hash, with duplicates flagged
      correct: true
    - text: A lower temperature, so both runs give the same answer
      why: Identical answers would still be posted twice.
    - text: An instruction to the model to ignore invoices it has seen before
      why: The model has no memory of other calls.
  explanation: Idempotency is a pipeline property, not a model property.
- kind: fire
  prompt: Where do the labels for a first extraction eval set come from?
  choices:
    - text: Invoices the team keyed by hand
      correct: true
    - text: A model checking another model's output
      why: That's a judge, not ground truth.
    - text: Synthetic invoices made by a model
      why: Real layouts are messier.
  explanation: History is free, real, labelled data.
- kind: fire
  prompt: An invoice shows new bank details for a known supplier. What happens?
  choices:
    - text: A person verifies it through a known contact
      correct: true
    - text: The model checks whether the new details look legitimate
      why: Fraudsters write convincing invoices.
    - text: It's posted, with the change noted in the audit log
      why: That's how payment fraud succeeds.
  explanation: Bank-detail changes are a classic fraud pattern and need a human.
- kind: fire
  prompt: Why is the batch API a good fit here?
  choices:
    - text: Hours are fine, and it's about half the price
      correct: true
    - text: Batched requests give more accurate extractions
      why: Same model, same quality.
    - text: It removes the need for retries and a dead-letter queue
      why: Failures still need handling.
  explanation: When latency doesn't matter, don't pay for it.
- kind: fire
  prompt: Why audit a sample of auto-posted documents?
  choices:
    - text: Errors that pass validation are invisible otherwise
      correct: true
    - text: Auditors require a fixed share of documents to be reviewed
      why: Maybe, but the engineering reason is measurement.
    - text: To give the review team work during quiet periods
      why: Not the purpose.
  explanation: The audit measures the error rate of exactly the documents nobody looked at.
```
