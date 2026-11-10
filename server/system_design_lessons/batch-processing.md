---
id: batch-processing
category: queues
skill: capacity
title: Batch processing and joins at scale
minutes: 22
summary: A batch job reads a large, fixed input and produces a derived output, judged on throughput rather than response time. Its power comes from immutable inputs, so a failed task can simply be re-run. The Unix pipeline is the template; MapReduce spreads the same shape across a cluster; and the hard part is the join, where the choice of strategy and a single hot key decide whether a job takes minutes or hours.
objectives:
  - Describe the map, shuffle and reduce stages and why immutable inputs make batch jobs easy to retry
  - Choose between sort-merge, broadcast hash and partitioned hash joins from table sizes and layout
  - Explain data skew and how to split a hot key
  - Say how batch output should be written, and how dataflow engines improve on MapReduce
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 10', 'https://dataintensive.net/']
  - ['Dean & Ghemawat, MapReduce: Simplified Data Processing on Large Clusters', 'https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/']
  - ['Apache Spark: RDD programming guide (shuffle, joins)', 'https://spark.apache.org/docs/latest/rdd-programming-guide.html']
  - ['Apache Spark SQL: Join strategy hints', 'https://spark.apache.org/docs/latest/sql-performance-tuning.html#join-strategy-hints-for-sql-queries']
---

> [!story] The job stuck at 99%
> A nightly job joined a year of click events to user profiles. It normally finished in 40 minutes. One night it sat at 99% for six hours. All but one of the 200 workers were idle; the last was still working through the clicks for a single account, an automated test user that had generated more than half of all events. The join sent every record with the same key to the same worker, so the job was only as fast as that one worker. Nothing was broken. The data had a shape the job's plan couldn't handle.

## Throughput, not response time

A **batch job** takes a large, bounded input, runs for minutes or hours, and writes an output. Nobody waits at a screen for it, so the measure is **throughput**: records processed per second, or how long the whole job takes for a given input size. It is the offline counterpart of an online service (which answers requests with low latency) and of a stream processor (which handles unbounded input continuously).

Batch jobs build the *derived* data of a system: search indexes, recommendation models, reports, aggregated tables, data warehouse loads. They are the right tool when "an hour old" is acceptable, and the easiest kind of processing to get right, for one reason.

> [!senior] Immutable input makes retries free
> A batch job reads its input and never modifies it, and it writes its output as a whole when it finishes. If a task crashes you can run it again and get the same answer, and if you discover a bug you can fix the code and re-run the entire job. That "human fault tolerance", being able to recover from a bad deploy by re-running, is hard to get from a system that updates data in place.

## The Unix pipeline is the template

The shape is older than distributed computing. Finding the five most-requested URLs in an access log:

```
cat access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head -5
```

Each program does one thing, reads input and writes output as plain lines, never changes its input, and can be swapped or tested alone. Pipes connect them without anyone writing intermediate files by hand. The same ideas carry over: a uniform interface, composable stages, and inputs that are left alone. (`sort` even spills to disk and runs in parallel when the data is bigger than memory, which is the same trick a cluster uses.)

## MapReduce: the same shape across machines

MapReduce spreads that pipeline over a cluster. A job reads records from a distributed file system (HDFS originally; today more often files in object storage), and runs three steps:

1. **Map.** A function runs on each input record independently and emits zero or more key–value pairs. In word count, `"to be or not"` emits `(to,1) (be,1) (or,1) (not,1)`. Map tasks run on many machines, each on a slice of the input.
2. **Shuffle.** The framework groups all pairs with the same key together, sending each key to one reducer machine, then sorts them.
3. **Reduce.** A function receives one key and all its values and emits results: the key's total count, say.

```sim
name: mapreduce
key: b930
title: MapReduce, step by step
intro: Run a word count through map, shuffle and reduce, and see where the data moves.
```

Two properties explain why it scales. Map and reduce tasks don't talk to each other during a stage, so a framework can run thousands in parallel. And a failed task is re-run from its inputs. The expensive part is the shuffle: all the data for a key has to cross the network to meet at one place.

```order
prompt: Order the stages of a MapReduce job.
items:
  - The job reads input blocks from the distributed file system
  - Map tasks emit key–value pairs from each record
  - The framework partitions pairs by key and sends them to reducers
  - Each reducer sorts and groups the values for its keys
  - Reduce tasks combine each key's values and write output files
  - Output files are published as the job's result
explain: Data is read locally where possible, mapped independently, moved once by key, then reduced independently. Output becomes visible only after the job completes.
```

