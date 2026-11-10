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
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 3', 'https://dataintensive.net/']
---

> [!story] Why Cassandra writes were fast and reads weren't
> A team moved a write-heavy event store from Postgres to Cassandra and saw write latency drop and throughput jump. Months later, reads for old devices had become slow and erratic, and disk usage was double what they'd estimated. Nothing was misconfigured. They had swapped a read-optimised engine for a write-optimised one: writes became cheap appends, and the bill arrived as compaction I/O, multiple files consulted per read, and space taken by not-yet-compacted versions.

## The log comes first

Every serious database writes changes to an append-only **write-ahead log (WAL)** before touching its data structures. A commit is durable once its log record is flushed (`fsync`) to disk; the data pages or files can be updated later, and after a crash the log is replayed.

Sequential appends are fast — even on SSDs they beat scattered random writes — and batching many commits into one flush (**group commit**) lets a database sustain thousands of durable commits per second. The log also feeds replication and change-data-capture.

```sim
name: wal
key: b900
title: Write-ahead logging and crash recovery
intro: Run transactions, flush pages and crash the database at awkward moments, then watch recovery replay the log.
takeaway: |
  Commit only needs the log flushed; data pages can lag behind. After a crash, redo repeats history from the log and undo rolls back what never committed.
```

## B-trees: update in place

A B-tree engine (Postgres, MySQL InnoDB, SQL Server) stores rows and indexes in fixed-size pages and **modifies pages in place**, logging each change to the WAL first.

- **Reads:** one root-to-leaf path, about 3–4 pages, mostly cached. Predictable.
- **Writes:** a small change rewrites a whole page (later, at checkpoint), plus the WAL record, plus every affected index — real write amplification, and random I/O.
- **Space:** pages run partly empty after splits; MVCC engines like Postgres also keep dead row versions until vacuum.

Details worth knowing:

- **Shallow by design.** With a branching factor in the hundreds, three or four levels cover almost any database. One textbook example: four levels of 4 KB pages with a branching factor of 500 address roughly 256 TB.
- **Why the WAL is not optional.** A page split rewrites several pages (the two halves and the parent). A crash between those writes would leave an orphaned or inconsistent tree, so every change is logged first and replayed on restart. It also means a B-tree writes each change at least twice: once to the log, once to the page.
- **Concurrency needs latches.** Because pages change in place, threads protect the tree with lightweight locks (latches). Log-structured engines avoid this by merging in the background and swapping files atomically.
- **Common optimisations:** copy-on-write pages instead of a WAL (LMDB writes a new page and a new parent chain, which also gives cheap consistent snapshots), abbreviated keys in interior pages for a higher branching factor, sibling pointers between leaves for range scans, and efforts to lay leaves out sequentially on disk (hard to maintain as the tree grows, easier for LSM engines because they rewrite large runs).
- **One home per key.** Each key lives in exactly one place, which lets transactional engines attach key-range locks directly to the tree. That is one reason relational databases stayed with B-trees (see the transactions lesson).

```sim
name: btree
key: b901
title: B-tree inserts and page splits
intro: Insert keys and watch full pages split and the tree grow upward.
takeaway: |
  Every insert touches one root-to-leaf path. When a page overflows it splits and pushes a key to its parent, so the tree stays balanced and shallow.
```

```sim
name: slottedpage
key: b902
title: Inside a database page
intro: Insert, delete and update variable-size records and watch the page fragment, then compact.
takeaway: |
  Slots let records move within a page without changing their addresses; deleted space is reclaimed by compaction.
```

## The simplest log-structured engine: segments plus a hash index

