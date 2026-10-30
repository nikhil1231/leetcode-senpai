---
id: postgres-internals
category: data
skill: data
title: Postgres internals - MVCC, isolation, locks and vacuum
minutes: 17
summary: Postgres keeps transactions apart with MVCC. An update writes a new row version, readers see a snapshot and never block writers, and vacuum later reclaims dead versions. Each isolation level allows a specific set of anomalies. Row locks (`SELECT ... FOR UPDATE`), lock queues behind DDL, long-running transactions and connection limits cause most production incidents. Interviewers want the mechanism and the failure mode.
objectives:
  - Explain MVCC row versions, snapshots, and why readers don't block writers
  - Name the anomaly each isolation level permits in Postgres, and how to prevent lost updates
  - Explain why long transactions and DDL locks cause outages
  - Explain vacuum, bloat, transaction ID wraparound and connection pooling
sources:
  - ['PostgreSQL docs: Transaction isolation', 'https://www.postgresql.org/docs/current/transaction-iso.html']
  - ['PostgreSQL docs: Explicit locking', 'https://www.postgresql.org/docs/current/explicit-locking.html']
  - ['PostgreSQL docs: Routine vacuuming', 'https://www.postgresql.org/docs/current/routine-vacuuming.html']
---

## MVCC

Every row version (tuple) records `xmin`, the transaction that created it, and `xmax`, the one that deleted or replaced it. An `UPDATE` doesn't overwrite in place. It marks the old version dead (sets `xmax`) and writes a new one. A query reads from a **snapshot** and only sees versions committed before it started, so **readers never block writers and writers never block readers**. Writers do block other writers on the same row.

The cost is dead tuples. **VACUUM** (usually autovacuum) marks their space reusable, and until it runs, tables and indexes **bloat**. Anything that holds an old snapshot open, such as a long-running transaction, an idle-in-transaction session or an old replication slot, stops vacuum from removing versions that snapshot could still see, everywhere in the database.

## Isolation levels in Postgres

| Level | What each statement or transaction sees | Anomaly still possible |
|---|---|---|
| Read committed (default) | A new snapshot **per statement** | Non-repeatable reads, lost updates with read-modify-write in app code, write skew |
| Repeatable read | One snapshot **per transaction** | Write skew. Concurrent updates to the same row fail with a serialization error you must retry |
| Serializable | Repeatable read plus conflict detection (SSI) | None, but transactions can fail with serialization errors and must be retried |

Postgres never allows dirty reads, even if you ask for read uncommitted.

**Lost updates** are the classic interview case: two requests read `balance = 100`, both compute `100 - 30`, and both write `70`. Fixes, from simplest: do it in one statement (`UPDATE accounts SET balance = balance - 30 WHERE id = 1 AND balance >= 30`), lock the row first (`SELECT ... FOR UPDATE`), use optimistic concurrency (`WHERE version = :v` and check the row count), or use repeatable read or serializable with retries.

**Write skew** is subtler: two doctors each check "at least one other doctor is on call", then each takes themselves off. Each transaction updates a *different* row, so row locks don't conflict. Only serializable catches it, unless you lock the rows you read or add a constraint.

```timeline
title: A lost update under read committed
lanes: [Request A, Request B, Postgres]
state: {balance: '100'}
steps:
  - {lane: Request A, to: Postgres, text: 'SELECT balance → 100'}
  - {lane: Request B, to: Postgres, text: 'SELECT balance → 100'}
  - {lane: Request A, to: Postgres, text: 'UPDATE SET balance = 70 (computed 100 − 30); COMMIT', set: {balance: '70'}}
  - {lane: Request B, to: Postgres, text: 'UPDATE SET balance = 50 (computed 100 − 50); COMMIT', set: {balance: '50'}}
find:
  prompt: Which step loses money for the bank?
  answer: 3
  explain: |
    B computed its new balance from a value that A had already changed, and wrote an absolute value over A's update. The correct result is 20. Fix it with a relative, guarded update (`SET balance = balance - 50 WHERE balance >= 50`), with `SELECT ... FOR UPDATE` in step 2 (B would wait for A, then read 70), or with a version check.
```

## Locks that cause outages

- **Row locks** come from `UPDATE`, `DELETE` and `SELECT ... FOR UPDATE`. `FOR UPDATE SKIP LOCKED` turns a table into a work queue: each worker takes rows nobody else holds.
- **Table locks from DDL**: `ALTER TABLE ... ADD COLUMN ... DEFAULT` is fast since Postgres 11, but many `ALTER`s take an **ACCESS EXCLUSIVE** lock. The real danger is the **lock queue**: the ALTER waits behind one long-running query, and every new query on that table queues behind the ALTER. A two-second migration becomes a full outage. Always set `lock_timeout` for migrations, and use `CREATE INDEX CONCURRENTLY`.
- **Deadlocks**: Postgres detects them and aborts one transaction. Prevent them by taking locks in a consistent order.