## Joins: where batch jobs win or lose

Most useful batch jobs join datasets: click events with user profiles, orders with products. Records that must be combined live on different machines. There are three main strategies.

- **Sort-merge join (reduce-side).** Mappers tag each record with the join key and its source; the shuffle brings every record with the same key (from both tables) to the same reducer, which sees them together and combines them. It works on any inputs, however large, but shuffles **both** tables across the network.
- **Broadcast hash join (map-side).** If one table is small enough to fit in memory, copy it to every worker. Each worker loads it into a hash table and streams its slice of the big table past it, joining locally. **Nothing from the big table moves.** It only works when the small side fits.
- **Partitioned hash join (map-side).** If both tables were already partitioned the same way by the join key, and the partition count matches, each worker joins just its own pair of partitions with no shuffle. It depends on an earlier job having laid out the data to match.

```sim
name: batchjoin
title: Which join strategy wins?
intro: Change the table sizes, the cluster, and how lopsided the data is. The bars show how long the slowest worker takes.
challenges:
  - {text: 'Find a setup where the broadcast hash join is fastest', metric: best, op: '==', value: broadcast}
  - {text: 'Make the small table too big for worker memory so broadcast is impossible', metric: broadcastOk, op: '==', value: 0}
  - {text: 'Add a 60% hot key and confirm that splitting the hot key beats plain sort-merge', metric: skewedBeatsSort, op: '==', value: 1, and: [{metric: skew, op: '>=', value: 60}]}
takeaway: |
  When one side is small, broadcast avoids shuffling the big table altogether. When both are huge, a shuffle is unavoidable, and then skew decides the finish time: every record for the hot key lands on one worker, which becomes the straggler for the whole job. Spreading the hot key's records across workers, and copying its one small-table row to each, brings the job back to the average.
```

### Skew: one key, one worker

Data is rarely uniform. A few accounts, products or pages produce most of the records. With key-based partitioning, **every record for a key goes to one worker**, so the job finishes only when the unluckiest worker does. Remedies:

- **Detect and split hot keys.** Sample the data to find them. Spread each hot key's records over several workers (a random sub-key) and replicate the small side's matching row to all of them. Spark's adaptive execution and Pig's skewed join do this automatically.
- **Pre-aggregate in the map stage** (a *combiner*), so a hot key sends one partial count per mapper, not millions of records.
- **Handle the extreme keys separately**, for example, filter out test or bot traffic in a first pass.

```predict
prompt: A join sends clicks to 100 reducers by user ID. One user accounts for 60% of 1 billion clicks. Roughly how long does the job take compared with perfectly even data?
choices:
  - About the same, because 99 reducers share the other 40% between them
  - Around 60 times longer, since one reducer gets 60% of the data instead of 1%
  - About twice as long, because the hot key doubles the average load on a reducer
  - It fails immediately, because no single key can be larger than one partition
answer: 1
reveal: |
  Even data would give each reducer 1% of the records. The hot reducer gets 60%, which is sixty times its fair share, and the whole job waits for it. The other 99 reducers finish early and sit idle. That is why average utilisation of the cluster can be low while the job still runs for hours.
```

```calc
title: How much does a reduce-side join move?
prompt: A sort-merge join combines 1 billion click records of 100 bytes with 1 million user records of 200 bytes. Both tables are shuffled in full. Roughly how many gigabytes cross the network?
answer: 100.2
unit: GB
tolerance: 1.1
steps: |
  Clicks: 1,000,000,000 × 100 B = 100 GB. Users: 1,000,000 × 200 B = 0.2 GB. Total ≈ **100.2 GB**. A broadcast join would instead copy the 0.2 GB user table to each of, say, 100 workers (20 GB in total) and move none of the clicks. When one side is small, that's several times less network traffic, and no sort.
```

## Writing the output

A batch job that writes to a production database record by record is a hazard. Network round trips to the database slow the job to a crawl, thousands of parallel tasks can overwhelm it, and if the job fails midway the database holds partial results. Better:

- **Write files, then publish atomically.** Tasks write to their own output files, and the job makes them visible only after every task succeeds. A failed task leaves nothing behind and is simply re-run.
- **Build the index or model offline, then swap it in.** Search indexes, key-value stores and read-only lookup tables can be produced as files by the job and loaded into the serving system in one step, replacing the old version.
- **Keep the old output until the new one is verified.** If the new results look wrong, switch back.

## Beyond MapReduce

MapReduce writes the output of every stage to the distributed file system, even when the next stage is the only reader. For a multi-step workflow, that is a lot of I/O, and each step waits for the previous one to finish completely. **Dataflow engines** (Spark, Flink, Tez) treat the whole workflow as one graph of operators, keep intermediate data in memory or on local disk, pipeline between stages where possible, and recompute lost partitions from their lineage if a machine dies. Most new batch work uses them, usually through SQL or a DataFrame API, over files in object storage. **Graph algorithms** (PageRank and friends) run in iterations where each vertex sends messages to its neighbours, in the bulk-synchronous model of Pregel.

```arch
title: A nightly batch pipeline
nodes:
  - {id: src, label: Events and exports, kind: client, x: 0, y: 1, note: 'raw, immutable'}
  - {id: lake, label: Object storage, kind: db, x: 1, y: 1, note: 'files by date'}
  - {id: job, label: Spark job, kind: service, x: 2, y: 1, note: 'join, aggregate'}
  - {id: out, label: Output files, kind: db, x: 3, y: 0, note: 'written whole'}
  - {id: idx, label: Search index build, kind: service, x: 3, y: 2}
  - {id: serve, label: Serving store, kind: cache, x: 4, y: 1, note: 'swapped atomically'}
edges:
  - [src, lake, 'land raw data']
  - [lake, job, 'read']
  - [job, out, 'write']
  - [out, serve, 'publish']
  - [lake, idx, 'read']
  - [idx, serve, 'publish']
paths:
  - label: A successful night
    steps:
      - [src, lake, 'Raw events and exports are appended to dated files and never modified.']
      - [lake, job, 'The job reads the day''s files and joins them with the user table.']
      - [job, out, 'Tasks write their parts, which stay hidden until all of them finish.']
      - [out, serve, 'The serving store switches to the new version in one step. The old version is kept for rollback.']
  - label: A task fails
    steps:
      - [lake, job, 'One task dies halfway through its slice.']
      - [job, out, 'Its partial output is discarded. The task is re-run from the same immutable input and writes the same result.']
```

```sort
prompt: Which join strategy fits each situation?
buckets: [Sort-merge (reduce-side), Broadcast hash, Partitioned hash]
items:
  - {text: 'Join 10 TB of events with a 50 MB list of country codes', bucket: 1, why: 'One side is tiny, so copy it to every worker and avoid shuffling the 10 TB.'}
  - {text: 'Join two 5 TB tables that have no particular layout', bucket: 0, why: 'Neither fits in memory and nothing is pre-partitioned, so shuffle both by key.'}
  - {text: 'Join two tables that an earlier job already bucketed by the same key into 512 matching partitions', bucket: 2, why: 'Matching partitions can be joined locally, with no shuffle.'}
  - {text: 'Join clicks with a 2 GB product catalogue on workers that have 16 GB of memory', bucket: 1, why: 'The catalogue fits, so broadcast it.'}
```

```bug
title: A job that loads its result row by row
prompt: This nightly job aggregates a day of events and loads the results straight into the production database. Which lines are risky?
lang: python
code: |
  def nightly(events, db):
      totals = aggregate_by_user(events)          # runs on the cluster
      for user, total in totals.items():
          db.execute("UPDATE users SET daily_total = %s WHERE id = %s", total, user)
      db.commit()
bug: [3, 4, 5]
explain: |
  **Lines 3–4** issue one network round trip per user (potentially hundreds of millions), which slows the job and can overload the database. **Line 5** commits only once at the end, so a crash midway leaves a huge open transaction or, if committed in pieces, partial results. Write the output as files, load them in bulk into a new table, and swap it in only after it is complete and checked.
fix: |
  def nightly(events, storage, db):
      totals = aggregate_by_user(events)
      path = storage.write_parquet(totals, "daily_totals/2026-11-10/")   # tasks write their own parts
      db.bulk_load("users_daily_totals_new", path)                        # one bulk load
      db.swap_tables("users_daily_totals", "users_daily_totals_new")      # atomic switch, old table kept
```

