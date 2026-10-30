---
id: sync-async
category: apis
skill: retries
title: Synchronous or asynchronous work?
minutes: 15
summary: Doing work in the request path is simple and gives immediate answers, but it ties the caller's latency and availability to every dependency. Accepting work durably and finishing it later decouples them — at the price of a job lifecycle the client must observe, retries, and the honest admission that "accepted" is not "done".
objectives:
  - Decide what belongs in the request path using latency budgets, work duration, dependency risk and the user's need for an answer
  - Design durable acceptance with a job resource and explicit lifecycle states
  - Choose how clients learn about completion — polling, webhooks or push — and make webhooks safe
  - Recognise when asynchrony moves a problem rather than solving it
sources:
  - ['Google AIP-151: Long-running operations', 'https://google.aip.dev/151']
  - ['Stripe: Webhooks best practices', 'https://docs.stripe.com/webhooks']
  - ['RabbitMQ: Consumer acknowledgements and publisher confirms', 'https://www.rabbitmq.com/docs/confirms']
---

> [!story] The "processing…" spinner that lied
> A video platform returned `202 Accepted` the moment an upload finished and put a message on an in-memory queue inside the API process. Deploys restarted the API several times a day. Any video uploaded in the few seconds before a restart showed "processing…" forever. Support tickets blamed the transcoder; the real bug was that **acceptance wasn't durable**. The response promised something the system hadn't secured.

## What goes in the request path?

Keep work synchronous when the user needs the answer to continue, it's fast and bounded, and its dependencies are reliable enough to share your availability. Move it out when any of these hold:

- It **takes longer** than a reasonable request (seconds to hours: transcoding, reports, ML inference batches).
- It **calls flaky or slow dependencies** whose failure shouldn't fail the user's action (emails, webhooks to customers, analytics).
- It **fans out** (notify 10,000 followers).
- It **arrives in bursts** a queue could smooth.

```sort
prompt: Synchronous in the request, or accepted and done asynchronously?
buckets: [Synchronous, Asynchronous]
items:
  - {text: 'Check username availability as the user types', bucket: 0, why: 'Fast, needed immediately, no lasting side effect.'}
  - {text: 'Transcode an uploaded 4K video into six renditions', bucket: 1, why: 'Minutes of CPU. Accept durably, return a job, show progress.'}
  - {text: 'Send the order-confirmation email after checkout', bucket: 1, why: "The order is the user's action; the email provider being down mustn't fail checkout."}
  - {text: 'Reserve stock and create the order at checkout', bucket: 0, why: 'The user needs to know whether they bought it, and the invariant (stock) must be checked now.'}
  - {text: 'Generate a 2-million-row CSV export', bucket: 1, why: 'Too long for a request; produce a file and notify.'}
  - {text: "Fan out a celebrity's post to 30M follower timelines", bucket: 1, why: 'Fan-out work dwarfs the request; do it in the background.'}
  - {text: 'Log in with a password', bucket: 0, why: 'Short, and the user is blocked until it succeeds.'}
```

## Durable acceptance and the job resource

The async contract has two parts:

1. **Accept:** validate, write a durable job record (and the intent to process it) **before** responding, then return `202 Accepted` with a job ID and a `Location` to poll.
2. **Observe:** the job moves through explicit states, and the client can see them — including failure.

```arch
title: Accept now, process later
nodes:
  - {id: client, label: Client, kind: client, x: 0, y: 1}
  - {id: api, label: Job API, kind: service, x: 1, y: 1}
  - {id: db, label: Jobs table, kind: db, x: 2, y: 1, note: 'durable state'}
  - {id: queue, label: Queue, kind: queue, x: 2, y: 0}
  - {id: worker, label: Workers, kind: worker, x: 3, y: 0}
  - {id: store, label: Object storage, kind: storage, x: 3, y: 1, note: outputs}
edges:
  - [client, api, 'POST /exports']
  - [api, db, 'INSERT job']
  - [api, queue, 'enqueue']
  - [queue, worker, 'deliver']
  - [worker, db, 'update status']
  - [worker, store, 'write file']
paths:
  - label: Submit
    steps:
      - [client, api, 'POST /exports {filters} with Idempotency-Key']
      - [api, db, 'INSERT job (status=queued) — committed before we answer']
      - [api, queue, 'Publish job ID (or let workers poll the jobs table; or use an outbox)']
      - [client, api, '202 Accepted, Location: /jobs/77']
  - label: Process
    steps:
      - [queue, worker, 'Worker receives job 77 and marks it running']
      - [worker, store, 'Writes exports/77.csv under a deterministic name (safe to redo)']
      - [worker, db, 'status=succeeded, result_url=…; then acknowledge the message']
  - label: Observe
    steps:
      - [client, api, 'GET /jobs/77 → {status: running, progress: 0.6}']
      - [api, db, 'Read job (and check the caller owns it)']
```

