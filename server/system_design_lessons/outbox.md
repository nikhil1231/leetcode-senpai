---
id: outbox
category: queues
skill: retries
title: The dual-write problem and the transactional outbox
minutes: 15
summary: Writing to your database and publishing to a broker are two separate operations, and any crash between them leaves the two disagreeing — an order with no event, or an event with no order. The transactional outbox makes the intent to publish part of the same database transaction, and a relay delivers it at least once. Consumers then deduplicate with an inbox.
objectives:
  - Explain why "write to the DB, then publish" and "publish, then write" both fail
  - Implement a transactional outbox with a polling relay or CDC, preserving per-entity order
  - Make consumers safe with an inbox (dedupe) table, and clean up outbox rows
  - Compare the outbox with alternatives such as listening to yourself, CDC on business tables and event sourcing
sources:
  - ['microservices.io: Transactional outbox', 'https://microservices.io/patterns/data/transactional-outbox.html']
  - ['Debezium: Outbox event router', 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html']
  - ['PostgreSQL: SELECT … FOR UPDATE SKIP LOCKED', 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE']
case: jobs
---

> [!story] The orders the warehouse never saw
> An order service committed each order to Postgres and then published `OrderPlaced` to Kafka. Every few days a handful of customers complained that their orders never shipped. The cause was mundane: deploys sent SIGTERM to pods mid-request. If the kill landed after the commit but before the publish, the order existed and the event didn't. Nobody noticed until a customer did, because the database said everything was fine.

## Two writes, no shared transaction

```timeline
title: Commit, then publish
lanes: [Order service, Database, Broker]
state: {Order: none, Event: none}
steps:
  - {lane: Order service, to: Database, text: 'INSERT order 77; COMMIT', set: {Order: '77 saved'}}
  - {lane: Order service, to: Broker, text: 'publish OrderPlaced(77)', set: {Event: 'published'}}
  - {lane: Order service, to: Order service, text: 'respond 201'}
crashes:
  - after: 0
    label: between commit and publish
    verdict: lost
    text: The order exists, but no event will ever be sent — the warehouse, email and analytics never hear about it. Nothing errors and nothing retries.
  - after: 1
    label: after publish
    verdict: safe
    text: Both happened. (The client might retry, which needs an idempotency key, but the two systems agree.)
```

Flipping the order doesn't help: **publish then commit** means a crash (or a failed commit) can leave an event for an order that doesn't exist, and consumers act on it. And you can't wrap a database and a broker in one transaction — distributed two-phase commit across them is rarely available and brittle when it is.

```predict
prompt: A teammate suggests publishing to Kafka *inside* the database transaction, just before COMMIT, so "either both happen or neither". What actually happens if the COMMIT then fails?
choices:
  - Kafka rolls back the message automatically
  - The event is already published and consumers may act on an order that was never committed
  - The database waits for Kafka to confirm the commit
  - It works because both are in the same function
answer: 1
reveal: |
  The broker has no idea about your database transaction. Once published, the event is visible; a later rollback (constraint violation, deadlock, connection loss) can't recall it. You've swapped "missing event" for "phantom event". Atomicity only exists **inside** one system — so put the publish intent inside the database.
```

## The transactional outbox

Write the event into an `outbox` table **in the same transaction** as the business change. Either both commit or neither does. A separate **relay** reads unpublished outbox rows, publishes them, and marks them sent.

```arch
title: Transactional outbox
nodes:
  - {id: api, label: Order service, kind: service, x: 0, y: 1}
  - {id: db, label: Postgres, kind: db, x: 1, y: 1, note: 'orders + outbox'}
  - {id: relay, label: Outbox relay, kind: worker, x: 2, y: 1, note: 'poll or CDC'}
  - {id: kafka, label: Kafka, kind: stream, x: 3, y: 1}
  - {id: wh, label: Warehouse consumer, kind: service, x: 3, y: 2, note: 'inbox dedupe'}
edges:
  - [api, db, 'one transaction']
  - [relay, db, 'read new rows']
  - [relay, kafka, 'publish']
  - [kafka, wh, 'consume']
paths:
  - label: Place an order
    steps:
      - [api, db, 'BEGIN; INSERT INTO orders …; INSERT INTO outbox (aggregate_id=77, type=OrderPlaced, payload=…); COMMIT — atomic']
      - [relay, db, 'The relay picks up outbox rows not yet published, in order']
      - [relay, kafka, 'Publish with key = order 77 (so per-order events stay ordered in one partition) and wait for acks=all']
      - [relay, db, 'Mark the rows published (or advance a stored position)']
      - [kafka, wh, 'The warehouse consumes it and records the event ID in its inbox table, in the same transaction as its effect']
```

```faded
title: A polling relay in SQL
prompt: Complete the relay's main loop.
text: |
  ```sql
  BEGIN;
  SELECT id, aggregate_id, type, payload
  FROM outbox
  WHERE published_at IS NULL
  ORDER BY id
  LIMIT 500
  FOR UPDATE SKIP LOCKED;     -- several relay instances can run without blocking each other
  -- publish each row to the broker, waiting for broker acks
  UPDATE outbox SET published_at = now() WHERE id = ANY(:published_ids);
  COMMIT;
  ```

  If the relay crashes after publishing but before the UPDATE commits, those rows are published again on the next run, so delivery is [[at-least-once|at-most-once|exactly-once]] and consumers must [[deduplicate by event ID|trust there are no duplicates|ignore the payload]].

  `SKIP LOCKED` lets multiple relay instances share the work, but two instances could then publish events for the same order [[out of order|in perfect order always|twice as fast]]. To preserve per-aggregate ordering, assign each relay instance a subset of aggregates (e.g. by hash of aggregate_id), or run a single active relay.

  Published rows are deleted by a background job after [[a retention period, e.g. 7 days|one second|never]], so the table stays small and the polling query stays fast.
explain: The outbox gives atomic intent, the relay gives at-least-once delivery, and consumers make it effectively-once. Ordering and cleanup are the two details most implementations get wrong.
```

## Relay options

| Relay | How | Pros | Cons |
|---|---|---|---|
| **Polling** | Query the outbox every few hundred ms | Simple, any database, easy to reason about | Polling load and latency; ordering with multiple instances needs care |
| **CDC (log tailing)** | Debezium or similar reads the WAL/binlog and emits outbox inserts | Low latency, no polling queries, preserves commit order | Another system to run; needs log access and replication slots |

```timeline
title: Relay crash after publishing
lanes: [Relay, Broker, Outbox table]
state: {Outbox: 'row 9001 pending', 'Copies in broker': '0'}
steps:
  - {lane: Relay, to: Outbox table, text: 'read row 9001 (OrderPlaced 77)'}
  - {lane: Relay, to: Broker, text: 'publish 9001 → acked', set: {'Copies in broker': '1'}}
  - {lane: Relay, to: Outbox table, text: 'UPDATE published_at … COMMIT', set: {Outbox: 'row 9001 published'}}
crashes:
  - after: 1
    label: after publish, before marking
    verdict: duplicate
    text: The row is still pending, so the restarted relay publishes 9001 again. Two copies of the same event, same event ID. The consumer's inbox table sees ID 9001 already processed and skips it.
  - after: 0
    label: before publishing
    verdict: safe
    text: Nothing was published and the row is still pending. The next run publishes it. Delay, no loss.
```

## The inbox on the consumer side

Because the relay is at-least-once, every consumer needs a dedupe step. The **inbox pattern** records each consumed event ID in a table with a unique constraint, in the same transaction as the consumer's own state change; a conflict means "already done".

```bug
title: An order service and its consumer
prompt: Which lines break the reliability guarantees?
lang: python
code: |
  def place_order(cart):
      with db.transaction():
          order = db.insert_order(cart)
          db.insert_outbox("OrderPlaced", aggregate_id=order.id, payload=order.json())
      kafka.publish("orders", key=order.id, value=order.json())   # also publish directly, to be fast
      return order

  def on_order_placed(event):
      reserve_stock(event.payload["items"])
      db.insert_inbox(event.id)
bug: [5, 9]
explain: |
  **Line 5** publishes directly as well as through the outbox. Every order now produces two events with *different* identities (only the outbox row has the event ID consumers deduplicate on), and the direct publish can still be lost in a crash, so it adds duplicates without adding reliability. Let the relay do the publishing. **Lines 9–10:** the consumer reserves stock and only then records the inbox entry, outside any transaction and without checking it first. A crash between them, or a redelivery, reserves stock twice. Insert the inbox row first with a unique constraint, inside the same transaction as the reservation, and skip on conflict.
fix: |
  def place_order(cart):
      with db.transaction():
          order = db.insert_order(cart)
          db.insert_outbox("OrderPlaced", aggregate_id=order.id, payload=order.json())
      return order                                   # the relay publishes

  def on_order_placed(event):
      with db.transaction():
          if not db.insert_inbox_if_absent(event.id):  # unique on event_id
              return                                   # duplicate delivery
          reserve_stock(event.payload["items"])        # local DB effect, same transaction
```

## Alternatives, briefly

- **CDC on business tables** (no outbox): emit changes straight from the `orders` table's log. Fewer moving parts, but you publish your internal schema as your public event contract, and you can't easily emit events that don't map to row changes.
- **Listen to yourself:** publish first, and have the service consume its own event to update its database. Simple, but the user's request no longer sees its own write immediately.
- **Event sourcing:** the event log *is* the source of truth, so there's no dual write — at the cost of a very different programming model.

```calc
title: Outbox relay lag
prompt: A polling relay runs every **200 ms** and publishes up to **500** rows per poll. At peak, the service commits **3,000** orders per second. How many relay instances (each handling a disjoint set of aggregates) are needed just to keep up?
answer: 2
unit: instances
tolerance: 1.01
steps: |
  One instance publishes at most 500 rows per 0.2 s = 2,500 rows/s. 3,000 ÷ 2,500 = 1.2, so you need **2** instances (or bigger batches, a shorter interval, or CDC). Track outbox lag — the age of the oldest unpublished row — because "accepted but not yet published" is invisible to users until downstream effects don't happen.
```

```interview
ask: How would you reliably publish order-placement events from a Postgres-backed ordering service to Kafka when failures can occur?
say: |
  "Placing an order inserts the order and an OrderPlaced row into an outbox table in one Postgres transaction, so the intent to publish can't be lost. Debezium tails the WAL and publishes outbox rows to Kafka, keyed by order ID to keep per-order ordering. Delivery is at-least-once, so every consumer has an inbox table with a unique event ID, written in the same transaction as its effect. We alert on outbox lag and clean up published rows after a week."
followups:
  - q: Why not publish to Kafka inside the database transaction?
    a: The broker doesn't participate in the transaction. If the commit fails after publishing, consumers act on a phantom order. Atomicity only holds inside one system.
  - q: Polling relay or CDC?
    a: Polling is simpler and works anywhere, at the cost of query load and some latency. CDC is lower-latency and preserves commit order, but needs log access and another component. Both are at-least-once.
  - q: How do you keep events for one order in order?
    a: Publish them in outbox order with the order ID as the partition key, and avoid having multiple relay instances race on the same aggregate.
weak: |
  "Save to the DB, then send to Kafka; retry if it fails." Ignores the crash between the two, and consumer duplicates.
strong: |
  Names the dual-write problem, writes publish intent atomically with the change, relays at-least-once with ordering preserved, deduplicates with an inbox, and monitors lag and cleanup.
```

```recall
prompt: Explain the dual-write problem and how the transactional outbox solves it, including what consumers must still do.
points:
  - Writing to the database and publishing to a broker are separate operations, so a crash between them leaves them inconsistent (lost or phantom events)
  - The outbox stores the event in a database table in the same transaction as the business change
  - A relay (polling or CDC) reads the outbox and publishes, marking rows as sent, with at-least-once delivery
  - Consumers must deduplicate (inbox / unique event ID) because the relay can publish duplicates
model: |
  The database and the broker can't share a transaction, so "commit, then publish" loses events when the process dies in between, and "publish, then commit" creates events for changes that never committed. The transactional outbox writes the event as a row in an outbox table inside the same transaction as the business change — both commit or neither. A relay then reads pending outbox rows and publishes them, marking them done. Because the relay can crash after publishing but before marking, events may be published twice, so consumers record processed event IDs with a unique constraint in the same transaction as their own effects and skip repeats.
```

```questions
- kind: check
  prompt: A service commits an order and then publishes an event. The process dies between the two. What's the result?
  choices:
    - text: The order exists, but the event is never published — downstream systems never learn about it
      correct: true
    - text: The order is rolled back automatically
      why: It already committed.
    - text: The broker publishes the event later on its own
      why: The broker never received anything.
    - text: The event is published twice
      why: It wasn't published at all.
  explanation: Two writes with no shared transaction leave a crash window. The outbox removes it by making the publish intent part of the database transaction.
- kind: check
  type: order
  prompt: Order the steps of the transactional outbox flow.
  items:
    - Begin a database transaction
    - Write the business change and an outbox row together
    - Commit the transaction
    - The relay reads pending outbox rows and publishes them to the broker
    - The relay marks the rows as published
    - Consumers process the events and deduplicate by event ID
  explanation: Atomic intent first, then at-least-once relay, then idempotent consumption.
- kind: check
  type: multi
  prompt: Which statements about an outbox relay are true? Select all that apply.
  choices:
    - text: A crash after publishing but before marking the row causes a duplicate publish
      correct: true
    - text: Consumers therefore need to deduplicate by event ID
      correct: true
    - text: Using the aggregate ID as the partition key helps preserve per-entity order
      correct: true
    - text: The relay guarantees exactly-once delivery to consumers
      why: It's at-least-once. Exactly-once effects come from consumer deduplication.
  explanation: The outbox guarantees no lost events, not no duplicates. Ordering needs keyed partitions and a careful relay.
- kind: check
  prompt: Why is publishing to the broker inside the database transaction (before COMMIT) not a fix?
  choices:
    - text: If the commit then fails, the already-published event describes a change that never happened
      correct: true
    - text: It is a fix — both happen in one function
      why: Being in one function doesn't make two systems atomic.
    - text: Brokers refuse publishes during database transactions
      why: They know nothing about your transaction, and that's the problem.
    - text: It doubles the database load
      why: The issue is correctness, not load.
  explanation: Atomicity can't span the database and the broker. Put the event in the database and let a relay move it.
- kind: fire
  prompt: What's the consumer-side counterpart of the outbox?
  choices:
    - text: An inbox table recording processed event IDs, written in the same transaction as the consumer's effect
      correct: true
    - text: A second outbox in the broker
      why: Brokers don't deduplicate your effects.
    - text: A longer visibility timeout
      why: That reduces some redeliveries, but doesn't make duplicates safe.
    - text: Acking messages before processing
      why: That risks losing messages and does nothing about duplicates.
  explanation: The inbox makes at-least-once delivery effectively-once for the consumer's own state.
- kind: fire
  type: numeric
  prompt: A relay polls every 250 ms and publishes up to 400 rows per poll. What's its maximum throughput in rows per second?
  answer: 1600
  unit: rows/s
  tolerance: 0.01
  explanation: 400 rows ÷ 0.25 s = 1,600 rows/s. If commits exceed this, outbox lag grows, so add instances (partitioned by aggregate), bigger batches, or CDC.
- kind: fire
  prompt: What's an advantage of a CDC-based relay over polling the outbox table?
  choices:
    - text: Lower latency without polling queries, publishing in commit order from the database log
      correct: true
    - text: Exactly-once delivery to consumers
      why: CDC is still at-least-once.
    - text: No need for an outbox table at all, ever
      why: CDC can read business tables directly, but the outbox gives a deliberate event contract.
    - text: It works without database log access
      why: It requires log access, such as replication slots or binlog.
  explanation: Tailing the log avoids polling overhead and preserves commit order, at the cost of operating the CDC pipeline.
- kind: fire
  level: advanced
  prompt: Several relay instances use SELECT … FOR UPDATE SKIP LOCKED on the outbox. What ordering risk does this introduce?
  choices:
    - text: Two instances can publish events for the same aggregate in a different order than they were committed
      correct: true
    - text: Events are lost
      why: Locked rows are skipped, not lost — another instance publishes them.
    - text: No risk — SKIP LOCKED preserves global order
      why: It deliberately lets instances process different rows concurrently.
    - text: Rows are published three times
      why: Duplicates come from crashes, not from SKIP LOCKED.
  explanation: Parallel relays trade ordering for throughput. Partition the work by aggregate, or use a single active relay, when per-entity order matters.
- kind: fire
  type: multi
  prompt: What should you monitor and maintain for an outbox in production? Select all that apply.
  choices:
    - text: Age of the oldest unpublished outbox row (relay lag)
      correct: true
    - text: Cleanup of published rows so the table and its queries stay small
      correct: true
    - text: Relay error and retry rates
      correct: true
    - text: Nothing — the outbox is self-maintaining
      why: Unbounded growth and silent relay failures are the common failure modes.
  explanation: Lag shows when accepted changes aren't reaching consumers. Cleanup keeps polling fast. Errors catch broker problems early.
```
