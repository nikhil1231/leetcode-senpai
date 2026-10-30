---
id: transactions
category: storage
skill: concurrency
title: Transactions, isolation and constraints
minutes: 18
summary: A transaction makes a group of changes commit or roll back together, but it only prevents the concurrency anomalies its isolation level covers. Most databases default to Read Committed, which still allows lost updates and write skew. Know which anomaly threatens your invariant, then pick the cheapest mechanism that stops it — an atomic update, a constraint, a lock, a version check or serialisable isolation with retries.
objectives:
  - Explain atomicity and durability, and what a transaction can't cover (external side effects)
  - Recognise dirty reads, non-repeatable reads, phantoms, lost updates and write skew, and which isolation levels prevent them
  - Prevent races with atomic conditional updates, row locks, optimistic versions, unique and check constraints, or serialisable isolation plus retries
  - Avoid deadlocks and long transactions in production
sources:
  - ['PostgreSQL: Transaction isolation', 'https://www.postgresql.org/docs/current/transaction-iso.html']
  - ['PostgreSQL: Explicit locking', 'https://www.postgresql.org/docs/current/explicit-locking.html']
  - ['Berenson et al., A Critique of ANSI SQL Isolation Levels', 'https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/']
case: seats
---

> [!incident] The bitcoin exchange that printed money
> In 2014 a cryptocurrency exchange, Flexcoin, shut down after attackers drained its hot wallet. They sent many simultaneous withdrawal requests: each request read the balance, checked it was sufficient, and wrote the new balance, and all of them passed the check before any write landed. Every individual request was "correct". Together they withdrew far more than the account held. It's the textbook lost update, in production, with real money.

## What transactions give you