```order
prompt: Order the states of a typical job lifecycle (one valid path).
items:
  - queued — accepted and durably recorded
  - running — claimed by a worker (with a lease that expires if the worker dies)
  - retrying — a transient failure; will run again after a backoff
  - succeeded or failed — terminal, with a result or an error the user can see
explain: Every state must be visible to the client, and **terminal failure must exist**. A job that can only be "processing" forever is a support ticket generator. Leases on "running" let another worker take over when the first one crashes.
```

```timeline
title: Where can acceptance be lost?
lanes: [Client, API, Database, Queue]
state: {Job: 'none', 'Client told': ''}
steps:
  - {lane: Client, to: API, text: 'POST /exports'}
  - {lane: API, to: Database, text: 'INSERT job 77 (queued); COMMIT', set: {Job: '77 queued (durable)'}}
  - {lane: API, to: Queue, text: 'publish job 77'}
  - {lane: API, to: Client, text: '202 Accepted, job 77', set: {'Client told': 'accepted'}}
crashes:
  - after: 0
    label: before the INSERT commits
    verdict: safe
    text: Nothing was promised. The client sees an error or timeout and retries; the idempotency key makes the retry create one job, not two.
  - after: 1
    label: after commit, before publish
    verdict: stuck
    text: The job exists but nobody will process it — **unless** something sweeps for queued jobs. Fix with a transactional outbox, or have workers poll the jobs table, or run a reconciler that re-publishes jobs stuck in queued.
  - after: 2
    label: after publish, before responding
    verdict: safe
    text: The job will run. The client didn't get a response and retries with the same idempotency key, so it gets back job 77 instead of creating a duplicate.
```

> [!mistake] Responding before anything is durable
> Returning 202 after pushing to an in-memory queue, or before the job row commits, promises work the system can lose. The promise must be backed by durable state — or an explicitly accepted risk.

## How the client finds out

| Mechanism | How it works | Good for | Watch out for |
|---|---|---|---|
| **Polling** | Client calls `GET /jobs/77` periodically | Simple clients, scripts | Wasted requests; use backoff and `Retry-After` |
| **Webhook** | Server POSTs to a URL the customer registered | Server-to-server integrations | Retries, ordering, security, receivers that are down |
| **Push to the app** | WebSocket / SSE / mobile push notification | Interactive UIs | Connection management; still keep a pollable source of truth |

Webhooks are where teams get bitten. Senders retry (so receivers see **duplicates**), deliveries arrive **out of order**, and anyone can POST to a public URL.

```bug
title: A webhook receiver
prompt: This endpoint receives "payment succeeded" webhooks and marks orders as paid. Which lines are problems?
lang: python
code: |
  @app.post("/webhooks/payments")
  def payment_webhook(request):
      event = json.loads(request.body)
      order = db.get_order(event["order_id"])
      order.paid_amount += event["amount"]
      send_receipt_email(order)
      db.save(order)
      return 200
bug: [3, 5, 6]
explain: |
  **Line 3** trusts the payload without verifying the signature: anyone can POST "payment succeeded". Verify the HMAC signature header against the raw body and check the timestamp to stop replays. **Line 5** isn't idempotent: providers retry deliveries, so `+=` adds the payment twice. Record the event ID with a unique constraint and set state (`status = paid`) rather than incrementing. **Line 6** does slow, failure-prone work before acknowledging. If the email provider is slow, the sender times out and retries. Store the event, return 200 quickly, and process asynchronously (also, the email goes out before the save commits).
fix: |
  @app.post("/webhooks/payments")
  def payment_webhook(request):
      verify_signature(request.headers["Signature"], request.raw_body)  # HMAC + timestamp
      event = json.loads(request.raw_body)
      with db.transaction():
          inserted = db.insert_ignore("webhook_events", id=event["id"])  # unique on id
          if inserted:
              db.mark_order_paid(event["order_id"], event["payment_id"])  # set, not add
              outbox.enqueue("send_receipt", order_id=event["order_id"])
      return 200
```

## Async doesn't make work faster

A queue changes **when** work happens, not how much capacity you have. If arrivals exceed what workers can process, the backlog grows and "accepted" turns into "done tomorrow". Async systems need:

- capacity planning for the **drain rate** (queue lessons),
- monitoring of **oldest job age**, not just "is the queue up",
- a user-facing expectation: progress, an ETA or at least honest states,
- **admission control** when the backlog exceeds what you can honour.

```predict
prompt: A report endpoint used to time out at the 30 s gateway limit. The team made it async: 202 plus polling. A week later p50 time-to-report is 4 minutes, up from 25 s. What's the most likely reason?
choices:
  - Async processing is inherently slower than synchronous
  - Reports now wait in a queue behind other jobs, and the worker pool is sized below peak arrivals
  - Polling makes the database slower
  - 202 responses are delayed by proxies
answer: 1
reveal: |
  Each report still takes about 25 s of work; the rest is **queueing**. Asynchrony lets you accept bursts but doesn't add capacity. Size workers for peak drain, autoscale on queue age, and consider priorities so small reports don't wait behind huge ones.
```

```calc
title: How many workers for an export queue?
prompt: At peak, **12 exports per second** are requested. Each takes **20 s** of worker time on average. How many workers must be busy, on average, just to keep up (Little's Law)?
answer: 240
unit: workers
tolerance: 1.03
steps: |
  Concurrency = arrival rate × time in service = 12/s × 20 s = **240** workers busy on average. To also drain bursts and absorb failures you'd provision more (often 30–50% more) or autoscale on queue age. If that's too expensive, it's a product question: can exports be batched, cached or made incremental?
```

```interview
ask: How would you design an enterprise data export service, from accepting an export request to letting customers know it has completed or failed?
say: |
  "Export is async: POST validates, inserts a job row with the idempotency key in the same transaction plus an outbox row, and returns 202 with /jobs/{id}. A relay publishes to the queue; workers lease jobs, write output under a deterministic key, mark the job succeeded and then ack. States are queued, running, succeeded and failed, with an error message for failures. Clients poll with Retry-After, and enterprise customers can register signed webhooks — at-least-once, so their receivers must dedupe on event ID. We alert on oldest-job age."
followups:
  - q: What does 202 promise?
    a: That the request is valid and durably accepted, and that the outcome will become observable — not that the work is done. Respond only after the job and its intent to run are committed.
  - q: Polling or webhooks?
    a: Offer polling as the source of truth (simple and robust), and webhooks or push as an optimisation. Webhooks need signing, retries with backoff, idempotent receivers, and a way to replay missed events.
  - q: How do you stop users waiting forever?
    a: Terminal failure states with reasons, retry limits, lease timeouts for crashed workers, and alerts on stuck or old jobs. A reconciler finds jobs in impossible states.
weak: |
  "We'll put it on a queue." No durable acceptance, no job states, no failure visibility, no idea that queues don't add capacity.
strong: |
  Justifies the boundary, commits a job before 202, defines lifecycle states including failure, covers how clients observe completion, makes webhooks safe, and sizes workers for drain rate with age-based monitoring.
```

```recall
prompt: What exactly should a 202 Accepted response promise, and what must the system have done before sending it?
points:
  - It promises the request is valid and the work will be processed, or will reach a visible failure — not that it's complete
  - The job (and its intent to be processed) must be durably recorded before responding
  - The response returns a job identifier or status URL the client can observe
  - Retried submissions must not create duplicates (idempotency key tied to the job)
model: |
  202 means "valid, recorded, and you'll be able to see how it ends." Before sending it, the API must commit a job record durably — together with whatever guarantees it will be picked up, such as an outbox row or a jobs table workers poll — so a crash right after responding can't lose it. The response includes the job ID or a status URL. Because the client may not receive the 202 and retry, the submission must be idempotent: the same idempotency key returns the same job rather than creating a second one.
```

