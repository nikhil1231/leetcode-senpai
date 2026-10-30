---
id: event-streams
category: queues
skill: capacity
title: Event streams, partitions and ordering
minutes: 16
summary: A partitioned log like Kafka scales by splitting a topic into partitions, each an ordered sequence consumed by exactly one member of a consumer group. That one design choice decides your ordering guarantee (per key, never global), your parallelism ceiling (the partition count) and your worst bottleneck (a hot key). Retention, compaction and schemas turn the log into a shared, replayable source of events.
objectives:
  - Explain partitions, keys, offsets and consumer groups, and what ordering a partitioned log guarantees
  - Choose partition keys and counts from throughput, ordering needs and skew
  - Describe consumer rebalancing, lag, retention and log compaction
  - Evolve event schemas without breaking consumers, and know what Kafka's exactly-once covers
sources:
  - ['Apache Kafka documentation: Design', 'https://kafka.apache.org/documentation/#design']
  - ['Confluent: How to choose the number of topics/partitions in a Kafka cluster', 'https://www.confluent.io/blog/how-choose-number-topics-partitions-kafka-cluster/']
  - ['Kafka: Log compaction', 'https://kafka.apache.org/documentation/#compaction']
---

> [!story] Twelve consumers, one doing all the work
> A team scaled its order-events consumer from 3 to 12 instances to fix growing lag, and nothing improved. The topic had 6 partitions, so 6 consumers sat idle. Worse, events were keyed by `merchant_id`, and one marketplace merchant generated 40% of all orders — so one partition, and the one consumer that owned it, carried 40% of the load no matter how many instances ran. Lag on that partition grew all day while dashboards showed plenty of spare capacity.

## The model

- A **topic** is split into **partitions**. Each partition is an append-only, ordered log, replicated across brokers.
- A producer chooses a partition by **key**: `hash(key) % partitions`. Events with the same key always go to the same partition, so they're **ordered relative to each other**. With no key, events are spread for balance and ordering is lost.
- Each event in a partition has an **offset**. Consumers track their position per partition.
- A **consumer group** shares the work: each partition is assigned to **exactly one** consumer in the group. Different groups read independently, each with its own offsets.

So the guarantees are: **order within a partition, never across partitions**, and **at most one active consumer per partition per group**.

```sim
name: partitions
title: Partitions, consumers and hot keys
challenges:
  - {text: 'With 6 partitions, add consumers until some sit idle', metric: idle, op: '>', value: 0, and: [{metric: partitions, op: '==', value: 6}]}
  - {text: 'Find a partition and consumer count with no idle consumers and no lag at 6,000 events/s', metric: lagRate, op: '==', value: 0, and: [{metric: idle, op: '==', value: 0}]}
  - {text: 'Switch the key to tenant_id (one tenant is 40% of traffic) and see one consumer fall behind however many you add', metric: lagRate, op: '>', value: 0, and: [{metric: keying, op: '==', value: tenant}, {metric: consumers, op: '>=', value: 12}]}
takeaway: |
  Parallelism is capped by the partition count, and per-key ordering means a hot key's whole load lands on one partition and one consumer. Choose keys with many values and even load, and plan partition counts for future peak — adding partitions later changes which partition each key maps to.
```

## Choosing a partition key

Pick the key from **what must stay ordered**:

| Events | Ordering needed | Key |
|---|---|---|
| Order lifecycle (placed → paid → shipped) | Per order | `order_id` |
| Account balance changes | Per account | `account_id` |
| Click-stream analytics | None | No key (or random) for balance |
| Per-device sensor readings | Per device | `device_id` |

Then check **skew**: if a few keys dominate (a celebrity, a huge tenant), their partitions become hot. Options: a more granular key (`tenant_id + order_id` when only per-order ordering matters), splitting the hot key with a suffix (losing its ordering), or giving the giant tenant its own topic.

