---
id: queue-basics
category: queues
skill: retries
title: Producers, consumers and buffering
minutes: 15
summary: A queue decouples when work arrives from when it's done. It absorbs bursts, lets producers and consumers scale and fail independently, and turns one event into work for many systems. It doesn't create capacity. Know which kind of queue you need, size consumers for the drain rate, and watch how old the oldest message is.
objectives:
  - Distinguish work queues, pub/sub fan-out and retained logs, and match them to use cases
  - Explain how a queue absorbs bursts, and calculate backlog growth and drain time
  - Scale consumers and choose prefetch, priorities and per-tenant fairness
  - Monitor queues by age and lag, and autoscale on the right signal
sources:
  - ['RabbitMQ tutorials: Work queues and publish/subscribe', 'https://www.rabbitmq.com/tutorials/tutorial-two-python']
  - ['Apache Kafka documentation: Introduction', 'https://kafka.apache.org/documentation/#introduction']
  - ['AWS: Amazon SQS visibility timeout', 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html']
case: jobs
---

> [!story] Black Friday, 11:58
> An online retailer's checkout wrote orders to the database and then synchronously called the warehouse, email, loyalty and analytics services. At peak, the loyalty service slowed to two seconds per call, and checkout — the only thing that made money — slowed with it. The fix wasn't a faster loyalty service. Checkout committed the order and published one `OrderPlaced` event; each downstream system consumed it at its own pace. When loyalty fell behind that night, its backlog grew and drained by 2 a.m. Nobody noticed.

## Three shapes of "queue"

| Shape | Semantics | Use for | Examples |
|---|---|---|---|
| **Work queue (competing consumers)** | Each message goes to **one** of N workers; it's removed once acknowledged | Distributing tasks: resize this image, send this email | SQS, RabbitMQ queues, Celery, Sidekiq |
| **Pub/sub fan-out** | Each subscriber gets its **own copy** | Notifying several independent systems of an event | SNS → SQS, RabbitMQ fanout exchanges, Google Pub/Sub |
| **Retained log (stream)** | An append-only log kept for days; each consumer group tracks its own **offset** and can **replay** | Event streams many systems read, reprocessing, CDC, audit | Kafka, Kinesis, Pulsar, Redis Streams |

```sort
prompt: Which shape fits each requirement?
buckets: [Work queue, Pub/sub fan-out, Retained log]
items:
  - {text: 'Generate a PDF invoice for each order; any of 20 workers can do it', bucket: 0, why: 'One task, one worker. Competing consumers spread the load.'}
  - {text: 'When an order is placed, email, warehouse and loyalty must each react independently', bucket: 1, why: 'Every subscriber needs its own copy and its own pace. (A log also works here.)'}
  - {text: 'A new fraud model must be back-tested on the last 7 days of payment events', bucket: 2, why: 'Replay requires retention and independent offsets — only a log gives you that.'}
  - {text: 'Stream every database change to a search index and a data warehouse', bucket: 2, why: 'CDC into a log lets each consumer read at its own pace and rebuild from an offset.'}
  - {text: 'Thumbnail each uploaded photo', bucket: 0, why: 'Classic task distribution.'}
```

## What a queue buys you

- **Burst absorption.** Producers can briefly outpace consumers; the backlog grows, then drains when traffic falls.
- **Isolation.** A slow or failing consumer stops slowing the producer, and the producer keeps working when consumers are down.
- **Independent scaling.** Add consumers when the backlog grows.
- **Retries and replay** (with acknowledgements and retention — next lessons).

The cost: added latency (work waits in line), another system to run, at-least-once delivery semantics to handle, and "accepted" no longer meaning "done".

```arch
title: Fan-out with independent consumers
nodes:
  - {id: checkout, label: Checkout, kind: service, x: 0, y: 1}
  - {id: db, label: Orders DB, kind: db, x: 0, y: 2}
  - {id: topic, label: OrderPlaced topic, kind: stream, x: 1, y: 1}
  - {id: wh, label: Warehouse queue, kind: queue, x: 2, y: 0}
  - {id: em, label: Email queue, kind: queue, x: 2, y: 1}
  - {id: loy, label: Loyalty queue, kind: queue, x: 2, y: 2}
  - {id: whw, label: Warehouse workers, kind: worker, x: 3, y: 0}
  - {id: emw, label: Email workers, kind: worker, x: 3, y: 1}
  - {id: loyw, label: Loyalty workers, kind: worker, x: 3, y: 2, note: 'slow today'}
edges:
  - [checkout, db, 'commit']
  - [checkout, topic, 'publish']
  - [topic, wh, '']
  - [topic, em, '']
  - [topic, loy, '']
  - [wh, whw, 'compete']
  - [em, emw, 'compete']
  - [loy, loyw, 'compete']
paths:
  - label: One order
    steps:
      - [checkout, db, 'Commit the order — the only thing the user waits for']
      - [checkout, topic, 'Publish OrderPlaced (reliably, e.g. via an outbox)']
      - [topic, wh, 'Each subscriber gets its own copy, in its own queue']
      - [loy, loyw, "Loyalty is slow: its queue grows, but checkout and the other consumers don't notice"]
```

## Bursts, backlogs and drain time

If arrivals exceed completions, the backlog grows at the difference. After the burst, it drains at **(completion rate − arrival rate)**. A queue only helps if there's spare capacity later. Sustained overload just produces an ever-growing backlog, until the queue hits its limit or messages expire.

```sim
name: queue
title: Absorbing a burst
intro: Ten workers each finish about 2 jobs/s (capacity 20/s). The burst triples arrivals for 30 seconds.
config:
  initial: {arrival: 14, workers: 10, rate: 2, burst: true, burstSize: 3, random: true}
challenges:
  - {text: 'With the burst on, find a worker count that drains the backlog within 60 seconds of the burst ending', metric: drainSeconds, op: '<=', value: 60, and: [{metric: burst, op: '==', value: true}]}
  - {text: 'Set arrivals above capacity with no burst, and watch the backlog never drain', metric: finalBacklog, op: '>', value: 500, and: [{metric: burst, op: '==', value: false}]}
  - {text: 'Add a queue limit and see overload become rejections instead of unbounded waiting', metric: rejected, op: '>', value: 0}
takeaway: |
  Drain time depends on **spare** capacity: 2× headroom drains a backlog far faster than 1.1×. A queue in front of a permanently undersized consumer is just a slow way to fail — add capacity, shed load, or bound the queue so overload is explicit.
```

```calc
title: How long until the backlog drains?
prompt: A traffic spike left **90,000** messages in a queue. New messages still arrive at **500/s**. Consumers can process **800/s** in total. How many **minutes** until the backlog is gone?
answer: 5
unit: minutes
tolerance: 1.03
steps: |
  Net drain rate = 800 − 500 = 300 messages/s. 90,000 ÷ 300 = 300 s = **5 minutes**. Double the consumers (1,600/s) and it drains in 90,000 ÷ 1,100 ≈ 82 s. The oldest message in the backlog waits roughly the whole drain time — that's the latency users feel.
```

## Consumers: scaling, prefetch, priorities and fairness

- **Scale out** by adding consumers (for logs, up to the partition count — see event streams).
- **Prefetch / batch size** controls how many messages a consumer holds unacknowledged at once. Too low wastes round trips; too high lets one slow consumer hoard messages others could process.
- **Priorities:** urgent work (password-reset emails) shouldn't wait behind a million marketing emails. Use separate queues with dedicated or weighted consumers, rather than relying on fragile per-message priorities.
- **Fairness:** one tenant enqueueing a million jobs can starve everyone else in a shared FIFO. Per-tenant queues, round-robin scheduling or quotas keep it fair.

```predict
prompt: A shared job queue serves 2,000 customers. One customer bulk-imports 3 million records, enqueueing 3 million jobs in a minute. Other customers report that their jobs, normally done in seconds, now take hours. What's the best fix?
choices:
  - Add more workers until the import finishes quickly
  - Give each tenant its own queue (or a fair scheduler) so workers round-robin across tenants, plus per-tenant rate limits
  - Make the queue LIFO so new jobs run first
  - Ask the customer not to import data
answer: 1
reveal: |
  In a single FIFO, everyone waits behind the bulk import. Fair scheduling across tenants (per-tenant queues serviced round-robin, or weighted fair queuing) bounds how long small customers wait, regardless of one customer's backlog. Rate limits or bulk lanes contain heavy users. More workers help, but they don't fix the unfairness.
```

## Monitor the age, not just the depth

Queue **depth** alone is ambiguous: 10,000 messages could be 2 seconds of work or 2 hours. **Age of the oldest message** (or consumer **lag** in time) is what users feel. Alert on it, and autoscale on it (or on depth ÷ throughput), not on consumer CPU — consumers blocked on a slow dependency show low CPU while the backlog explodes.

```bug
title: Queue monitoring and scaling config
prompt: Which lines would leave you blind or scaling the wrong thing?
lang: yaml
code: |
  alerts:
    - metric: broker_up
      condition: "== 0"
    - metric: queue_depth
      condition: "> 1000000"
  autoscaling:
    metric: worker_cpu_percent
    target: 70
bug: [4, 7]
explain: |
  **Line 4:** a fixed depth threshold says nothing about delay. A million cheap messages might drain in a minute, while 5,000 expensive ones might mean hours. Alert on the age of the oldest message against the latency target. **Line 7:** workers waiting on a slow downstream API have *low* CPU, so the autoscaler scales them **down** while the backlog grows. Scale on queue age or backlog ÷ per-worker throughput. (Broker health is worth watching, but "broker up" doesn't mean jobs are completing.)
fix: |
  alerts:
    - metric: oldest_message_age_seconds
      condition: "> 300"          # users expect results within 5 minutes
    - metric: consumer_success_rate
      condition: "< 0.99"
  autoscaling:
    metric: backlog_per_worker     # depth / (workers x per-worker throughput) ~ seconds to drain
    target: 60
```

```interview
ask: How would you use queues to feed warehouse, email and loyalty workflows from a checkout system handling 300 orders per second?
say: |
  "Checkout commits the order and publishes OrderPlaced. Warehouse, email and loyalty each have their own queue subscribed to it, so a slow consumer only grows its own backlog. Each queue has competing workers sized for peak drain with headroom: at 300 orders/s and 0.2 s per email, that's 60 busy workers, so I'd run about 90 and autoscale on oldest-message age. Urgent emails get a separate queue. Bulk tenants are fair-scheduled. Alerts fire on age against each consumer's latency target."
followups:
  - q: When is a queue the wrong choice?
    a: When the caller needs the result now and the work is fast, when ordering and exactly-once matter but you can't make consumers idempotent, or when the consumer is permanently undersized — then the queue only hides the overload.
  - q: Work queue or Kafka?
    a: Work queues suit task distribution with per-message acks and retries. Kafka suits retained event streams with replay and many independent consumer groups. Many systems use both.
  - q: What do you monitor?
    a: Oldest-message age or time lag per consumer, throughput in and out, error and dead-letter rates, and redelivery counts. Depth alone isn't enough.
weak: |
  "Add Kafka to make it scalable." No idea of fan-out versus work distribution, drain rate, fairness or what to monitor.
strong: |
  Picks the queue shape per need, isolates consumers, sizes for drain rate with headroom, handles priority and fairness, and monitors and autoscales on age.
```

```recall
prompt: Explain what a queue does and doesn't do for a system under a traffic burst, and how you'd size consumers.
points:
  - It buffers work so producers aren't slowed or failed by consumers during the burst
  - It doesn't add processing capacity — the backlog drains only at completion rate minus arrival rate
  - Sustained arrivals above capacity make the backlog grow without bound, so capacity, shedding or limits are needed
  - Size consumers for peak arrivals with headroom for draining (Little's Law for concurrency), and monitor oldest-message age
model: |
  A queue lets the producer accept work at burst speed while consumers process at their own rate, so the burst becomes a temporary backlog instead of errors or slow responses. It adds no capacity: the backlog shrinks only at (completion rate − arrival rate), and if arrivals stay above capacity it grows until something gives. So I size consumers from peak arrival rate × processing time (Little's Law), add headroom so backlogs drain in an acceptable time, autoscale on the oldest message's age, and bound the queue or shed load if the backlog would outgrow what users will tolerate.
```

```questions
- kind: check
  prompt: Five independent services must each react to every OrderPlaced event at their own pace. Which shape fits?
  choices:
    - text: Pub/sub fan-out (or a retained log), where each subscriber gets its own copy and progress
      correct: true
    - text: One work queue shared by all five services
      why: Competing consumers means each message goes to only one of them.
    - text: Synchronous calls from checkout to each service
      why: That couples checkout's latency and availability to all five.
    - text: A database table each service polls and deletes from
      why: Deletes by one service would hide the event from the others.
  explanation: Fan-out gives every subscriber an independent copy, so one slow consumer doesn't affect the others or the producer.
- kind: check
  type: numeric
  prompt: A backlog of 120,000 messages exists, arrivals continue at 1,000/s, and consumers process 1,400/s. How many seconds until it drains?
  answer: 300
  unit: seconds
  tolerance: 0.02
  explanation: The net drain rate is 400/s, so 120,000 ÷ 400 = 300 s. Only spare capacity drains a backlog.
- kind: check
  type: multi
  prompt: Which are good signals to alert or autoscale on for a job queue? Select all that apply.
  choices:
    - text: Age of the oldest unprocessed message
      correct: true
    - text: Backlog divided by consumer throughput (an estimate of time to drain)
      correct: true
    - text: Consumer error or dead-letter rate
      correct: true
    - text: Consumer CPU usage alone
      why: Consumers blocked on I/O show low CPU while the backlog grows.
    - text: Whether the broker process is running
      why: Useful for health, but a running broker says nothing about whether work gets done in time.
  explanation: Time-based signals reflect user-visible delay. Error rates catch consumers that are running but failing.
- kind: check
  prompt: One tenant floods a shared FIFO queue and every other tenant's jobs are delayed. What's the structural fix?
  choices:
    - text: Fair scheduling across tenants (per-tenant queues serviced round-robin) and per-tenant limits
      correct: true
    - text: A larger FIFO queue
      why: Everyone still waits behind the flood.
    - text: Switching to LIFO
      why: That starves older jobs, including the flood's, and is still unfair.
    - text: Shorter message TTLs
      why: That drops jobs instead of scheduling them fairly.
  explanation: Fairness has to be designed. A single FIFO serves whoever enqueues most.
- kind: fire
  prompt: Arrivals are permanently above consumer capacity. What does putting a queue in front achieve?
  choices:
    - text: The backlog and wait times grow until a limit is hit — capacity must increase or load must be shed
      correct: true
    - text: The queue eventually catches up on its own
      why: Without spare capacity, it never can.
    - text: Throughput increases
      why: Queues don't add processing capacity.
    - text: Latency stays constant
      why: Waiting time grows with the backlog.
  explanation: Queues smooth temporary bursts. Sustained overload needs more capacity, less work, or explicit rejection.
- kind: fire
  prompt: Why might a consumer prefetch of 1,000 messages cause uneven processing?
  choices:
    - text: One consumer can hold many messages it can't process quickly, while idle consumers have nothing
      correct: true
    - text: Prefetch makes messages disappear
      why: Unacknowledged messages are redelivered if the consumer dies. They don't vanish.
    - text: Brokers reject large prefetch values
      why: They allow them. That's how the problem arises.
    - text: Prefetch reduces durability
      why: Durability is a separate concern.
  explanation: Prefetch trades round trips against hoarding. Tune it to the processing time per message and the number of consumers.
- kind: fire
  prompt: Password-reset emails sit behind a million marketing emails in one queue. What's the usual fix?
  choices:
    - text: Put urgent mail in a separate queue with dedicated or prioritised consumers
      correct: true
    - text: Send marketing emails faster
      why: Reset emails still wait in line behind the backlog.
    - text: Delete the marketing emails
      why: Those are legitimate jobs too.
    - text: Use a longer visibility timeout
      why: Visibility timeouts affect redelivery, not ordering between job types.
  explanation: Separate queues per priority class give predictable latency for urgent work.
- kind: fire
  level: advanced
  prompt: A new analytics model needs to reprocess the last 14 days of events that other consumers have already handled. Which system makes this straightforward?
  choices:
    - text: A retained log where the new consumer group starts from an offset 14 days back
      correct: true
    - text: A work queue, where acknowledged messages have already been deleted
      why: Once acknowledged, messages are gone from a traditional work queue.
    - text: Synchronous RPC
      why: There's nothing to replay.
    - text: An in-memory queue
      why: There's no retention.
  explanation: Logs retain events independently of consumption, so new or repaired consumers can replay from any retained offset.
- kind: fire
  type: numeric
  prompt: Emails arrive at 300/s at peak and each takes 0.2 s to send. How many workers must be busy on average just to keep up?
  answer: 60
  unit: workers
  tolerance: 0.02
  explanation: 300/s × 0.2 s = 60 concurrent workers (Little's Law). Add headroom (say 1.5×) so backlogs drain and failures are absorbed.
```
