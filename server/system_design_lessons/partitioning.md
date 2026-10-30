---
id: partitioning
category: distributed
skill: capacity
title: Partitioning and shard keys
minutes: 16
summary: When one machine can't hold the data or absorb the writes, you split the data into partitions (shards). The shard key decides everything that follows — which queries stay on one shard, which become expensive scatter-gathers, which transactions become distributed, and whether one hot key can melt a node. Sharding is easy to start and hard to change, so choose the key from the queries.
objectives:
  - Compare range, hash and directory-based partitioning
  - Choose a shard key from access patterns, cardinality and skew
  - Handle cross-shard queries, secondary indexes and transactions
  - Plan rebalancing and an online resharding migration
sources:
  - ['Vitess: Sharding', 'https://vitess.io/docs/reference/features/sharding/']
  - ['Citus: Choosing a distribution column', 'https://docs.citusdata.com/en/stable/sharding/data_modeling.html']
  - ['Amazon DynamoDB: Partitions and data distribution', 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html']
---

> [!story] Sharded by the wrong thing
> A B2B SaaS company sharded its database by `user_id` because "users are the unit of scale". But nearly every product query was per *company*: dashboards, reports and permissions all aggregated a company's users. Each dashboard load fanned out to all 32 shards, one slow shard slowed every page, and a company-wide transaction (re-assigning all of a team's tickets) became a distributed transaction. Re-sharding by `company_id` took nine months.

## Three ways to split data

| Strategy | How keys map to shards | Good at | Bad at |
|---|---|---|---|
| **Range** | Contiguous key ranges (`A–F`, `G–M`; or by time) | Range scans; easy to split hot ranges | Sequential keys (timestamps, auto-increment) send every new write to the last shard |
| **Hash** | `hash(key)` decides the shard | Spreading load evenly | Range queries scatter to every shard; changing shard count remaps keys (unless you use consistent hashing or fixed partitions) |
| **Directory / lookup** | A mapping table says which shard holds each key (or tenant) | Moving individual tenants; placing big tenants on dedicated shards | The directory is a critical dependency that must be fast and highly available |

Most large systems use **many small fixed partitions** (say 1,024) hashed from the key, and then map partitions onto physical nodes. Rebalancing then moves whole partitions rather than rehashing keys.

```predict
prompt: An events table is range-partitioned by `created_at`, with one shard per month. Writes are 20,000/s. What happens to the shards?
choices:
  - Writes spread evenly across all shards
  - All writes hit the current month's shard while older shards sit idle — a write hotspot
  - Reads become impossible
  - Range partitioning automatically switches to hash
answer: 1
reveal: |
  With monotonically increasing keys, "now" always lives in one range. Range partitioning by time is great for retention (drop old months cheaply) and time-range queries, but terrible for spreading write load. Common fixes: hash by entity (`device_id`) with time as the sort key within the partition, or a compound key (`hash(device) bucket, time`).
```

## Choosing a shard key

A good shard key:

1. **Appears in your most frequent queries**, so they hit one shard.
2. **Groups data that's updated together**, so transactions stay single-shard.
3. **Has high cardinality and even load**, so no shard becomes hot.
4. **Is stable**: a key that changes means moving the row between shards.

```sort
prompt: Is each choice of shard key a good idea?
buckets: [Good choice, Poor choice]
items:
  - {text: 'Multi-tenant SaaS where almost every query is scoped to one company: shard by company_id', bucket: 0, why: "Queries and transactions stay on one shard. Watch for very large tenants, which may need dedicated shards."}
  - {text: 'Shard a messaging app by country', bucket: 1, why: 'Low cardinality and heavy skew: a few countries dominate, and you can never have more shards than countries.'}
  - {text: 'Chat messages sharded by conversation_id', bucket: 0, why: "The main query ('messages in this conversation') is single-shard, with high cardinality."}
  - {text: 'Orders sharded by order status', bucket: 1, why: "A handful of values, a hot 'pending' shard, and orders move shards whenever their status changes."}
  - {text: 'User profiles sharded by user_id', bucket: 0, why: 'High cardinality, stable, and profile reads are by user.'}
  - {text: 'An append-only log sharded by an auto-increment ID using ranges', bucket: 1, why: 'Every new write lands in the last range.'}
```