- **Atomicity:** all of the transaction's changes commit, or none do. A transfer's debit and credit can't half-happen.
- **Durability:** once `COMMIT` returns, the change survives a crash (it's in the write-ahead log on disk, and on replicas if you configured synchronous replication).
- **Isolation:** concurrent transactions don't see each other's partial work — *to the degree the isolation level promises*. This is where the subtlety lives.
- **Consistency** (the "C") is really your invariants: constraints the database enforces, plus rules your transactions maintain.

> [!mistake] Transactions don't cover the outside world
> Calling a payment API or sending an email inside a transaction that later rolls back doesn't un-send the email. External side effects need idempotency, outbox patterns or sagas — not `BEGIN … COMMIT`.

## The anomalies

| Anomaly | What happens | Read Committed (PG default) | Repeatable Read / Snapshot | Serializable |
|---|---|---|---|---|
| Dirty read | See another transaction's uncommitted data | Prevented | Prevented | Prevented |
| Non-repeatable read | Read a row twice and get different values | **Possible** | Prevented | Prevented |
| Phantom | Re-run a query and get new rows | **Possible** | Prevented in Postgres (MVCC snapshot) | Prevented |
| Lost update | Two read-modify-writes; one overwrites the other | **Possible** | Postgres aborts one with a serialisation error; MySQL's RR does not | Prevented |
| Write skew | Two transactions read overlapping data, write *different* rows, and break an invariant | **Possible** | **Possible** | Prevented (Postgres SSI aborts one) |

Defaults differ: Postgres and Oracle default to **Read Committed**; MySQL InnoDB defaults to **Repeatable Read** (with different semantics from Postgres's). Always check rather than assume.

## Lost update

```timeline
title: Two withdrawals, Read Committed
lanes: [Withdrawal A, Withdrawal B, Database]
state: {Balance: '100'}
steps:
  - {lane: Withdrawal A, to: Database, text: 'SELECT balance → 100'}
  - {lane: Withdrawal B, to: Database, text: 'SELECT balance → 100'}
  - {lane: Withdrawal A, to: Withdrawal A, text: '100 ≥ 80, OK → new balance 20'}
  - {lane: Withdrawal B, to: Withdrawal B, text: '100 ≥ 80, OK → new balance 20'}
  - {lane: Withdrawal A, to: Database, text: 'UPDATE balance = 20; COMMIT', set: {Balance: '20'}}
  - {lane: Withdrawal B, to: Database, text: 'UPDATE balance = 20; COMMIT', set: {Balance: '20 ⚠ (160 paid out)'}}
find:
  prompt: Which step makes the second withdrawal's decision invalid?
  answer: 4
  explain: |
    A's commit changes the balance B based its decision on. B still writes "20" computed from a stale read, so 160 was paid out of 100. Wrapping both steps in `BEGIN … COMMIT` at Read Committed doesn't help: each SELECT sees committed data, but nothing stops the interleaving. The fix is to make **the check and the write one atomic step**, so the second one fails.
```

Four ways to stop it, cheapest first:

```sql
-- 1. Atomic conditional update: the database checks and writes in one statement.
UPDATE accounts SET balance = balance - 80
WHERE id = 7 AND balance >= 80;            -- 0 rows updated => insufficient funds

-- 2. Pessimistic lock: the second transaction waits for the first.
BEGIN;
SELECT balance FROM accounts WHERE id = 7 FOR UPDATE;
-- check in application code, then:
UPDATE accounts SET balance = balance - 80 WHERE id = 7;
COMMIT;

-- 3. Optimistic version check: detect the conflict, retry.
UPDATE accounts SET balance = 20, version = version + 1
WHERE id = 7 AND version = 41;             -- 0 rows => someone else changed it; re-read and retry

-- 4. Constraint as a safety net: the database refuses the invalid state.
ALTER TABLE accounts ADD CONSTRAINT non_negative CHECK (balance >= 0);
```

## Write skew: the anomaly snapshots don't stop

```predict
prompt: |
  A hospital rule: **at least one doctor must be on call**. Alice and Bob are both on call. Each, at the same moment, runs: "count doctors on call; if more than 1, set *me* off call." Both transactions use **Repeatable Read** (snapshot isolation). What can happen?
choices:
  - One transaction blocks until the other finishes, so the rule holds
  - Both see a count of 2, both set themselves off call, and nobody is on call
  - The database detects the conflict because they updated the same row
  - Snapshot isolation prevents all anomalies
answer: 1
reveal: |
  Each transaction reads the same snapshot (2 on call) and writes a **different** row (its own). There's no write–write conflict for snapshot isolation to catch, so both commit and the invariant breaks. This is **write skew**. Fixes: `SERIALIZABLE` isolation (Postgres's SSI detects the read–write dependency and aborts one, which the app retries), explicitly locking the rows the decision depends on (`SELECT … FOR UPDATE` on all on-call doctors), or materialising the conflict on a single row (an `on_call_count` row both must update).
```

```timeline
title: Write skew on a shared invariant
lanes: [Alice's txn, Bob's txn, Database]
state: {'On call': 'Alice, Bob'}
steps:
  - {lane: "Alice's txn", to: Database, text: 'SELECT count(*) WHERE on_call → 2'}
  - {lane: "Bob's txn", to: Database, text: 'SELECT count(*) WHERE on_call → 2'}
  - {lane: "Alice's txn", to: Database, text: 'UPDATE doctors SET on_call=false WHERE name=Alice; COMMIT', set: {'On call': 'Bob'}}
  - {lane: "Bob's txn", to: Database, text: 'UPDATE doctors SET on_call=false WHERE name=Bob; COMMIT', set: {'On call': 'nobody ⚠'}}
```

The same shape appears whenever an invariant spans rows: "no two bookings overlap for a room", "a username is unique across tables", "total allocation ≤ budget". If you can, encode the invariant so it becomes a conflict on a single row or a constraint — an exclusion constraint for overlapping ranges, a unique index — and let the database enforce it.

```sort
prompt: Which mechanism is the most direct fit for each invariant?
buckets: [Unique constraint, Atomic conditional UPDATE, SELECT … FOR UPDATE, SERIALIZABLE + retry]
items:
  - {text: 'No two users have the same email', bucket: 0, why: 'The database enforces uniqueness across all concurrent writers, even ones that bypass your code.'}
  - {text: 'Stock count never goes below zero when buying one item', bucket: 1, why: '`SET stock = stock - 1 WHERE id = ? AND stock > 0` checks and writes atomically.'}
  - {text: 'Read a seat, call a fraud check, then reserve it — other buyers must wait', bucket: 2, why: 'A row lock holds the seat for the short decision. Keep the lock scope small and never hold it across slow external calls if you can avoid it.'}
  - {text: 'Total of all project allocations must stay under the department budget', bucket: 3, why: 'The invariant spans many rows written by different transactions — classic write skew. Serialisable isolation detects it, or you lock a budget row that every allocation must update.'}
  - {text: 'One confirmed booking per (event, seat)', bucket: 0, why: 'A unique index on (event_id, seat_id) for confirmed bookings makes duplicates impossible.'}
```

## Deadlocks and long transactions

Two transactions that lock the same rows in **opposite orders** wait for each other forever. Databases detect this and abort one with a deadlock error, so your code must retry. Prevent most deadlocks by locking in a consistent order (e.g. by primary key).

Long transactions cause trouble beyond locks. In MVCC databases they keep old row versions alive (bloat, slower scans), hold locks that block other writers, and in Postgres can prevent vacuum from reclaiming space. Keep transactions **short**: no user think time, no network calls to other services inside them.

```bug
title: A transfer implementation
prompt: This money-transfer function runs at Read Committed. Which lines are bugs?
lang: python
code: |
  def transfer(src, dst, amount):
      with db.transaction():
          a = db.query("SELECT balance FROM accounts WHERE id=%s", src)
          if a.balance < amount:
              raise InsufficientFunds()
          db.execute("UPDATE accounts SET balance=%s WHERE id=%s", a.balance - amount, src)
          db.execute("UPDATE accounts SET balance=balance+%s WHERE id=%s", amount, dst)
          payments_api.notify_transfer(src, dst, amount)
bug: [6, 8]
explain: |
  **Line 6** writes a balance computed from a read that may be stale. Two concurrent transfers from `src` both pass the check and the last write wins — a lost update. Use `UPDATE … SET balance = balance - %s WHERE id = %s AND balance >= %s` and check the row count (or lock with `FOR UPDATE`). **Line 8** makes an external call inside the transaction: it holds row locks for the duration of a network call, and if the commit later fails the notification has already gone out. Commit first, then notify through an outbox. (Transfers between the same two accounts in opposite directions can also deadlock — lock both rows in a consistent order, such as by account id.)
fix: |
  def transfer(src, dst, amount):
      first, second = sorted([src, dst])            # consistent lock order avoids deadlocks
      with db.transaction():
          db.query("SELECT 1 FROM accounts WHERE id IN (%s,%s) ORDER BY id FOR UPDATE", first, second)
          moved = db.execute("UPDATE accounts SET balance = balance - %s WHERE id=%s AND balance >= %s",
                             amount, src, amount)
          if moved.rowcount == 0:
              raise InsufficientFunds()
          db.execute("UPDATE accounts SET balance = balance + %s WHERE id=%s", amount, dst)
          outbox.add("transfer_completed", src=src, dst=dst, amount=amount)   # same transaction
```

> [!senior] Serializable isn't free, but it's cheaper than you think
> Postgres's serialisable snapshot isolation (SSI) doesn't lock everything: it tracks read–write dependencies and aborts a transaction when a dangerous pattern appears. You pay some overhead and a higher abort rate under contention, and your code **must retry** serialisation failures (SQLSTATE 40001). For complex invariants that's often simpler and safer than hand-placing locks.

```interview
ask: How would you maintain correctness in an event ticketing system when users concurrently hold and book seats, with per-event allocation limits?
say: |
  "For the seat invariant I'd let the database enforce it: a unique index on (event_id, seat_id) for confirmed bookings, and holds via a conditional update — `UPDATE seats SET held_by = ?, hold_expires = now() + interval '5 min' WHERE id = ? AND (held_by IS NULL OR hold_expires < now())` — checking the row count. Transactions stay short, with no external calls inside; notifications go through an outbox. Where an invariant spans rows, like a per-event allocation limit, I'd use SERIALIZABLE with retries or lock a single limit row."
followups:
  - q: Isn't wrapping it in a transaction enough?
    a: Not at Read Committed. Two transactions can both read the old value and both write. You need the check and the write to be atomic — a conditional update, a lock, a version check — or a stronger isolation level.
  - q: What's write skew?
    a: Two transactions read overlapping data, each writes a different row based on what it read, and together they violate an invariant. Snapshot isolation doesn't catch it, because there's no write–write conflict. Serializable does.
  - q: How do you handle deadlocks?
    a: Lock in a consistent order to avoid most of them, keep transactions short, and retry when the database aborts one with a deadlock error.
weak: |
  "Use a transaction so it's atomic." Doesn't know the isolation level, read-then-writes in application code, calls external services inside transactions.
strong: |
  Names the anomaly threatening each invariant, picks the narrowest mechanism (constraint, conditional update, lock, version, serializable+retry), keeps transactions short and external effects outside, and handles deadlocks and retries.
```

```recall
prompt: Explain why a read-check-write sequence inside a transaction can still lose an update at Read Committed, and give two ways to prevent it.
points:
  - At Read Committed, two transactions can both read the same committed value before either writes
  - Each makes its decision on that value and writes, so one write overwrites the other (lost update)
  - Prevention through an atomic conditional update that checks and writes in one statement
  - Or a row lock (SELECT … FOR UPDATE), an optimistic version check, or stronger isolation with retries
model: |
  Read Committed only guarantees you see committed data. Two withdrawals can both SELECT a balance of 100, both decide 80 is affordable, and both write 20 — the second overwrites the first, and 160 leaves a 100 account. The transaction boundary doesn't serialise them. Either make the check part of the write — `UPDATE … SET balance = balance - 80 WHERE id = ? AND balance >= 80` and check that one row changed — or lock the row with SELECT … FOR UPDATE so the second waits. Optimistic version columns or SERIALIZABLE isolation with retries also work, and a CHECK constraint is a good last line of defence.
```

```questions
- kind: check
  prompt: Two concurrent transactions at Read Committed each read stock = 1, check it's above 0, and write stock = 0. Two orders succeed. Which anomaly is this?
  choices:
    - text: Lost update
      correct: true
    - text: Dirty read
      why: Both read committed data. Nothing uncommitted was seen.
    - text: Phantom read
      why: Phantoms are new rows appearing on a re-run query. Here the same row was overwritten.
    - text: Deadlock
      why: Nothing waited on anything. Both just committed.
  explanation: Both transactions made decisions from the same value and wrote over each other. An atomic conditional update (`WHERE stock > 0`) or a row lock prevents it.
- kind: check
  prompt: Which isolation level prevents write skew in Postgres?
  choices:
    - text: Serializable
      correct: true
    - text: Repeatable Read
      why: Snapshot isolation misses write skew, because the transactions write different rows.
    - text: Read Committed
      why: It prevents dirty reads only.
    - text: Read Uncommitted
      why: In Postgres this behaves like Read Committed, and it's weaker still in principle.
  explanation: Postgres's SSI detects the read–write dependency pattern behind write skew and aborts one transaction, which the application must retry.
- kind: check
  type: multi
  prompt: Which reliably prevent two users registering the same username under concurrency? Select all that apply.
  choices:
    - text: A unique index on username
      correct: true
    - text: "INSERT … ON CONFLICT (username) DO NOTHING, then check whether a row was inserted"
      correct: true
    - text: SELECT to check the name is free, then INSERT, at Read Committed
      why: Both requests can see "free" and both insert, unless a unique constraint stops the second.
    - text: Checking availability in the browser as the user types
      why: That's a UX nicety, not a guarantee.
  explanation: Uniqueness under concurrency has to be enforced by the database. Application-level checks are only hints.
- kind: check
  type: order
  prompt: Order the steps of an optimistic-concurrency update that handles conflicts.
  items:
    - Read the row and its version (e.g. version = 41)
    - Compute the new state in application code
    - "UPDATE … SET …, version = 42 WHERE id = ? AND version = 41"
    - If 0 rows were updated, re-read and retry (or report a conflict)
  explanation: The version predicate makes the write fail if anyone changed the row since you read it. That turns a silent lost update into a detectable conflict.
- kind: fire
  prompt: A transaction charges a card through an external API, then hits an error and rolls back. What happens to the charge?
  choices:
    - text: The charge stands — database rollbacks don't undo external side effects
      correct: true
    - text: The charge is reversed automatically
      why: The payment provider knows nothing about your database transaction.
    - text: The charge never happened, because it ran inside a transaction
      why: The API call completed, whatever happens to your transaction afterwards.
    - text: The database retries the charge
      why: Databases don't retry external calls.
  explanation: Keep external effects out of transactions. Commit intent (e.g. an outbox row), then perform the effect idempotently, with compensations if needed.
- kind: fire
  prompt: How do you prevent most deadlocks between transactions that update several rows?
  choices:
    - text: Acquire locks in a consistent order (for example by primary key) and keep transactions short
      correct: true
    - text: Use longer lock timeouts
      why: That only makes deadlocked transactions wait longer before one is aborted.
    - text: Disable deadlock detection
      why: Then deadlocked transactions would hang forever.
    - text: Run all transactions at Read Uncommitted
      why: Isolation level doesn't stop opposite lock orders. Writes still take locks.
  explanation: Deadlocks need a cycle. A global lock order removes cycles. Still retry the occasional deadlock abort.
- kind: fire
  prompt: Why should applications using SERIALIZABLE isolation wrap transactions in retry logic?
  choices:
    - text: The database aborts some transactions with serialisation failures to keep the history serialisable, and they must be re-run
      correct: true
    - text: Serializable transactions never commit the first time
      why: Most commit. Aborts happen under conflicting access patterns.
    - text: Retries make serializable faster
      why: Retries are a correctness requirement, not an optimisation.
    - text: Serializable doesn't support COMMIT
      why: It does.
  explanation: Optimistic serialisable implementations resolve dangerous interleavings by aborting one transaction. The application re-runs it, now seeing the other's effects.
- kind: fire
  level: advanced
  prompt: "Bookings must not overlap for the same room. Two transactions check \"no overlapping booking exists\" and both insert different rows. What's the most robust database-level fix in Postgres?"
  choices:
    - text: An exclusion constraint on (room_id WITH =, tstzrange(start, end) WITH &&)
      correct: true
    - text: A unique index on (room_id, start)
      why: That only stops identical start times. Overlapping ranges with different starts get through.
    - text: Running the check twice
      why: The race still exists between the checks and the inserts.
    - text: Read Committed isolation
      why: This is write skew, which Read Committed doesn't prevent.
  explanation: Exclusion constraints let the database reject overlapping ranges for every concurrent writer, turning write skew into a constraint violation.
- kind: fire
  type: multi
  prompt: Which problems do long-running transactions cause in an MVCC database such as Postgres? Select all that apply.
  choices:
    - text: Old row versions can't be cleaned up, causing bloat
      correct: true
    - text: Locks are held longer, blocking other writers
      correct: true
    - text: More conflicts and aborts under higher isolation levels
      correct: true
    - text: They make indexes unusable
      why: Indexes still work, though bloat can slow them down.
  explanation: Keep transactions short — no user think time, no external calls — to limit bloat, lock contention and conflicts.
```
