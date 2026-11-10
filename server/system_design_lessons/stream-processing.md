---
id: stream-processing
category: queues
skill: retries
title: Stream processing
minutes: 22
summary: A stream processor turns an endless log of events into running aggregates, alerts and continuously updated views. Getting it right means choosing which clock to trust (when events happened, not when they arrived), joining streams against changing data, and surviving crashes without losing or duplicating effects. "Exactly once" is really effectively once, achieved with checkpoints, idempotent outputs or atomic commits.
objectives:
  - Choose event time over processing time and pick tumbling, hopping, sliding or session windows
  - Explain stream–stream, stream–table and table–table joins and the time problem in each
  - Compare micro-batching and checkpointing, and say what "exactly once" really guarantees
  - Make external effects safe across restarts with idempotent writes or atomic commits
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 11', 'https://dataintensive.net/']
  - ['Akidau et al., The Dataflow Model (VLDB 2015)', 'https://research.google/pubs/the-dataflow-model-a-practical-approach-to-balancing-correctness-latency-and-cost-in-massive-scale-unbounded-out-of-order-data-processing/']
  - ['Apache Flink: Stateful stream processing and checkpoints', 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/']
  - ['Apache Kafka documentation: Message delivery semantics', 'https://kafka.apache.org/documentation/#semantics']
---

> [!story] The counter that counted twice
> A team counted ad clicks per campaign with a stream job that incremented a row in a database for each event and committed its Kafka offset every 30 seconds. A routine deploy killed the job mid-interval. On restart it resumed from the last committed offset and reprocessed up to half a minute of clicks. Every campaign's count jumped, advertisers were billed for clicks that never happened, and the invoices could not be explained from the data. Nothing was wrong with Kafka or the database. The job's effects and its progress marker were two separate things that could disagree.

## What a stream processor is

An event stream is an unbounded sequence of facts, usually a partitioned log you can replay (see the event streams lesson). A **stream processor** reads one or more streams continuously and writes derived results somewhere: a database table, a search index, another stream, an alert. Typical uses:

- **Analytics**: counts, rates and percentiles over the last minute, updated as events arrive.
- **Detection**: fraud patterns or thresholds, such as "five failed logins from one IP in two minutes".
- **Derived views**: a materialised view, cache or search index kept up to date from a database's change log.
- **Enrichment and routing**: attach a user's profile to each event, or split traffic by type.

A batch job re-runs when it fails, because its input is immutable and its output only appears when it finishes. A stream never finishes. That one difference is where nearly all the difficulty comes from.

```arch
title: A typical stream pipeline
nodes:
  - {id: app, label: Application, kind: service, x: 0, y: 0}
  - {id: db, label: Orders database, kind: db, x: 0, y: 2, note: 'source of truth'}
  - {id: log, label: Event log, kind: stream, x: 1, y: 1, note: 'partitioned, replayable'}
  - {id: proc, label: Stream processor, kind: service, x: 2, y: 1, note: 'windows, joins, state'}
  - {id: view, label: Dashboard store, kind: db, x: 3, y: 0, note: 'running counts'}
  - {id: idx, label: Search index, kind: db, x: 3, y: 1}
  - {id: alert, label: Alerts, kind: service, x: 3, y: 2}
edges:
  - [app, log, 'click events']
  - [db, log, 'change data capture']
  - [log, proc, 'read from offset']
  - [proc, view, 'per-minute counts']
  - [proc, idx, 'updates']
  - [proc, alert, 'thresholds']
paths:
  - label: A click becomes a count
    steps:
      - [app, log, 'The click is appended to a partition chosen by campaign ID, so one campaign stays in order.']
      - [log, proc, 'The processor reads it and adds it to the current one-minute window for that campaign.']
      - [proc, view, 'When the window closes (or periodically) the result is written to the dashboard store.']
  - label: A database change becomes an index update
    steps:
      - [db, log, 'Change data capture turns each committed row change into an event.']
      - [log, proc, 'The processor reads the change in commit order.']
      - [proc, idx, 'It updates the search document. Replaying the log rebuilds the index from scratch.']
```

## Time: when it happened, not when you saw it

Aggregating "per minute" raises the question: which minute? **Processing time** (when the processor sees an event) is simple but wrong whenever there is a delay. After a restart or a backlog, hours of old events arrive in a burst and are all counted in the current minute. **Event time** (when it actually happened, stamped by the source) gives the correct answer but forces you to deal with events that arrive late.

- **Stragglers.** When have you seen every event for 10:03? You can't know. A **watermark** is a bet: "no more events older than T are coming." Late arrivals past the watermark are either dropped (and counted, so you know the cost) or used to publish a correction to the earlier result.
- **Untrustworthy device clocks.** A phone's clock may be minutes off, or set deliberately wrong. One remedy is to record three timestamps: when the event happened and when it was sent (both by the device's clock) and when the server received it (the server's clock). The difference between the last two estimates the device's offset, which you subtract from the first.

**Window shapes**, by how events are grouped:

| Window | Shape | Example |
|---|---|---|
| **Tumbling** | Fixed length, no overlap | Orders per calendar minute |
| **Hopping** | Fixed length, overlapping (a 5-minute window every minute) | A moving average smoothed over 5 minutes, refreshed each minute |
| **Sliding** | Every event within some interval of another | "Two failed logins within 60 seconds of each other" |
| **Session** | No fixed length: events grouped until a gap of inactivity | One visit to a site, ended by 30 minutes of silence |

```sim
name: streamwindow
key: b920
title: Windows over a stream of events
intro: Feed events in, some of them late, and compare tumbling, sliding and session windows with a watermark.
takeaway: |
  Windows group events by when they happened, not when they arrived. The watermark is your bet on how late data can be, and it decides what you drop or correct.
```

```sort
prompt: Which window fits each question?
buckets: [Tumbling, Hopping, Sliding, Session]
items:
  - {text: 'Requests served in each clock-minute, for a billing report', bucket: 0, why: 'Fixed, non-overlapping buckets that line up with the calendar.'}
  - {text: 'A 10-minute moving average of latency, recomputed every minute', bucket: 1, why: 'Fixed length, but successive windows overlap.'}
  - {text: 'Flag any card used in two countries within 5 minutes', bucket: 2, why: 'The window is relative to each event, not the clock.'}
  - {text: 'Group a user''s clicks into a visit, ending after 30 idle minutes', bucket: 3, why: 'The length depends on the data. A gap of inactivity closes it.'}
  - {text: 'Revenue per hour for the finance dashboard', bucket: 0, why: 'Calendar-aligned and non-overlapping.'}
```

## Joins in a stream

Joining is harder when both sides keep changing.

- **Stream–stream (window) join.** Match events from two streams that occur close together in time: a search followed within an hour by a click on one of its results. The processor buffers recent events from each side, keyed by the join key (such as the session ID), and expires them when the window closes. A search with no click inside the window is itself a result: an unclicked search.
- **Stream–table (enrichment) join.** Attach reference data to each event, such as the user's plan or country. Querying a remote database for every event is slow and risks overload. Instead the processor keeps a **local copy of the table**, loaded from a snapshot and then kept current by reading the table's change log. The catch is time: if the table changes, which version should an old event join against? Re-running the job later could give a different answer. Some systems keep versioned rows so reprocessing is repeatable.
- **Table–table join.** Both inputs are change logs of tables, and the output is a **materialised view** of the join that the processor keeps up to date: each change on either side updates the affected output rows. A social feed built from "who follows whom" and "who posted what" is this shape.

```timeline
title: Enriching events with a local table copy
lanes: [Event stream, Processor, Users change log]
state: {'Local copy of user 7': 'plan = free'}
steps:
  - {lane: Event stream, to: Processor, text: 'click(user 7) → joined with plan = free'}
  - {lane: Users change log, to: Processor, text: 'user 7 upgraded: plan = pro', set: {'Local copy of user 7': 'plan = pro'}}
  - {lane: Event stream, to: Processor, text: 'click(user 7) → joined with plan = pro'}
  - {lane: Event stream, to: Processor, text: 'a delayed click from before the upgrade arrives → joined with plan = pro ⚠'}
find:
  prompt: Which step shows the time problem of stream–table joins?
  answer: 3
  explain: |
    The delayed click happened while the user was on the free plan, but the local copy now says pro, so the event is joined against the wrong version of the table. Fixes are to keep timestamped versions of each row and join on event time, or to accept the error where it doesn't matter. This is the same "slowly changing dimension" problem data warehouses know.
```

## Surviving a crash

A batch task that fails is simply retried, and its half-written output is discarded. In a stream there is no "finished", so frameworks use one of two ideas:

- **Micro-batching.** Cut the stream into small blocks (about a second, in Spark Streaming) and treat each as a tiny batch job. A failed block is re-run. The block size is a compromise: smaller means more scheduling overhead, larger means more delay. It also makes the window length equal to the batch size, by processing time.
- **Checkpointing.** Periodically save the processor's state and its position in the input to durable storage, with markers flowing through the stream to keep them aligned. After a crash, restart from the last checkpoint and discard output produced since (Flink works this way).

Inside the framework, both give results *as if* each event had been processed once. The honest name is **effectively once**: the work may run twice, but the visible effect happens once. That promise stops at the framework's edge. A database write, an email or a call to another service made by the restarted work **happens again**, which is exactly what went wrong in the opening story.

```sim
name: replay
title: Crash the processor and see what the world sees
intro: Each event has an external effect such as an email or a payment. Pick a delivery strategy, move the crash, and watch which events get lost or repeated.
challenges:
  - {text: 'Find a strategy that loses events when the processor crashes mid-batch', metric: lost, op: '>=', value: 1}
  - {text: 'Find a strategy that repeats effects after a crash', metric: duplicated, op: '>=', value: 1}
  - {text: 'Get exactly-once results with a batch size of 5 or more and a crash mid-batch', metric: exact, op: '==', value: 1, and: [{metric: every, op: '>=', value: 5}]}
takeaway: |
  Committing the offset before processing loses the in-flight work. Committing after replays it, so effects repeat. Two ways make the replay harmless: make the effect idempotent (the sink recognises an event it has already applied) or commit the effects and the offset together, so a crash rolls both back. Smaller batches shrink the window of repeated work but never remove it.
```

Two ways to make restarts safe:

- **Idempotent output.** Make applying an event twice the same as once. Setting a value is idempotent; incrementing a counter is not. For effects you can't make idempotent, carry a unique event ID (or the input offset) with the write and have the destination ignore IDs it has already seen. This is cheap and works across systems.
- **Atomic commit.** Make the state change, the output messages and the advance of the input offset one transaction, so a crash leaves all or none. Within a single framework this is practical (Kafka transactions, Google Dataflow); across independent systems it needs distributed transactions, which are expensive and fragile.

```calc
title: How much work does a crash replay?
prompt: A stream job takes a checkpoint every 10 seconds and processes 20,000 events per second. It crashes just before the next checkpoint. Roughly how many events are processed a second time after restart?
answer: 200000
unit: events
tolerance: 1.05
steps: |
  The job restarts from the last checkpoint, so it redoes everything since: up to 10 s × 20,000 events/s = **200,000 events**. Their effects inside the framework are rolled back, but any external write they made happens again unless it was idempotent. A shorter checkpoint interval shrinks the replay, at the cost of more checkpointing overhead.
```

```bug
title: A consumer that counts clicks
prompt: This consumer reads click events and updates campaign totals in a database. Which lines break the totals when the process restarts?
lang: python
code: |
  def run(consumer, db):
      for batch in consumer.poll(max_records=500):
          for click in batch:
              db.execute("UPDATE campaigns SET clicks = clicks + 1 WHERE id = %s", click.campaign)
          # commit the offset every 30 seconds
          if time.time() - last_commit > 30:
              consumer.commit()
              last_commit = time.time()
bug: [4, 6]
explain: |
  **Line 4** is a non-idempotent increment, so reprocessing the same event adds one again. **Line 6** commits progress on a timer, separately from the database write, so a crash replays up to 30 seconds of clicks. Fix it by storing the offset (or an event ID) in the same database transaction as the increment, or by making the write idempotent: record each click ID in a table with a unique key and count those rows.
fix: |
  def run(consumer, db):
      for batch in consumer.poll(max_records=500):
          with db.transaction():
              for click in batch:
                  db.execute("INSERT INTO clicks (id, campaign) VALUES (%s, %s) ON CONFLICT DO NOTHING", click.id, click.campaign)
              db.execute("UPDATE consumer_offsets SET position = %s WHERE partition = %s", batch.end_offset, batch.partition)
```

## State and reprocessing

Windows, joins and counters all need **state**. Keeping it in a remote database per event is slow, so processors usually keep it locally (in memory or an embedded store) and make it durable by logging changes to a compacted topic or by taking checkpoints. After a failure the state is rebuilt from the changelog.

The same property gives you a powerful way to fix mistakes. Because the input is a retained, ordered log, you can deploy new processing code, point it at the log from the beginning, build a new output alongside the old one, check it, and cut over. There is no in-place migration. It needs enough retention to hold the history, and enough capacity to chew through it while live traffic keeps arriving.

> [!senior] Streams versus batch is a spectrum
> Micro-batches, checkpoints and windows all blur the line. Choose by latency need, not fashion: if "an hour old" is fine, a periodic batch job is simpler to operate and easy to re-run. Use a stream when decisions must happen within seconds, or when you'd otherwise rebuild a view from scratch every few minutes.

```order
prompt: Order what happens when a checkpointing stream job crashes and recovers.
items:
  - The processor takes a checkpoint of its state and input position
  - It processes more events and produces output
  - It crashes before the next checkpoint
  - A new instance loads the last checkpoint's state and input position
  - It reprocesses events since that checkpoint, with output since then discarded or made idempotent
  - It catches up to the live end of the stream
explain: Recovery restores state and position together, then replays. Whether the replay's side effects are harmless depends entirely on idempotence or atomic commit at the output.
```

```faded
title: Fill in the stream facts
prompt: Fill each gap from memory.
text: |
  Counting per minute by [[event time|processing time|arrival time]] gives correct results after a backlog, at the cost of handling [[stragglers|checkpoints|joins]] with a watermark.

  A session window ends after a [[gap of inactivity|fixed length|checkpoint]].

  A stream–table join keeps a [[local copy of the table updated from its change log|remote query per event|cached row from the first event]].

  A checkpointing job that crashes redoes work since its last checkpoint, so its external writes must be [[idempotent|larger|synchronous]].
explain: Event time, watermarks, change-log-backed local tables and idempotent writes are the four things that make stream results correct.
```

```recall
prompt: A stream job computes per-minute revenue and writes it to a database. Explain how it can be made correct across a crash, and what "exactly once" really means.
points:
  - Aggregate by event time with a watermark, handling late events by dropping or correcting
  - On restart the job reprocesses events since its last checkpoint or committed offset, so writes can repeat
  - Make the write idempotent (upsert keyed by window, or dedupe by event ID) or commit the result and the offset atomically
  - The phrase exactly once really means effectively once: the framework's internal state is consistent, but external side effects need idempotence or transactions
model: |
  I would window by event time, using a watermark to decide when a minute is complete and either dropping or issuing corrections for later events. The job checkpoints state and input position, so after a crash it resumes from the last checkpoint and redoes the events since then. Inside the framework that gives results as if each event were processed once, but writes to the database would repeat, so I'd write the revenue for a window as an upsert keyed by (window, campaign), which gives the same result when applied twice, or store the offset in the same transaction as the write. That is what "exactly once" really means: the work may run more than once, and idempotence or an atomic commit makes the effect happen once.
```

```interview
ask: Design a pipeline that shows, within five seconds, the number of orders per product in the last ten minutes, and survives deploys without miscounting.
say: |
  "Orders are emitted to a partitioned log keyed by product ID, so each product's events are ordered and one partition owns it. A stream processor keeps a 10-minute hopping window, one-minute hop, by event time, with a watermark of about 30 seconds for late events. State lives locally and is checkpointed, so a deploy restarts from the last checkpoint. Results go to a dashboard store as an upsert keyed by (product, window end), so a replay after restart just overwrites the same rows. If I need a correction for very late events, I'd publish an updated row for that window. I'd monitor consumer lag and watermark delay, and keep a week of log retention so I can fix bugs by reprocessing."
followups:
  - q: Why not count in the database with an increment per event?
    a: A restart replays events, and an increment isn't idempotent, so the count drifts. An upsert of the window's total, or a deduped insert per event, is safe.
  - q: What if an event arrives an hour late?
    a: Past the watermark it is either dropped and counted as lateness, or applied as a correction to the old window. Which one depends on whether the dashboard can show restatements.
  - q: How do you roll out a bug fix to the counting logic?
    a: Run the new version from the start of retained log into a new output table, compare it with the live one, then switch readers over.
weak: |
  "Use Kafka and a consumer that increments a counter in Redis." Ignores event time, restarts and duplicate effects.
strong: |
  Chooses event time and a watermark, sizes the hop and window to the question, makes the sink idempotent or transactional, and plans reprocessing from the log.
```

```questions
- kind: check
  prompt: A stream job counts events per minute using the time the processor receives each event. After a 20-minute outage the backlog is processed quickly. What goes wrong?
  choices:
    - text: Twenty minutes of events are all counted in the current minute
      correct: true
    - text: Nothing goes wrong, because the replayed events keep their original order
      why: Order is kept, but each falls into the minute it arrived.
    - text: The events are dropped as duplicates of ones that were processed before
      why: Duplicates are not involved here.
    - text: The consumer offsets are reset to the beginning of the topic by the broker
      why: Offsets are unaffected by how time is assigned.
  explanation: Event time puts each event in the minute it happened. Processing time attributes a whole backlog to the moment it was read.
- kind: check
  prompt: What is a watermark in stream processing?
  choices:
    - text: A bet that no events older than T will still arrive
      correct: true
    - text: A snapshot of the processor's state taken so it can restart after a crash
      why: That is a checkpoint.
    - text: A unique ID attached to each event so the sink can drop duplicates
      why: That is an event ID.
    - text: The position where the consumer's offset is last committed to the broker
      why: Offsets track position, not event-time completeness.
  explanation: It balances waiting for late events against how soon results appear. Events after the watermark are dropped or trigger corrections.
- kind: check
  prompt: Why does a stream–table join keep a local copy of the table instead of querying the database for each event?
  choices:
    - text: Per-event remote queries are slow, so the copy follows the change log
      correct: true
    - text: Databases cannot be queried at all from inside a stream processor
      why: They can, it just does not scale.
    - text: A local copy makes the join deterministic regardless of event timing
      why: It still depends on which version of the table an event sees.
    - text: Change logs are always far smaller than the table they describe
      why: Size is not the reason.
  explanation: A local, change-log-fed copy gives fast lookups at stream speed. The remaining problem is choosing which version an old event should see.
- kind: check
  type: multi
  prompt: A stream job restarts from a checkpoint and replays events. Which of its outputs are safe to repeat? Select all that apply.
  choices:
    - text: An upsert keyed by (window, campaign)
      correct: true
    - text: An insert into a table with a unique constraint on the event ID, ignoring conflicts
      correct: true
    - text: Incrementing a counter in a database
      why: Replaying adds again.
    - text: Sending an email with no deduplication key
      why: The recipient would get it twice.
  explanation: Safe outputs give the same final result however many times they are applied. Increments and sends don't.
- kind: check
  prompt: What does "exactly-once" processing mean in practice?
  choices:
    - text: Each event's effect is visible once
      correct: true
    - text: The network never delivers any message more than once to a consumer
      why: Duplicates and retries are normal.
    - text: Events are processed on exactly one machine, which is never restarted
      why: Processing is parallel and restarts move work.
    - text: No checkpoints are needed, because the framework never repeats work
      why: Checkpoints or transactions are how it is achieved.
  explanation: "Effectively once" is the better name. It requires state consistency inside the framework and idempotent or atomic output at its edge.
- kind: fire
  prompt: Which window type ends after a period of inactivity?
  choices:
    - text: Session
      correct: true
    - text: Tumbling
      why: Fixed length.
    - text: Hopping
      why: Fixed length, overlapping.
    - text: Sliding
      why: Relative to each event's neighbours.
  explanation: A session has no set length. It closes when no event arrives within the gap.
- kind: fire
  prompt: A job checkpoints every 5 seconds at 10,000 events per second. At most how many events are reprocessed after a crash?
  choices:
    - text: About 50,000
      correct: true
    - text: About 5,000
      why: That's one second's worth.
    - text: About 10,000
      why: That's one second at 10,000.
    - text: About 500,000
      why: Ten times too many.
  explanation: 5 s × 10,000/s = 50,000.
- kind: fire
  prompt: Micro-batching windows events by what?
  choices:
    - text: Processing time, in blocks about a second long
      correct: true
    - text: Event time, using a watermark chosen by the application
      why: Larger windows must be built on top using carried state.
    - text: Partition number, so each partition forms its own window
      why: Partitions split parallelism, not time.
    - text: The parity of each event's offset, alternating between two buffers
      why: Not a thing.
  explanation: A micro-batch is a tumbling window by processing time. Longer windows need explicit state carried between batches.
- kind: fire
  type: order
  prompt: Order these ways of handling output after a crash from least to most safe.
  items:
    - Commit the offset before writing the output
    - Write the output then commit the offset, with a non-idempotent write
    - Write idempotently, then commit the offset
    - Commit output and offset in one transaction
  explanation: Committing first can lose events, committing after a non-idempotent write duplicates effects, an idempotent write makes the replay harmless, and a transaction removes the window entirely.
- kind: fire
  prompt: Why can you fix a bug in stream logic by replaying the log?
  choices:
    - text: The log is retained and ordered, so new code can rebuild
      correct: true
    - text: Stream processors store every previous output and can recompute from it
      why: They do not. The input log is the source.
    - text: Kafka automatically recomputes old results whenever the code is redeployed
      why: It stores events. You run the recomputation.
    - text: Checkpoints contain the full input data as well as the state
      why: They contain state and position.
  explanation: Retention turns the input into a reusable source of truth, so a new version can be built beside the old and swapped in.
```
