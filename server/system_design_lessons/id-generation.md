---
id: id-generation
category: storage
skill: capacity
title: Generating unique IDs at scale
minutes: 14
summary: An ID scheme decides more than uniqueness. It affects write locality in your indexes, whether IDs sort by time, how much coordination each insert needs, what IDs leak about your business, and how short a public code can be. Auto-increment, random UUIDs, time-ordered UUIDs, Snowflake-style IDs and range allocation each win somewhere.
objectives:
  - Compare auto-increment, UUIDv4, UUIDv7/ULID, Snowflake and range-allocated IDs on coordination, ordering, size and index locality
  - Design a Snowflake-style bit layout and handle clock skew and sequence exhaustion
  - Generate short public codes and reason about collisions with the birthday bound
  - Avoid leaking sensitive information through enumerable IDs
sources:
  - ['RFC 9562: Universally Unique IDentifiers (UUIDs), including UUIDv7', 'https://www.rfc-editor.org/rfc/rfc9562']
  - ['Twitter engineering: Announcing Snowflake', 'https://blog.x.com/engineering/en_us/a/2010/announcing-snowflake']
  - ['Flickr: Ticket servers — distributed unique primary keys on the cheap', 'https://code.flickr.net/2010/02/08/ticket-servers-distributed-unique-primary-keys-on-the-cheap/']
---

> [!story] Counting a competitor's orders
> A well-known trick in competitive intelligence: place an order on a rival's site in the morning and another in the evening. If the order numbers are sequential — `#104511` and `#106203` — you've just learned they processed about 1,700 orders that day. Sequential IDs in URLs have leaked user counts, revenue and growth rates more than once, and they make enumeration attacks trivial when authorisation is missing. IDs are part of your public surface.

## The options

| Scheme | Coordination | Sortable by time | Size | Index locality | Leaks |
|---|---|---|---|---|---|
| **Auto-increment** (DB sequence) | Central — one database | Yes | 8 bytes | Excellent (always appends) | Volume, growth; easy enumeration |
| **UUIDv4** (random) | None | No | 16 bytes | Poor (random inserts all over the B-tree) | Nothing |
| **UUIDv7 / ULID** (time + random) | None | Yes (ms) | 16 bytes | Good (roughly appending) | Creation time |
| **Snowflake** (time + worker + sequence) | Worker IDs must be assigned | Yes | 8 bytes | Good | Creation time, worker |
| **Range allocation** (hi/lo, ticket server) | Occasional — fetch a block of IDs | Roughly | 8 bytes | Good | Approximate volume |

```sort
prompt: Pick the most suitable scheme for each situation.
buckets: [Auto-increment, UUIDv4, UUIDv7 / ULID, Snowflake-style 64-bit]
items:
  - {text: 'An internal admin table on a single Postgres instance, never exposed publicly', bucket: 0, why: 'Simple, compact, perfectly ordered. Its drawbacks (central, enumerable) do not apply here.'}
  - {text: 'Client-generated IDs for offline-first mobile records that sync later, sortable by creation time', bucket: 2, why: 'Generated without coordination, sorted by time, friendlier to B-tree indexes than random UUIDs.'}
  - {text: 'A one-time password-reset token that must be unguessable', bucket: 1, why: '122 random bits with no structure. Time-ordered or sequential IDs are guessable. (A dedicated cryptographic token is even better.)'}
  - {text: 'Tweet or message IDs across thousands of servers, 64-bit, roughly time-ordered, very high rate', bucket: 3, why: 'Compact, time-sortable, generated locally per worker with no per-ID coordination.'}
```

## Why random UUIDs hurt B-tree indexes

A B-tree primary key keeps entries sorted. Monotonic IDs always insert at the right-hand edge: the hot pages stay in memory and fill completely. Random UUIDv4s insert at random positions: every insert may touch a different leaf page, pulling cold pages into the buffer cache, splitting half-full pages and inflating index size and write I/O. At a few thousand inserts per second on a large table, the difference is very visible.

```predict
prompt: A table with 500M rows uses UUIDv4 primary keys, and insert throughput has dropped while disk reads rise, even though inserts don't read data. A teammate proposes switching new rows to UUIDv7. Why would that help?
choices:
  - It wouldn't — all UUIDs are the same to an index
  - UUIDv7 starts with a timestamp, so new keys land near the right edge of the index, keeping the working set of index pages small and in memory
  - UUIDv7 is shorter, so it saves space
  - UUIDv7 disables the index
answer: 1
reveal: |
  With random keys, the "hot" part of the index is the whole index, so inserts cause cache misses and page splits everywhere. Time-ordered keys concentrate inserts on a few recent pages. Same 16 bytes, same uniqueness, far better locality. (Clustered-index engines such as InnoDB feel this most, because the table itself is ordered by primary key.)
```

