---
id: derived-data
category: queues
skill: reads
title: Derived data and keeping systems in sync
minutes: 20
summary: Real systems are several data stores, not one. One is the source of truth and the rest (caches, search indexes, warehouses, materialised views) are derived from it. Keeping them in step is an integration problem, and the sturdy answer is a single ordered log that every derived store replays, instead of clients writing to each store themselves. Correctness then comes from idempotent operations carried end to end, constraints enforced by partitioning the log, and checks that verify the copies agree.
objectives:
  - Separate systems of record from derived data and name the common derived copies
  - Explain why dual writes diverge and how a single ordered log fixes both races and crashes
  - Compare Lambda-style batch plus speed layers with replaying one log, and say what reprocessing buys you
  - Apply operation IDs end to end, enforce uniqueness through log partitioning, and plan integrity checks
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapters 11 and 12', 'https://dataintensive.net/']
  - ['Jay Kreps, The Log: What every software engineer should know about real-time data’s unifying abstraction', 'https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying']
  - ['Saltzer, Reed & Clark, End-to-End Arguments in System Design', 'https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf']
  - ['Debezium: Change data capture', 'https://debezium.io/documentation/reference/stable/']
---

> [!story] The search that showed the old price
> A shop updated product prices in its database and then in its search index, in two separate calls from the application. Usually it worked. During a sale two staff edited the same product within milliseconds of each other. The database received the edits in one order and the search index in the other, so the database said £18 and the search results said £25. Nothing failed, no error was logged, and the two stayed different until someone happened to edit the product again. The shop spent a week finding out why customers were being charged a different price from the one they saw.

## One source of truth, many copies

Almost no production system is a single database. Alongside the main store there is a cache, a search index, a data warehouse, a recommendation model, a read replica in another region. Some data is **system of record**: the authoritative version, written first, the one you'd restore from a backup. Everything else is **derived data**: redundant, produced from the source by some transformation. It could in principle be thrown away and rebuilt.

| Derived copy | Derived from | Why it exists |
|---|---|---|
| Cache | Database rows | Faster reads |
| Search index | Documents or rows | Full-text and faceted queries |
| Materialised view | Query over tables | Pre-computed joins and aggregates |
| Warehouse table | Operational data | Analytics without loading the live system |
| Denormalised copy | Another service's data | Avoiding a remote call per request |

Two consequences follow. Keeping the copies in step is the **integration** problem of the system, and it is as important as any one database. And if you treat derived data as rebuildable, you can change it freely: add an index for a new question, fix a bug in a transformation, or migrate to a new store, by re-deriving.

## Dual writes: two writes, two orders

The obvious way to keep two stores in step is for the application to write to both. It fails in two independent ways, neither of which raises an error.

- **A race.** Two clients update the same record at nearly the same time. Each sends its write to the database and to the index, and network delays differ, so the database applies A then B while the index applies B then A. The stores now disagree **permanently**. Neither is "wrong" in any way that a log would show.
- **A crash between the writes.** The client writes the first store and dies (or the second call times out) before writing the second. One store has the update, the other doesn't.

```sim
name: dualwrite
title: Two writes versus one log
intro: Compare a client that writes the database and the index itself with an index that replays the database's own change log. Raise the contention and the crash rate.
challenges:
  - {text: 'With dual writes, push the share of racing updates up until at least 5% of records disagree', metric: diverged, op: '>=', value: 25, and: [{metric: mode, op: '==', value: dual}]}
  - {text: 'Switch to the log and bring the disagreement to zero at 100% contention', metric: diverged, op: '==', value: 0, and: [{metric: mode, op: '==', value: log}]}
takeaway: |
  Dual writes have no single order, so concurrent updates can land in opposite orders in the two systems, and a crash between them leaves one behind. A change log has exactly one order, the order the database committed in. The index applies it in that order and resumes from its saved position after a crash, so it can lag but cannot disagree.
```

The fix is to remove the second writer. Let **one system** be the source of truth, take its changes as an **ordered log**, and have every derived store consume that log. That is what change data capture (CDC) does: it reads the database's own replication log, turns each committed row change into an event, and publishes it in commit order. The transactional outbox is the application-level version of the same thing (see the outbox lesson). The properties you get:

- **One order.** Every consumer applies changes in the order the source committed them.
- **Resumable.** Each consumer remembers its position and picks up from there after a crash.
- **Independent.** A slow or broken index can't hold up the database or the other consumers.
- **Replayable.** A new consumer starts from a snapshot plus the log (or from a compacted log, which keeps the latest value per key), then stays current.

