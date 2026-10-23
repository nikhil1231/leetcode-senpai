---
id: data-models
category: storage
skill: requirements
title: Choose a data model from access patterns
minutes: 16
summary: Start from the queries and the invariants, not the database brand. Relational, document, key-value, wide-column and graph models make different queries cheap and different guarantees easy. Denormalisation trades write complexity for read speed. Schemas always evolve, so plan migrations that never take the system down.
objectives:
  - Derive a data model from the list of access patterns and invariants
  - Compare relational, document, key-value, wide-column and graph models by the queries and guarantees they make easy
  - Decide when to denormalise and how to keep the copies consistent
  - Run a zero-downtime schema migration with the expand–contract pattern
sources:
  - ['PostgreSQL: Data definition and constraints', 'https://www.postgresql.org/docs/current/ddl.html']
  - ['Amazon DynamoDB: Best practices for designing and using partition keys', 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html']
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 2', 'https://dataintensive.net/']
---

> [!story] The document that ate the database
> A forum stored each thread as one MongoDB document with an embedded array of replies. It was elegant: one read rendered a whole page. Then a popular thread passed 40,000 replies. Every new reply rewrote a multi-megabyte document, concurrent replies contended on the same document, pages loaded every reply to show twenty, and the thread hit the 16 MB document size limit. The model fitted how the page *looked*, not how the data *grew* and was *written*.

## Begin with the access patterns

Before choosing anything, write down:

1. The **queries**, with their frequency and latency targets: "get a user's last 20 orders, newest first, 3k/s, p99 < 50 ms".
2. The **writes** and their rates.
3. The **invariants**: "an order references an existing customer", "at most one active subscription per user".
4. The **growth**: what's unbounded? (Replies, events, followers, messages.)

The model that makes the important queries cheap and the invariants enforceable wins. The logo doesn't matter.

## The main models

| Model | Shape | Makes easy | Watch out for | Examples |
|---|---|---|---|---|
| **Relational** | Tables, rows, foreign keys, joins | Ad hoc queries, constraints, multi-row transactions | Scaling writes beyond one node needs sharding | Postgres, MySQL |
| **Document** | Nested JSON-like documents | Reading an aggregate in one go; flexible fields | Unbounded embedded arrays; cross-document joins and constraints | MongoDB, Firestore |
| **Key-value** | Key → opaque value | O(1) lookups by key at huge scale | No queries beyond the key | Redis, DynamoDB (simple use) |
| **Wide-column** | Partition key → sorted rows | Massive write throughput, range scans within a partition | Must design tables per query; hot partitions | Cassandra, Bigtable, DynamoDB |
| **Graph** | Nodes and edges | Multi-hop traversals (friends of friends, fraud rings) | Sharding graphs is hard | Neo4j |
| **Time-series** | Timestamped points, compressed | Downsampling and range aggregation over time | Updates and high-cardinality tags | Prometheus, TimescaleDB |

```sort
prompt: Which model is the natural first choice?
buckets: [Relational, Document, Wide-column, Key-value, Graph]
items:
  - {text: 'Orders, payments and refunds with foreign keys and multi-row transactions', bucket: 0, why: 'Relationships plus invariants plus transactions is what relational databases are built for.'}
  - {text: 'A product catalogue where each category has different attributes, read as whole products', bucket: 1, why: 'Varying fields read together as an aggregate suit documents (or a JSONB column in Postgres).'}
  - {text: 'IoT sensor readings: 2M writes/s, queried by device and time range', bucket: 2, why: 'Partition by device, cluster by time: huge write throughput with cheap range scans per device.'}
  - {text: 'Session lookup by opaque token with a TTL', bucket: 3, why: 'The only query is by key. A key-value store with expiry fits exactly.'}
  - {text: '"People you may know": friends-of-friends within 3 hops', bucket: 4, why: 'Multi-hop traversals are what graph databases optimise.'}
```

> [!senior] Postgres is usually the right first answer
> A relational database with JSONB columns, partial indexes and time-based partitioning covers a remarkable range of workloads, with constraints and transactions you'll otherwise rebuild in application code. Reach for a specialised store when a specific access pattern or scale clearly demands it — and say which one.

## Designing for the query: partition and sort keys

Wide-column and key-value stores (Cassandra, DynamoDB, Bigtable) have no joins and little ad hoc querying. You design **one table per query pattern** around two keys:

- **Partition key** — decides which node stores the row. All rows with the same partition key live together; queries must supply it.
- **Sort (clustering) key** — orders rows within a partition, so range queries ("the latest 50") are cheap.

```faded
title: Model a chat message table for Cassandra or DynamoDB
prompt: The main query is "load the latest 50 messages in a conversation, then page backwards".
text: |
  The partition key should be [[conversation_id|message_id|sender_id]], so all of a conversation's messages are stored together and one query hits one partition.

  The sort key should be [[a time-ordered message ID (e.g. Snowflake or ULID)|the sender's name|a random UUIDv4]], so messages are stored in order and "latest 50, descending" is a single range read.

  A very busy conversation might make its partition too large or hot, so we [[add a time bucket to the partition key, e.g. (conversation_id, month)|switch to a graph database|remove the sort key]] and read the most recent bucket first.

  To answer "all conversations for a user, by latest activity" we need [[a second table keyed by user_id|a JOIN|a full table scan]], updated on every new message — duplication by design.
explain: In these stores you denormalise deliberately — one table per query, keyed for that query. The cost moves to writes (several tables to update) and to keeping them consistent.
```

## Normalise or denormalise?

**Normalised** data stores each fact once: a user's name lives in `users` and posts reference `user_id`. Updates are trivial; reads need joins.

**Denormalised** data copies facts to where they're read: each post stores the author's name. Reads are one lookup; updates must touch every copy, and copies can disagree.

Denormalise when a read path is hot and the copied data changes rarely (or can be stale), and decide up front how copies are updated: synchronously in the same transaction, asynchronously from an event or change stream, or never (a snapshot taken at the time, such as the price on an invoice line).

```predict
prompt: A social app copies each author's display name and avatar URL into every post document so feeds render without joins. Users can change their display name. What's the real cost?
choices:
  - None — copies are free
  - Every name change must update all of that user's posts (potentially millions), or old posts show the old name until a background job catches up
  - The feed becomes slower to read
  - It's impossible to change a display name
answer: 1
reveal: |
  Denormalisation moves work from reads to writes. A prolific user's rename becomes a large fan-out update, usually done asynchronously, so old posts show stale names for a while. Many systems instead store only `author_id` in posts and resolve names through a hot cache. Pick based on how often the copied data changes and how stale it may be.
```

## Avoid unbounded growth inside one record

Whatever the model, never let a single row, document or partition grow without bound: replies inside a thread document, followers in a user row, all events of a device in one partition forever. Model the many side as its own rows (`replies(thread_id, created_at, …)`), bucket partitions by time, and paginate.

```bug
title: Review this document schema
prompt: A MongoDB schema for a Q&A site. Which fields will cause problems as the site grows?
lang: json
code: |
  {
    "_id": "question_123",
    "title": "How do I reverse a list?",
    "author": {"id": "u_9", "name": "Sam", "reputation": 4120},
    "tags": ["python", "lists"],
    "answers": [ {"id": "a_1", "body": "...", "votes": 52, "comments": [ ... ]} ],
    "viewer_ids": ["u_1", "u_2", "u_3", "..."],
    "created_at": "2026-03-01T10:00:00Z"
  }
bug: [5, 7]
explain: |
  **Line 7:** `viewer_ids` grows with every view — unbounded, rewritten on each view, and quickly the biggest part of the document. Store a counter (and per-user views elsewhere if needed). **Line 5:** embedding every answer, each with its own embedded comments, means popular questions grow without bound, concurrent answers contend on one document, and you can't paginate answers efficiently. Store answers as their own documents keyed by `question_id`. (Line 3's embedded author name is a reasonable denormalisation if a stale reputation figure is acceptable.)
```

## Schemas evolve: expand, migrate, contract

You can't take the site down to rename a column, and old and new code run side by side during every deploy. The safe pattern:

```order
prompt: Order the steps to rename `users.fullname` to `users.display_name` with zero downtime.
items:
  - "Expand: add the new nullable column display_name"
  - Deploy code that writes both columns and still reads fullname
  - Backfill display_name for existing rows in small batches
  - Deploy code that reads display_name (still writing both)
  - Deploy code that stops writing fullname
  - "Contract: drop the fullname column after a safe period"
explain: At every step, both the currently deployed version and the previous one work against the schema, so a rollback is always possible. Backfilling in batches avoids long locks and replication lag. Skipping steps — for example renaming in place — breaks whichever code version is still running.
```

```calc
title: How long will the backfill take?
prompt: You need to backfill **300 million** rows. To keep replication lag low you update in batches of **5,000** rows, one batch every **200 ms**. Roughly how many **hours** will it take?
answer: 3.3
unit: hours
tolerance: 1.1
steps: |
  5,000 rows per 0.2 s = 25,000 rows/s. 300,000,000 ÷ 25,000 = 12,000 s ≈ **3.3 hours**. That's fine as a background job, but it means the dual-write phase lasts at least that long — and you'd throttle further if replica lag or p99 latency rises.
```

```interview
say: |
  "The access patterns are: fetch an order with its items by ID, list a customer's recent orders, and an invariant that items reference real products and stock never goes negative. That's relational — orders, order_items and products, with foreign keys, a composite index on (customer_id, created_at) and a conditional stock update. Product attributes vary by category, so they go in a JSONB column. The event history has its own append-only table, partitioned by month. Schema changes follow expand–migrate–contract."
followups:
  - q: When would you choose a document database?
    a: When data is read and written as self-contained aggregates with varying fields, cross-aggregate transactions are rare, and nothing embedded grows without bound.
  - q: How do you model data in Cassandra or DynamoDB?
    a: One table per query pattern. Pick a partition key that spreads load and contains what the query needs together, and a sort key that orders it for range reads. Accept duplication, and plan how the copies get updated.
  - q: How do you change a schema on a live system?
    a: Expand–contract. Add new structures, dual-write, backfill in batches, switch reads, stop the old writes, then remove the old structures — every step compatible with the previous deploy.
weak: |
  "I'll use MongoDB because it scales." No access patterns, no invariants, embedded arrays that grow forever, no thought about migrations.
strong: |
  Lists queries, writes, invariants and growth first; justifies the model by them; denormalises deliberately with an update strategy; bounds record growth; plans expand–contract migrations.
```

```recall
prompt: Explain the trade-off of denormalising a frequently read field, such as copying a user's name into every post, and name two strategies for keeping the copies up to date.
points:
  - Reads get faster or simpler because there's no join or second lookup
  - Writes get more expensive because a change must update every copy
  - Copies can be stale or inconsistent until they're updated
  - Strategies include updating copies synchronously in the same transaction, asynchronously from events/CDC, or treating the copy as an intentional snapshot
model: |
  Copying the name into each post makes rendering a feed a single read with no join or extra lookup. The cost lands on writes: when the user changes their name, every post holding a copy must be updated — possibly millions — and until then some posts show the old name. You can update copies in the same transaction (simple but slow for big fan-outs), asynchronously from an event or change-data-capture stream (fast writes, temporary staleness), or decide the copy is a historical snapshot that never changes, like the price on an invoice. Often the better answer is to store only the ID and resolve the name through a cache.
```

```questions
- kind: check
  prompt: What should drive the initial choice of data model?
  choices:
    - text: The access patterns, invariants and growth characteristics of the data
      correct: true
    - text: The database with the most GitHub stars
      why: Popularity tells you nothing about whether a database fits your queries and guarantees.
    - text: Whatever the UI page layout looks like
      why: Page layouts change, and they say nothing about write patterns or growth.
    - text: The schema with the fewest tables
      why: Fewer tables can mean unbounded documents and impossible invariants.
  explanation: Model for the queries that matter, the rules that must hold, and what grows without bound.
- kind: check
  prompt: In a wide-column store, the main query is "the latest messages in a conversation". What should the partition and sort keys be?
  choices:
    - text: Partition by conversation ID, sort by a time-ordered message ID
      correct: true
    - text: Partition by message ID, sort by conversation ID
      why: That spreads one conversation's messages across every partition, so the query must scatter.
    - text: Partition by sender, sort by text
      why: The query is by conversation, not sender.
    - text: A single partition for all messages
      why: That's one gigantic hot partition.
  explanation: The partition key colocates what one query needs, and the sort key orders it for cheap range reads.
- kind: check
  type: order
  prompt: Order a zero-downtime column rename (expand–contract).
  items:
    - Add the new column
    - Write to both columns
    - Backfill existing rows in batches
    - Switch reads to the new column
    - Stop writing the old column
    - Drop the old column
  explanation: Every step keeps both the current and the previous code version working, so any deploy can be rolled back safely.
- kind: check
  type: multi
  prompt: Which are warning signs in a document schema? Select all that apply.
  choices:
    - text: An embedded array that grows with every user action (views, followers, replies)
      correct: true
    - text: A document that many users update concurrently
      correct: true
    - text: Data that must be joined across many documents for the main query
      correct: true
    - text: Fields that differ between documents of the same collection
      why: Flexible fields are a strength of documents, as long as validation exists.
  explanation: Documents shine for bounded, self-contained aggregates. Unbounded growth, hot shared documents and join-heavy queries fight the model.
- kind: fire
  prompt: A post stores a copy of its author's display name. The author renames themselves. What must the design decide?
  choices:
    - text: How and when the copies get updated (synchronously, asynchronously, or never), and how much staleness is acceptable
      correct: true
    - text: Nothing — copies update themselves
      why: Nothing updates copies unless you build it.
    - text: Whether to delete the old posts
      why: Deleting user content isn't a way to manage consistency.
    - text: Whether to switch databases
      why: Every database has the same trade-off once you duplicate data.
  explanation: Denormalisation creates a consistency obligation. Choose the propagation strategy explicitly.
- kind: fire
  prompt: Which workload most clearly fits a graph database?
  choices:
    - text: Finding accounts connected through up to four shared devices or payment cards (fraud rings)
      correct: true
    - text: Storing user sessions by token
      why: That's a key-value lookup.
    - text: Monthly revenue by region
      why: That's an analytical aggregate, suited to SQL or a warehouse.
    - text: Appending sensor readings
      why: That's time-series or wide-column territory.
  explanation: Variable-depth traversals over relationships are where graph databases beat joins.
- kind: fire
  type: numeric
  prompt: A backfill processes 4,000 rows every 100 ms. How many hours will 288 million rows take?
  answer: 2
  unit: hours
  tolerance: 0.05
  explanation: 40,000 rows/s → 288,000,000 ÷ 40,000 = 7,200 s = 2 hours. Throttle further if replica lag or latency rises.
- kind: fire
  level: advanced
  prompt: Why can renaming a column in a single deploy break a live system, even if the migration itself is instant?
  choices:
    - text: During a rolling deploy, old code still running expects the old column name, and rollback becomes impossible
      correct: true
    - text: Databases can't rename columns
      why: They can. Compatibility is the issue.
    - text: Renames always take hours
      why: In many databases a rename is a quick metadata change. That's not the problem.
    - text: The new name must be shorter
      why: Length doesn't matter.
  explanation: Old and new versions coexist during deploys, so schema changes must be backward compatible at each step. That's why expand–contract exists.
- kind: fire
  prompt: A team proposes a key-value store for orders, then needs "orders over £500 in the last week by region". What's the core problem?
  choices:
    - text: Key-value stores only support lookup by key, so ad hoc filters need a full scan or another system
      correct: true
    - text: Key-value stores can't store numbers
      why: Values can hold anything.
    - text: The query is too fast for a key-value store
      why: The query is impossible to serve efficiently, not too fast.
    - text: Regions can't be keys
      why: They could be, but you'd need another table per query.
  explanation: Choose stores whose query model covers the questions you'll ask, or pair an operational store with an analytical one.
```