```faded
title: Fill in the batch facts
prompt: Fill each gap from memory.
text: |
  Batch jobs are judged on [[throughput|response time|availability]], and are easy to retry because their input is [[immutable|sorted|replicated]].

  A join in which every worker receives a copy of the small table is a [[broadcast hash|sort-merge|partitioned hash]] join.

  When one key has most of the records, the worker that receives it becomes a [[straggler|combiner|shuffler]].

  A job should write its output as [[files published atomically|row-by-row updates to production|many small commits]].
explain: Throughput and immutability are what make batch simple. Strategy choice and skew handling decide how long it takes, and atomic publication keeps failures from leaking out.
```

```recall
prompt: A nightly job joins 2 billion events to a 3 GB user table and one account has half the events. Explain how you would make it fast and safe.
points:
  - The user table is small enough to broadcast, so use a broadcast hash join and avoid shuffling the events
  - If a shuffle is needed, skew puts the hot account's records on one worker, so split the hot key across workers and replicate its row
  - Pre-aggregate in the map stage to cut the data sent for the hot key
  - Write output as files published atomically, so a failed run leaves nothing and can be re-run
model: |
  3 GB fits in memory on typical workers, so I'd broadcast the user table to every worker and stream the events past it. That removes the shuffle of 2 billion events and, because no records are routed by key, it also removes the skew problem from the hot account. If the user table were too big, a sort-merge join would send half the events to one reducer, so I'd detect the hot key, spread its records across many workers with a random sub-key and copy its user row to each, and use a combiner to pre-aggregate counts per mapper. The result goes to files in a new location, published atomically after the job completes, so a failure can't leave partial data and a bad run can be rolled back by switching to the previous version.
```

```interview
ask: A nightly report takes 6 hours and is growing. Where do you look and what do you change?
say: |
  "First I'd find where the time goes: a job that sits at 99% usually has a straggler, so I'd check the per-task durations and the largest partition by key. If one key is hot, I'd split it across workers and pre-aggregate before the shuffle. Then I'd look at the joins, since a small table joined with a shuffle should be broadcast instead, and at whether I'm shuffling more columns than I need. I'd also check whether stages write and re-read big intermediate files, which a dataflow engine like Spark avoids. For the output I'd write files and swap atomically rather than updating production tables. If the real need is fresher data, I'd consider making the expensive aggregates incremental with a stream."
followups:
  - q: How do you find a hot key?
    a: Sample the data, or look at the per-task input sizes after a shuffle. One task with far more data than the median points at a hot key.
  - q: Why not just add more workers?
    a: The hot key still goes to a single worker, so extra capacity sits idle. The remedy is changing how the key is distributed.
  - q: Why write output as files rather than directly to the database?
    a: Parallel row-by-row writes overload the database and leave partial results on failure. Files can be written in parallel, verified, and published in one step.
weak: |
  "Give the cluster more machines." Ignores skew, join strategy and output handling.
strong: |
  Diagnoses the straggler, picks the join strategy from table sizes, splits hot keys, avoids needless materialisation and publishes output atomically.
```