## When a query crosses shards

- **Scatter-gather:** send the query to every shard and merge the results. Latency is the *slowest* shard (the tail at scale again), and cost grows with shard count. Fine for rare admin queries; bad as the main read path.
- **Secondary indexes:**
  - **Local (document-partitioned)** indexes live with each shard's data. Writes are cheap; queries by the indexed attribute scatter to all shards.
  - **Global (term-partitioned)** indexes are themselves partitioned by the indexed value. Queries hit one index shard; writes must update a remote index shard, usually asynchronously, so the index lags.
- **Cross-shard transactions** need two-phase commit or a saga. Design so the common transactions are single-shard.
- **Analytics:** don't run reports against the sharded OLTP store; stream it into a warehouse.

```calc
title: How many shards?
prompt: A table will hold **18 TB** of data within two years. Each shard node should hold at most **1.5 TB** (to keep backups, restores and index rebuilds fast), and peak writes of **90,000/s** must stay under **10,000/s** per node. How many shards do you need?
answer: 12
unit: shards
tolerance: 1.01
steps: |
  Storage: 18 ÷ 1.5 = 12 shards. Writes: 90,000 ÷ 10,000 = 9 shards. Take the larger — **12** — and many teams would provision 16 logical partitions, or a much larger fixed partition count mapped onto 12 nodes, to leave room to grow. Note that it was storage, not throughput, that decided. Always size against every limit.
```

## Hot partitions

Even a good key has hot values: a celebrity account, a huge customer, a viral product. Mitigations:

- **Salting / key splitting** — append a suffix (`product:42#0..7`) to spread a hot key across partitions, at the cost of reading all suffixes and losing per-key ordering.
- **Dedicated shards** for the biggest tenants (with a directory to route them).
- **Caching** reads of hot keys in front of the partition.
- **Adaptive capacity** — some managed stores (DynamoDB) automatically split or boost hot partitions, but only up to a point. Design for it rather than relying on it.

## Rebalancing and resharding

Data grows, and so must the cluster. Approaches:

- **Fixed number of partitions** (many more than nodes), with whole partitions moved between nodes. Simple, used by Elasticsearch, Riak, Couchbase and others. The partition count needs choosing well up front.
- **Dynamic splitting** — split a range or partition when it grows too big (HBase, Bigtable, CockroachDB, DynamoDB).
- **Consistent hashing** — next lesson.

Changing the shard **key** is a migration, not a rebalance:

```order
prompt: Order the steps of an online resharding from user_id to company_id.
items:
  - Create the new shard layout and routing for company_id
  - Start dual-writing every change to both the old and the new layout
  - Backfill historical data into the new layout in batches, verifying counts and checksums
  - Shift reads to the new layout gradually (by tenant or percentage), comparing results
  - Stop writing to the old layout once reads are fully migrated and verified
  - Decommission the old shards after a rollback window
explain: The same expand–migrate–contract shape as schema migrations, at a larger scale. Each step is reversible until the end. Tools like Vitess automate parts of it (VReplication), but the verification and the gradual cutover are what keep it safe.
```

