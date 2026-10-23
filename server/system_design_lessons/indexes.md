---
id: indexes
category: storage
skill: capacity
title: Indexes and query access paths
minutes: 17
summary: An index is a second, sorted copy of some columns that lets the database jump to the rows a query needs instead of reading them all. Column order decides which queries it can serve, covering indexes skip the table entirely, and every index taxes every write. Design indexes from queries, then verify with the plan.
objectives:
  - Explain how a B-tree index finds rows, and why its depth stays small for billions of rows
  - Design composite indexes with the leftmost-prefix and equality-before-range rules, including sort avoidance
  - Use covering indexes and partial or expression indexes, and recognise queries that can't use an index
  - Weigh read gains against write amplification, storage and planner choices, and read EXPLAIN output
sources:
  - ['PostgreSQL: Indexes', 'https://www.postgresql.org/docs/current/indexes.html']
  - ['Use The Index, Luke — SQL indexing and tuning', 'https://use-the-index-luke.com/']
  - ['PostgreSQL: Using EXPLAIN', 'https://www.postgresql.org/docs/current/using-explain.html']
---

> [!story] The 9-second order history
> An e-commerce site's "My orders" page slowed from 40 ms to 9 seconds over a year. The query filtered by `customer_id` and sorted by `created_at`, and there *was* an index — on `created_at` alone. For each customer, Postgres walked the entire date index backwards, discarding millions of other customers' orders until it found twenty belonging to this one. One composite index on `(customer_id, created_at)` brought it back to 2 ms. The data had grown; the access path hadn't been designed.

## How a B-tree finds a row

A B-tree index keeps keys **sorted** in pages (typically 8–16 KB). Inner pages point to child pages; leaf pages hold keys and pointers to table rows (or, in clustered stores, the rows themselves). Because each page holds hundreds of keys, the tree is very shallow.

```calc
title: How deep is the tree?
prompt: An index has **500 million** entries and each page holds about **400** keys (the fan-out). How many levels does the B-tree need to reach any entry?
answer: 4
unit: levels
tolerance: 1.01
steps: |
  400¹ = 400, 400² = 160,000, 400³ = 64 million, 400⁴ = 25.6 billion. 500 million needs **4 levels**. The top levels are almost always cached in memory, so a lookup costs about one or two page reads from disk. That's why indexed lookups stay in single-digit milliseconds as tables grow from millions to billions of rows — and why a *missing* index is so expensive.
```

Because entries are sorted, a B-tree supports:

- **equality seeks** (`= ?`),
- **range scans** (`>`, `BETWEEN`, `LIKE 'abc%'`),
- **ordered reads** (`ORDER BY` in index order, so `LIMIT` can stop early).

## Composite indexes: order is everything

An index on `(customer_id, status, created_at)` is sorted by customer, then by status within customer, then by time. Like a phone book sorted by surname then first name, you can only use it efficiently from the **left**:

- `WHERE customer_id = ?` — ✓ seek on the first column
- `WHERE customer_id = ? AND status = ?` — ✓ seek on both
- `WHERE status = ?` — ✗ status is only sorted *within* each customer, so the index can't seek on it
- `WHERE customer_id = ? AND created_at > ?` — partial: seek on customer, then filter the rest of that customer's entries by time, because `status` sits in between

**Rule of thumb:** equality columns first, then **one** range or sort column. Columns after a range can't narrow the seek.

```sort
prompt: "Index: (customer_id, status, created_at). Can it seek efficiently for each query?"
buckets: [Uses the index well, Uses only a prefix, Can't seek with it]
items:
  - {text: "WHERE customer_id = 7 AND status = 'paid' ORDER BY created_at DESC LIMIT 20", bucket: 0, why: 'Two equality columns, then rows come out already ordered by created_at, and LIMIT stops after 20.'}
  - {text: 'WHERE customer_id = 7 ORDER BY created_at DESC LIMIT 20', bucket: 1, why: "Seeks on customer_id, but within a customer rows are ordered by status first, so a sort is needed (unless there's only one status)."}
  - {text: "WHERE status = 'pending'", bucket: 2, why: "status isn't the leftmost column. Every customer's entries would have to be checked."}
  - {text: "WHERE customer_id = 7 AND status IN ('paid','shipped')", bucket: 0, why: 'Equality on the first column and a small IN-list on the second. Planners handle this as a few seeks.'}
  - {text: 'WHERE created_at > now() - interval 1 day', bucket: 2, why: 'created_at is third. Without customer_id and status, it can only be read by scanning.'}
  - {text: 'WHERE customer_id = 7 AND created_at > now() - interval 1 day', bucket: 1, why: 'Seeks on customer_id. The time filter applies to that customer''s entries row by row, because status sits in between.'}
```