```sort
prompt: Pick the best partition key for each stream.
buckets: ['entity id (e.g. order_id)', 'user_id', 'no key / random']
items:
  - {text: 'Payment state transitions that must be applied in order per payment', bucket: 0, why: 'Ordering matters per payment, so the payment ID keeps its events together.'}
  - {text: 'Page-view events for a traffic dashboard', bucket: 2, why: 'No ordering requirement, so spread evenly for maximum balance.'}
  - {text: "A user's settings changes, where the last write must win", bucket: 1, why: "Per-user ordering means the final state is applied last. It also enables log compaction by user."}
  - {text: 'Shipment status updates for each package', bucket: 0, why: 'Order per package. Package IDs have high cardinality and spread evenly.'}
```

```predict
prompt: A topic has 8 partitions keyed by `account_id`, and per-account ordering matters. You increase it to 16 partitions to get more throughput. What changes for ordering?
choices:
  - Nothing — Kafka moves existing data to keep keys in place
  - New events for many accounts now hash to a different partition than their older events, so during the transition a consumer can process an account's new events before its old ones finish
  - All ordering is lost forever
  - Kafka refuses to add partitions to keyed topics
answer: 1
reveal: |
  `hash(key) % 8` and `hash(key) % 16` disagree for about half the keys, and existing data isn't moved. Until the old partitions are fully consumed, an account can have events in two partitions processed in parallel. Plan partition counts for peak up front (they're cheap-ish), or migrate carefully — drain consumers, or move to a new topic.
```

## Sizing partition counts

Partitions are the unit of parallelism, and they cost something too (open files, replication traffic, longer leader elections and rebalances). Size from throughput:

```calc
title: How many partitions?
prompt: A topic must sustain **240 MB/s** at peak, growing **2×** over the planning horizon. One consumer instance can process about **12 MB/s** from a partition. How many partitions do you need for the future peak?
answer: 40
unit: partitions
tolerance: 1.05
steps: |
  Future peak = 480 MB/s. 480 ÷ 12 = **40** partitions, so up to 40 consumers can work in parallel. Producer and broker throughput per partition are usually higher than consumer throughput, so consumers set the number. Many teams round up (to 48, say) so that consumer counts divide evenly and there's headroom for skew.
```

## Consumer groups in motion

- **Lag** — the gap between the latest offset and the group's committed offset, per partition — is the core health metric. Convert it to time ("8 minutes behind") for alerting.
- **Rebalancing:** when consumers join, leave or miss heartbeats, partitions are reassigned. Older protocols stop the whole group during a rebalance; cooperative (incremental) rebalancing and static membership reduce the disruption. Slow processing beyond `max.poll.interval.ms` gets a consumer kicked out, triggering rebalance storms.
- **Commit after processing** (at-least-once), and expect redelivery of a partition's uncommitted tail after every rebalance.

```bug
title: A Kafka consumer loop
prompt: This consumer causes repeated rebalances and occasional lost events. Which lines are wrong?
lang: python
code: |
  consumer = KafkaConsumer("orders", group_id="billing", enable_auto_commit=True,
                           auto_commit_interval_ms=1000, max_poll_records=5000)
  for batch in consumer.poll_batches():
      for event in batch:
          charge_customer(event)        # ~200 ms each, calls a payment API
bug: [1, 2]
explain: |
  **Line 1:** auto-commit commits offsets on a timer regardless of whether events were processed. A crash after an auto-commit but before processing loses those events (at-most-once by accident). Disable it and commit after processing. **Line 2:** 5,000 records × 200 ms is about 17 minutes per poll — far beyond the default `max.poll.interval.ms` of 5 minutes. The consumer is presumed dead, the group rebalances, and another consumer starts on the same uncommitted events. Repeat forever. Use small batches (or move slow work to a work queue), and commit as you go.
fix: |
  consumer = KafkaConsumer("orders", group_id="billing", enable_auto_commit=False,
                           max_poll_records=50)
  for batch in consumer.poll_batches():
      for event in batch:
          charge_customer(event, idempotency_key=event.id)
      consumer.commit()                 # after the batch is processed
```

## Retention, replay and compaction

