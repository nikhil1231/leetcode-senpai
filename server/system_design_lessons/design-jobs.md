---
id: design-jobs
category: designs
skill: retries
title: Design reliable asynchronous processing, end to end
minutes: 20
summary: A full walkthrough of the document-processing case — durable acceptance with idempotent submissions, a job lifecycle users can see, workers that survive crashes and duplicate deliveries, output publication that's safe to redo, capacity with recovery headroom, and the metrics that tell you users are waiting. Every crash point has an answer.
objectives:
  - Define what "accepted" promises and implement it with a transactional job record and recoverable dispatch
  - Make submission idempotent per user and request ID, rejecting mismatched payloads
  - Make workers crash-safe — leases, retry-safe output, ack after commit — and failures visible
  - Size workers for peak and drain, and monitor oldest-job age
sources:
  - ['AWS Builders Library: Avoiding insurmountable queue backlogs', 'https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/']
  - ['microservices.io: Transactional outbox', 'https://microservices.io/patterns/data/transactional-outbox.html']
  - ['Google AIP-151: Long-running operations', 'https://google.aip.dev/151']
case: jobs
---

> [!tip] The case contract
> Authenticated users submit a stored document for conversion, receive a job ID, and check status; workers produce an output artifact. Inputs already live in object storage. **A successful submission promises the job won't be silently lost.** Workers can crash at any step, and queue messages can be delivered more than once. The same user and request ID must return the same logical job; a different payload with that ID must be rejected. Peak arrivals are **30 jobs/s**; each worker processes **2 jobs/s**. Persistent failures must be visible to users and operators.

## 1. What "accepted" must mean

```predict
prompt: The API inserts a job row and then publishes a message to the queue, returning 202 after both. What happens if the process crashes between the INSERT commit and the publish?
choices:
  - The job is lost forever
  - The job row exists but nobody will process it — unless dispatch is recoverable (an outbox, or workers that poll the jobs table)
  - The queue publishes it automatically
  - The client is told it failed
answer: 1
reveal: |
  That's the dual-write gap. The promise "won't be silently lost" requires the intent to process to be committed with the job: an outbox row in the same transaction (relayed to the queue), or workers that claim directly from the jobs table. A reconciler for jobs stuck in `queued` is a good safety net either way.
```

## 2. API and data model

```http
POST /v1/jobs          {input_key, target_format}   Idempotency-Key: <request_id>   -> 202 {job_id, status}
GET  /v1/jobs/{job_id}                                                               -> 200 {status, progress, output_url?, error?}
```

```sql
CREATE TABLE jobs (
  job_id        UUID PRIMARY KEY,
  owner_id      BIGINT NOT NULL,
  request_id    TEXT NOT NULL,
  request_hash  BYTEA NOT NULL,                -- fingerprint of the payload
  input_key     TEXT NOT NULL,
  target_format TEXT NOT NULL,
  status        TEXT NOT NULL,                 -- queued | running | succeeded | failed
  attempts      INT NOT NULL DEFAULT 0,
  lease_until   TIMESTAMPTZ,                   -- worker lease
  output_key    TEXT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, request_id)                -- same user + request ID = same job
);
CREATE TABLE outbox (id BIGSERIAL PRIMARY KEY, job_id UUID NOT NULL, published_at TIMESTAMPTZ);
```

```faded
title: The submission transaction
prompt: Complete the submit handler's logic.
text: |
  In one transaction: `INSERT INTO jobs (…) VALUES (…) ON CONFLICT (owner_id, request_id) DO NOTHING RETURNING job_id`, together with [[an outbox row for the new job|a direct publish to the queue|nothing else]].

  If the insert returned no row, the request ID was used before, so we load the existing job and compare `request_hash`. If it matches, we return [[the existing job (same job_id)|a new job|an error]]; if it differs, we return [[422 — the request ID was reused for a different payload|the existing job anyway|201 Created]].

  We respond `202` only after the transaction [[commits|starts|is queued]], so a crash before then means the client never got a promise and will safely retry with the same request ID.
explain: Uniqueness on (owner, request ID) makes the submission idempotent and race-safe; the fingerprint catches client bugs; the outbox makes "accepted" durable.
```

## 3. Architecture