Use the planner below. The table holds 2M orders, 10k customers and 5 statuses. Build indexes and watch rows read, sorts and table lookups change.

```sim
name: index
title: Index planner
config:
  initial: {i1: '', i2: '', i3: '', q: history}
challenges:
  - {text: 'Customer order history: get rows read to 20 with no sort', metric: rowsRead, op: '<=', value: 20, and: [{metric: sortAvoided, op: '==', value: 1}, {metric: query, op: '==', value: history}]}
  - {text: 'Make that same query index-only (no table heap lookups)', metric: covering, op: '==', value: 1, and: [{metric: query, op: '==', value: history}]}
  - {text: 'Recent pending orders: read fewer than 1,000 index entries', metric: rowsRead, op: '<', value: 1000, and: [{metric: query, op: '==', value: status}]}
  - {text: "Range then equality: find the index that reads under 100 rows (column order matters!)", metric: rowsRead, op: '<', value: 100, and: [{metric: query, op: '==', value: range_first}]}
takeaway: |
  The winning indexes all follow the same rule: **equality columns first, then the range or sort column**, then (optionally) extra columns just to cover the SELECT. `(created_at, customer_id)` for the "range then equality" query reads a whole month of everyone's orders. `(customer_id, created_at)` reads one customer's month. Same columns, 1,000× different cost.
```

## Covering, partial and expression indexes

- **Covering index:** if every column the query needs is in the index, the database can answer from the index alone (an *index-only scan*), skipping a random table read per row. Postgres supports `INCLUDE (col)` to add non-key columns to leaf pages.
- **Partial index:** index only the rows queries care about — `CREATE INDEX ON orders (created_at) WHERE status = 'pending'`. Smaller, cheaper to maintain, and very selective.
- **Expression index:** index a computed value — `CREATE INDEX ON users (lower(email))` — so `WHERE lower(email) = ?` can use it.

Other index types exist for other shapes: **hash** (equality only), **GIN** (arrays, JSONB, full-text), **GiST** (geometry, ranges), **BRIN** (tiny summaries for naturally ordered huge tables, such as append-only logs by time).

## Queries that can't use your index

```bug
title: Why are these queries scanning?
prompt: "There's an index on `users(email)` and one on `orders(created_at)`. Which queries can't use them as written?"
lang: sql
code: |
  SELECT * FROM users WHERE email = 'sam@example.com';
  SELECT * FROM users WHERE lower(email) = 'sam@example.com';
  SELECT * FROM users WHERE email LIKE '%@example.com';
  SELECT * FROM users WHERE email LIKE 'sam@%';
  SELECT * FROM orders WHERE created_at >= '2026-03-01' AND created_at < '2026-03-02';
  SELECT * FROM orders WHERE date(created_at) = '2026-03-01';
bug: [2, 3, 6]
explain: |
  **Line 2** wraps the column in a function, so the index on raw `email` doesn't apply (add an expression index on `lower(email)`, or store normalised emails). **Line 3** has a leading wildcard. A B-tree is sorted from the first character, so "ends with" can't seek (use a trigram index, or a reversed-string column). **Line 6** applies `date()` to the column. Rewrite it as a half-open range, as line 5 does. Lines 1, 4 and 5 can seek: equality, a prefix match, and a range on the bare column.
```

```predict
prompt: "`orders` has 2M rows, 5 status values, and 80% of orders are 'delivered'. You add an index on `status`. What does the planner most likely do for `WHERE status = 'delivered'`?"
choices:
  - Use the index — indexes are always faster
  - Scan the table — reading 1.6M rows via 1.6M random index lookups is slower than one sequential scan
  - Refuse to run the query
  - Use the index only for the first 20 rows
answer: 1
reveal: |
  Index lookups mean random reads into the table. When a predicate matches a large fraction of rows (low **selectivity**), a sequential scan is cheaper, and a good planner, using its statistics, chooses it. The same index *is* valuable for `status = 'pending'` if pending orders are rare — which is exactly what a **partial index** captures.
```

## The cost side

Every index is maintained on every `INSERT`, on `DELETE`, and on any `UPDATE` that touches an indexed column. A table with eight indexes does nine writes per insert, and each index takes disk and buffer cache. Unused indexes are pure cost, so review them (`pg_stat_user_indexes` shows scan counts).