```questions
- kind: check
  prompt: What must happen before an API returns 202 Accepted for a long-running job?
  choices:
    - text: The job and its intent to be processed must be durably recorded
      correct: true
    - text: The job must be complete
      why: That would be a 200 or 201. 202 explicitly means "accepted, not finished".
    - text: A worker must have started the job
      why: The work can wait in a queue. Acceptance only needs to be durable.
    - text: The message must be in an in-memory queue
      why: In-memory queues vanish when the process restarts.
  explanation: 202 promises the work won't be silently lost. Back it with committed state — a job row plus an outbox or a polled jobs table.
- kind: check
  type: multi
  prompt: Which are good reasons to move work out of the request path? Select all that apply.
  choices:
    - text: The work takes minutes
      correct: true
    - text: It calls an email provider whose outages shouldn't fail checkout
      correct: true
    - text: It fans out to thousands of recipients
      correct: true
    - text: The user can't continue without the result, and it takes 20 ms
      why: That's exactly what synchronous calls are for.
    - text: To add processing capacity
      why: Queues smooth bursts. They don't create capacity.
  explanation: Asynchrony suits long, unreliable or fan-out work. It shifts work in time; it doesn't make more of it possible.
- kind: check
  type: order
  prompt: Order the steps of a safe asynchronous submission.
  items:
    - Validate the request and check the idempotency key
    - Commit the job row (and an outbox row) in one transaction
    - Return 202 with the job ID
    - A worker processes the job and records a terminal status
    - The client sees the terminal status by polling or notification
  explanation: Durability comes before the promise, and observation of the outcome closes the loop. Idempotency handles the case where the 202 is lost.
- kind: check
  prompt: A webhook receiver adds the payment amount to the order on each delivery. Why is that a bug?
  choices:
    - text: Webhooks are delivered at least once, so a retried delivery adds the amount twice
      correct: true
    - text: Webhooks are always delivered exactly once
      why: Senders retry after timeouts and errors, so duplicates are normal.
    - text: Webhooks can't carry amounts
      why: They can. The problem is non-idempotent processing.
    - text: Addition is too slow
      why: Speed isn't the issue.
  explanation: Make receivers idempotent. Deduplicate by event ID with a unique constraint and set state rather than incrementing.
- kind: fire
  prompt: After an endpoint was made asynchronous, users wait longer for results than before. What's the most likely cause?
  choices:
    - text: Jobs queue behind each other because worker capacity is below peak arrivals
      correct: true
    - text: Asynchronous code always runs slower
      why: The work itself takes the same time. The added delay is waiting in the queue.
    - text: Polling interferes with processing
      why: Status reads are cheap compared with the work.
    - text: 202 responses are cached
      why: Caching the acceptance response doesn't delay processing.
  explanation: Asynchrony introduces queueing. Size the worker pool for drain rate, autoscale on oldest-job age, and set user expectations.
- kind: fire
  prompt: What must a webhook receiver do before trusting a "payment succeeded" event?
  choices:
    - text: Verify the sender's signature over the raw body (and the timestamp, to stop replays)
      correct: true
    - text: Check that the request came over HTTPS
      why: TLS protects the connection, but anyone can open an HTTPS connection to your endpoint.
    - text: Check the User-Agent header
      why: Headers like that are trivially forged.
    - text: Respond 200 and trust it
      why: That lets anyone mark orders as paid.
  explanation: Public endpoints receive forged requests. HMAC signatures prove the sender and integrity; timestamps limit replay. Then deduplicate by event ID.
- kind: fire
  type: numeric
  prompt: Jobs arrive at 5 per second and each takes 40 s of worker time. How many workers are busy on average at steady state?
  answer: 200
  unit: workers
  tolerance: 0.03
  explanation: Little's Law — 5/s × 40 s = 200. Add headroom for bursts and failures, or the backlog never drains.
- kind: fire
  prompt: A worker crashes while a job is in the running state. How does a well-designed system recover?
  choices:
    - text: The worker's lease on the job expires and another worker reclaims it; the job's outputs are safe to redo
      correct: true
    - text: The job stays running until an engineer intervenes
      why: Without leases and reclaiming, that's exactly the "processing forever" bug.
    - text: The client must submit a new job
      why: Recovery should be automatic, and a resubmission could duplicate work.
    - text: The queue deletes the job
      why: Deleting accepted work breaks the 202 promise.
  explanation: Leases (visibility timeouts) turn worker death into a delay, and idempotent outputs make the retry safe.
- kind: fire
  level: advanced
  prompt: A job is committed to the database, but the process dies before publishing to the queue. With no outbox, what prevents the job being stuck forever?
  choices:
    - text: A reconciler or polling worker that finds jobs left in queued too long and republishes or claims them
      correct: true
    - text: The client's retry with the same idempotency key always republishes
      why: The client may never retry, especially if it did receive the 202.
    - text: The database automatically notifies the queue
      why: Not unless you build exactly that, which is the outbox/CDC pattern.
    - text: Nothing is needed — the queue will eventually find it
      why: The queue never received it.
  explanation: Dual writes (database and queue) need a recovery path — an outbox, CDC, workers polling the jobs table, or a sweeper for stale queued jobs.
```
