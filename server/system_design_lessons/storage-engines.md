---
id: storage-engines
category: storage
skill: capacity
title: Storage engines — logs, B-trees, LSM trees and columns
minutes: 16
summary: Underneath every database is a storage engine making one trade-off over and over — optimise for reads, for writes, or for space. B-trees update pages in place and read fast; LSM trees turn every write into a sequential append and pay later in compaction; column stores lay data out for scanning billions of values. Knowing which you're on explains most performance surprises.
objectives:
  - Explain the write-ahead log and why it makes commits durable and fast
  - Compare B-tree and LSM-tree engines by write, read and space amplification
  - Explain memtables, SSTables, compaction strategies and why Bloom filters matter to LSM reads
  - Choose row-oriented or column-oriented storage for OLTP versus analytics
sources:
  - ["O'Neil et al., The Log-Structured Merge-Tree (LSM-Tree)", 'https://www.cs.umb.edu/~poneil/lsmtree.pdf']
  - ['RocksDB wiki: Compaction', 'https://github.com/facebook/rocksdb/wiki/Compaction']
  - ['PostgreSQL: Write-Ahead Logging (WAL)', 'https://www.postgresql.org/docs/current/wal-intro.html']
---

> [!story] Why Cassandra writes were fast and reads weren't
> A team moved a write-heavy event store from Postgres to Cassandra and saw write latency drop and throughput jump. Months later, reads for old devices had become slow and erratic, and disk usage was double what they'd estimated. Nothing was misconfigured. They had swapped a read-optimised engine for a write-optimised one: writes became cheap appends, and the bill arrived as compaction I/O, multiple files consulted per read, and space taken by not-yet-compacted versions.

## The log comes first

Every serious database writes changes to an append-only **write-ahead log (WAL)** before touching its data structures. A commit is durable once its log record is flushed (`fsync`) to disk; the data pages or files can be updated later, and after a crash the log is replayed.

Sequential appends are fast — even on SSDs they beat scattered random writes — and batching many commits into one flush (**group commit**) lets a database sustain thousands of durable commits per second. The log also feeds replication and change-data-capture.

## B-trees: update in place

A B-tree engine (Postgres, MySQL InnoDB, SQL Server) stores rows and indexes in fixed-size pages and **modifies pages in place**, logging each change to the WAL first.

- **Reads:** one root-to-leaf path, about 3–4 pages, mostly cached. Predictable.
- **Writes:** a small change rewrites a whole page (later, at checkpoint), plus the WAL record, plus every affected index — real write amplification, and random I/O.
- **Space:** pages run partly empty after splits; MVCC engines like Postgres also keep dead row versions until vacuum.

## LSM trees: append, then merge

A **log-structured merge tree** (RocksDB, Cassandra, ScyllaDB, LevelDB, HBase, and the storage under many NewSQL systems) never modifies files in place:

1. A write goes to the WAL and to an in-memory sorted **memtable**.
2. When the memtable fills, it's flushed to disk as an immutable sorted file, an **SSTable**.
3. Background **compaction** merges SSTables, discarding overwritten values and tombstones (deletes are writes of a "deleted" marker).
4. A read checks the memtable, then SSTables from newest to oldest, until it finds the key. **Bloom filters** let it skip files that definitely don't contain the key.

Try it — watch what flushes, compaction and Bloom filters do to the work:

```sim
name: lsm
title: An LSM tree, step by step
challenges:
  - {text: 'Put enough keys to trigger at least two memtable flushes', metric: flushes, op: '>=', value: 2}
  - {text: 'Trigger a compaction and watch overwritten values and tombstones disappear', metric: compactions, op: '>=', value: 1}
takeaway: |
  Writes are cheap — a memory insert plus a log append — but each byte is rewritten again by flush and every compaction (**write amplification**). Reads may consult several files (**read amplification**) unless Bloom filters rule most of them out. Deleted data takes space until compaction removes it (**space amplification**). Compaction strategy decides how those three costs balance.
```

## The amplification trade-off