- **Time or size retention** (e.g. 7 days) keeps events after consumption, so new consumers can start from the beginning and broken consumers can rewind and reprocess.
- **Log compaction** keeps at least the **latest event per key** indefinitely, removing older values for the same key (a null value is a tombstone). A compacted topic is a changelog: replaying it rebuilds the current state of every key. It's how Kafka Streams state stores and CDC-derived tables are bootstrapped.

## Schemas and evolution

Producers and consumers deploy independently, so event formats must evolve compatibly:

- Use a schema (Avro, Protobuf or JSON Schema) with a **schema registry** enforcing compatibility rules.
- **Backward compatible** changes let new consumers read old events; **forward compatible** changes let old consumers read new events. Adding optional fields with defaults is usually both; removing or renaming fields and changing types are not.
- Treat events as a public API: version them, document them, and never reuse a field name for a different meaning.

> [!senior] What Kafka's "exactly-once" actually covers
> Idempotent producers stop duplicates caused by producer retries. Transactions make "consume from topic A, produce to topic B, commit offsets" atomic, so a stream processor's output reflects each input once. None of that covers side effects *outside* Kafka — a database write or an email — which still need idempotent handling.

```interview
ask: How would you design an event-streaming platform for order lifecycle events and customer-profile updates that serves multiple downstream systems?
say: |
  "Order events go to a topic keyed by order_id, so each order's lifecycle stays ordered while load spreads across 48 partitions — sized for twice today's 240 MB/s at about 12 MB/s per consumer. Each downstream system is its own consumer group, committing after processing and deduplicating by event ID. We alert on lag in minutes per partition. Retention is 7 days for replay, and the customer-profile topic is compacted so new services can rebuild state. Schemas are Avro in a registry with backward compatibility enforced."
followups:
  - q: How do you guarantee ordering?
    a: Only per partition. Put events that must be ordered under the same key, keep a single writer path per key, and consume each partition sequentially.
  - q: Why didn't adding consumers fix lag?
    a: Either there were more consumers than partitions, so the extras sat idle, or a hot key made one partition the bottleneck. Fix the partition count or the key, not the consumer count.
  - q: What's log compaction for?
    a: Keeping the latest value per key indefinitely, so the topic acts as a changelog that new consumers can replay to rebuild current state.
weak: |
  "Use Kafka for scale and it keeps events in order." Ignores per-partition ordering, the partition-count cap, hot keys, rebalances and schema evolution.
strong: |
  Chooses keys from ordering needs and checks skew, sizes partitions for future peak, explains consumer groups, lag and rebalances, uses retention and compaction purposefully, governs schemas, and is precise about exactly-once.
```

```recall
prompt: Explain what ordering a Kafka topic guarantees, and how the choice of partition key affects both ordering and scalability.
points:
  - Kafka guarantees order only within a partition, not across the topic
  - Events with the same key hash to the same partition, so per-key order is preserved
  - Parallelism is limited to one consumer per partition per group, so the partition count caps scaling
  - Keys with skewed traffic make hot partitions that can't be scaled by adding consumers; low-cardinality or dominant keys cause imbalance
model: |
  A topic is a set of independent ordered logs. Kafka promises order within each partition and nothing across partitions. The producer sends every event with a given key to the same partition, so all events for one order (keyed by order_id) stay in order. Within a consumer group each partition is read by exactly one consumer, so the partition count is the ceiling on parallelism. And because a key's events all live in one partition, a key carrying a big share of traffic overloads that partition and its consumer no matter how many consumers you add. So choose a key that's as fine-grained as your ordering need allows, with many evenly loaded values.
```

