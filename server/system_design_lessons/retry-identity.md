---
id: retry-identity
category: apis
skill: retries
title: Timeouts, retries and idempotency
minutes: 17
summary: A timeout tells you that you didn't hear back — not that nothing happened. Retries are how distributed systems survive transient faults, and duplicates are the price. Idempotency turns "at least once" delivery into "exactly once" effects, but only if the key, the stored result and the effect are committed together.
objectives:
  - Reason about ambiguous outcomes after timeouts and lost responses
  - Write a retry policy — which errors, how many times, with backoff, jitter and budgets
  - Implement idempotency keys correctly, including concurrent duplicates, payload mismatch and retention
  - Recognise naturally idempotent operations and when external side effects need the provider's cooperation
sources:
  - ['AWS Builders Library: Making retries safe with idempotent APIs', 'https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/']
  - ['AWS Builders Library: Timeouts, retries and backoff with jitter', 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/']
  - ['Stripe API: Idempotent requests', 'https://docs.stripe.com/api/idempotent_requests']
case: jobs
---

> [!story] Two Generals, every day
> The "Two Generals" problem proves that no protocol over an unreliable channel can guarantee both sides agree an action happened. Every payment API lives with it: the client sends "charge £40", the provider charges the card, and the response is lost on the way back. The client cannot know whether to retry. Stripe, Adyen, AWS and every serious API answer the same way — make retries safe with an **idempotency key**, so "do it again" means "tell me what happened the first time".

## Timeouts are ambiguous

When a call times out, one of three things happened:

1. The request never arrived — retrying is correct.
2. It arrived and failed — retrying might be correct.
3. **It arrived and succeeded, but the response was lost** — retrying causes a duplicate.

The client can't tell these apart. So either the operation must be **naturally idempotent**, or the server must **deduplicate**.

```timeline
title: The lost response
lanes: [Client, API, Database]
state: {Orders: '0', 'Client knows': 'nothing'}
steps:
  - {lane: Client, to: API, text: 'POST /orders (no idempotency key)'}
  - {lane: API, to: Database, text: 'INSERT order 501; COMMIT', set: {Orders: '1'}}
  - {lane: API, to: Client, text: '201 Created … lost (mobile network drops)'}
  - {lane: Client, to: Client, text: 'Timeout after 5 s', set: {'Client knows': 'timeout = unknown'}}
  - {lane: Client, to: API, text: 'Retry POST /orders'}
  - {lane: API, to: Database, text: 'INSERT order 502; COMMIT', set: {Orders: '2 ⚠ duplicate'}}
find:
  prompt: Which step made the retry unsafe — the moment the client could no longer know the outcome?
  answer: 2
  explain: |
    The commit at step 2 succeeded, so the system's state changed. Losing the response at step 3 left the client blind, and its retry at step 5 is indistinguishable from a brand-new order. Retrying isn't the bug; retrying **without an identity for the operation** is.
```

## A retry policy

Not every failure should be retried, and the ones that should need restraint.

```sort
prompt: Should the client retry automatically?
buckets: [Retry with backoff, Retry only if the operation is idempotent, Do not retry]
items:
  - {text: '503 Service Unavailable', bucket: 0, why: 'Transient by definition. Back off, and honour Retry-After if present.'}
  - {text: '429 Too Many Requests with Retry-After: 2', bucket: 0, why: 'Wait the indicated time. Immediate retries make it worse.'}
  - {text: 'Connection reset or timeout on POST /payments', bucket: 1, why: 'The outcome is unknown. Safe only with an idempotency key the server deduplicates on.'}
  - {text: '400 Bad Request: invalid currency', bucket: 2, why: 'The same request will fail the same way. Fix the input.'}
  - {text: '403 Forbidden', bucket: 2, why: 'Retrying with the same credentials will not change the decision.'}
  - {text: 'Timeout on GET /products/42', bucket: 0, why: 'GETs are safe and idempotent.'}
  - {text: '409 Conflict: version mismatch', bucket: 2, why: 'Re-read, merge and send a *new* request. Blindly resending the same one will conflict again.'}
```

Then bound it:

- **Exponential backoff with jitter** — `sleep = random(0, min(cap, base × 2^attempt))`. Without jitter, every client that failed together retries together.
- **A small maximum attempt count**, within the caller's overall deadline.
- **Retry at one layer.** Retries at several layers multiply — three layers of three attempts can make 27 calls.
- **A retry budget** — e.g. retries may add at most 10% extra load. Under a broad outage, most requests fail fast instead of tripling traffic against a struggling dependency.

```sim
name: backoff
title: Retry storms
intro: 2,000 clients hit a dependency that is down for 10 seconds, then recovers with limited capacity. When it's overloaded, its goodput drops.
challenges:
  - {text: 'With fixed 100 ms retries, see attempts run at 50× capacity — and keep thrashing it after recovery', metric: peakLoad, op: '>', value: 2000, and: [{metric: strategy, op: '==', value: immediate}]}
  - {text: 'Switch to exponential backoff with full jitter and serve every client', metric: servedPct, op: '==', value: 100, and: [{metric: strategy, op: '==', value: jitter}]}
  - {text: 'Try plain exponential backoff without jitter: clients retry in synchronised waves and many miss their deadline', metric: servedPct, op: '<', value: 50, and: [{metric: strategy, op: '==', value: exp}]}
  - {text: 'Try the retry budget: the dependency sees the least load, but during a long outage most clients fail fast', metric: gaveUp, op: '>', value: 0, and: [{metric: strategy, op: '==', value: budget}]}
takeaway: |
  Fixed-delay retries keep offered load far above capacity, and an overloaded dependency serves *less* than its capacity, so recovery crawls. Exponential backoff without jitter still sends clients back in synchronised waves. **Full jitter** spreads them out, and everyone gets served. A retry budget caps retry traffic hard: in a long, total outage most callers fail fast instead of piling on. That's the right trade when callers have fallbacks, or when protecting a shared dependency matters more than any single request.
```

## Idempotency keys, done properly

The client generates a unique key per **logical operation** (a UUID) and sends it on the first attempt and every retry. The server stores the key with the result, so a repeat returns the stored result instead of acting again.

The details are where implementations go wrong:

1. **Scope** keys per client or account, so one customer's key can't collide with another's.
2. **Store a fingerprint of the request** (a hash of the method, path and body). The same key with a different payload is a client bug — reject it (`422`), don't return the old result.
3. **Commit the key and the effect atomically.** If the order and the key are written in separate transactions, a crash between them breaks the guarantee.
4. **Handle concurrent duplicates.** Two retries may arrive at the same time. The first claims the key (a unique constraint); the second sees it's *in progress* and gets `409` (try again shortly) or waits — it must not run the operation too.
5. **Retain keys** for longer than clients retry (Stripe keeps them 24 hours), and say what happens after that.

```bug
title: An idempotency implementation
prompt: This handler is meant to make order creation retry-safe. Which lines break the guarantee?
lang: python
code: |
  def create_order(account_id, key, body):
      existing = db.query("SELECT response FROM idem WHERE account_id=%s AND key=%s", account_id, key)
      if existing:
          return existing.response
      order = db.insert_order(account_id, body)            # transaction 1
      response = {"order_id": order.id, "status": "created"}
      db.insert("idem", account_id=account_id, key=key,     # transaction 2
                response=response)
      return response
bug: [2, 7]
explain: |
  **Line 2** is a check-then-act race. Two concurrent retries both find no row, and both create an order. Claim the key first with an INSERT that relies on a unique constraint on `(account_id, key)`, so only one request can win. **Line 7** records the key in a separate transaction from the order. A crash between transaction 1 and 2 leaves an order with no key, so the next retry creates a second order. The key, an in-progress marker and the order must commit together. (It also never stores or checks a fingerprint of `body`, so reusing a key with a different payload silently returns the wrong result.)
fix: |
  def create_order(account_id, key, body):
      fp = sha256(canonical_json(body))
      with db.transaction():
          claimed = db.insert_ignore("idem", account_id=account_id, key=key,
                                     fingerprint=fp, status="in_progress")   # unique (account_id, key)
          if not claimed:
              row = db.query_for_update("SELECT * FROM idem WHERE account_id=%s AND key=%s", account_id, key)
              if row.fingerprint != fp:
                  raise Unprocessable("Idempotency key reused with a different request")
              if row.status == "in_progress":
                  raise Conflict("Original request still in progress; retry shortly")
              return row.response
          order = db.insert_order(account_id, body)
          response = {"order_id": order.id, "status": "created"}
          db.update("idem", status="done", response=response, where={"account_id": account_id, "key": key})
      return response
```

```faded
title: Design the idempotency table
prompt: Fill in the schema decisions.
text: |
  ```sql
  CREATE TABLE idempotency_keys (
    account_id   BIGINT      NOT NULL,
    key          TEXT        NOT NULL,
    fingerprint  BYTEA       NOT NULL,   -- hash of method + path + body
    status       TEXT        NOT NULL,   -- in_progress | done
    response     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, key)
  );
  ```

  The primary key on `(account_id, key)` makes the first INSERT [[the single winner among concurrent duplicates|optional|slower than a SELECT]].

  Storing `fingerprint` lets us reject [[the same key reused with a different body|the first request|requests from other accounts]].

  A nightly job deletes rows older than [[the documented retention window, e.g. 24 hours|1 second|never — keep them forever]], and we document that a retry after that window is treated as a new request.

  For operations that call an external payment provider, we also pass [[our own idempotency key to the provider|nothing extra|a random key on each retry]] so that a crash after their charge but before our commit is still deduplicated on their side.
explain: The table is the server-side memory of "what happened". Uniqueness makes concurrent duplicates safe, the fingerprint catches client bugs, retention bounds cost, and external effects need the downstream system's own idempotency.
```