```arch
title: Document processing pipeline
nodes:
  - {id: user, label: User, kind: client, x: 0, y: 1}
  - {id: api, label: Jobs API, kind: service, x: 1, y: 1}
  - {id: db, label: Postgres, kind: db, x: 2, y: 1, note: 'jobs + outbox'}
  - {id: relay, label: Outbox relay, kind: worker, x: 2, y: 2}
  - {id: q, label: Queue, kind: queue, x: 3, y: 2}
  - {id: w, label: Workers, kind: worker, x: 3, y: 1, note: 'up to 23 at peak'}
  - {id: s3, label: Object storage, kind: storage, x: 3, y: 0, note: 'inputs + outputs'}
  - {id: dlq, label: Dead letters, kind: queue, x: 4, y: 2}
edges:
  - [user, api, 'POST /jobs']
  - [api, db, 'job + outbox (1 txn)']
  - [relay, db, 'poll outbox']
  - [relay, q, 'publish job_id']
  - [q, w, 'deliver']
  - [w, s3, 'read input, write output']
  - [w, db, 'claim / complete']
  - [q, dlq, 'after N attempts']
paths:
  - label: Happy path
    steps:
      - [user, api, 'Submit with Idempotency-Key']
      - [api, db, 'Insert the job (queued) and an outbox row in one transaction, then return 202 {job_id}']
      - [relay, q, 'The relay publishes the job_id (at least once) and marks the outbox row sent']
      - [q, w, 'A worker receives job_id']
      - [w, db, 'Claim: UPDATE jobs SET status=running, lease_until=now()+5 min, attempts=attempts+1 WHERE job_id=$1 AND status IN (queued, running) AND (lease_until IS NULL OR lease_until < now())']
      - [w, s3, 'Convert and write outputs/{job_id}.pdf — a deterministic key, so a redo overwrites rather than duplicates']
      - [w, db, 'UPDATE status=succeeded, output_key=… WHERE job_id=$1 AND status=running; then ack the message']
```

## 4. Every crash point

```timeline
title: Worker crash points
lanes: [Queue, Worker, Object storage, Database]
state: {Job: queued, Output: none, Message: delivered}
steps:
  - {lane: Queue, to: Worker, text: 'deliver job 77'}
  - {lane: Worker, to: Database, text: 'claim job 77 (lease 5 min)', set: {Job: 'running (lease)'}}
  - {lane: Worker, to: Object storage, text: 'PUT outputs/77.pdf', set: {Output: 'outputs/77.pdf'}}
  - {lane: Worker, to: Database, text: 'status=succeeded, output_key', set: {Job: succeeded}}
  - {lane: Worker, to: Queue, text: ack, set: {Message: acked}}
crashes:
  - after: 1
    label: after claiming, before output
    verdict: safe
    text: The message is redelivered after its visibility timeout. The next worker's claim succeeds once the 5-minute lease expires, and the job runs again from scratch.
  - after: 2
    label: after writing output, before marking succeeded
    verdict: safe
    text: The redo overwrites `outputs/77.pdf` with identical content (a deterministic key) and then marks success. No duplicate artifacts, no lost job.
  - after: 3
    label: after succeeded, before ack
    verdict: duplicate
    text: The message is redelivered. The claim's `WHERE status IN (queued, running)` matches 0 rows, so the worker sees the job is already succeeded and simply acks. A duplicate delivery, no duplicate work.
```

```bug
title: A worker implementation
prompt: Which lines break the guarantees?
lang: python
code: |
  def handle(msg):
      job = db.get_job(msg.job_id)
      queue.ack(msg)
      out_key = f"outputs/{uuid4()}.pdf"
      convert(job.input_key, out_key)
      db.update_job(job.job_id, status="succeeded", output_key=out_key)
bug: [3, 4]
explain: |
  **Line 3** acks before doing the work. A crash during conversion loses the job — exactly what "won't be silently lost" forbids. Ack after the success is committed. **Line 4** writes the output under a random key, so every retry produces another artifact (orphans and storage leaks), and two concurrent deliveries can both "succeed" with different outputs. Use a deterministic key such as `outputs/{job_id}.{fmt}`, and claim the job with a lease before working. (It also never handles failures: exceptions should increment attempts and, after the limit, set status=failed with an error the user can see.)
```

## 5. Failure visibility

