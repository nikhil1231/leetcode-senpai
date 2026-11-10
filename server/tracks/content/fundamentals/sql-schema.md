---
id: sql-schema
category: data
skill: data
title: 'Schema design: keys, constraints and normalisation'
minutes: 15
summary: A schema is the cheapest place to enforce correctness. Primary keys identify rows, foreign keys keep references valid, and NOT NULL, UNIQUE and CHECK reject bad data before any code runs. Normalisation (in practice, third normal form) stores each fact once, which removes update, insert and delete anomalies. You denormalise deliberately, for measured read performance, and then own the job of keeping the copies in sync. Interviewers want you to model entities and relationships, pick keys, and say what you'd denormalise and why.
objectives:
  - Choose primary keys (surrogate or natural) and say what each costs
  - Use NOT NULL, UNIQUE, CHECK and foreign keys with the right ON DELETE behaviour
  - Recognise 1NF, 2NF and 3NF violations and the anomalies they cause
  - Model one-to-many and many-to-many relationships
  - Decide when to denormalise, and how to keep the copies correct
sources:
  - ['PostgreSQL docs: Constraints', 'https://www.postgresql.org/docs/current/ddl-constraints.html']
  - ['E. F. Codd, A Relational Model of Data for Large Shared Data Banks (1970)', 'https://dl.acm.org/doi/10.1145/362384.362685']
  - ['William Kent, A Simple Guide to Five Normal Forms in Relational Database Theory (1983)', 'https://www.bkent.net/Doc/simple5.htm']
---

## Keys

Every table needs a **primary key**: a column (or set) that is unique and never NULL, which other tables use to refer to its rows.

- **Surrogate keys** (`bigint` identity, or a UUID) have no business meaning, never change, and keep joins narrow. Random UUIDv4 keys scatter inserts across a B-tree index; time-ordered **UUIDv7** or ULIDs keep inserts at the right edge and are a good default when IDs are generated outside the database.
- **Natural keys** (an email, an ISBN, a country code) are meaningful but can change or turn out not to be unique. Emails change; people share phone numbers.

The usual answer is both: a surrogate primary key, plus a **UNIQUE constraint** on the natural key so duplicates are still impossible. A **composite key** (`(order_id, line_no)`) fits child rows that only exist inside a parent, and join tables.

## Constraints

Constraints are declarations the database enforces on every write, from every client, forever. Application checks have races and get bypassed by scripts and migrations; constraints don't.

```sql
CREATE TABLE accounts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  plan        text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  balance     numeric(12,2) NOT NULL CHECK (balance >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  bigint NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  period      daterange NOT NULL,
  total       numeric(12,2) NOT NULL,
  UNIQUE (account_id, period)
);
CREATE INDEX ON invoices (account_id);   -- Postgres doesn't index foreign keys for you
```

**ON DELETE** says what happens to children when a parent goes:

- `RESTRICT` / `NO ACTION` (default): refuse while children exist. Safest for anything financial.
- `CASCADE`: delete the children too. Right for parts that mean nothing alone (an order's line items); dangerous for history.
- `SET NULL`: keep the child and forget the parent (an author account deleted, posts kept as "deleted user").

A `UNIQUE` constraint also creates an index, and the database checks it atomically, which is the only reliable way to stop two concurrent requests both inserting the same email. A check-then-insert in application code races.

```sort
prompt: Which constraint best enforces each rule?
buckets: [NOT NULL, UNIQUE, CHECK, FOREIGN KEY]
items:
  - {text: 'No two accounts may share an email', bucket: 1, why: 'Enforced atomically, even under concurrent sign-ups.'}
  - {text: 'An order line must refer to a product that exists', bucket: 3, why: 'Referential integrity.'}
  - {text: 'Quantity must be positive', bucket: 2, why: 'A row-level predicate.'}
  - {text: 'Every invoice must have a total', bucket: 0, why: 'The column may not be missing.'}
  - {text: 'One seat per showing can be booked once', bucket: 1, why: 'UNIQUE (showing_id, seat_id).'}
  - {text: 'A booking''s end date is after its start date', bucket: 2, why: 'CHECK (ends_at > starts_at).'}
```

## Normalisation

Normalisation means each fact is stored in exactly one place. Here's a table that doesn't:

| order_id | customer | customer_email | items | product | unit_price |
|---|---|---|---|---|---|
| 1 | Ana | ana@x.com | "pen, pad" | … | … |

The forms you need for interviews:

- **1NF**: every column holds one atomic value, no repeating groups. `items = "pen, pad"` breaks it: you can't index, join or constrain inside a string. Make a row per item.
- **2NF**: 1NF, and no non-key column depends on only *part* of a composite key. In `order_lines(order_id, product_id, qty, product_name)`, `product_name` depends on `product_id` alone, so it belongs in `products`.
- **3NF**: 2NF, and no non-key column depends on another non-key column. In `orders(id, customer_id, customer_email)`, the email depends on the customer, not the order. Informally: every non-key column depends on "the key, the whole key, and nothing but the key".
- **BCNF** tightens 3NF for tables with overlapping candidate keys; rare in practice.

What goes wrong when you don't normalise, the **anomalies**:

- **Update**: Ana changes her email; it's stored on 400 orders and one update misses some.
- **Insert**: you can't record a new product until someone orders it.
- **Delete**: deleting the only order for a product loses the product's price.

```sort
prompt: Which normal form does each design break first?
buckets: [1NF, 2NF, 3NF]
items:
  - {text: 'users.phone_numbers stores "0207…, 0798…"', bucket: 0, why: 'Several values in one column.'}
  - {text: 'enrolments(student_id, course_id, grade, course_title)', bucket: 1, why: 'course_title depends on course_id, part of the key.'}
  - {text: 'employees(id, dept_id, dept_name)', bucket: 2, why: 'dept_name depends on dept_id, a non-key column.'}
  - {text: 'orders with columns item1, item2, item3', bucket: 0, why: 'A repeating group.'}
  - {text: 'order_lines(order_id, product_id, qty, unit_list_price)', bucket: 1, why: 'The list price depends only on the product.'}
  - {text: 'addresses(id, postcode, city) where postcode determines city', bucket: 2, why: 'A transitive dependency through postcode.'}
```

A trap: `order_lines.unit_price` *should* be stored even though `products.price` exists, because it records the price **at the time of the order**, a different fact. Normalisation is about facts, not about columns with the same name.

## Relationships

- **One-to-many**: the foreign key goes on the "many" side (`orders.customer_id`).
- **Many-to-many**: a **join table** with a foreign key to each side and a composite primary key: `enrolments(student_id, course_id, PRIMARY KEY (student_id, course_id))`. Attributes of the relationship itself (enrolled_at, grade) live there.
- **One-to-one**: a unique foreign key; often a sign the two tables should be one, unless you're splitting off rarely read or sensitive columns.

## Denormalising on purpose

A normalised schema can need many joins for one page, and some aggregates are too slow to compute on every read. Denormalising trades write complexity and consistency risk for read speed. Do it after measuring, and pick how the copy stays correct:

- **Counters and totals** (`posts.comment_count`) updated in the same transaction as the change, or by a trigger.
- **Materialised views** refreshed on a schedule, when slightly stale is fine.
- **Read models** fed by events or change data capture, in another store (a search index, a cache).
- **Snapshots that are really different facts** (the order's price and address at purchase time), which aren't denormalisation at all.

```predict
prompt: 'A forum shows each thread''s reply count on the list page. With 50 million replies, `SELECT thread_id, COUNT(*) FROM replies GROUP BY thread_id` for a page of threads has become slow. You add `threads.reply_count`. What is the simplest way to keep it correct?'
choices:
  - text: Increment it in the same transaction that inserts the reply
  - text: A nightly job that recounts every thread
  - text: Increment it in the application after the insert commits
  - text: Cache the GROUP BY result in Redis for an hour
answer: 0
reveal: |
  Same transaction means the count and the replies can never disagree: both commit or neither does. `UPDATE threads SET reply_count = reply_count + 1 WHERE id = $1` takes a row lock on the thread, which serialises replies to one very hot thread; if that becomes a problem, shard the counter or accept a slightly stale count fed asynchronously. A nightly job leaves it wrong all day; a separate post-commit write can be lost on a crash; an hour-old cache is stale and still runs the slow query on every miss.
```

```recall
prompt: You're asked to design the tables for a library that lends books. Describe the entities, keys, relationships and constraints you'd use, and one place you'd consider denormalising.
points:
  - Separate a book (title, ISBN) from its physical copies, since one title has many copies
  - Members, copies and loans; a loan references a member and a copy, with borrowed and due dates and a nullable returned date
  - Surrogate primary keys, plus UNIQUE on natural keys like ISBN and member email
  - Constraints, such as due after borrowed, and at most one open loan per copy (a partial unique index)
  - Foreign keys restrict deletes so loan history survives; denormalise a counter like available copies only if measured reads need it
model: |
  I'd separate the work from the object: `books(id, isbn UNIQUE, title, …)`, `authors`, a `book_authors` join table for the many-to-many, and `copies(id, book_id REFERENCES books, barcode UNIQUE, condition)`, because one title has many physical copies. `members(id, email UNIQUE, …)`. Then `loans(id, copy_id REFERENCES copies, member_id REFERENCES members, borrowed_at, due_at, returned_at NULL)` with `CHECK (due_at > borrowed_at)`, and a partial unique index on `copy_id WHERE returned_at IS NULL`, so a copy can't be lent twice even under concurrent check-outs. Foreign keys use ON DELETE RESTRICT, so loan history isn't lost when a member leaves (I'd anonymise instead). I'd index the foreign keys. If the catalogue page showing "3 of 5 available" got slow, I'd add `books.available_copies`, maintained in the same transaction as each loan and return, but only after measuring.
```

```questions
- kind: check
  prompt: Two sign-up requests with the same email arrive at the same moment. The application checks "SELECT … WHERE email = ?" before inserting. What reliably prevents a duplicate account?
  choices:
    - text: A UNIQUE constraint on email, with the second insert's error handled
      correct: true
    - text: The application-level check, if it runs inside a transaction
      why: Under READ COMMITTED both transactions see no row and both insert.
    - text: An index on email without UNIQUE
      why: A plain index speeds lookups but allows duplicates.
    - text: Retrying the sign-up if it's slow
      why: Retries make duplicates more likely.
  explanation: The database checks uniqueness atomically; application check-then-insert races.
- kind: check
  prompt: Which table violates third normal form?
  choices:
    - text: orders(id, customer_id, customer_email, total)
      correct: true
    - text: order_lines(order_id, line_no, product_id, qty)
      why: Every non-key column depends on the whole key.
    - text: customers(id, email, name)
      why: Each column describes the customer.
    - text: products(id, sku, name, price)
      why: Each column describes the product.
  explanation: customer_email depends on customer_id, a non-key column, not on the order.
- kind: check
  prompt: order_lines stores unit_price even though products.price exists. Is that a normalisation mistake?
  choices:
    - text: No: it records the price at the time of the order, a different fact
      correct: true
    - text: Yes; it duplicates products.price, and the two will drift apart over time
      why: Drifting is the point: past orders must not change when prices do.
    - text: Yes, because it breaks first normal form
      why: It's an atomic value.
  explanation: Normalisation is about facts, not columns with similar names.
- kind: check
  prompt: Which ON DELETE behaviour fits order line items when an order is deleted?
  choices:
    - text: CASCADE, because line items mean nothing without their order
      correct: true
    - text: SET NULL, keeping the line items as orphans for later reporting
      why: Lines without an order are meaningless.
    - text: RESTRICT, so orders can never be deleted
      why: That's right for financial history you must keep, but not the natural fit for parts of a whole.
  explanation: Cascade for owned parts; restrict for independent records with history.
- kind: fire
  prompt: How do you model a many-to-many relationship between students and courses?
  choices:
    - text: A join table with a foreign key to each, keyed by both
      correct: true
    - text: A comma-separated course_ids column on the students table
      why: Breaks 1NF; can't be constrained or joined.
    - text: A foreign key to courses on students
      why: That's one course per student.
  explanation: Attributes of the relationship, like grade, go on the join table.
- kind: fire
  prompt: A table stores "red, green, blue" in a colours column. Which normal form is broken?
  choices:
    - text: First normal form
      correct: true
    - text: Third normal form
      why: The earlier form already fails.
    - text: Boyce-Codd normal form
      why: The problem is non-atomic values.
  explanation: One atomic value per column.
- kind: fire
  prompt: Does Postgres create an index on a foreign key column automatically?
  choices:
    - text: No; only on the referenced primary or unique key
      correct: true
    - text: Yes, every foreign key column is indexed automatically
      why: You add it yourself.
    - text: Only with ON DELETE CASCADE
      why: Still no, though cascades are slow without one.
  explanation: Index foreign keys used in joins and deletes of the parent.
- kind: fire
  prompt: Why are time-ordered UUIDv7 keys often preferred over random UUIDv4 as primary keys?
  choices:
    - text: New keys land at the right edge of the B-tree, not on random pages
      correct: true
    - text: They are shorter, so the index takes less space
      why: Both are 128 bits.
    - text: They can never collide, unlike random UUIDv4 values
      why: Neither can collide in practice.
  explanation: Random inserts spread writes and cache misses across the whole index.
- kind: fire
  prompt: Which anomaly is "we can't add a new product until someone orders it"?
  choices:
    - text: Insert anomaly
      correct: true
    - text: Update anomaly
      why: That's changing a fact stored in several places.
    - text: Delete anomaly
      why: That's losing a fact when deleting another.
  explanation: Products deserve their own table.
```