## Natural idempotency is cheaper

Before adding a key table, see if the operation can be made idempotent by design:

- **Set, don't add:** `status = 'paid'` is idempotent; `balance = balance + 40` is not.
- **PUT to a client-chosen ID:** `PUT /orders/{client_uuid}` creates once; repeats overwrite the same resource with the same content.
- **Upserts and unique constraints:** `INSERT … ON CONFLICT (request_id) DO NOTHING`.
- **Conditional writes:** `UPDATE … WHERE version = 7` can only apply once.

```predict
prompt: Your service charges cards through a provider, then records the charge in your database. The process crashes after the provider charges the card but before your database commit. The client retries with the same idempotency key. What prevents a second charge?
choices:
  - Your idempotency table — the key was stored
  - Nothing in your system; you need to pass an idempotency key to the provider so *it* recognises the retry
  - The database transaction rolls back the charge
  - HTTP retries are exactly-once
answer: 1
reveal: |
  Your key and result were never committed (the crash came first), so your side sees a brand-new request. The external effect already happened, and your transaction can't roll it back. The fix is to pass a deterministic idempotency key to the provider (derived from yours), so the provider returns the original charge. Every boundary with a side effect needs its own deduplication.
```

> [!senior] "Exactly once" is a composition
> Networks deliver at least once (with retries) or at most once (without). "Exactly-once processing" is at-least-once delivery **plus** idempotent effects at every boundary that matters. When someone claims exactly-once, ask: exactly once *what* — delivery, processing, or the external side effect? And deduplicated *where*?

