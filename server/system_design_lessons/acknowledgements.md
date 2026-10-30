---
id: acknowledgements
category: queues
skill: retries
title: Delivery semantics and acknowledgements
minutes: 16
summary: Where a consumer acknowledges a message decides what a crash costs. Ack before the work and a crash loses it; ack after and a crash repeats it. Real systems choose at-least-once and make consumers idempotent. Visibility timeouts, publisher confirms and offset commits are the same decision in different clothes.
objectives:
  - Define at-most-once, at-least-once and effectively-once processing, and where each comes from
  - Place acknowledgements and offset commits relative to the work and its side effects
  - Size visibility timeouts or leases, and extend them for long work
  - Make consumers idempotent, and know what publisher confirms and durable queues do and don't guarantee
sources:
  - ['RabbitMQ: Consumer acknowledgements and publisher confirms', 'https://www.rabbitmq.com/docs/confirms']
  - ['AWS: Amazon SQS visibility timeout', 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html']
  - ['Confluent: Message delivery guarantees in Kafka', 'https://docs.confluent.io/kafka/design/delivery-semantics.html']
case: jobs
---

> [!story] The double-shipped orders
> A warehouse consumer read `OrderPlaced` messages from SQS, created a shipment with the courier's API, and deleted the message. Courier calls usually took 2 seconds, but one afternoon they took 45. The queue's visibility timeout was 30 seconds. Every slow message became visible again mid-call, another worker picked it up, and 1,100 orders shipped twice. The queue behaved exactly as documented: it guarantees at-least-once delivery. The consumer had been written as if it guaranteed exactly once.

## Three guarantees

- **At-most-once:** acknowledge (or commit the offset) **before** processing. A crash loses the message; nothing is ever processed twice. Acceptable for metrics samples, never for orders.
- **At-least-once:** acknowledge **after** processing. A crash redelivers the message, so work may happen twice. This is the default for anything that matters.
- **Effectively-once ("exactly-once processing"):** at-least-once delivery **plus idempotent processing**, so duplicates have no extra effect. Brokers can help within their own boundary (Kafka transactions for read-process-write between topics), but external side effects always need your own deduplication.

```timeline
title: Where should the ack go?
intro: A worker receives "send invoice 551", generates the PDF, emails it, then acknowledges. Inject crashes and compare.
lanes: [Broker, Worker, Email provider]
state: {'Message': 'delivered, unacked', 'Emails sent': '0'}
steps:
  - {lane: Broker, to: Worker, text: 'deliver message 551 (now invisible to others)'}
  - {lane: Worker, to: Worker, text: 'render the invoice PDF'}
  - {lane: Worker, to: Email provider, text: 'send email with key invoice-551', set: {'Emails sent': '1'}}
  - {lane: Worker, to: Broker, text: 'ack 551', set: {'Message': 'acked, removed'}}
crashes:
  - after: 1
    label: before sending
    verdict: safe
    text: The message was never acked, so the broker redelivers it after the visibility timeout and another worker does the whole job. No email was lost or duplicated.
  - after: 2
    label: after sending, before ack
    verdict: duplicate
    text: The email went out, but the broker doesn't know. It redelivers, and a second email is sent — **unless** the send is idempotent (here, the provider deduplicates on `invoice-551`, or the worker records "sent" before acking and checks it first).
  - after: 3
    label: after ack
    verdict: safe
    text: Done. Now imagine the ack had been at step 1 instead — a crash at step 2 would have lost the invoice entirely (at-most-once).
```

```sort
prompt: Ack before or after the work?
buckets: [Ack after processing (at-least-once), Ack before processing (at-most-once is acceptable)]
items:
  - {text: 'Charge a subscription renewal', bucket: 0, why: 'Losing the message loses revenue or service. Ack after, with idempotent charging.'}
  - {text: 'Sampled page-view telemetry for a dashboard', bucket: 1, why: 'Losing a fraction of samples is acceptable, and it avoids double counting without dedupe machinery.'}
  - {text: 'Provision a customer database after signup', bucket: 0, why: 'It must eventually happen. Make provisioning idempotent and ack after.'}
  - {text: 'Live cursor positions in a collaborative editor', bucket: 1, why: 'Stale positions are useless anyway — newer updates supersede them.'}
```

## Visibility timeouts and leases

Queues like SQS don't delete a message on delivery. They **hide** it for a visibility timeout. If the consumer deletes (acks) it in time, it's gone; if not, it reappears for another consumer. That's how crashes get recovered — and how slow consumers create duplicates.

- Set the timeout comfortably above the **p99** processing time, not the average.
- For long or variable work, **extend** the lease periodically (heartbeat with `ChangeMessageVisibility`, or RabbitMQ's unacked-until-closed model with consumer timeouts).
- Even with perfect tuning, assume duplicates: network blips, consumer restarts and broker failovers all cause redelivery.

```calc
title: Choose a visibility timeout
prompt: Processing takes **4 s** at p50 and **48 s** at p99, and occasionally up to **90 s** when a dependency is slow. You'll extend the lease every 20 s while working. What's a sensible **initial** visibility timeout, in seconds, so normal p99 work never reappears before the first extension?
answer: 60
unit: s
tolerance: 1.25
steps: |
  The initial timeout must cover the time until the first heartbeat (20 s) with a margin, and should also cover typical p99 work in case heartbeats fail. Around **60 s** fits both. The heartbeat keeps extending for 90 s outliers, and if the worker dies the message reappears within a minute. A huge timeout (say 12 h) would delay recovery after every crash — the trade-off is duplicates versus recovery time.
```

```bug
title: A queue consumer
prompt: This SQS consumer processed some refunds twice and lost others. Which lines are wrong?
lang: python
code: |
  while True:
      for msg in sqs.receive(queue, max_messages=10, visibility_timeout=10):
          sqs.delete(queue, msg.receipt_handle)
          refund = json.loads(msg.body)
          payments.refund(refund["payment_id"], refund["amount"])
          db.mark_refunded(refund["refund_id"])
bug: [2, 3, 5]
explain: |
  **Line 3** deletes (acks) before doing the work, so if `payments.refund` throws or the process dies, the refund is lost forever (at-most-once). Delete only after success. **Line 2**: a 10-second visibility timeout for ten messages processed one by one, each calling an external API, means later messages reappear while still queued in this batch, and other workers process them too. Size the timeout to the batch's p99 or extend it. **Line 5** isn't idempotent: on redelivery it refunds again. Pass an idempotency key (`refund_id`) to the payment provider and check or record the refund state first.
fix: |
  while True:
      for msg in sqs.receive(queue, max_messages=10, visibility_timeout=120):
          refund = json.loads(msg.body)
          if not db.already_refunded(refund["refund_id"]):
              payments.refund(refund["payment_id"], refund["amount"],
                              idempotency_key=refund["refund_id"])
              db.mark_refunded(refund["refund_id"])      # unique on refund_id
          sqs.delete(queue, msg.receipt_handle)          # ack only after the effect is safe
```

## Idempotent consumers

Common ways to make processing safe to repeat:

- **Deduplication table:** record each processed message ID (or business key) with a unique constraint, **in the same transaction** as the database effect. If the insert conflicts, skip.
- **Idempotent effects:** upserts, "set status = shipped", conditional updates on a version.
- **Downstream idempotency keys** for external APIs (payments, couriers, email providers).
- **Natural keys:** process "order 551" rather than "message abc123", so even a re-published duplicate with a new message ID is caught.

```faded
title: An idempotent consumer for database effects
prompt: Complete the design.
text: |
  Each `OrderPaid` event carries `order_id` and `event_id`. In one database transaction, the consumer first inserts `event_id` into `processed_events`, which has a [[unique constraint on event_id|foreign key to orders|TTL of one second]]. If the insert conflicts, the event was already handled, so the consumer [[skips the work and acks|processes it again|raises an alert and stops]].

  Otherwise it runs `UPDATE orders SET status = 'paid' WHERE id = :order_id AND status = 'pending'`, which is idempotent on its own because [[setting a status (with a state precondition) has the same result when repeated|it adds to a balance|it inserts a new row]].

  Only after the transaction [[commits|starts|is rolled back]] does the consumer ack the message. A crash before the commit means redelivery and a clean retry; a crash after the commit but before the ack means redelivery, and the dedupe insert catches it.
explain: Put the dedupe record and the effect in the same transaction, and ack after commit. Then every crash point is either "nothing happened" or "it happened exactly once and the duplicate is ignored".
```

## Publisher confirms and durability

Acknowledgements have a producer side too. A **publisher confirm** (RabbitMQ) or `acks=all` (Kafka) means the **broker** has accepted and persisted the message to its configured replicas — not that any consumer processed it. Without confirms, a producer can believe it published a message that was lost in a broker crash.

Durability is configuration, not a default to assume: durable or quorum queues, persistent messages, replication factor ≥ 3 with `min.insync.replicas` = 2 in Kafka, and producers that retry with idempotence enabled.

```predict
prompt: A producer publishes an order event and gets a publisher confirm from RabbitMQ. What has been guaranteed?
choices:
  - The warehouse service has processed the order
  - The broker has accepted the message and stored it according to the queue's durability settings
  - The message will be delivered exactly once
  - The message is now in the database
answer: 1
reveal: |
  A confirm covers the hop to the broker only. Processing is the consumer's job (and its ack), delivery is still at-least-once, and the database knows nothing about it. Each hop has its own acknowledgement and its own failure window, which is why end-to-end reliability is designed hop by hop.
```

```interview
ask: How would you design reliable message delivery for an event-processing pipeline that updates a database and calls external APIs?
say: |
  "Delivery is at-least-once everywhere. Producers publish with confirms (acks=all to a topic with RF 3 and min ISR 2), consumers process and then ack. Each consumer is idempotent: it inserts the event ID into a processed table in the same transaction as its effect, and passes idempotency keys to external APIs. Visibility timeouts are about 2× p99 with lease extension for long jobs, and messages that keep failing go to a dead-letter queue after N attempts."
followups:
  - q: Can't the broker just guarantee exactly once?
    a: It can within its own boundary — Kafka transactions make read-process-write between topics atomic — but it can't stop your consumer sending an email twice after a crash. External effects need idempotency on your side.
  - q: What happens if processing takes longer than the visibility timeout?
    a: The message reappears and a second consumer starts on it, so you get duplicate work. Extend the lease while working, size the timeout above p99, and keep the processing idempotent anyway.
  - q: When is at-most-once acceptable?
    a: For lossy, superseded or sampled data — telemetry, presence and cursor updates — where a duplicate is worse than a gap, or neither matters.
weak: |
  "The queue guarantees each message is delivered once." Acks on receipt, no idempotency, timeouts left at the default.
strong: |
  Names at-least-once plus idempotency as the model, places acks after effects, sizes and extends leases, implements dedupe in the same transaction as the effect, and distinguishes publisher confirms from consumer acks.
```

```recall
prompt: Explain what happens to a message if the consumer crashes before it acks versus after it acks, and how that leads to the at-least-once plus idempotency design.
points:
  - If the consumer crashes before acking, the broker redelivers the message (after the visibility timeout or connection loss)
  - If the work's effect already happened before the crash, the redelivery repeats it, causing a duplicate
  - Acking before processing avoids duplicates but loses messages on a crash (at-most-once)
  - So systems ack after processing and make processing idempotent, giving effectively-once results
model: |
  A broker only forgets a message once it's acked. Crash before the ack and the message comes back to another consumer, which is how work survives failures — but if the side effect already happened just before the crash, it now happens again. Acking first would prevent duplicates but lose the message whenever a consumer dies mid-work. Since losing orders is unacceptable, systems ack after the work and design the work to be idempotent — a dedupe record in the same transaction, state-setting updates, idempotency keys downstream — so a redelivery has no extra effect.
```

```questions
- kind: check
  prompt: A consumer acks a message immediately on receipt, then processes it. What delivery behaviour results?
  choices:
    - text: At-most-once — a crash during processing loses the message
      correct: true
    - text: At-least-once — crashes cause redelivery
      why: Redelivery only happens for unacked messages, and this one was acked before the work.
    - text: Exactly-once
      why: Nothing deduplicates, and crashes lose work.
    - text: It depends on the producer
      why: Where the consumer acks is what decides this.
  explanation: The ack tells the broker to forget the message. Acking before the work trades duplicates for possible loss.
- kind: check
  type: multi
  prompt: Which make a consumer of at-least-once messages safe? Select all that apply.
  choices:
    - text: Recording processed event IDs with a unique constraint in the same transaction as the effect
      correct: true
    - text: Using state-setting updates (status = 'paid') instead of increments
      correct: true
    - text: Passing idempotency keys to external APIs
      correct: true
    - text: Acking only after the effect is committed
      correct: true
    - text: Assuming the broker never redelivers
      why: Redelivery happens on crashes, timeouts, rebalances and failovers.
  explanation: Duplicates are guaranteed eventually. Idempotent effects plus acking after commit make them harmless.
- kind: check
  prompt: Messages take up to 45 s to process, but the SQS visibility timeout is 30 s. What happens?
  choices:
    - text: Slow messages become visible again mid-processing and another consumer processes them too
      correct: true
    - text: SQS waits for processing to finish
      why: SQS has no idea about processing. It only tracks the timeout.
    - text: The messages are deleted after 30 s
      why: They reappear. They aren't deleted.
    - text: Processing speeds up to fit the timeout
      why: The timeout doesn't change how long the work takes.
  explanation: Set the visibility timeout above p99 processing time and extend it for long work. Keep consumers idempotent regardless.
- kind: check
  prompt: What does a publisher confirm (or Kafka acks=all) guarantee?
  choices:
    - text: The broker has accepted and persisted the message per its durability configuration
      correct: true
    - text: A consumer has processed the message
      why: That's the consumer's ack, a separate hop.
    - text: The message will never be delivered twice
      why: Delivery to consumers is still at-least-once.
    - text: The database write succeeded
      why: The broker doesn't know about your database.
  explanation: Each hop has its own acknowledgement. Confirms protect producer-to-broker. Consumer acks protect broker-to-processing.
- kind: fire
  prompt: For which data is at-most-once processing reasonable?
  choices:
    - text: Sampled telemetry where occasional loss is acceptable
      correct: true
    - text: Payment captures
      why: Losing them loses money.
    - text: Account deletions requested by users
      why: Those must eventually happen.
    - text: Shipment creation
      why: Losing one means a customer never receives their order.
  explanation: Choose at-most-once only when losing data is cheaper than handling duplicates.
- kind: fire
  type: numeric
  prompt: A message's p99 processing time is 30 s, and you want the visibility timeout to be 2× p99. What timeout do you set, in seconds?
  answer: 60
  unit: s
  tolerance: 0.01
  explanation: 2 × 30 = 60 s. Longer timeouts mean fewer spurious redeliveries but slower recovery when a worker dies.
- kind: fire
  prompt: A consumer inserts its dedupe record in one transaction and performs the database effect in a second transaction. What can go wrong?
  choices:
    - text: A crash between them marks the event as processed without its effect, so the redelivery is skipped and the effect is lost
      correct: true
    - text: Nothing — the order of transactions doesn't matter
      why: Separate transactions leave a window between them.
    - text: The dedupe table grows too large
      why: That's a retention question, not a correctness one.
    - text: The broker rejects the message
      why: The broker doesn't see your transactions.
  explanation: The dedupe record and the effect must commit atomically. Otherwise you trade duplicates for losses.
- kind: fire
  level: advanced
  prompt: In Kafka, a consumer commits its offset, then processes the batch, then crashes mid-batch. What happens on restart?
  choices:
    - text: The unprocessed messages in that batch are skipped (lost), because the committed offset is already past them
      correct: true
    - text: The whole batch is redelivered
      why: That's what happens when you commit after processing.
    - text: Kafka detects the crash and rolls back the offset
      why: Offsets are what you commit. Kafka won't undo a commit.
    - text: Messages are duplicated
      why: Committing first causes loss, not duplication.
  explanation: Commit offsets after processing (at-least-once) and make processing idempotent. Committing first is at-most-once.
- kind: fire
  type: multi
  prompt: Which settings strengthen durability of published messages in Kafka? Select all that apply.
  choices:
    - text: Replication factor 3 for the topic
      correct: true
    - text: min.insync.replicas = 2
      correct: true
    - text: Producer acks=all
      correct: true
    - text: Idempotent producer enabled to avoid duplicates on producer retries
      correct: true
    - text: acks=0 for speed
      why: The producer doesn't wait at all, so messages can be lost silently.
  explanation: Durability means replicas, waiting for them, and safe producer retries. Then design consumers for at-least-once.
```