```questions
- kind: check
  prompt: Why are batch jobs generally simpler to make fault tolerant than online services?
  choices:
    - text: Inputs are immutable, so a failed task can be re-run for the same output
      correct: true
    - text: They run on faster hardware with more redundancy than the machines serving online traffic
      why: Hardware does not change the retry property.
    - text: They never fail, because their tasks are short and the cluster is lightly loaded at night
      why: Tasks fail constantly at scale. Retrying is cheap.
    - text: They need no durable storage, since results are recomputed whenever somebody asks
      why: They read and write large amounts of data.
  explanation: Immutable input plus atomic publication of output means a re-run is safe, and a bug can be fixed by running the whole job again.
- kind: check
  prompt: In MapReduce, what does the shuffle do?
  choices:
    - text: Sends all pairs with one key to the same reducer
      correct: true
    - text: Reads the input blocks from the distributed file system and hands them to mappers
      why: That is the input stage.
    - text: Applies the map function to every record held in a worker's local input slice
      why: That is the map stage.
    - text: Writes the final output files and publishes them once every reducer has finished
      why: That is the end of the reduce stage.
  explanation: Shuffling brings together everything needed to compute one key's result. It is the network-heavy part of the job.
- kind: check
  prompt: You join 5 TB of events to a 100 MB lookup table on workers with 8 GB of memory. Which strategy is usually best?
  choices:
    - text: Broadcast hash join
      correct: true
    - text: Sort-merge join
      why: It would shuffle all 5 TB for no reason.
    - text: Partitioned hash join without prior partitioning
      why: Partitioned joins need matching pre-partitioned inputs.
    - text: Cartesian product
      why: Far too expensive.
  explanation: The small table fits in memory on every worker, so copy it everywhere and join locally with no shuffle of the big table.
- kind: check
  type: multi
  prompt: Which actions reduce the impact of a hot key in a reduce-side join? Select all that apply.
  choices:
    - text: Spread the hot key's records over several workers and replicate its row from the other table
      correct: true
    - text: Pre-aggregate in the map stage with a combiner
      correct: true
    - text: Process the hot key in a separate pass
      correct: true
    - text: Increase the number of reducers without changing the partitioning
      why: The hot key still lands on a single reducer.
  explanation: Skew is solved by changing how the hot key is distributed or by shrinking its data early, not by adding capacity.
- kind: check
  prompt: Why is writing a batch job's results to a production database one row at a time a bad idea?
  choices:
    - text: It is slow, can overload the database and leaves partial results on failure
      correct: true
    - text: Databases cannot accept batch writes of any size, so row by row is the only option
      why: They can, in bulk, which is the better approach.
    - text: It uses too little parallelism, since only a single worker may write at once
      why: Often the opposite: too many parallel writers.
    - text: It breaks the immutability of the job's input files while the load is running
      why: The input is not being modified.
  explanation: Produce files, publish atomically and load in bulk, so failure leaves nothing half-written.
- kind: fire
  prompt: What is the main cost of a sort-merge join?
  choices:
    - text: Shuffling both tables over the network
      correct: true
    - text: Loading one whole table into memory on every worker before the join starts
      why: That is the broadcast join's constraint.
    - text: Requiring both inputs to have been partitioned the same way by an earlier job
      why: That is the partitioned join.
    - text: Keeping every intermediate result in memory until the final stage completes
      why: Not the main cost.
  explanation: Everything with the same key must meet at one reducer, so both inputs cross the network.
- kind: fire
  prompt: With 100 reducers and one key holding 50% of the records, what share of the data does one reducer receive?
  choices:
    - text: About 50%, plus its normal 1%
      correct: true
    - text: About 1%, the same share as for any other reducer under even hashing
      why: That is even distribution.
    - text: About 10%, since the framework rebalances oversized keys automatically
      why: It does not.
    - text: About 100%, because the other keys are routed to the hot reducer too
      why: The other keys still go elsewhere.
  explanation: All of the hot key's records land on one reducer, so it gets roughly half the data and sets the job's finish time.
- kind: fire
  prompt: What advantage do dataflow engines like Spark have over classic MapReduce?
  choices:
    - text: Intermediate results stay in memory or local disk
      correct: true
    - text: They need no input data, because operators generate their own records
      why: They still read data.
    - text: They remove the need for fault tolerance by never losing a machine
      why: They recompute lost partitions from lineage.
    - text: They only work on streams, and cannot process a fixed batch input
      why: They run batch workloads too.
  explanation: Avoiding the materialisation of every intermediate result, and pipelining stages, speeds up multi-step workflows.
- kind: fire
  type: order
  prompt: Order these join strategies by how much data they move across the network at run time, most to least.
  items:
    - Sort-merge join (both tables shuffled)
    - Broadcast hash join (small table copied to every worker)
    - Partitioned hash join on pre-partitioned inputs
  explanation: A sort-merge join shuffles both tables, a broadcast join copies only the small table to each worker, and a partitioned join on matching layouts moves nothing at run time because the earlier job already did the work.
- kind: fire
  prompt: How should a batch job publish its results?
  choices:
    - text: Write files, then make them visible atomically once every task succeeds
      correct: true
    - text: Each task updates the production table as soon as it finishes its own slice
      why: A failure leaves partial results.
    - text: Overwrite the previous output files in place while the tasks are still running
      why: Readers would see a mix of old and new.
    - text: Publish only the first finished task's output and discard the rest of the job
      why: Incomplete.
  explanation: Atomic publication means a failed run leaves nothing visible and is simply re-run.
```