| | B-tree | LSM (leveled compaction) | LSM (size-tiered compaction) |
|---|---|---|---|
| Write amplification | Medium–high (page rewrites, random I/O) | High (data rewritten at each level), but sequential | Lower |
| Read amplification | Low (one path) | Low–medium (about one file per level, Bloom filters help) | Higher (many overlapping files) |
| Space amplification | Medium (fragmentation, dead tuples) | Low (~10% extra) | High (up to 2× during compaction) |
| Sweet spot | Read-heavy OLTP, range scans, predictable latency | Mixed workloads where space matters | Write-heavy, append-mostly data |

> [!senior] Compaction is a background workload you must budget for
> Compaction competes with foreground traffic for disk and CPU. If writes outpace it, files pile up, reads slow down and engines throttle writes ("write stalls"). Capacity plans for LSM stores include compaction headroom — often keeping disks under ~50% full for size-tiered strategies.

```sort
prompt: Which engine family fits better?
buckets: [B-tree engine, LSM engine]
items:
  - {text: 'Ingesting 500k IoT readings per second, mostly appends, queried by device and recent time range', bucket: 1, why: 'Sequential writes and memtable batching absorb huge write rates. Reads are recent-range scans within a partition.'}
  - {text: 'An order-management system with many short read-modify-write transactions and secondary indexes', bucket: 0, why: 'In-place updates and mature transactional engines give predictable reads and strong transactional features.'}
  - {text: 'A messaging store with heavy writes and reads of the latest messages per conversation', bucket: 1, why: 'Write-heavy, with reads concentrated on recent data that is often still in the memtable or newest files.'}
  - {text: 'A reporting replica running complex joins and range scans over a moderate write rate', bucket: 0, why: 'B-tree engines with rich query planners and stable read paths fit read-heavy relational workloads.'}
```

## Bloom filters: "definitely not" in a few bits

A **Bloom filter** is a bit array plus *k* hash functions. Adding a key sets *k* bits. Querying checks those *k* bits: if any is 0 the key is **definitely absent**; if all are 1 it's **probably present**. False positives happen; false negatives never do. LSM engines keep one per SSTable, so a lookup for a missing key usually reads no data files at all.

```sim
name: bloom
title: A Bloom filter up close
challenges:
  - {text: 'Add 10 random keys at 32 bits, then query words you never added until you find a false positive', metric: falsePositives, op: '>=', value: 1}
  - {text: 'Get the false-positive rate under 2% with at least 20 items stored (more bits, or a better k)', metric: fpr, op: '<', value: 2, and: [{metric: n, op: '>=', value: 20}]}
takeaway: |
  The false-positive rate depends on bits per item and the number of hashes: p ≈ (1 − e^(−kn/m))^k, minimised at k ≈ (m/n)·ln 2. Around 10 bits per key gives about 1%, regardless of how long the keys are — which is why Bloom filters appear everywhere: LSM reads, CDN cache admission, "have I crawled this URL?", and avoiding cache penetration.
```

```calc
title: Size a Bloom filter
prompt: An LSM store holds **2 billion** keys and wants a **1%** false-positive rate, which needs about **9.6 bits per key**. How much memory do the Bloom filters need, in **GB**?
answer: 2.4
unit: GB
tolerance: 1.1
steps: |
  2 × 10⁹ keys × 9.6 bits = 19.2 × 10⁹ bits = 2.4 × 10⁹ bytes ≈ **2.4 GB**. That's affordable in RAM across a cluster, and it saves a disk read for most lookups of absent keys. Cutting to 0.1% needs about 14.4 bits per key (3.6 GB) — each tenfold improvement costs roughly 4.8 more bits per key.
```

## Rows or columns?

**Row-oriented** storage keeps each row's columns together: perfect for "fetch order 42 with all its fields" and for small transactional writes (OLTP).

**Column-oriented** storage (ClickHouse, BigQuery, Snowflake, Redshift, Parquet files) stores each column separately: an analytical query that sums one column over a billion rows reads just that column, which compresses extremely well because the values are similar. Writes of individual rows are expensive, so data arrives in batches.