The price is that derived data is **asynchronous**: it lags the source by milliseconds in good times and minutes when a consumer is behind. Users can see their own write missing from search for a moment, a timeliness problem rather than an integrity problem (see the guarantees lesson).

```arch
title: One log, many derived stores
nodes:
  - {id: app, label: Application, kind: service, x: 0, y: 1}
  - {id: db, label: Primary database, kind: db, x: 1, y: 1, note: 'system of record'}
  - {id: log, label: Change log, kind: stream, x: 2, y: 1, note: 'commit order, replayable'}
  - {id: cache, label: Cache, kind: cache, x: 3, y: 0}
  - {id: idx, label: Search index, kind: db, x: 3, y: 1}
  - {id: wh, label: Warehouse, kind: db, x: 3, y: 2}
  - {id: model, label: Recommendation model, kind: service, x: 4, y: 1, note: 'rebuilt nightly'}
edges:
  - [app, db, 'writes']
  - [db, log, 'CDC']
  - [log, cache, 'invalidate or update']
  - [log, idx, 'index document']
  - [log, wh, 'load']
  - [wh, model, 'train']
paths:
  - label: A price change
    steps:
      - [app, db, 'The application writes the new price. This is the only write it makes.']
      - [db, log, 'The commit appears in the change log, in the same order as every other change.']
      - [log, idx, 'The search indexer applies it. If it is down, it catches up later from its saved position.']
      - [log, cache, 'The cache entry is replaced or invalidated, in the same order.']
  - label: A new search feature
    steps:
      - [log, idx, 'Build a new index version by replaying the log from a snapshot while the old one keeps serving.']
      - [log, idx, 'When the new index has caught up and passes checks, switch readers to it and drop the old one.']
```

## Batch and stream together

Derived data is built two ways. **Batch** recomputes a whole view from the full input: simple, easy to reason about, easy to fix by re-running, but stale until the next run. **Stream** updates it incrementally as events arrive: fresh, but harder to make correct. The **Lambda architecture** used both side by side, a batch layer for accurate but slow results and a speed layer for approximate recent ones, merged at read time. It works but means writing and maintaining the same logic twice and reconciling two answers.

The alternative many teams prefer is to keep **one** log with enough retention, and run the *same* code over it in either mode: from the beginning to rebuild, or from the end to stay current. Modern engines (Flink, Spark Structured Streaming, Kafka Streams) are designed for this. You don't escape the problems of streams, but you do avoid two code paths, and **reprocessing** becomes the standard way to fix mistakes: deploy the new logic, replay, compare, cut over.

## Where to do the work: write path or read path

Derived data is a choice about *when* to compute. A cache entry, an index or a materialised view moves work to **write time** so reads are cheap. Computing on demand moves it to **read time**, so writes are cheap and reads are slow. Social timelines are the classic case (see the feed fan-out lesson): precompute each user's feed on every post, compute it on read, or do both depending on the author. There is no right answer, only a boundary you can move, and each derived store is a decision about where it sits. Keep the choice explicit and revisit it as read and write rates change.

## Correctness without distributed transactions

Distributed transactions across heterogeneous systems are expensive and brittle, so log-based designs aim for the properties that matter with less. Three techniques.

**Carry one operation ID end to end.** Duplicate suppression at lower layers is not enough. TCP removes duplicate packets within a connection; a database transaction commits once; yet a user who submits a form, gets a timeout and clicks again creates a second request that no lower layer recognises as a duplicate. This is the **end-to-end argument**: a guarantee only an end can make must be built at the ends. Generate a unique ID at the client for each logical operation, send it with the request, and have every step (the log, the processor, the database) treat a repeated ID as a no-op. That is the idempotency key from the retries lesson, applied across the whole pipeline.

**Enforce constraints by partitioning the log.** A uniqueness rule such as "one account per username" normally needs a lock or a transaction. With a log, route every claim for a name to the same partition (by hashing the name). One processor owns that partition and reads claims in order, so it accepts the first and rejects the rest, then publishes the outcome. No cross-node coordination happens at decision time, because every claim for a given name is already in one place and in one order. The client learns the result by waiting for the outcome event, so the rule is enforced even though the write is asynchronous.