```interview
ask: How would you design timeout and retry handling for an e-commerce order-creation API that charges customers through an external payment provider?
say: |
  "Any timed-out call has an unknown outcome, so creates take an Idempotency-Key header. The server claims the key with a unique constraint in the same transaction as the order, stores a request fingerprint and the response, returns 409 while the original is in progress, and keeps keys for 24 hours. We pass a derived key to the payment provider too. Clients retry only retryable errors, at one layer, with exponential backoff, full jitter and a retry budget, inside the overall deadline."
followups:
  - q: What if the same key arrives with a different body?
    a: Reject it with a 4xx. It's a client bug, and returning the original response would hide that the second request was never executed.
  - q: Two duplicates arrive at the same instant — what happens?
    a: Both try to insert the key. The unique constraint lets one win. The other sees in_progress and gets a 409 to retry shortly (or waits briefly), and never executes the operation.
  - q: Why is jitter important?
    a: Without it, clients that failed together retry at exactly the same moments, producing synchronised waves that can keep a recovering service down.
weak: |
  "We'll retry three times." Doesn't say which errors, ignores duplicates, or claims HTTP gives exactly-once.
strong: |
  Explains ambiguous timeouts, chooses retryable errors with backoff, jitter and budgets at one layer, implements keys atomically with fingerprints and concurrent-duplicate handling, and propagates idempotency to external side effects.
```

```recall
prompt: List the properties a correct idempotency-key implementation needs, and why each matters.
points:
  - The key is claimed atomically (unique constraint), so concurrent duplicates can't both execute
  - The key and stored result commit in the same transaction as the effect, so a crash can't separate them
  - A fingerprint of the request is stored, so reusing a key with a different payload is rejected
  - Keys are scoped (per account or client) and retained for a documented window, longer than clients retry
model: |
  First, claim the key with an INSERT protected by a unique constraint, so of two concurrent retries only one runs and the other sees "in progress". Second, write the key, its status and the response in the same transaction as the business effect — otherwise a crash between them lets a retry repeat the effect. Third, store a hash of the request and reject the key if it comes back with a different body. Fourth, scope keys per account so customers can't collide, and keep them longer than any client retries, documenting what happens after expiry. For external side effects, pass a key downstream too.
```