```bug
title: Shard routing
prompt: This router sends each user's data to one of the database shards. Which lines will hurt when the cluster grows?
lang: python
code: |
  SHARDS = ["db-0", "db-1", "db-2", "db-3"]

  def shard_for(user_id):
      return SHARDS[hash(user_id) % len(SHARDS)]

  def user_orders(user_id, since):
      return query(shard_for(user_id), "SELECT * FROM orders WHERE user_id=%s AND created_at > %s", user_id, since)

  def orders_by_sku(sku):
      return [r for s in SHARDS for r in query(s, "SELECT * FROM orders WHERE sku=%s", sku)]
bug: [4, 10]
explain: |
  **Line 4:** `hash(key) % N` remaps almost every key when N changes from 4 to 5, so adding a shard means moving ~80% of the data. Map keys to a large fixed number of logical partitions (or use consistent hashing) and map partitions to physical shards. (Python's built-in `hash()` is also randomised per process for strings — use a stable hash.) **Line 10** is an unbounded scatter-gather to every shard on what may be a hot path. Its latency is the slowest shard's and its cost grows with the cluster. If "orders by SKU" matters, maintain a global secondary index (or a search or analytics store) for it.
```

```interview
ask: How would you design partitioning for a multi-tenant business platform supporting company dashboards, permissions and transactions as its customer base grows?
say: |
  "Almost every query is per company, so I'd shard by company_id: dashboards, permissions and transactions stay on one shard. Keys hash to 4,096 logical partitions mapped onto physical nodes, so rebalancing moves partitions rather than rehashing keys. Three enormous customers get dedicated shards through a directory. Cross-company queries are admin-only and go to the warehouse via CDC. If we ever change the key, we'd dual-write, backfill and shift reads gradually."
followups:
  - q: Why not shard by user_id?
    a: Company-scoped queries and transactions would scatter across shards and need distributed transactions. The shard key should match the unit of access and atomicity.
  - q: How do you handle one tenant that's bigger than a shard?
    a: Give it a dedicated shard, or sub-shard it by a finer key inside the tenant (e.g. company_id + project_id), with a directory routing that tenant.
  - q: What's the cost of a global secondary index?
    a: Writes must update an index partition on another node, usually asynchronously, so the index can lag the data. In exchange, queries by the indexed attribute hit one partition instead of all of them.
weak: |
  "Shard by user ID with hash mod N." No reasoning from queries or transactions, no plan for hot tenants, rebalancing or cross-shard queries.
strong: |
  Derives the key from access and transaction patterns, checks cardinality and skew, uses fixed logical partitions, handles secondary indexes and hot tenants, and plans online resharding.
```

```recall
prompt: What makes a good shard key? Give an example of a good one and a bad one for a multi-tenant SaaS app.
points:
  - It appears in the most frequent queries, so they hit a single shard
  - It groups data that is updated together, so transactions stay single-shard
  - It has high cardinality and even load, so no shard is hot, and it's stable over time
  - Good example — company_id when queries are per company (watch big tenants); bad example — status or country (low cardinality, skewed, changing)
model: |
  A shard key should match how data is used: the main queries include it, so they're answered by one shard, and the rows a transaction touches share it, so transactions stay local. It needs many distinct values with fairly even traffic, so load spreads and no single shard gets hot, and it shouldn't change over a row's life. In a B2B SaaS app where everything is scoped to a company, company_id is usually right, with a plan for the few giant tenants. Something like status or country is a poor key: few values, heavy skew, and status even changes, forcing rows to move.
```