## Snowflake: 64 bits, no coordination per ID

Twitter's Snowflake packs an ID into a signed 64-bit integer:

- **1 sign bit** (always 0)
- **41 bits** — milliseconds since a custom epoch (about 69 years)
- **10 bits** — worker ID (1,024 workers)
- **12 bits** — per-millisecond sequence (4,096 IDs per ms per worker)

Each worker generates IDs locally. IDs sort by time (to the millisecond, across workers), fit in a `BIGINT`, and are unique as long as **worker IDs are unique** and **clocks don't go backwards**.

```sim
name: snowflake
title: Design a bit layout
challenges:
  - {text: 'Find a layout that lasts at least 100 years from the epoch and supports 4,096+ workers', metric: years, op: '>=', value: 100, and: [{metric: machines, op: '>=', value: 4096}]}
  - {text: 'Keep both, and still let each worker issue at least 500 IDs per millisecond (1,000 is impossible — why?)', metric: perMs, op: '>=', value: 500, and: [{metric: years, op: '>=', value: 100}, {metric: machines, op: '>=', value: 4096}]}
takeaway: |
  The 63 usable bits are a budget split between lifetime, fleet size and per-worker rate. Choosing a recent custom epoch adds decades. If you need more of all three, you need more bits — a 128-bit time-ordered ID like UUIDv7.
```

```bug
title: A Snowflake generator
prompt: This generator is used by 300 services. Which lines can produce duplicate or broken IDs?
lang: python
code: |
  WORKER_ID = random.randint(0, 1023)
  last_ms, seq = 0, 0

  def next_id():
      global last_ms, seq
      now = int(time.time() * 1000) - EPOCH_MS
      if now == last_ms:
          seq = seq + 1
      else:
          seq = 0
      last_ms = now
      return (now << 22) | (WORKER_ID << 12) | seq
bug: [1, 8, 10]
explain: |
  **Line 1:** random worker IDs collide. With 300 processes picking from 1,024 values, the birthday bound makes a collision overwhelmingly likely, and two workers sharing an ID produce identical IDs in the same millisecond. Assign worker IDs from a coordinator (ZooKeeper/etcd lease, a database row, or the pod ordinal). **Line 8:** the sequence isn't bounded. At more than 4,096 IDs in a millisecond it overflows into the worker bits. Wait for the next millisecond instead. **Line 10:** if the clock moves backwards (NTP step), `now < last_ms` falls into the `else` branch, resets the sequence and reissues IDs from an earlier millisecond. Detect the regression and wait (or refuse) until the clock passes `last_ms`. (It also needs a lock if called from several threads.)
fix: |
  WORKER_ID = lease_worker_id()                      # unique, from a coordinator
  last_ms, seq, lock = -1, 0, threading.Lock()

  def next_id():
      global last_ms, seq
      with lock:
          now = current_ms()
          if now < last_ms:
              now = wait_until(last_ms)              # clock went backwards: never reuse a past ms
          if now == last_ms:
              seq = (seq + 1) & 0xFFF
              if seq == 0:
                  now = wait_until(last_ms + 1)      # sequence exhausted this ms
          else:
              seq = 0
          last_ms = now
          return (now << 22) | (WORKER_ID << 12) | seq
```

## Range allocation: cheap central IDs

If you want compact, roughly sequential integers without a database round trip per ID, let each server **reserve a block**: fetch "IDs 1,000,001–1,001,000" from a central sequence (one atomic increment), then hand them out from memory. One coordination per thousand IDs; a crash wastes the unused part of the block (gaps are fine). Flickr's "ticket servers" used a pair of MySQL servers issuing odd and even numbers for redundancy.

## Short public codes

URL shorteners, invite codes and order references need **short**, often **unguessable**, codes. In base62 (`0-9a-zA-Z`), each character carries about 5.95 bits:

| Length | Codes |
|---|---|
| 6 | 62⁶ ≈ 56.8 billion |
| 7 | 62⁷ ≈ 3.52 trillion |
| 8 | 62⁸ ≈ 218 trillion |

Two approaches:

- **Encode a unique integer** (from a sequence or range allocator) in base62. No collisions by construction, but sequential codes are enumerable — scramble them with a reversible permutation if that matters.
- **Generate random codes** and insert with a unique constraint, retrying on conflict. Unguessable, but collisions become frequent long before the space fills — the **birthday problem**.

