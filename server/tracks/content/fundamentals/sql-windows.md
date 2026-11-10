---
id: sql-windows
category: data
skill: data
title: 'SQL analytics: window functions, CTEs and query plans'
minutes: 15
summary: Window functions compute across related rows without collapsing them, so rankings, running totals, top-N per group and comparisons with the previous row are one query instead of a self-join. PARTITION BY sets the group, ORDER BY the sequence, and the frame which rows count. CTEs name intermediate results, and recursive CTEs walk trees. Reading EXPLAIN tells you whether the plan scans, seeks or sorts, and which join algorithm it chose. Interview SQL rounds lean heavily on all of this.
objectives:
  - Write window functions with PARTITION BY, ORDER BY and an explicit frame
  - Tell ROW_NUMBER, RANK and DENSE_RANK apart, and solve top-N per group
  - Use LAG and LEAD, running totals and moving averages
  - Use CTEs, including a recursive CTE for a hierarchy
  - Read an EXPLAIN plan and name the three join algorithms
sources:
  - ['PostgreSQL docs: Window functions tutorial', 'https://www.postgresql.org/docs/current/tutorial-window.html']
  - ['PostgreSQL docs: Window function calls (frames)', 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS']
  - ['PostgreSQL docs: WITH queries (CTEs)', 'https://www.postgresql.org/docs/current/queries-with.html']
  - ['PostgreSQL docs: Using EXPLAIN', 'https://www.postgresql.org/docs/current/using-explain.html']
---

## Windows keep the rows

`GROUP BY` turns each group into one row. A **window function** computes over a group of rows but returns a value *for every row*:

```sql
SELECT rep, region, amount,
       SUM(amount)  OVER (PARTITION BY region)                     AS region_total,
       amount * 1.0 / SUM(amount) OVER (PARTITION BY region)       AS share,
       RANK()       OVER (PARTITION BY region ORDER BY amount DESC) AS rank_in_region
FROM sales;
```

The `OVER` clause has three parts:

- **PARTITION BY**: which rows belong together (like GROUP BY, without collapsing). Omit it for one window over everything.
- **ORDER BY**: the sequence inside the partition. Needed for ranking, LAG/LEAD and running totals.
- **Frame**: which rows *around* the current one an aggregate sees, such as `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` for a three-row moving average.

The functions you'll use most: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE(n)`; `LAG(x)` and `LEAD(x)` for the previous and next row; `FIRST_VALUE` and `LAST_VALUE`; and any aggregate (`SUM`, `AVG`, `COUNT`, `MAX`) with OVER.

```sim
name: sqlwindow
title: Window functions on eight sales
intro: 'Each row is one month''s sale for a rep in North or South. Note the ties: two North sales of 120 and three South sales of 80.'
challenges:
  - {text: 'Find a RANK() that skips a number after a tie', metric: gap, op: '==', value: 1}
  - {text: 'Return the top two sales in each region', metric: topOk, op: '==', value: 1}
  - {text: 'Make two rows share one running total, then fix it with a ROWS frame', metric: peerFixed, op: '==', value: 1}
takeaway: |
  ROW_NUMBER is unique, RANK leaves gaps after ties, DENSE_RANK doesn't. Filter on a window function from an outer query or CTE, because WHERE runs first. And with ORDER BY but no frame, aggregates use RANGE … CURRENT ROW, which includes every tied row; say ROWS when you mean physical rows.
```

## Ranking and top-N per group

"The latest order per customer", "the top three products per category" and "deduplicate, keeping the newest row" are the same pattern:

```sql
WITH ranked AS (
  SELECT o.*,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS rn
  FROM orders o
)
SELECT * FROM ranked WHERE rn = 1;
```

Choose the function by what ties should do:

| amount | ROW_NUMBER | RANK | DENSE_RANK |
|---|---|---|---|
| 120 | 1 | 1 | 1 |
| 120 | 2 | 1 | 1 |
| 90 | 3 | 3 | 2 |
| 60 | 4 | 4 | 3 |

ROW_NUMBER picks arbitrarily among ties unless the ORDER BY is unique, so add a tiebreaker (`id`) to make results repeatable. "Top 3 with ties included" is RANK ≤ 3; "the third-highest distinct salary" is DENSE_RANK = 3.

## Comparing with neighbours

`LAG` and `LEAD` read another row in the window without a self-join:

```sql
SELECT day, revenue,
       revenue - LAG(revenue) OVER (ORDER BY day)                        AS change,
       AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_7d,
       SUM(revenue) OVER (ORDER BY day ROWS UNBOUNDED PRECEDING)          AS running_total
FROM daily_revenue;
```

The frame default deserves its own warning. With `ORDER BY` and no frame, the frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and RANGE includes every row with the same ORDER BY value (the current row's **peers**). If two days had the same date, both would get the total including both. `LAST_VALUE(x) OVER (ORDER BY t)` surprises people for the same reason: the frame ends at the current row, so it returns the current row. Spell the frame out.

A classic interview problem uses the same tools. **Gaps and islands**: find runs of consecutive days a user was active. `day - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day)` is constant within a run, so group by it.

```faded
prompt: Fill in the gaps.
text: |
  To keep only each customer's newest order, number rows with [[ROW_NUMBER()|RANK()|COUNT(*)]] OVER (PARTITION BY [[customer_id|created_at|id]] ORDER BY created_at DESC) and keep rn = 1, in an outer query, because [[WHERE|ORDER BY|LIMIT]] runs before window functions. For the difference from the previous day, use [[LAG|LEAD|FIRST_VALUE]](revenue) OVER (ORDER BY day).
```

## CTEs and recursion

A **CTE** (`WITH name AS (…)`) names a subquery so a long query reads top to bottom. In Postgres 12 and later, a CTE referenced once is inlined and optimised like a subquery; add `MATERIALIZED` to force it to be computed once.

A **recursive CTE** walks a hierarchy (org charts, category trees, bill of materials, graph reachability):

```sql
WITH RECURSIVE reports AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE id = 42                 -- anchor: the starting manager
  UNION ALL
  SELECT e.id, e.name, e.manager_id, r.depth + 1
  FROM employees e JOIN reports r ON e.manager_id = r.id   -- step: their direct reports
)
SELECT * FROM reports;
```

The anchor runs once; the recursive part runs against the previous step's new rows until it adds none. Guard against cycles in graph data (track a path array, or Postgres's `CYCLE` clause) or it never ends.

## Reading a query plan

`EXPLAIN` shows the plan; `EXPLAIN (ANALYZE, BUFFERS)` runs the query and shows actual rows, times and pages read. Read it inside out: the most indented nodes run first. What to look for:

- **Scans**: `Seq Scan` reads the whole table (fine for small tables or most rows); `Index Scan` seeks then visits the table; `Index Only Scan` never touches the table; `Bitmap Heap Scan` collects matching pages from an index, then reads them in order.
- **Estimated vs actual rows**: a big mismatch means stale statistics (`ANALYZE`) or correlated columns, and the planner picks badly from there on.
- **Sorts** that spill to disk (`Sort Method: external merge`), which an index in the right order or more `work_mem` can avoid.

Three join algorithms:

| Algorithm | How | Wins when |
|---|---|---|
| Nested loop | For each outer row, look up matches (ideally by index) | The outer side is small and the inner side is indexed |
| Hash join | Build a hash table on the smaller input, probe with the other | Large, unsorted inputs joined on equality |
| Merge join | Walk two inputs sorted on the join key | Both are already sorted (by an index) or need sorting anyway |

Indexes themselves, leftmost-prefix rules and covering indexes are in the system design lesson on [indexes](#/system-design/lesson/indexes).

```predict
prompt: "EXPLAIN ANALYZE shows `Nested Loop (rows=12 estimated, 1,840,000 actual)` with an index scan on the inner side, and the query takes 40 seconds. What's the most likely root cause?"
choices:
  - text: The planner underestimated the outer rows, so it chose a nested loop doing 1.8M lookups
  - text: The index on the inner table is corrupt and needs a REINDEX to fix
  - text: Nested loops are always slow and should be disabled
  - text: The server needs more CPU cores to run the 1.8 million lookups in parallel
answer: 0
reveal: |
  A nested loop is excellent for 12 outer rows and terrible for 1.8 million: each one is a separate index lookup with random reads. A hash join would have been far cheaper. The estimate is the bug. Run ANALYZE so the statistics are fresh; if columns are correlated (city and postcode), add extended statistics (`CREATE STATISTICS`); check for a function on the filtered column or a type mismatch that hides it from the statistics. Turning off nested loops globally fixes one query and breaks others.
```

```questions
- kind: check
  prompt: Scores are 95, 95, 90. What do RANK and DENSE_RANK assign to the 90?
  choices:
    - text: RANK gives 3, DENSE_RANK gives 2
      correct: true
    - text: Both give 2
      why: RANK skips after ties.
    - text: Both give 3
      why: DENSE_RANK doesn't skip.
    - text: RANK gives 2, DENSE_RANK gives 3
      why: The other way round.
  explanation: RANK counts the tied rows before it; DENSE_RANK counts distinct values.
- kind: check
  prompt: Why does `SELECT *, ROW_NUMBER() OVER (…) AS rn FROM t WHERE rn = 1` fail?
  choices:
    - text: WHERE is evaluated before window functions, so rn doesn't exist yet
      correct: true
    - text: Window functions can't be given column aliases in the SELECT list
      why: They can.
    - text: ROW_NUMBER needs GROUP BY
      why: Window functions don't use GROUP BY.
    - text: rn must be compared with a string
      why: It's an integer.
  explanation: Compute rn in a CTE or subquery and filter outside it.
- kind: check
  prompt: "`SUM(amount) OVER (ORDER BY day)` gives two rows the same running total. Why?"
  choices:
    - text: They share a day, and the default RANGE frame includes tied rows
      correct: true
    - text: SUM ignores duplicate values, so tied amounts are only added once
      why: SUM adds every value.
    - text: The window is partitioned by day
      why: There is no PARTITION BY.
    - text: It's a bug in the database
      why: It's the standard default frame.
  explanation: Use ROWS UNBOUNDED PRECEDING for a per-row running total.
- kind: check
  prompt: When does a hash join beat a nested loop?
  choices:
    - text: Both inputs are large, joined on equality, with no index for row-by-row lookups
      correct: true
    - text: The outer input has a handful of rows and the inner one is indexed
      why: That's when a nested loop shines.
    - text: The join condition is a range like a.t BETWEEN b.start AND b.end
      why: Hash joins need equality.
  explanation: Build a hash table on the smaller side once, then probe it.
- kind: fire
  prompt: Which function returns the previous row's value in the window?
  choices:
    - text: LAG
      correct: true
    - text: LEAD
      why: LEAD looks ahead.
    - text: FIRST_VALUE
      why: That returns the frame's first row.
  explanation: LAG(x, n, default) looks n rows back.
- kind: fire
  prompt: What does PARTITION BY do in a window?
  choices:
    - text: Splits rows into groups that each get their own window, keeping every row
      correct: true
    - text: Physically partitions the table on disk by the given column's values
      why: That's table partitioning, a different feature.
    - text: Collapses each group into one row
      why: That's GROUP BY.
  explanation: Every row keeps its identity.
- kind: fire
  prompt: Which plan node never reads the table itself?
  choices:
    - text: Index Only Scan
      correct: true
    - text: Bitmap Heap Scan
      why: It reads table pages found via the index.
    - text: Index Scan
      why: It visits the table for each match.
  explanation: Every needed column is in the index (and the visibility map says the pages are all-visible).
- kind: fire
  prompt: What is the anchor of a recursive CTE?
  choices:
    - text: The non-recursive query that produces the starting rows
      correct: true
    - text: The termination condition that stops the recursion early
      why: Recursion stops when a step adds no rows.
    - text: The final SELECT
      why: That reads the result.
  explanation: Anchor UNION ALL recursive step.
- kind: fire
  prompt: "Third-highest distinct salary: which ranking function?"
  choices:
    - text: DENSE_RANK() = 3
      correct: true
    - text: ROW_NUMBER() = 3
      why: Ties would push it to the wrong value.
    - text: RANK() = 3
      why: Ties above it make rank 3 skip.
  explanation: DENSE_RANK counts distinct values.
```