```timeline
title: Unique usernames through a partitioned log
lanes: [Client 1, Client 2, Claims partition (alice), Processor]
state: {alice: free}
steps:
  - {lane: Client 1, to: Claims partition (alice), text: 'claim(alice, request r1)'}
  - {lane: Client 2, to: Claims partition (alice), text: 'claim(alice, request r2)'}
  - {lane: Processor, to: Claims partition (alice), text: 'reads r1 first: alice is free → accepted', set: {alice: 'taken by client 1'}}
  - {lane: Processor, to: Client 1, text: 'outcome(r1) = success'}
  - {lane: Processor, to: Claims partition (alice), text: 'reads r2: alice is taken → rejected'}
  - {lane: Processor, to: Client 2, text: 'outcome(r2) = rejected'}
find:
  prompt: Which step is the actual decision that guarantees uniqueness?
  answer: 2
  explain: |
    The processor reading r1 before r2, from a single partition, is where uniqueness is decided. Both claims were already ordered in one place, so no locking across machines was needed. The trade is that all claims for one name serialise through one partition, and the answer arrives after a delay.
```

**Separate timeliness from integrity.** Asynchronous derived data can be late (stale search results) and that is usually tolerable. What must never happen is **integrity** failure: events lost, applied twice, or applied wrongly. Idempotent consumers and the log's durability protect integrity without making every reader wait for every writer.

## Trust, but verify

Large systems drift. Hardware flips bits, a bug corrupts a transformation, someone edits a table by hand. If you rely on replication and checks inside each component, a fault between them goes unnoticed. So build **end-to-end audits** into the design:

- **Reconcile** derived stores against the source regularly: row counts, checksums over key ranges, sampled record comparison. Alert on drift and repair by re-deriving.
- **Make history auditable.** An append-only log of events is evidence: you can see what changed and when, and replay to a point in time.
- **Test your restores and rebuilds.** A derived store you've never rebuilt from scratch is a store you can't rely on rebuilding.

```predict
prompt: A service writes a new order to its database and then publishes an OrderPlaced event to a broker, in two separate calls. Which is the most robust change?
choices:
  - Retry the broker publish three times, then log an error and move on
  - Publish first, so the event always exists before the order does
  - Write an outbox row in the same transaction, and let a relay publish in order
  - Wrap both calls in a try/catch and delete the order if the publish fails
answer: 2
reveal: |
  Retrying doesn't help if the process dies between the calls. Publishing first just reverses which side can be missing. Deleting the order on a failed publish can itself fail. The outbox writes the order and its event in one local transaction, so both exist or neither does, and the relay publishes in commit order and can resume after a crash. The event may be published more than once, so consumers must be idempotent.
```

```sort
prompt: Is each store a system of record or derived data?
buckets: [System of record, Derived data]
items:
  - {text: 'The orders table in the primary database', bucket: 0, why: 'The authoritative version, written first.'}
  - {text: 'The Elasticsearch index of products', bucket: 1, why: 'Rebuilt from the product table whenever you like.'}
  - {text: 'A Redis cache of rendered product pages', bucket: 1, why: 'Disposable. Rebuilt from the database on a miss.'}
  - {text: 'The append-only event log from which all views are built (in an event-sourced design)', bucket: 0, why: 'In event sourcing the log is the source and views are derived from it.'}
  - {text: 'A nightly warehouse table of revenue by region', bucket: 1, why: 'Computed from operational data and re-computable.'}
```

```bug
title: Keeping the index in step
prompt: This handler updates a product and keeps the search index current. Which lines can leave the database and index disagreeing?
lang: python
code: |
  def update_price(product_id, price):
      db.execute("UPDATE products SET price = %s WHERE id = %s", price, product_id)
      db.commit()
      search.update(product_id, {"price": price})
      cache.delete(f"product:{product_id}")
bug: [4, 5]
explain: |
  **Line 4** can fail or be skipped if the process dies after the commit, leaving the index with the old price and no retry. **Lines 4–5** have no ordering guarantee relative to a concurrent update, so two racing handlers can write the index in the opposite order from the database. **Line 5** has the same problem for the cache. Make the database write the only write: record the change (outbox or CDC) in the same transaction, and let separate consumers apply it to the index and cache in commit order, idempotently.
fix: |
  def update_price(product_id, price):
      with db.transaction():
          db.execute("UPDATE products SET price = %s, version = version + 1 WHERE id = %s", price, product_id)
          db.execute("INSERT INTO outbox (aggregate, id, type, payload) VALUES ('product', %s, 'PriceChanged', %s)", product_id, price)
  # A relay publishes the outbox in commit order. The index consumer applies it, skipping any event whose version is not newer than what the index holds.
```