```calc
title: How often do random codes collide?
prompt: You generate random **7-character base62** codes (N ≈ 3.52 × 10¹²). After **10 million** codes exist, what's the probability that a new random code collides with an existing one, in **percent**?
answer: 0.00028
unit: '%'
tolerance: 1.2
hint: A new code collides if it matches any of the n existing codes, so the probability is n ÷ N.
steps: |
  p = n / N = 10⁷ / 3.52 × 10¹² ≈ 2.8 × 10⁻⁶ ≈ **0.00028%**. So each insert almost never needs a retry — but *some* collision among all codes becomes likely around √N ≈ 1.9 million codes (the birthday bound), which is why you always insert with a unique constraint and retry, rather than assuming randomness guarantees uniqueness. At 1 billion codes, about 0.03% of new inserts collide.
```

```interview
ask: How would you design unique ID generation at scale for a distributed application with internal database records, public URLs and clients that work offline?
say: |
  "Internally, primary keys are Snowflake-style 64-bit IDs: a 41-bit millisecond timestamp from a 2024 epoch, 10 bits of worker ID leased from etcd, and a 12-bit sequence. That's compact, time-sortable, and needs no per-insert coordination. The generator waits on sequence exhaustion and refuses to go backwards in time. Public URLs use a separate random base62 code with a unique constraint and retry, so nothing leaks order volume or invites enumeration. Where clients must create IDs offline, they use UUIDv7."
followups:
  - q: Why not UUIDv4 everywhere?
    a: It's 16 bytes, not time-sortable, and random keys scatter B-tree inserts across the index, hurting cache locality and write throughput on big tables. UUIDv7 keeps decentralisation and gains locality.
  - q: What breaks Snowflake IDs?
    a: Duplicate worker IDs, clocks moving backwards, and more than 4,096 IDs per millisecond per worker. Lease worker IDs, refuse or wait on clock regression, wait out exhausted sequences, and monitor clock skew.
  - q: How long should a short code be?
    a: Long enough that the space is far larger than the codes you'll issue (7 base62 characters gives 3.5 trillion), with a unique constraint and retry. Use an unguessable scheme if enumeration matters.
weak: |
  "Use auto-increment" for a sharded, public system, or "UUIDs never collide, so no constraint needed."
strong: |
  Chooses per use: compact time-ordered internal IDs with no per-ID coordination, unguessable public codes, a reason about index locality, the failure modes of Snowflake, and collision maths with a uniqueness constraint as the backstop.
```

```recall
prompt: Explain why random UUIDv4 primary keys can slow down inserts on a large table, and what a better alternative is.
points:
  - A B-tree index keeps keys sorted, so each insert goes to the leaf page where its key belongs
  - Random keys land on random pages across the whole index, so the hot working set is the entire index, causing cache misses and page splits
  - Monotonic or time-ordered keys insert near the right edge, keeping a small set of hot pages in memory
  - A time-ordered ID such as UUIDv7, ULID or Snowflake keeps decentralised generation and restores locality
model: |
  A B-tree places every key in sorted position. With UUIDv4, consecutive inserts land on random leaf pages anywhere in a huge index, so each insert may need a page that isn't in memory and may split a half-full page — the whole index becomes the working set, and write I/O and index size grow. Sequential or time-ordered keys always append near the right edge, so the same few pages stay hot and fill completely. UUIDv7 or ULID (timestamp prefix plus randomness), or a Snowflake ID, keep the benefit of generating IDs without coordination while restoring that locality.
```

