---
id: sql-queries
category: data
skill: data
title: 'SQL queries: joins, NULLs and grouping'
minutes: 16
summary: SQL reads top to bottom but runs in a different order, FROM and JOIN first, then WHERE, GROUP BY, HAVING, SELECT, ORDER BY and LIMIT, which explains most of its surprises. Joins decide which rows survive; an outer join's WHERE clause can quietly turn it back into an inner join. NULL means "unknown", so comparisons with it are neither true nor false, which breaks NOT IN and changes what COUNT counts. Interviewers test exactly these edges.
objectives:
  - State the logical order in which a SELECT is evaluated, and use it to explain errors
  - Choose between inner, left, full, cross, semi- and anti-joins, and predict their row counts
  - Explain three-valued logic, and the NOT IN and COUNT traps it creates
  - Use GROUP BY with HAVING correctly, and know when WHERE is the right place instead
  - Write EXISTS and NOT EXISTS subqueries
sources:
  - ['PostgreSQL docs: Queries (SELECT, joins, GROUP BY)', 'https://www.postgresql.org/docs/current/queries.html']
  - ['PostgreSQL docs: Comparison functions and operators (NULL handling)', 'https://www.postgresql.org/docs/current/functions-comparison.html']
  - ['Use The Index, Luke: SQL indexing and tuning', 'https://use-the-index-luke.com/']
  - ['Markus Winand, Modern SQL', 'https://modern-sql.com/']
---

## The order SQL actually runs in

You write `SELECT … FROM … WHERE …`, but the database evaluates the clauses in a different, logical order. Each step produces a table the next one works on:

```order
prompt: Put the clauses of a SELECT in the logical order they are evaluated.
items:
  - FROM and JOIN (build the combined rows)
  - WHERE (filter individual rows)
  - GROUP BY (form groups)
  - HAVING (filter groups)
  - SELECT (compute output columns, window functions)
  - DISTINCT
  - ORDER BY
  - LIMIT / OFFSET
explain: That order explains the classic errors. WHERE can't use a column alias from SELECT (SELECT hasn't run yet), nor an aggregate (groups don't exist yet), which is why HAVING exists. ORDER BY *can* use aliases, because it runs after SELECT. Window functions run in SELECT, after WHERE and HAVING, so you can't filter on them without a subquery.
```

The planner is free to execute things in any physical order that gives the same answer (pushing filters into scans, reordering joins), but the *meaning* of a query follows this order.

## Joins

A join combines rows from two tables where a condition holds. The type decides what happens to rows with no partner:

- **INNER JOIN**: only matching pairs. Unmatched rows on either side disappear.
- **LEFT (OUTER) JOIN**: every row from the left, with NULLs where nothing on the right matched. **RIGHT** is the mirror image (rarely used; swap the tables). **FULL** keeps unmatched rows from both.
- **CROSS JOIN**: every pair. 1,000 × 1,000 rows is a million. An accidentally missing join condition does the same thing.
- **Semi-join** (`WHERE EXISTS (…)`): rows from the left that have *at least one* match, each returned once.
- **Anti-join** (`WHERE NOT EXISTS (…)`, or `LEFT JOIN … WHERE right.id IS NULL`): rows with *no* match.

A join on a one-to-many relationship **multiplies rows**: a user with three orders appears three times. Summing a user column after such a join double counts, a bug that passes every test with one order per user.

```sim
name: sqljoin
title: Joins on two tiny tables
intro: 'Users and orders. Dee has no orders, Cy has only a refunded one, and order 105 was a guest checkout with no user. Change the join, where the filter goes, and how you count.'
challenges:
  - {text: 'List every user, including those with no orders', metric: allUsers, op: '==', value: 1, and: [{metric: join, op: '==', value: 'left'}]}
  - {text: 'Turn a LEFT JOIN back into an inner join with a WHERE clause', metric: leftBecameInner, op: '==', value: 1}
  - {text: 'Find the users with no paid order (Cy and Dee)', metric: noPaid, op: '==', value: 1}
  - {text: 'Watch COUNT(*) claim Dee has an order', metric: starWrong, op: '==', value: 1}
takeaway: |
  ON decides which rows match; WHERE filters the joined result afterwards. A condition on the right-hand table belongs in ON if you want to keep unmatched left rows. And COUNT(*) counts rows, including the NULL-filled ones an outer join adds, while COUNT(column) counts non-NULL values.
```

## NULL and three-valued logic