```faded
title: Fill in the derived-data facts
prompt: Fill each gap from memory.
text: |
  Two writes from the application to two stores can leave them disagreeing because there is no single [[order|clock|index]], and a [[crash between the writes|slow read|large payload]] leaves one behind.

  Change data capture turns the database's own [[commit-ordered change log|nightly backup|query plan]] into events that derived stores replay.

  A uniqueness rule can be enforced without a distributed transaction by sending all claims for a name to the [[same partition|nearest replica|fastest node]].

  To suppress duplicates caused by a user clicking twice, the unique ID must be created at the [[client, end to end|network layer|database]].
explain: One order, one writer to the source, partitioned decisions and end-to-end operation IDs give correctness without cross-system transactions.
```

```recall
prompt: Explain why dual writes to a database and a search index diverge, and how you would redesign to keep them in step.
points:
  - Two separate writes have no shared order, so concurrent updates can be applied in opposite orders in the two systems
  - A crash or timeout between the two writes leaves one system without the update, silently
  - Make the database the only write: capture its changes (CDC or a transactional outbox) as an ordered log
  - The index consumes the log in order, resumes from its position after a crash, and is eventually consistent, so make consumers idempotent and reconcile periodically
model: |
  Writing to two systems separately gives them no common ordering, so two concurrent updates can reach the database in one order and the index in the other, and nothing notices. A crash or timeout between the two calls leaves one of them behind with no error. I would make the database the single system of record and publish its changes as an ordered log, using change data capture or a transactional outbox written in the same transaction. The search indexer consumes that log in commit order and remembers its position, so after a crash it resumes where it stopped; the index may lag but can't disagree. Consumers are idempotent because the log can deliver an event more than once, and a periodic reconciliation compares counts or checksums with the source to catch drift.
```

```interview
ask: We need search, a cache and an analytics warehouse all to stay in sync with our orders database. How do you design it?
say: |
  "The orders database is the only system of record, and the application writes only to it. I'd capture changes with CDC, or a transactional outbox if I need business-level events, and publish them as an ordered log keyed by order ID so each order's changes stay in sequence. The search indexer, the cache invalidator and the warehouse loader are separate consumers with their own saved positions, so any of them can lag or fail without affecting the others. Each applies events idempotently by order ID and version. New consumers bootstrap from a snapshot plus the log, and I can rebuild any of them by replaying. I'd monitor consumer lag per store, and run a reconciliation job comparing counts and checksums against the source, because a silent fault between components wouldn't show up otherwise."
followups:
  - q: What about a user who must see their own update in search immediately?
    a: Read-your-writes for that user can be handled by reading from the database for a short window, or by waiting until the consumer's position passes the event. The index itself stays asynchronous.
  - q: How do you roll out a new index schema?
    a: Build the new index in parallel by replaying the log from a snapshot, compare, switch readers, then retire the old one. No downtime and a simple rollback.
  - q: Why not distributed transactions across the database and index?
    a: Cross-system two-phase commit is slow, blocks on coordinator failure, and most search and cache systems don't support it. A log gives ordered, durable, resumable updates without it.
weak: |
  "Update all three in the request handler, wrapped in try/catch." Races, crashes and no way to repair.
strong: |
  One system of record, an ordered log, independent idempotent consumers, replayable rebuilds, and reconciliation.
```