```questions
- kind: check
  prompt: What's the main operational problem with random UUIDv4 primary keys on a very large B-tree-indexed table?
  choices:
    - text: Inserts scatter across the whole index, causing cache misses, page splits and lower write throughput
      correct: true
    - text: UUIDv4s collide frequently
      why: With 122 random bits, collisions are practically impossible at real volumes.
    - text: They can't be generated without a database
      why: They're generated anywhere, with no coordination — that's their appeal.
    - text: They are only 4 bytes
      why: They're 16 bytes.
  explanation: Random keys destroy insert locality. Time-ordered IDs (UUIDv7, ULID, Snowflake) keep inserts concentrated on recent pages.
- kind: check
  type: multi
  prompt: Which conditions must hold for Snowflake-style IDs to stay unique? Select all that apply.
  choices:
    - text: Every running generator has a distinct worker ID
      correct: true
    - text: A generator never issues IDs for a millisecond earlier than one it already used (clock regression handled)
      correct: true
    - text: The per-millisecond sequence never overflows into the worker bits (wait for the next ms)
      correct: true
    - text: All servers' clocks are perfectly synchronised to the microsecond
      why: Global synchronisation isn't required. Each worker only needs to be monotonic itself — skew just makes cross-worker ordering approximate.
  explanation: Uniqueness comes from (timestamp, worker, sequence) being unique per worker. Duplicate workers, clocks going backwards and sequence overflow break it.
- kind: check
  type: numeric
  prompt: How many distinct codes does a 6-character base62 alphabet provide, in billions? (62⁶)
  answer: 56.8
  unit: billion
  tolerance: 0.15
  explanation: 62⁶ = 56,800,235,584 ≈ 56.8 billion. In your head, 62² ≈ 3,800 ≈ 4,000 and 4,000³ = 64 billion, which is close enough. Each extra character multiplies the space by 62.
- kind: check
  prompt: Why might a company avoid exposing sequential order IDs in URLs?
  choices:
    - text: Competitors can infer order volume, and attackers can enumerate resources if authorisation is weak
      correct: true
    - text: Sequential IDs are slower to look up
      why: They're actually index-friendly. The concern is information leakage.
    - text: Browsers can't display large numbers
      why: They can.
    - text: Sequential IDs collide more often
      why: Sequences don't collide.
  explanation: Public identifiers leak information and invite enumeration. Use random public codes or scramble sequential ones, and always authorise access.
- kind: fire
  prompt: In a 64-bit Snowflake layout, what does taking bits from the timestamp to give to the sequence trade?
  choices:
    - text: More IDs per millisecond per worker, but a shorter lifetime before the timestamp overflows
      correct: true
    - text: More workers with no downside
      why: Those bits come from the timestamp, which shortens the lifetime.
    - text: Stronger randomness
      why: No bits are random in a Snowflake ID.
    - text: Shorter IDs
      why: The ID is still 64 bits.
  explanation: The 63 usable bits are split between lifetime, worker count and per-worker rate. Gaining in one costs another.
- kind: fire
  prompt: How does range (block) allocation reduce coordination for integer IDs?
  choices:
    - text: Each server reserves a block of IDs with one atomic operation and hands them out from memory
      correct: true
    - text: Each server picks random integers
      why: That's random generation, which can collide.
    - text: Every ID is fetched from the database individually
      why: That's maximum coordination.
    - text: IDs are assigned by the load balancer
      why: Load balancers don't allocate IDs.
  explanation: One round trip per block amortises coordination. Gaps from crashed servers are harmless.
- kind: fire
  prompt: A URL shortener generates random 7-character codes. Why is a unique constraint with retry still required?
  choices:
    - text: Collisions become likely long before the space is full (birthday bound), so some inserts will clash
      correct: true
    - text: Random codes never collide, so it's just good hygiene
      why: Collisions are guaranteed eventually, and probable after about √N codes.
    - text: Unique constraints make codes shorter
      why: They enforce uniqueness, not length.
    - text: The database requires it for strings
      why: It's a correctness choice, not a requirement.
  explanation: Probability of some collision passes 50% around √N issued codes. The constraint plus retry turns that into an occasional extra attempt.
- kind: fire
  level: advanced
  prompt: An NTP correction moves a server's clock back by 50 ms. What should a careful Snowflake generator do?
  choices:
    - text: Refuse or wait until the clock passes the last timestamp it used, so it never reissues IDs in an already-used millisecond
      correct: true
    - text: Continue normally with the new, earlier time
      why: It could reissue (timestamp, sequence) pairs it already used, creating duplicates.
    - text: Switch to a random worker ID
      why: That risks collisions with other workers.
    - text: Reset the epoch
      why: That would break ordering and could collide with existing IDs.
  explanation: Per-worker monotonicity is what keeps IDs unique. Detect clock regression, wait it out (or fail loudly if it's large), and alert on skew.
- kind: fire
  type: multi
  prompt: Which are advantages of UUIDv7 over UUIDv4? Select all that apply.
  choices:
    - text: Roughly time-ordered, so they sort by creation time
      correct: true
    - text: Better B-tree insert locality
      correct: true
    - text: Still generated without coordination
      correct: true
    - text: They reveal nothing about when they were created
      why: The timestamp prefix does reveal creation time. That's a reason to prefer v4 for secret tokens.
    - text: They are half the size of UUIDv4
      why: Both are 128 bits.
  explanation: UUIDv7 keeps decentralisation and adds time ordering and locality, at the cost of exposing creation time.
```