NULL means "unknown" (or "not applicable"), not zero or the empty string. Any comparison with NULL is itself **unknown**, and WHERE keeps only rows where the condition is **true**:

| Expression | Result |
|---|---|
| `NULL = NULL` | unknown (so use `IS NULL`) |
| `NULL <> 5` | unknown |
| `TRUE AND NULL` | unknown |
| `FALSE AND NULL` | false |
| `TRUE OR NULL` | true |
| `NOT NULL` | unknown |

Consequences worth knowing by heart:

- `WHERE city <> 'London'` does **not** return rows where city is NULL.
- `COUNT(*)` counts rows; `COUNT(col)` skips NULLs; `SUM`, `AVG`, `MIN` and `MAX` ignore NULLs, so `AVG` of (10, NULL, 20) is 15, not 10.
- `COALESCE(x, 0)` substitutes a default; `IS DISTINCT FROM` compares treating NULLs as equal values.
- A `UNIQUE` constraint allows many NULLs in most databases (Postgres 15 added `NULLS NOT DISTINCT` to change that).
- `GROUP BY` and `DISTINCT` *do* treat NULLs as one group.

```predict
prompt: "orders.user_id contains the values 1, 2, 3 and one NULL (a guest checkout). How many users does this return? SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders);"
choices:
  - text: Every user except 1, 2 and 3
  - text: No rows at all
  - text: Every user, because NOT IN ignores NULLs
  - text: An error, because the subquery contains a NULL
answer: 1
reveal: |
  `id NOT IN (1, 2, 3, NULL)` means `id <> 1 AND id <> 2 AND id <> 3 AND id <> NULL`. The last term is unknown for every id, so the whole condition is at best unknown and never true. No rows. This bug ships often because it only appears once a NULL sneaks into the subquery. Use `NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)`, which has no such trap, or filter `WHERE user_id IS NOT NULL` inside the subquery.
```

## Grouping and aggregates

`GROUP BY` collapses rows into one row per group, and every column in SELECT must then be either grouped or aggregated (Postgres also allows columns functionally dependent on a grouped primary key). Filter **rows** with WHERE before grouping; filter **groups** with HAVING after:

```sql
SELECT customer_id, COUNT(*) AS orders, SUM(total) AS spend
FROM orders
WHERE status = 'paid'            -- rows: cheap, and can use an index
GROUP BY customer_id
HAVING SUM(total) > 1000         -- groups: needs the aggregate
ORDER BY spend DESC
LIMIT 10;
```

Putting a non-aggregate condition in HAVING works but groups everything first. Conditional aggregates count several things in one pass: `COUNT(*) FILTER (WHERE status = 'refunded')` in Postgres, or `SUM(CASE WHEN … THEN 1 ELSE 0 END)` anywhere.

```bug
title: A revenue report
prompt: "This report of each customer's spend on paid orders, including customers who spent nothing, is wrong. Which lines are the bugs?"
lang: sql
code: |
  SELECT c.id,
         c.name,
         c.credit_limit,
         COUNT(*)      AS paid_orders,
         SUM(o.total)  AS spend
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id
  WHERE o.status = 'paid'
  GROUP BY c.id, c.name, c.credit_limit
  ORDER BY spend DESC;
bug: [4, 8]
explain: |
  Line 8 filters on the right-hand table in WHERE, which removes the NULL-extended rows and turns the LEFT JOIN into an inner join: customers with no paid orders vanish. Move it into the join: `ON o.customer_id = c.id AND o.status = 'paid'`. Line 4 then counts the NULL-filled row as an order, so a customer with none shows 1. Use `COUNT(o.id)`. Also consider `COALESCE(SUM(o.total), 0)`, since SUM over no rows is NULL, and NULLs sort first in DESC order in Postgres (add `NULLS LAST`).
```

## Subqueries and EXISTS