```questions
- kind: check
  prompt: A table is range-partitioned by an auto-incrementing ID. What problem appears under heavy inserts?
  choices:
    - text: All new rows land in the last range's shard, creating a write hotspot
      correct: true
    - text: Inserts spread evenly
      why: Sequential IDs all fall into the newest range.
    - text: Range queries become impossible
      why: Range partitioning is good at range queries.
    - text: IDs start colliding
      why: The sequence stays unique. The problem is load placement.
  explanation: Monotonic keys and range partitioning concentrate writes. Hash the key, or put a hashed prefix before the time component.
- kind: check
  type: multi
  prompt: Which properties make a good shard key? Select all that apply.
  choices:
    - text: Present in the most frequent queries
      correct: true
    - text: Groups rows that are updated together in one transaction
      correct: true
    - text: High cardinality with fairly even traffic
      correct: true
    - text: Stable for the lifetime of a row
      correct: true
    - text: Has as few distinct values as possible
      why: Few values limit how many shards you can have and concentrate load.
  explanation: A shard key should keep common operations local while spreading load evenly.
- kind: check
  type: numeric
  prompt: Data will reach 24 TB and each shard should hold at most 2 TB. Peak writes of 50,000/s must stay under 8,000/s per shard. How many shards are needed?
  answer: 12
  unit: shards
  tolerance: 0.01
  explanation: Storage needs 24 ÷ 2 = 12 shards; writes need 50,000 ÷ 8,000 ≈ 6.25, so 7. Take the larger: 12.
- kind: check
  prompt: What's the main drawback of answering a query by scatter-gather across 64 shards?
  choices:
    - text: Latency is set by the slowest shard and cost grows with the shard count
      correct: true
    - text: It returns incorrect results
      why: Correctly merged results are accurate. Cost and tail latency are the problem.
    - text: It only works on hash-partitioned data
      why: It works on any partitioning.
    - text: It locks every shard
      why: Reads don't normally lock.
  explanation: Fan-out queries inherit tail latency and multiply load. Keep them off hot paths, or add a global index or another store.
- kind: fire
  prompt: Why does `hash(key) % N` make adding a shard expensive?
  choices:
    - text: Changing N remaps most keys to different shards, forcing most data to move
      correct: true
    - text: Hash functions slow down as N grows
      why: Hashing cost doesn't depend on N.
    - text: It only works for N that are powers of two
      why: It works for any N. The remapping is the problem.
    - text: Modulo is not deterministic
      why: It's deterministic. That's why keys move when N changes.
  explanation: Use many fixed logical partitions or consistent hashing, so growth moves only a small fraction of the data.
- kind: fire
  prompt: What's the trade-off of a global (term-partitioned) secondary index in a sharded database?
  choices:
    - text: Queries on the indexed attribute hit one partition, but each write must update a remote index partition, often asynchronously
      correct: true
    - text: It makes writes cheaper and reads more expensive
      why: It's the other way round.
    - text: It removes the need for a shard key
      why: The data is still sharded by its primary key.
    - text: It guarantees the index is always perfectly in sync
      why: Usually it lags slightly, because index updates are asynchronous.
  explanation: Local indexes give cheap writes and scattered reads. Global indexes give targeted reads and costlier, often lagging, writes.
- kind: fire
  prompt: One tenant is 30% of all traffic and overloads its shard. What's a reasonable fix?
  choices:
    - text: Move that tenant to a dedicated shard (via a directory) or sub-shard it by a finer key
      correct: true
    - text: Add more shards for all tenants
      why: The big tenant still lives on one shard.
    - text: Switch to range partitioning by tenant name
      why: That still keeps the tenant on one shard.
    - text: Shard by country instead
      why: That's lower cardinality and doesn't isolate the tenant.
  explanation: Skewed tenants need special placement. Directories make per-tenant placement possible.
- kind: fire
  type: order
  prompt: Order an online change of shard key.
  items:
    - Build the new layout and routing
    - Dual-write to old and new layouts
    - Backfill history and verify
    - Gradually move reads to the new layout
    - Stop old writes, then decommission the old layout
  explanation: Expand, migrate and contract, with verification and rollback possible at every step.
- kind: fire
  level: advanced
  prompt: Why do many systems hash keys into thousands of fixed logical partitions rather than directly onto N physical nodes?
  choices:
    - text: Adding nodes moves whole partitions between nodes without changing any key's partition
      correct: true
    - text: Logical partitions make queries faster in general
      why: The benefit is cheap rebalancing, not query speed.
    - text: It removes the need for a shard key
      why: Keys are still hashed to partitions.
    - text: It guarantees no hot keys
      why: A hot key is still hot within its partition.
  explanation: Decoupling key → partition (fixed) from partition → node (flexible) makes rebalancing a matter of moving partitions.
```