Start with a store that only appends. Keep an in-memory hash map from every key to the byte offset of its latest value in the file; a write appends and updates the map, a read is one lookup plus one seek. This is roughly what Bitcask (Riak's original engine) does, and it suits workloads with few distinct keys and many updates per key, such as a play counter per video.

To stop the file growing forever, close it at a size limit and start a new **segment**; a background job rewrites old segments keeping only the newest value per key (and drops keys whose latest record is a **tombstone**), then swaps the compacted segment in and deletes the old ones. Real versions also need a binary format, checksums so a torn final record is detected and ignored, snapshots of the hash map so restart doesn't rescan every segment, and usually a single writer thread. Immutable append-only files make crash recovery and concurrent reads much simpler than overwriting in place.

It has two hard limits: **every key must fit in memory**, and **range scans are impossible** (you would look up each key individually). Sorting each segment by key fixes both, which is the SSTable idea below:

- Merging sorted segments is a streaming merge sort, even for files bigger than memory, and newer segments win for duplicate keys.
- A lookup needs only a **sparse** in-memory index (one key per few KB), then scans that small range; records in that range can be compressed as a block, saving disk and I/O.
- Range queries work because keys are in order.

Lucene, behind Elasticsearch and Solr, keeps its term dictionary in a similar merged-sorted-file structure, which is why a search index behaves like an LSM tree (see the search index lesson).

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
>
> Two further consequences: compaction shows up at **high percentiles** (average latency looks fine while p99 spikes when a big merge hogs the disk), so B-trees are often more predictable; and some engines do not slow incoming writes when compaction falls behind at all, so unmerged files can grow until the disk fills. You need explicit monitoring of pending compaction and file counts. Benchmarks are workload-sensitive, so test with your own traffic before choosing.

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

This split mirrors **OLTP versus OLAP**. OLTP reads a few rows by key and writes small, random, low-latency updates, over the current state of the data, at gigabytes to terabytes. Analytics scans huge numbers of rows, touches a few columns, and aggregates; it loads in bulk (ETL) or from an event stream, over history, at terabytes to petabytes. Teams run analytics in a separate **data warehouse** so that heavy scans don't hurt the transactional database, and warehouses commonly model data as a **star schema**: a central fact table (one row per event, such as a sale) pointing at dimension tables (who, what, where, when). A "snowflake" schema normalises the dimensions further.

How column stores get their speed, beyond reading fewer columns:

- **Compression.** A column with few distinct values can be stored as one bitmap per value, which can be run-length encoded when sparse. A filter like `product IN (30, 68, 69)` becomes a bitwise OR of three bitmaps, and a two-column filter a bitwise AND, because the Nth bit of every column refers to the same row.
- **Vectorised processing.** Chunks of compressed column data sit in the CPU cache and are processed in tight loops with SIMD instructions, so memory bandwidth and CPU efficiency matter as well as disk I/O.
- **Sort order.** Rows are sorted as whole rows (never one column on its own) by chosen keys, such as date first and product second. That speeds up range filters, and the first sort key compresses extremely well with run-length encoding, the later keys progressively less. Some warehouses store the same data under several sort orders, using the replicas they keep anyway.
- **Writes.** You can't update a compressed, sorted column in place, so column stores use the LSM idea: buffer writes in memory, then merge them into column files in bulk. Queries look at both and merge the results.
- **Pre-aggregation.** A **materialised view** stores the result of a query on disk (unlike a virtual view, which re-runs it). It is a denormalised copy that must be refreshed when the base data changes, which is costly for OLTP writes but fine in a read-heavy warehouse. A **data cube** is the special case of aggregates grouped along several dimensions, such as sales by date and product.

Don't confuse "column families" in Bigtable, HBase and Cassandra with column orientation: within a family, a row's columns are still stored together, and there is no columnar compression.

```sim
name: rowcol
key: b903
title: Row versus column layout
intro: Run the same query against a row store and a column store and compare the bytes read.
takeaway: |
  Analytic queries touch few columns of many rows, which is exactly what column layout makes cheap.
```

```predict
prompt: A query computes `SELECT region, sum(amount) FROM orders WHERE created_at >= '2026-01-01' GROUP BY region` over 2 billion rows with 40 columns. Roughly how much less data does a column store read than a row store?
choices:
  - About the same, since every row must still be scanned to apply the filter
  - Something like 10–100× less: it reads 3 of 40 columns, and they compress heavily
  - About 13× less (40 ÷ 3), with no further gain from compression
  - More, because each column file must be read and the rows reassembled
answer: 1
reveal: |
  It reads `region`, `amount` and `created_at` — about 3/40 of the bytes before compression — and columnar compression (dictionaries, run-length, delta encoding) often shrinks those another 5–10×. Combined with vectorised execution, that's why analytics moves to column stores or warehouses, fed from the OLTP database by CDC or batch exports.
```

```interview
ask: Which storage engine would you choose, and why, for a device-event system ingesting 300,000 events per second, supporting recent per-device queries, automatic expiry and historical analytics?
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
    - text: A commit needs only a sequential append flushed to disk; data structures are updated later from the log
      correct: true
    - text: The log is kept in memory and flushed in the background, so commits never wait on disk
      why: Then it couldn't survive a crash. The log is flushed to disk on commit.
    - text: It skips writing data pages entirely, since the log replaces the table files
      why: Data is still written, just later and in bigger batches.
    - text: It makes reads faster too, because recent writes are served straight from the log
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
    - text: The key may or may not be present; you must check the actual data
      correct: true
    - text: The key is definitely present, though it may have been deleted since
      why: False positives are possible when all the checked bits were set by other keys.
    - text: The key is definitely absent, since the filter only reports possible matches
      why: That's what a 0 bit would tell you.
    - text: The filter needs rebuilding, because it has too many keys for its size
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
    - text: Fetching one order with all its fields by ID, millions of times a day
      why: Row stores read a whole row in one place.
    - text: A shopping cart with frequent small transactions
      why: That's OLTP, which suits row-oriented engines.
  explanation: Column stores read only the needed columns and compress them heavily, which makes them ideal for wide scans and aggregation — and poor at frequent small writes.
- kind: fire
  prompt: An LSM store's reads slowed down as write volume grew, and the engine reports write stalls. What's the most likely cause?
  choices:
    - text: Compaction can't keep up, so files pile up and reads consult more of them
      correct: true
    - text: The memtable is too large, so each flush to disk takes too long
      why: Memtable speed isn't a problem. The backlog of unmerged files is.
    - text: B-tree pages are splitting as the index grows past memory
      why: An LSM engine has no in-place B-tree pages.
    - text: Bloom filters stop working at high volume, so every read checks every file
      why: They keep working, but there are more files to check.
  explanation: Budget disk and CPU for compaction. If it falls behind, read amplification grows and the engine throttles writes to catch up.
- kind: fire
  prompt: In an LSM store, why can deleting lots of data temporarily make reads slower and use more space?
  choices:
    - text: Deletes write tombstones; old values and tombstones stay until compaction, and reads skip past them
      correct: true
    - text: Deletes rewrite every file that holds the key immediately, which uses space and I/O
      why: Files are immutable. Deletes are just new writes.
    - text: Deleted keys are moved to a separate archive file, which reads must check as well
      why: Nothing is moved. The data stays until compaction drops it.
    - text: Deletes disable Bloom filters for the affected files until they are rebuilt
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