- Transient errors (timeouts from the converter, object-store blips) → retry with backoff via redelivery.
- Permanent errors (corrupt input, unsupported format) → `status=failed`, `error="Unsupported file: password-protected PDF"`, message to the DLQ for operators.
- After **N attempts**, fail terminally — never "running" forever.
- `GET /jobs/{id}` checks `owner_id` (job IDs identify jobs; they don't grant access).

## 6. Capacity

```calc
title: How many workers?
prompt: Peak arrivals are **30 jobs/s** and each worker processes **2 jobs/s**. You want enough headroom that a 10-minute backlog built during a worker outage drains within **20 minutes** while peak traffic continues. How many workers?
answer: 23
unit: workers
tolerance: 1.05
steps: |
  Steady state needs 30 ÷ 2 = 15 workers — **zero** drain headroom. A 10-minute outage builds 30 × 600 = 18,000 jobs. Draining them in 1,200 s while 30/s keep arriving needs 30 + 18,000/1,200 = 45 jobs/s → 22.5, so **23** workers (or autoscaling on queue age up to that). This is the trap in the case: 15 workers "handle peak" but never recover from anything.
```

```sort
prompt: Which signal tells you what?
buckets: [Users are waiting too long, Work is failing, The pipeline is healthy but idle]
items:
  - {text: 'Age of the oldest queued job is 14 minutes', bucket: 0, why: 'Queue age is the latency users feel — alert on it against the expected completion time.'}
  - {text: 'Rate of jobs moving to failed, and DLQ inflow', bucket: 1, why: 'Terminal failures and dead letters show broken inputs or broken workers.'}
  - {text: 'Queue depth 0, worker utilisation 10%, oldest job 2 s', bucket: 2, why: 'Healthy and over-provisioned at this moment — a candidate for scaling in.'}
  - {text: 'Outbox rows unpublished for more than a minute', bucket: 0, why: 'Accepted jobs are not even reaching workers — invisible to users until their job never starts.'}
```

```interview
say: |
  "Submission inserts the job with a unique (owner, request_id) and a payload hash, plus an outbox row, in one transaction, then returns 202 — so a crash either leaves nothing promised or a recoverable job. A relay publishes job IDs; workers claim with a conditional update and a 5-minute lease, write output to outputs/{job_id} so redos overwrite, mark succeeded, then ack. Duplicate deliveries see 'already succeeded' and just ack. After five attempts the job fails visibly with an error and goes to the DLQ. 15 workers only match peak, so we run up to 23, autoscaled on oldest-job age, and alert on that age plus outbox lag."
followups:
  - q: Why not ack as soon as the worker receives the message?
    a: A crash mid-conversion would lose the job, violating the acceptance promise. Ack after the result is committed and rely on idempotency for redeliveries.
  - q: What if the same request ID comes with a different file?
    a: Reject it with 422 — it's a client bug. Returning the old job would silently ignore the new request.
  - q: Do you even need a queue?
    a: At 30 jobs/s, workers could claim directly from the jobs table with SELECT … FOR UPDATE SKIP LOCKED. That removes the outbox and the dual write. A queue helps with fan-out, priorities and very high rates — both designs are defensible if crash points are handled.
weak: |
  "Put jobs on a queue and workers process them." No durable acceptance, idempotency, crash analysis, failure state or capacity headroom.
strong: |
  Defines the promise and backs it transactionally, makes submission and processing idempotent, walks every crash point, makes failures terminal and visible, sizes for drain and monitors queue age and outbox lag.
```

```recall
prompt: Walk through what happens if a worker crashes after writing the output file but before marking the job succeeded, and explain which design choices make the outcome correct.
points:
  - The message was never acked, so the queue redelivers it after the visibility timeout
  - The job's lease expires, so another worker can claim it with the conditional update
  - The output is written to a deterministic key based on job_id, so the redo overwrites rather than creating a duplicate artifact
  - The worker then marks the job succeeded and acks; a later duplicate delivery sees succeeded and just acks
model: |
  Because the worker acks only after committing success, the crash leaves the message unacked and the queue delivers it again later. The job row still says running, but its lease has a deadline, so once it expires the new worker's conditional claim succeeds. It reconverts and writes to outputs/{job_id}.pdf — the same key — so the earlier partial or complete output is simply overwritten, with no orphaned duplicate. It marks the job succeeded and acks. If the original message is delivered yet again, the claim matches no rows because the job is already succeeded, so the worker just acks it.
```

```questions
- kind: check
  prompt: What must be true before the Jobs API returns 202?
  choices:
    - text: The job and its recoverable dispatch (outbox row, or a pollable queued state) are committed
      correct: true
    - text: A worker has started the job
      why: Workers can start later. Durability is what the promise needs.
    - text: The output is written
      why: That's completion, not acceptance.
    - text: The message is in an in-memory queue
      why: In-memory queues vanish on restart.
  explanation: "Won't be silently lost" requires durable, recoverable intent before the promise is made.
- kind: check
  type: numeric
  prompt: Peak is 30 jobs/s and each worker handles 2 jobs/s. How many workers are needed just to match arrivals, with no headroom?
  answer: 15
  unit: workers
  tolerance: 0.01
  explanation: 30 ÷ 2 = 15. At exactly this size any interruption creates a backlog that never drains, so provision more.
- kind: check
  type: multi
  prompt: Which make the worker safe against crashes and duplicate deliveries? Select all that apply.
  choices:
    - text: Claiming the job with a conditional update and a lease
      correct: true
    - text: Writing output to a deterministic key derived from job_id
      correct: true
    - text: Acking only after the success update commits
      correct: true
    - text: Skipping work when the job is already succeeded
      correct: true
    - text: Acking immediately on receipt
      why: That loses jobs on a crash.
  explanation: Leases recover from crashes, deterministic outputs make redos idempotent, and acking after commit with status checks handles duplicates.
- kind: check
  prompt: The same user resubmits with the same request ID but a different input file. What should happen?
  choices:
    - text: Reject with 422 because the request ID was reused for a different payload
      correct: true
    - text: Return the original job
      why: That silently ignores the new request.
    - text: Create a second job
      why: That breaks the same-ID-same-job contract.
    - text: Overwrite the original job's input
      why: That corrupts the original request.
  explanation: Store a payload fingerprint with the idempotency key and treat mismatches as client errors.
- kind: fire
  prompt: A job keeps failing because its input is a corrupt PDF. What should the system do?
  choices:
    - text: After bounded attempts, set status=failed with a clear error the user can see, and send it to the DLQ for operators
      correct: true
    - text: Retry forever
      why: The job would show "running" forever and waste capacity.
    - text: Mark it succeeded with an empty output
      why: That's a lie the user discovers later.
    - text: Delete the job silently
      why: That violates "persistent failures must be visible".
  explanation: Terminal failure states with reasons are part of the contract.
- kind: fire
  prompt: Which metric best tells you users are waiting too long?
  choices:
    - text: Age of the oldest queued (or unpublished) job
      correct: true
    - text: Broker uptime
      why: The broker can be up while workers are stalled.
    - text: Worker CPU
      why: Workers stuck on I/O show low CPU.
    - text: Number of API instances
      why: Unrelated to processing delay.
  explanation: Age measures delay directly. Track outbox lag too, which is invisible otherwise.
- kind: fire
  prompt: Why might workers claim jobs directly from the jobs table instead of using a queue at this scale?
  choices:
    - text: At 30 jobs/s, SELECT … FOR UPDATE SKIP LOCKED is simple and removes the database/queue dual write entirely
      correct: true
    - text: Queues can't handle 30 messages per second
      why: They handle far more. This is about simplicity and correctness.
    - text: Databases are always faster than queues
      why: Not in general. It's about removing moving parts.
    - text: It avoids needing idempotency
      why: Crashes still cause redos, so idempotency is still needed.
  explanation: A broker is one mechanism, not a requirement. Polling a durable table is a valid design at modest rates.
- kind: fire
  level: advanced
  prompt: A 10-minute worker outage at 30 jobs/s must drain within 15 minutes while traffic continues. At 2 jobs/s per worker, how many workers?
  choices:
    - text: 25
      correct: true
    - text: 15
      why: That only matches arrivals and never drains.
    - text: 20
      why: That drains at 10 jobs/s, taking 30 minutes.
    - text: 30
      why: That's more than needed.
  explanation: Backlog = 18,000 jobs. Required rate = 30 + 18,000/900 = 50 jobs/s, so 25 workers.
- kind: fire
  type: order
  prompt: Order a worker's steps for one job.
  items:
    - Receive the message with job_id
    - Claim the job with a conditional update and a lease
    - Convert the input and write output to the deterministic key
    - Mark the job succeeded with the output key
    - Ack the message
  explanation: Claim before working, publish idempotently, commit the result, then ack — every crash point is then recoverable.
```