```incident
title: The migration that took the site down
start: s0
nodes:
  s0:
    text: 'A deploy runs `ALTER TABLE orders ADD CONSTRAINT ... FOREIGN KEY` at 14:00. Within seconds, every request touching `orders` times out. The ALTER itself shows as waiting. What do you check first?'
    options:
      - {label: 'pg_stat_activity and pg_locks: who holds a lock on orders, and who is waiting', next: s1, quality: good, note: 'Lock waits leave clear traces here.'}
      - {label: 'Scale up the database instance', next: bad1, quality: bad, note: 'CPU is idle; everyone is waiting on a lock.'}
  bad1:
    text: 'Bigger hardware does nothing, and the failover during resizing makes the outage longer.'
    verdict: bad
  s1:
    text: 'A reporting query has been running on `orders` for 40 minutes. The ALTER is queued behind it wanting ACCESS EXCLUSIVE, and 900 application queries are queued behind the ALTER.'
    options:
      - {label: 'Cancel the ALTER (pg_cancel_backend), let traffic recover, then re-run it with lock_timeout and NOT VALID + VALIDATE', next: good, quality: good, note: 'The queued DDL is what blocks everyone.'}
      - {label: 'Kill the reporting query so the ALTER can run', next: okay, quality: ok, note: 'Traffic recovers once the ALTER finishes, but you are still at the mercy of the next long query.'}
      - {label: 'Wait for the report to finish', next: bad2, quality: bad, note: 'Another 20 minutes of downtime.'}
  bad2:
    text: 'The site stays down until the report finishes.'
    verdict: bad
  okay:
    text: 'The ALTER gets its lock, validates every row while holding it, and the queue drains a minute later.'
    verdict: ok
  good:
    text: 'Traffic recovers immediately. The re-run adds the constraint as NOT VALID (brief lock), then VALIDATE CONSTRAINT checks existing rows under a weaker lock.'
    verdict: good
debrief: Set `lock_timeout` on every migration, split long operations into low-lock steps (NOT VALID then VALIDATE, CREATE INDEX CONCURRENTLY), and keep long analytical queries off the primary.
```

## Vacuum, wraparound and connections

- **Transaction ID wraparound**: transaction IDs are 32-bit, so old rows must be "frozen" by vacuum. If autovacuum can't keep up, for example because a long transaction pins old snapshots, Postgres eventually refuses writes to protect data. Monitor `age(datfrozenxid)`.
- **Connections are processes**: each one costs memory, and hundreds of idle connections hurt. Put **PgBouncer** in front in transaction pooling mode. Note that session state (prepared statements, `SET`, advisory locks) doesn't survive transaction pooling, unless your PgBouncer version supports protocol-level prepared statements.
- **Replicas**: streaming replicas lag. Reads from a replica can be stale, and long queries on a replica can be cancelled by replication conflicts, or with `hot_standby_feedback` on they can bloat the primary.

```questions
- kind: check
  prompt: Why don't readers block writers in Postgres?
  choices:
    - text: Updates create new row versions, and readers see a snapshot of versions committed before they started
      correct: true
    - text: Reads take no locks because they run on replicas
      why: This holds on the primary too.
    - text: Writers wait until all readers finish
      why: That's lock-based concurrency, not MVCC.
  explanation: MVCC keeps old versions visible to older snapshots until vacuum removes them.
- kind: check
  prompt: Two requests run `SELECT stock` then `UPDATE ... SET stock = <computed>` under read committed. Which change prevents the lost update with the least code?
  choices:
    - text: A single relative, guarded UPDATE such as SET stock = stock - 1 WHERE stock > 0
      correct: true
    - text: Raise max_connections
      why: Unrelated to concurrency control.
    - text: Add an index on stock
      why: Indexes don't serialize writers.
    - text: Read the value twice to confirm it
      why: The race remains between the read and the write.
  explanation: The row lock on UPDATE serializes the two, and each recomputes from the current value.
- kind: check
  prompt: An ALTER TABLE waits for a lock behind a long SELECT. What happens to new queries on that table?
  choices:
    - text: They queue behind the waiting ALTER, so the table becomes unusable
      correct: true
    - text: They skip ahead of the ALTER and run normally
      why: Postgres grants lock requests in a queue, so conflicting requests wait behind it.
    - text: They are routed to a replica
      why: Postgres doesn't reroute queries.
  explanation: Use lock_timeout so a blocked migration fails fast instead of taking the table down.
- kind: fire
  prompt: Which isolation level is the only one in Postgres that prevents write skew?
  choices:
    - text: Serializable
      correct: true
    - text: Repeatable read
      why: Snapshot isolation still allows write skew.
    - text: Read committed
      why: It allows even more anomalies.
  explanation: Serializable Snapshot Isolation detects the dangerous read-write dependency patterns.
- kind: fire
  prompt: What is `FOR UPDATE SKIP LOCKED` commonly used for?
  choices:
    - text: Letting several workers claim different rows from a job table without blocking each other
      correct: true
    - text: Reading uncommitted rows
      why: Postgres never does dirty reads.
    - text: Skipping vacuum
      why: Unrelated.
  explanation: Each worker locks rows nobody else holds, which makes a simple, reliable queue.
- kind: fire
  prompt: A session has sat idle in transaction for six hours. What's the main harm?
  choices:
    - text: Vacuum can't remove dead tuples newer than its snapshot, so tables bloat, and any locks it holds remain
      correct: true
    - text: None, because idle sessions use no resources
      why: It pins a snapshot and holds a connection.
    - text: It speeds up other queries by caching
      why: No.
  explanation: Set idle_in_transaction_session_timeout and monitor transaction age.
- kind: fire
  prompt: You put PgBouncer in transaction pooling mode. Which application feature may break?
  choices:
    - text: Session-level state such as SET variables, advisory locks or server-side prepared statements
      correct: true
    - text: Ordinary transactions
      why: Those are exactly what it pools.
    - text: Indexes
      why: Unaffected.
  explanation: Consecutive transactions from one client may land on different server connections.
```