> [!senior] Verify, don't assume
> Use `EXPLAIN (ANALYZE, BUFFERS)` on production-like data. Look for the access method (`Index Scan`, `Index Only Scan`, `Seq Scan`, `Bitmap Heap Scan`), estimated versus actual rows (a big mismatch means stale statistics), the `Sort` nodes you hoped to avoid, and buffer reads. Plans change as data grows and distributions shift — the 9-second page started out fast.

```faded
title: Design an index for a query
prompt: Fill in the reasoning.
text: |
  ```sql
  SELECT id, total FROM orders
  WHERE tenant_id = $1 AND status = 'open'
  ORDER BY due_date
  LIMIT 50;
  ```

  Both `tenant_id` and `status` are equality conditions, so they go [[first|last|nowhere]] in the index. The sort column `due_date` goes [[after them|before them|in a separate index]], so rows come out already ordered and the scan can stop after 50.

  Adding `INCLUDE (total)` makes the index [[covering, avoiding a table lookup per row|smaller|unnecessary]].

  Only about 2% of orders are open, so a [[partial index with WHERE status = 'open'|hash index|BRIN index]] on `(tenant_id, due_date)` would be much smaller and serve the same query.
explain: Equality, then sort or range, then covering columns. A partial index removes a low-value equality column entirely when the query always filters on the same value.
```

```interview
say: |
  "The hot query is a customer's recent orders, newest first, 20 per page. I'd index `(customer_id, created_at DESC)` — equality first, then the sort column — so it's a single seek and the LIMIT stops after 20 rows. If it needs only a couple of columns, I'd INCLUDE them for an index-only scan. For the ops dashboard's 'pending orders' query, a partial index on `created_at WHERE status = 'pending'`. I'd confirm both with EXPLAIN ANALYZE on production-sized data, and keep the index count small because each one costs every insert."
followups:
  - q: Why not index every column?
    a: Each index slows writes, takes storage and buffer cache, and single-column indexes often don't serve multi-column queries anyway. Index for real queries and remove unused ones.
  - q: When does the planner ignore an index?
    a: When the predicate matches too many rows (low selectivity), when the query wraps the column in a function or uses a leading wildcard, on type mismatches, or when statistics are stale.
  - q: What's a covering index?
    a: An index containing every column the query reads, so the database answers from the index alone and skips a random table lookup per row.
weak: |
  "Add an index on each column in the WHERE clause." Ignores column order, sorting, selectivity and write cost.
strong: |
  Designs composite indexes from the query with equality-then-range ordering, uses covering and partial indexes where useful, explains when indexes don't help, accounts for write cost, and verifies with EXPLAIN.
```

```recall
prompt: Explain the leftmost-prefix rule for composite indexes using an index on (a, b, c), and say which of `WHERE b = ?` and `WHERE a = ? AND c > ?` can use it.
points:
  - Composite index entries are sorted by a, then b within a, then c within b
  - A seek can use columns from the left without gaps
  - WHERE b = ? can't seek, because b is only ordered within each value of a
  - WHERE a = ? AND c > ? seeks on a and then filters c among that a's entries, because b sits between them
model: |
  An index on (a, b, c) is sorted by a first, then by b inside each a, then by c inside each (a, b). It's like a phone book sorted by surname then first name: you can find everyone called Smith, or John Smith, but you can't efficiently find every "John". So `WHERE b = ?` can't seek — b is only ordered within each a. `WHERE a = ? AND c > ?` can seek on a, but c is only sorted within each b, so the database scans all of that a's entries and filters c. An index on (a, c) would serve that query fully.
```