```questions
- kind: check
  prompt: What ordering does a partitioned Kafka topic guarantee?
  choices:
    - text: Order within each partition only — so per key, if events share a key
      correct: true
    - text: Global order across the whole topic
      why: Partitions are independent logs read in parallel.
    - text: No ordering at all
      why: Each partition is strictly ordered by offset.
    - text: Order by event timestamp
      why: Order follows append order within a partition, not timestamps.
  explanation: Put events that must be ordered under the same key, and therefore in the same partition.
- kind: check
  prompt: A topic has 8 partitions and a consumer group runs 20 instances. How many instances actually receive events?
  choices:
    - text: 8 — each partition goes to one consumer, and the other 12 are idle
      correct: true
    - text: 20
      why: A partition can't be split between consumers in the same group.
    - text: 1
      why: Partitions are spread across the group.
    - text: 16
      why: There are only 8 partitions to assign.
  explanation: The partition count caps parallelism within a group.
- kind: check
  type: numeric
  prompt: A topic must handle 300 MB/s and each consumer processes 15 MB/s. What's the minimum number of partitions for consumers to keep up?
  answer: 20
  unit: partitions
  tolerance: 0.01
  explanation: 300 ÷ 15 = 20. Plan for growth and skew too, because changing the partition count later remaps keys.
- kind: check
  type: multi
  prompt: Which are consequences of keying a topic by tenant_id when one tenant generates 40% of traffic? Select all that apply.
  choices:
    - text: One partition receives at least 40% of all events
      correct: true
    - text: The consumer owning that partition becomes the bottleneck
      correct: true
    - text: Adding consumers doesn't relieve that partition
      correct: true
    - text: Kafka automatically splits the hot partition
      why: Kafka never splits partitions automatically.
  explanation: Skewed keys create hot partitions. Use finer keys where ordering allows, split the hot key, or isolate the big tenant.
- kind: fire
  prompt: Auto-commit is enabled on a 1-second timer, and the consumer crashes while processing a batch. What can happen?
  choices:
    - text: Offsets for unprocessed events may already be committed, so those events are skipped (lost)
      correct: true
    - text: Everything is redelivered
      why: Only events after the last committed offset come back, and auto-commit may already have passed some unprocessed ones.
    - text: Kafka waits for processing to finish before committing
      why: Auto-commit is timer-based and knows nothing about your processing.
    - text: Duplicates are impossible
      why: Duplicates are possible too, for anything processed since the last commit.
  explanation: Commit explicitly after processing for at-least-once, and make processing idempotent.
- kind: fire
  prompt: What does log compaction keep?
  choices:
    - text: At least the latest event for every key, removing older events for the same key
      correct: true
    - text: Only events from the last hour
      why: That's time-based retention.
    - text: The first event for every key
      why: Compaction keeps the latest value, so the topic reflects current state.
    - text: Nothing — it deletes the topic
      why: It removes superseded values, not the topic.
  explanation: Compacted topics act as changelogs that can rebuild the current state of every key.
- kind: fire
  prompt: A consumer processes huge batches and keeps getting kicked out of its group, causing endless rebalances. What's the likely cause?
  choices:
    - text: Processing a poll's batch takes longer than max.poll.interval.ms, so the group considers it dead
      correct: true
    - text: Too many partitions
      why: Partition count doesn't decide the poll interval.
    - text: Retention is too short
      why: Retention isn't related to group membership.
    - text: The broker is out of disk
      why: That causes different errors.
  explanation: Keep poll batches small relative to processing time, or move slow work elsewhere, so consumers stay in the group.
- kind: fire
  level: advanced
  prompt: Which schema change is typically safe for both old and new consumers (backward and forward compatible)?
  choices:
    - text: Adding a new optional field with a default value
      correct: true
    - text: Renaming an existing field
      why: Old readers lose the field and new readers miss it in old events.
    - text: Changing a field from int to string
      why: Type changes break deserialisation.
    - text: Removing a required field
      why: Readers that expect it break.
  explanation: Additive, optional changes with defaults are the safe path. A schema registry can enforce compatibility rules on every producer change.
- kind: fire
  type: multi
  prompt: What does Kafka's exactly-once support (idempotent producers plus transactions) cover? Select all that apply.
  choices:
    - text: Duplicate writes caused by producer retries
      correct: true
    - text: Atomic consume-process-produce between Kafka topics, including offset commits
      correct: true
    - text: Sending an email exactly once from a consumer
      why: External side effects are outside Kafka's transaction.
    - text: Writing to an external database exactly once
      why: That needs idempotent handling or the outbox/inbox patterns.
  explanation: Kafka's guarantees end at Kafka's boundary. Effects outside it still need idempotency.
```