- **Scalar subquery**: returns one value, usable anywhere a value is (`SELECT (SELECT MAX(total) FROM orders)`).
- **IN (subquery)**: fine for positive membership; avoid **NOT IN** for the NULL reason above.
- **EXISTS / NOT EXISTS**: a correlated subquery that stops at the first match. Planners turn these into efficient semi- and anti-joins.
- **Derived tables and CTEs** (`WITH x AS (…)`) name an intermediate result. Covered with window functions in [SQL analytics](#/fundamentals/lesson/sql-windows).

```faded
prompt: Fill in the gaps.
text: |
  To find customers who have never placed an order, write `WHERE [[NOT EXISTS|NOT IN|<> ALL]] (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`. A condition on the right table of a LEFT JOIN belongs in the [[ON|WHERE|HAVING]] clause if unmatched rows should survive. To filter on `SUM(total)`, use [[HAVING|WHERE|ORDER BY]]. To test whether a column is missing, write `x [[IS NULL|= NULL|== NULL]]`.
```

```questions
- kind: check
  prompt: Why does `SELECT price * qty AS amount FROM items WHERE amount > 100` fail in most databases?
  choices:
    - text: WHERE is evaluated before SELECT, so the alias doesn't exist yet
      correct: true
    - text: Column aliases can't be used anywhere except ORDER BY and GROUP BY
      why: ORDER BY can use them because it runs after SELECT; WHERE can't because it runs before.
    - text: Arithmetic is not allowed in a WHERE clause
      why: It is; repeat the expression, or use a subquery.
    - text: amount is a reserved word
      why: The problem is evaluation order.
  explanation: Repeat the expression in WHERE, or compute it in a subquery or CTE.
- kind: check
  prompt: users has 4 rows; orders has 6 rows, all with a valid user_id, and one user has no orders. How many rows does `users LEFT JOIN orders ON orders.user_id = users.id` return?
  choices:
    - text: '7'
      correct: true
    - text: '6'
      why: The user with no orders also appears, NULL-filled.
    - text: '4'
      why: A left join doesn't collapse a user's orders into one row.
    - text: '24'
      why: That's a cross join.
  explanation: One row per matching order (6), plus one NULL-extended row for the user without orders.
- kind: check
  prompt: A column holds 10, NULL and 20. What does AVG(column) return?
  choices:
    - text: '15'
      correct: true
    - text: '10'
      why: That would treat NULL as 0.
    - text: 'NULL'
      why: Aggregates skip NULLs; they return NULL only when every value is NULL.
  explanation: AVG divides the sum of non-NULL values by their count.
- kind: check
  prompt: Which query finds users who have no orders without being broken by a NULL user_id in orders?
  choices:
    - text: "SELECT * FROM users u WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)"
      correct: true
    - text: "SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM orders)"
      why: One NULL in the subquery makes it return nothing.
    - text: "SELECT * FROM users u JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL"
      why: An inner join never produces NULL o.id.
    - text: "SELECT * FROM users WHERE id <> ANY (SELECT user_id FROM orders)"
      why: <> ANY is true for almost every id.
  explanation: NOT EXISTS (or LEFT JOIN … IS NULL) is the safe anti-join.
- kind: fire
  prompt: What does `NULL = NULL` evaluate to?
  choices:
    - text: Unknown (NULL)
      correct: true
    - text: 'True'
      why: Two unknowns aren't known to be equal.
    - text: 'False'
      why: It's not known to be false either.
  explanation: Use IS NULL, or IS NOT DISTINCT FROM to compare treating NULLs as equal.
- kind: fire
  prompt: Which clause filters groups by an aggregate?
  choices:
    - text: HAVING
      correct: true
    - text: WHERE
      why: WHERE runs before groups exist.
    - text: DISTINCT
      why: DISTINCT removes duplicate rows.
  explanation: HAVING runs after GROUP BY.
- kind: fire
  prompt: COUNT(*) versus COUNT(email) on a table where some emails are NULL?
  choices:
    - text: COUNT(*) counts every row; COUNT(email) skips NULL emails
      correct: true
    - text: They always return the same number, since both count the rows
      why: Only when email has no NULLs.
    - text: COUNT(email) counts distinct emails
      why: That's COUNT(DISTINCT email).
  explanation: Aggregates over a column ignore NULLs.
- kind: fire
  prompt: A join between two 10,000-row tables returns 100 million rows. Most likely cause?
  choices:
    - text: A missing or always-true join condition, producing a cross join
      correct: true
    - text: Neither table has an index on the join column, so it scans
      why: Indexes change speed, not row counts.
    - text: A LEFT JOIN where an INNER JOIN was meant, keeping every unmatched row
      why: That adds at most one row per unmatched left row.
  explanation: 10,000 × 10,000 is every pair.
- kind: fire
  prompt: Which evaluates first, WHERE or GROUP BY?
  choices:
    - text: WHERE
      correct: true
    - text: GROUP BY
      why: Rows are filtered before they are grouped.
    - text: They run at the same time
      why: There is a defined logical order.
  explanation: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT.
```