```predict
prompt: A query computes `SELECT region, sum(amount) FROM orders WHERE created_at >= '2026-01-01' GROUP BY region` over 2 billion rows with 40 columns. Roughly how much less data does a column store read than a row store?
choices:
  - About the same — it's the same data
  - Something like 10–100× less — it reads only 3 of 40 columns, and those compress heavily
  - 2× less
  - More, because columns must be reassembled
answer: 1
reveal: |
  It reads `region`, `amount` and `created_at` — about 3/40 of the bytes before compression — and columnar compression (dictionaries, run-length, delta encoding) often shrinks those another 5–10×. Combined with vectorised execution, that's why analytics moves to column stores or warehouses, fed from the OLTP database by CDC or batch exports.
```

```interview
ask: How would you design storage for a device-event system ingesting 300,000 events per second, supporting recent per-device queries, automatic expiry and historical analytics?
say: |
  "The workload is about 300k writes/s of append-mostly events, read by device and recent time window — that's LSM territory: Cassandra or ScyllaDB partitioned by (device_id, day), clustered by timestamp. Writes are sequential memtable appends; reads hit the newest SSTables with Bloom filters skipping the rest. I'd use time-window compaction since data arrives in time order and expires by TTL, and keep disks under about 50% for compaction headroom. Analytics doesn't hit this store — it's exported to Parquet and queried in a columnar warehouse."
followups:
  - q: Why are LSM writes fast?
    a: A write is a WAL append plus a memtable insert. Disk writes happen later, sequentially, in large immutable files. The cost is paid in compaction, which rewrites data in the background.
  - q: What's a tombstone and why does it matter?
    a: In an LSM store a delete writes a marker that hides older versions. Data isn't removed until compaction, so deletes cost space, and many tombstones slow reads that must skip over them.
  - q: When would you pick a B-tree engine instead?
    a: Read-heavy, update-in-place OLTP with secondary indexes and transactions, where predictable read latency matters more than peak write throughput.
weak: |
  "Cassandra is faster than Postgres." No notion of which operations get faster, what compaction costs, or how reads work.
strong: |
  Frames the choice as write vs read vs space amplification, explains WAL, memtables, SSTables, compaction and Bloom filters, budgets compaction headroom, and separates OLTP from columnar analytics.
```

```recall
prompt: Describe the path of a write and of a read for a key in an LSM-tree engine.
points:
  - "Write: append to the write-ahead log for durability, then insert into the in-memory memtable"
  - When the memtable fills it's flushed to disk as an immutable sorted SSTable; compaction later merges SSTables
  - "Read: check the memtable first, then SSTables from newest to oldest until the key is found"
  - Bloom filters per SSTable let reads skip files that definitely don't contain the key
model: |
  A write is appended to the WAL so it survives a crash, then inserted into the sorted in-memory memtable — no disk seek. When the memtable fills, it's written out sequentially as an immutable sorted SSTable. Background compaction merges SSTables, keeping the newest version of each key and dropping tombstoned data. A read checks the memtable first, then the SSTables from newest to oldest, stopping at the first match. Each SSTable's Bloom filter answers "definitely not here" for most files, so a typical read touches only one or two files.
```