```questions
- kind: check
  prompt: A POST to create a payment times out. What can the client conclude?
  choices:
    - text: The payment may or may not have happened — the outcome is unknown
      correct: true
    - text: The payment definitely failed
      why: The request may have succeeded and only the response was lost.
    - text: The payment definitely succeeded
      why: The request may never have arrived.
    - text: The server will roll back any partial work
      why: Committed effects stay committed whether or not the response reaches the client.
  explanation: A timeout means "no answer received". Retry only with an idempotency key, or check the outcome first.
- kind: check
  type: multi
  prompt: Which belong in a robust client retry policy? Select all that apply.
  choices:
    - text: Retry only errors that are likely to be transient (5xx, 429, timeouts on idempotent calls)
      correct: true
    - text: Exponential backoff with jitter
      correct: true
    - text: A maximum number of attempts that fits inside the caller's deadline
      correct: true
    - text: A retry budget that caps retry traffic as a share of normal traffic
      correct: true
    - text: Retrying 400 Bad Request responses until they succeed
      why: The same invalid request fails the same way every time.
  explanation: Retries should target transient failures, spread out in time, stay bounded, and back off globally during wide outages.
- kind: check
  prompt: Two identical requests with the same idempotency key arrive concurrently. What should happen?
  choices:
    - text: One claims the key through a unique constraint and runs; the other sees "in progress" and gets a 409 (or waits) without running the operation
      correct: true
    - text: Both run, and the second response is discarded
      why: Then the effect happens twice.
    - text: Both check the table first, see no key, and run
      why: That's the check-then-act race the unique constraint exists to prevent.
    - text: The second gets a cached response from a CDN
      why: CDNs don't cache POSTs or deduplicate application operations.
  explanation: Atomic claiming makes the key a lock on the logical operation. Duplicates then wait or retry until the original finishes.
- kind: check
  prompt: Which operation is naturally idempotent?
  choices:
    - text: "`UPDATE orders SET status = 'shipped' WHERE id = 7`"
      correct: true
    - text: "`UPDATE accounts SET balance = balance + 40 WHERE id = 7`"
      why: Each execution adds 40 again.
    - text: "`INSERT INTO orders (...) VALUES (...)` with a server-generated ID"
      why: Each execution creates a new row.
    - text: "`POST /emails/send`"
      why: Each call sends another email.
  explanation: Setting a value to a target is idempotent; adding, appending and creating with server-generated IDs are not.
- kind: fire
  prompt: The same idempotency key arrives with a different request body. What should the server do?
  choices:
    - text: Reject it with a 4xx error explaining that the key was reused for a different request
      correct: true
    - text: Return the original response
      why: That tells the client its new request succeeded when it never ran.
    - text: Run the new request and overwrite the stored result
      why: That breaks deduplication for the original request's retries.
    - text: Ignore the key and process normally
      why: The client asked for deduplication, so silently ignoring the key hides a bug.
  explanation: Store a request fingerprint with the key. A mismatch is a client bug that must surface.
- kind: fire
  prompt: Three layers each retry failed calls up to 3 times. During a downstream outage, roughly how many calls can one user request generate at the bottom?
  choices:
    - text: Up to 64 (4 × 4 × 4 attempts)
      correct: true
    - text: 9
      why: Retries multiply across layers rather than add.
    - text: 3
      why: That ignores the outer layers' retries.
    - text: 1, because retries are deduplicated
      why: Nothing deduplicates them automatically.
  explanation: Layered retries amplify load exponentially. Retry at one layer and fail fast elsewhere.
- kind: fire
  prompt: Why add jitter to exponential backoff?
  choices:
    - text: To stop clients that failed together from retrying in synchronised waves
      correct: true
    - text: To make each retry more likely to succeed on its own
      why: Jitter doesn't change any single attempt's odds. It spreads the load out in time.
    - text: To reduce the number of attempts
      why: The attempt count is set separately.
    - text: To let the server identify duplicates
      why: That's what idempotency keys do.
  explanation: Correlated retries create load spikes. Randomised delays decorrelate clients so a recovering service sees smoother traffic.
- kind: fire
  level: advanced
  prompt: Your service crashes after an external provider charges a card but before your database commits. What prevents a duplicate charge on retry?
  choices:
    - text: Passing a deterministic idempotency key to the provider, so it returns the original charge
      correct: true
    - text: Your own idempotency table
      why: Your key was never committed, so your side sees a new request.
    - text: A database rollback
      why: Rolling back your database can't undo the provider's charge.
    - text: Using a longer timeout
      why: Crashes and lost responses still happen.
  explanation: Each boundary that causes a side effect needs its own deduplication. Derive the downstream key from your own so retries map to the same external operation.
- kind: fire
  type: multi
  prompt: Which statements about "exactly-once" are accurate? Select all that apply.
  choices:
    - text: Networks offer at-least-once or at-most-once delivery, not exactly-once
      correct: true
    - text: Exactly-once effects come from at-least-once delivery plus idempotent processing
      correct: true
    - text: Each external side effect needs its own deduplication
      correct: true
    - text: A message broker with exactly-once settings guarantees emails are sent once
      why: Broker guarantees cover their own boundary, not your consumer's calls to an email provider.
  explanation: "Exactly once" is a property you compose across every boundary. Always ask what is exactly once, and where it's deduplicated.
```