```questions
- kind: check
  prompt: What distinguishes a system of record from derived data?
  choices:
    - text: Derived data can be rebuilt from the authoritative source
      correct: true
    - text: Derived data is stored on faster disks than the system of record
      why: Speed is not the defining property.
    - text: The system of record never changes once it has been written
      why: It changes, it is just authoritative.
    - text: Derived data is always more up to date than its source
      why: Derived copies usually lag.
  explanation: If you lose a derived store you re-derive it. If you lose the system of record, you restore from backup and lose data.
- kind: check
  prompt: Two clients update the same record at once. The application writes the database and then the search index. How can the two end up different with no failures?
  choices:
    - text: The two systems can see the updates in opposite orders
      correct: true
    - text: The database silently rejects one of the updates, so only one is applied
      why: Both are applied.
    - text: The index ignores writes whenever the cluster is under load
      why: Not the cause here.
    - text: Clock skew deletes the older value on one of the systems
      why: Ordering, not clocks, is the issue.
  explanation: Nothing makes two separate systems apply concurrent writes in the same order, so they can permanently disagree.
- kind: check
  prompt: How does change data capture avoid the dual-write problem?
  choices:
    - text: Stores read one commit-ordered log, and each can resume
      correct: true
    - text: It wraps both writes in a distributed transaction across the two systems
      why: CDC does not use cross-system transactions.
    - text: It makes the writes synchronous to every store before returning
      why: Consumers are asynchronous.
    - text: It prevents concurrent updates from reaching the database at all
      why: Concurrency is still allowed. The log just orders it.
  explanation: One writer, one order, resumable consumers. The cost is some lag.
- kind: check
  type: multi
  prompt: Which are legitimate advantages of rebuilding derived data by replaying a retained log? Select all that apply.
  choices:
    - text: You can add a new index or view without touching the source
      correct: true
    - text: A bug in a transformation can be fixed by re-deriving
      correct: true
    - text: You can migrate to a new store by building it alongside the old and switching
      correct: true
    - text: Replays are instant regardless of data size
      why: Reprocessing needs time and capacity, which is a real cost.
  explanation: Replayability makes derived data cheap to change. It needs retention and spare capacity, so it isn't free.
- kind: check
  prompt: Why is a unique operation ID created at the client rather than at the database?
  choices:
    - text: Only the client knows two requests are one logical operation
      correct: true
    - text: Databases cannot generate unique IDs for rows without client help
      why: They can, but that does not identify a repeated request.
    - text: Client-generated IDs are shorter than anything the server could make
      why: Length is not relevant.
    - text: Using client IDs removes the need for a log in the design
      why: The log is still needed.
  explanation: This is the end-to-end argument: duplicate suppression at TCP or in the database can't recognise a user's second click as a duplicate.
- kind: fire
  prompt: How is a uniqueness constraint enforced through a partitioned log?
  choices:
    - text: Route all claims for a name to one partition with one processor
      correct: true
    - text: Check every partition for the name before accepting a claim
      why: That would need cross-partition coordination.
    - text: Use each claim's timestamp to choose the winner between clients
      why: Clocks are not reliable for this.
    - text: Let every consumer decide on its own and reconcile later
      why: They could disagree.
  explanation: Partitioning by the unique key puts the competing claims in one place, in one order.
- kind: fire
  prompt: What is the Lambda architecture's main drawback?
  choices:
    - text: Logic is written and maintained twice
      correct: true
    - text: It cannot process historical data, only the most recent events
      why: The batch layer does exactly that.
    - text: It requires distributed transactions across every layer
      why: It does not.
    - text: It has no fault tolerance, since recomputation is not possible
      why: Batch recomputation provides some.
  explanation: Two code paths and a merge at read time are costly. Replaying one log with the same code avoids that.
- kind: fire
  prompt: Which of these is a timeliness violation rather than an integrity violation?
  choices:
    - text: A new post is missing from search for a few seconds
      correct: true
    - text: An order event is lost and never applied
      why: Lost data is an integrity violation.
    - text: A payment is applied twice
      why: Duplication is an integrity violation.
    - text: A balance no longer equals the sum of its transactions
      why: Contradiction is an integrity violation.
  explanation: Staleness heals by waiting. Loss, duplication and contradiction do not.
- kind: fire
  type: order
  prompt: Order these approaches to keeping a search index in step, from weakest to strongest.
  items:
    - The client writes the database, then the index, with no retry
    - The client writes both, with retries on failure
    - A job periodically re-syncs the whole table
    - Change data capture feeding an idempotent indexer
  explanation: Unretried dual writes lose updates, retries still race, periodic re-sync repairs drift late, and CDC with idempotent consumers gives ordered, resumable, repeatable updates.
- kind: fire
  prompt: Why reconcile derived stores against the source periodically?
  choices:
    - text: Faults between components escape checks inside each one
      correct: true
    - text: Logs are unreliable, so the consumers cannot trust their own position
      why: Logs are not the issue.
    - text: Consumers cannot resume after a crash without a full reconcile
      why: They can resume from their position.
    - text: To avoid having to use idempotent writes in the consumers
      why: Reconciliation complements idempotence.
  explanation: End-to-end checks catch drift that component-level guarantees miss, and repair is just re-deriving.
```