```questions
- kind: check
  prompt: "Which index best serves `WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`?"
  choices:
    - text: (customer_id, created_at)
      correct: true
    - text: (created_at, customer_id)
      why: That's ordered by time across all customers, so the scan must skip other customers' rows until it finds 20.
    - text: Two separate indexes, on customer_id and on created_at
      why: Neither gives "this customer's rows in time order". The database would combine or sort.
    - text: (customer_id) only
      why: That finds the customer's rows, but they still need sorting before LIMIT applies.
  explanation: Equality column first, then the sort column. Rows then come out in order and LIMIT stops after 20 index entries.
- kind: check
  type: multi
  prompt: "Which predicates can use a B-tree index on `email` as written? Select all that apply."
  choices:
    - text: "email = 'a@b.com'"
      correct: true
    - text: "email LIKE 'sam%'"
      correct: true
    - text: "email > 'm'"
      correct: true
    - text: "lower(email) = 'a@b.com'"
      why: The function hides the column. You'd need an expression index on lower(email).
    - text: "email LIKE '%@gmail.com'"
      why: A leading wildcard can't seek in a sorted index.
  explanation: B-trees support equality, ranges and prefixes on the bare column. Functions and leading wildcards defeat them unless you index for them.
- kind: check
  type: numeric
  prompt: An index has 20 billion entries and a fan-out of 500 keys per page. How many levels does the B-tree need?
  answer: 4
  unit: levels
  tolerance: 0.01
  explanation: 500³ = 125 million and 500⁴ = 62.5 billion, so 4 levels. Upper levels stay cached, so lookups cost about one or two disk reads.
- kind: check
  prompt: Why might a planner choose a sequential scan even though an index exists on the filtered column?
  choices:
    - text: The predicate matches a large fraction of rows, so random index lookups would cost more than reading the table sequentially
      correct: true
    - text: Planners always prefer scans
      why: They choose by estimated cost, and indexes win for selective predicates.
    - text: The index is corrupt
      why: That's possible but rare. Low selectivity is the usual reason.
    - text: Sequential scans never touch disk
      why: They read the whole table. They can still be cheaper than many random reads.
  explanation: Selectivity decides whether an index helps. Low-selectivity filters are often better served by scans, or by partial indexes on the rare values.
- kind: fire
  prompt: What does a covering index achieve?
  choices:
    - text: It answers the query from the index alone, skipping a table lookup for each matching row
      correct: true
    - text: It covers every possible query on the table
      why: It covers specific queries whose columns it contains.
    - text: It replaces the need for a primary key
      why: Primary keys enforce identity. Covering is about read efficiency.
    - text: It makes writes faster
      why: More columns in the index make writes slightly slower.
  explanation: Including all the needed columns (key columns plus INCLUDE) enables index-only scans, which save a random read per row.
- kind: fire
  prompt: "Only 1% of orders have status = 'pending', and the dashboard queries them by created_at. What's the most efficient index?"
  choices:
    - text: "A partial index on (created_at) WHERE status = 'pending'"
      correct: true
    - text: An index on (status) alone
      why: That works, but it's larger and still needs a sort for created_at.
    - text: An index on every column
      why: That taxes every write and doesn't target the query.
    - text: A BRIN index on status
      why: BRIN suits naturally ordered data like time, not a scattered status column.
  explanation: Partial indexes contain only the rows queries ask for. They're small, selective and cheap to maintain.
- kind: fire
  prompt: A write-heavy table has 12 indexes, and inserts have become slow. What's the likely cause and fix?
  choices:
    - text: Every insert updates all 12 indexes; remove unused or redundant ones (check index usage statistics)
      correct: true
    - text: Indexes don't affect inserts
      why: Each index is a structure that has to be updated on every insert.
    - text: Add more indexes to speed up the inserts
      why: That makes inserts slower.
    - text: Increase the cache TTL
      why: Caching doesn't change the cost of writes.
  explanation: Index maintenance is write amplification. Keep the indexes that serve real queries and drop the rest.
- kind: fire
  level: advanced
  prompt: "Index (tenant_id, created_at). Query: WHERE created_at > now() - interval '1 day' AND tenant_id = 42. What happens?"
  choices:
    - text: It seeks on tenant_id = 42, then range-scans created_at within that tenant — the order of predicates in SQL doesn't matter
      correct: true
    - text: It can't use the index because created_at is written first in the WHERE clause
      why: The order you write predicates in SQL doesn't affect index use. Index column order does.
    - text: It scans the whole index because there's a range condition
      why: Equality on the leading column still narrows the range.
    - text: It needs two separate indexes
      why: This composite index fits the query perfectly.
  explanation: Planners match predicates to index columns regardless of how the WHERE clause is written. Equality on the first column plus a range on the second is the ideal shape.
- kind: fire
  type: multi
  prompt: What should you check in EXPLAIN ANALYZE output when a query is slow? Select all that apply.
  choices:
    - text: The access method chosen (Seq Scan, Index Scan, Index Only Scan, Bitmap)
      correct: true
    - text: Estimated versus actual row counts (a large gap suggests stale statistics)
      correct: true
    - text: Sort nodes and whether they spill to disk
      correct: true
    - text: The number of buffers read
      correct: true
    - text: The colour scheme of the SQL client
      why: That has nothing to do with the query plan.
  explanation: The plan shows how data is accessed, where estimates diverge, and where time and I/O go — which tells you which index or rewrite would help.
```