```questions
- kind: check
  prompt: Why does writing to a write-ahead log make commits both durable and fast?
  choices:
    - text: A commit only needs a sequential append flushed to disk; data structures can be updated later and rebuilt from the log after a crash
      correct: true
    - text: The log is kept only in memory
      why: Then it couldn't survive a crash. The log is flushed to disk on commit.
    - text: It skips writing data entirely
      why: Data is still written, just later and in bigger batches.
    - text: It makes every read faster
      why: The WAL is about write durability and recovery, not reads.
  explanation: Sequential, batched log flushes are cheap. Page or file updates are deferred, and crash recovery replays the log.
- kind: check
  type: multi
  prompt: Which statements about LSM-tree engines are true? Select all that apply.
  choices:
    - text: Writes go to a memtable and are flushed as immutable sorted files
      correct: true
    - text: Compaction rewrites data in the background, causing write amplification
      correct: true
    - text: Deletes write tombstones that are removed during compaction
      correct: true
    - text: Bloom filters let reads skip SSTables that can't contain the key
      correct: true
    - text: They update rows in place on disk
      why: That's the B-tree approach. LSM files are immutable.
  explanation: LSM engines trade background compaction work and multi-file reads for very cheap, sequential writes.
- kind: check
  prompt: A Bloom filter says a key is "possibly present". What can you conclude?
  choices:
    - text: The key may or may not be present — you must check the actual data
      correct: true
    - text: The key is definitely present
      why: False positives are possible when all the checked bits were set by other keys.
    - text: The key is definitely absent
      why: That's what a 0 bit would tell you.
    - text: The filter is corrupt
      why: False positives are normal and expected.
  explanation: Bloom filters never give false negatives, but do give false positives at a rate set by bits per key and the number of hashes.
- kind: check
  type: numeric
  prompt: At about 9.6 bits per key for 1% false positives, how many MB do Bloom filters need for 50 million keys?
  answer: 60
  unit: MB
  tolerance: 0.05
  explanation: 50M × 9.6 bits = 480M bits = 60 MB. Size depends on the number of keys, not their length.
- kind: fire
  prompt: Which workload is the clearest fit for a column-oriented store?
  choices:
    - text: Aggregating a few columns over billions of rows for dashboards
      correct: true
    - text: Updating a single customer's address many times per second
      why: Single-row updates are expensive in column stores.
    - text: Fetching one order with all its fields by ID
      why: Row stores read a whole row in one place.
    - text: A shopping cart with frequent small transactions
      why: That's OLTP, which suits row-oriented engines.
  explanation: Column stores read only the needed columns and compress them heavily, which makes them ideal for wide scans and aggregation — and poor at frequent small writes.
- kind: fire
  prompt: An LSM store's reads slowed down as write volume grew, and the engine reports write stalls. What's the most likely cause?
  choices:
    - text: Compaction can't keep up, so files accumulate and reads consult more of them
      correct: true
    - text: The memtable is too fast
      why: Memtable speed isn't a problem. The backlog of unmerged files is.
    - text: B-tree pages are splitting
      why: An LSM engine has no in-place B-tree pages.
    - text: Bloom filters stop working at high volume
      why: They keep working, but there are more files to check.
  explanation: Budget disk and CPU for compaction. If it falls behind, read amplification grows and the engine throttles writes to catch up.
- kind: fire
  prompt: In an LSM store, why can deleting lots of data temporarily make reads slower and use more space?
  choices:
    - text: Deletes write tombstones; old values and tombstones remain until compaction, and reads must skip past them
      correct: true
    - text: Deletes rewrite every file immediately
      why: Files are immutable. Deletes are just new writes.
    - text: Deleted keys are moved to a separate disk
      why: Nothing is moved. The data stays until compaction drops it.
    - text: Deletes disable Bloom filters
      why: Filters still work, but tombstones are real entries that reads must process.
  explanation: Deletion in an LSM is logical until compaction. Mass deletes create tombstone build-up — a classic Cassandra performance problem.
- kind: fire
  level: advanced
  prompt: Which compaction strategy usually gives the lowest space amplification at the cost of more write amplification?
  choices:
    - text: Leveled compaction
      correct: true
    - text: Size-tiered compaction
      why: Size-tiered rewrites less but can temporarily need about 2× space and leaves more overlapping files.
    - text: No compaction
      why: Space would grow without bound.
    - text: Compacting only on reads
      why: Real engines don't do this.
  explanation: Leveled compaction keeps non-overlapping files per level (low space, low read amplification) by rewriting data more often. Size-tiered favours write throughput.
- kind: fire
  type: multi
  prompt: Which make B-tree engines a good fit for transactional workloads? Select all that apply.
  choices:
    - text: Predictable reads along a short root-to-leaf path
      correct: true
    - text: Efficient range scans over sorted keys
      correct: true
    - text: Mature support for secondary indexes and transactions
      correct: true
    - text: The lowest possible write amplification
      why: In-place page writes plus WAL records give B-trees substantial write amplification.
  explanation: B-trees optimise reads and in-place updates. LSM trees optimise write throughput and space.
```
