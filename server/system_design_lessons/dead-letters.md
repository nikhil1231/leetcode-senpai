---
id: dead-letters
category: queues
skill: operations
title: Retries, poison messages and dead-letter queues
minutes: 15
summary: Some failures heal on their own and deserve patient retries; others never will, and retrying them just burns capacity and blocks the messages behind them. Classify failures, retry with backoff outside the hot path, move persistent failures to a dead-letter queue someone actually owns, and redrive them safely once fixed.
objectives:
  - Classify failures as transient, permanent or dependency-wide, and respond differently to each
  - Implement delayed retries without blocking a queue or an ordered partition
  - Configure dead-letter queues with max-receive counts, ownership, alerting and retention
  - Redrive dead-lettered messages safely, and avoid dead-lettering everything during an outage
sources:
  - ['AWS: Amazon SQS dead-letter queues', 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html']
  - ['Uber engineering: Building reliable reprocessing and dead letter queues with Kafka', 'https://www.uber.com/blog/reliable-reprocessing/']
  - ['RabbitMQ: Dead letter exchanges', 'https://www.rabbitmq.com/docs/dlx']
case: jobs
---

> [!story] One bad message, six hours of silence
> A payments team consumed a Kafka topic with strict per-account ordering. One event arrived with a currency code the consumer didn't recognise. It threw, didn't commit the offset, and retried — forever. Every later event in that partition, for thousands of accounts, queued behind it. Dashboards showed the consumer "healthy" (it was running) while lag climbed for six hours. A single **poison message** had stopped a twelfth of the business.

## Not all failures are equal

```sort
prompt: How should the consumer treat each failure?
buckets: [Transient — retry with backoff, Permanent — dead-letter it, Dependency outage — pause or slow the whole consumer]
items:
  - {text: 'Downstream API returned 503 once', bucket: 0, why: 'Likely to succeed shortly. Retry with backoff.'}
  - {text: 'JSON schema validation failed: a required field is missing', bucket: 1, why: "Retrying the same bytes won't change anything. Park it for a human or a code fix."}
  - {text: 'Database connection refused for every message in the last 2 minutes', bucket: 2, why: "It isn't this message, it's the dependency. Dead-lettering everything would flood the DLQ with good messages. Back off the whole consumer, or trip a circuit breaker."}
  - {text: 'Lock timeout on a hot row', bucket: 0, why: 'Contention usually clears. Retry with jitter.'}
  - {text: 'The referenced customer ID does not exist (and never will)', bucket: 1, why: 'A data problem. Retries are pointless; investigate.'}
  - {text: 'Rate-limited by the email provider (429 with Retry-After)', bucket: 2, why: 'Applies to all messages. Slow the consumer down to the allowed rate rather than failing messages one by one.'}
```

## Retrying without blocking

Retrying inside the consumer — sleep, try again — holds a worker (and in ordered streams, the whole partition) for the full backoff. Better patterns:

- **Delayed redelivery:** `nack` with a delay or extend the visibility timeout. SQS redelivers after the timeout; RabbitMQ can route through delay queues using TTL plus a dead-letter exchange.
- **Retry topics (Kafka):** on failure, publish the message to `orders.retry.1m`, then `orders.retry.10m`, then the DLQ, and commit the original offset. Separate consumers read the retry topics after the delay. The main partition keeps flowing.
- **Bounded attempts:** after N attempts (SQS's `maxReceiveCount`), move the message to the DLQ automatically.

```calc
title: How long before a message is dead-lettered?
prompt: A consumer retries a failing message with exponential backoff — waits of **1, 2, 4, 8, 16, 32** minutes — and dead-letters it after the 7th failed attempt. Ignoring processing time, how many **minutes** after the first attempt does it land in the DLQ?
answer: 63
unit: minutes
tolerance: 1.02
steps: |
  The waits before attempts 2–7 sum to 1 + 2 + 4 + 8 + 16 + 32 = **63 minutes**. That's long enough to ride out most transient blips and short deploys. If your SLA promises results within 15 minutes, you'd shorten the schedule and alert sooner, because by the time a message is dead-lettered its user has long since noticed.
```

> [!mistake] Retrying permanent errors forever
> Infinite retries convert one bad message into a permanent capacity drain — and, in ordered consumers, into a full stop for every message behind it. Every retry loop needs a bound and a destination.

## Poison messages in ordered streams

When ordering matters (per account, per entity), you can't just skip a failed message: later events for the same key may depend on it. Options, from simplest:

1. **Dead-letter it and keep going**, accepting that later events for that key are processed without it (fine when events are independent or idempotent "latest state" updates).
2. **Park the key:** dead-letter the message *and* divert all subsequent messages for the same key to the DLQ (or a holding table) until it's fixed, while other keys flow normally.
3. **Stop the partition** and page someone — only when correctness demands it, and with alerting that fires in minutes, not hours.

```predict
prompt: A consumer of a 12-partition topic hits a message it can't deserialise and retries it in a loop without committing. What do you see?
choices:
  - A single error; everything else continues
  - Lag on that one partition climbs steadily while the other 11 are fine; consumer health checks still pass
  - The whole topic stops
  - Kafka deletes the bad message after three tries
answer: 1
reveal: |
  Kafka has no per-message acknowledgement or automatic dead-lettering — a consumer group's progress per partition is just an offset. If the consumer won't move past offset N, everything after N in that partition waits. That's why Kafka consumers implement their own retry topics and DLQs, and why **per-partition lag** (and its age) is the metric to alert on, not "is the process up".
```

## Owning the dead-letter queue

A DLQ is only useful if someone looks at it:

- **Alert** on any message arriving (or on a rate threshold), routed to the team that owns the consumer.
- **Keep context:** original payload, headers, error message and stack trace, attempt count and first-failure time.
- **Retain** long enough to investigate and fix (SQS's maximum is 14 days — longer for anything regulatory, so archive elsewhere).
- **Dashboard** DLQ depth and age by error type, so a new failure mode stands out.

```order
prompt: Order a safe redrive after fixing a bug that sent 4,000 messages to the DLQ.
items:
  - Group the dead-lettered messages by error and confirm the fix covers each group
  - Deploy the consumer fix, and verify it on a small sample replayed from the DLQ
  - Check that processing is idempotent for messages that partly succeeded before failing
  - Redrive the rest at a throttled rate while watching error rates and downstream load
  - Investigate or archive whatever fails again, and record why in the incident notes
explain: Redrive is just more traffic — throttle it so it doesn't become an incident of its own. Idempotency matters because some messages failed *after* a side effect. And keep the original message identity, so downstream deduplication still recognises them.
```

```incident
title: The DLQ is filling up
intro: |
  09:40. An alert fires: 12,000 messages have entered `invoices-dlq` in the last ten minutes, up from a usual handful a day. The invoice consumer is running, and the main queue is almost empty.
start: s1
nodes:
  s1:
    text: What do you check first?
    options:
      - {label: 'Look at the error messages and timestamps on a sample of dead-lettered messages', next: s2, quality: good, note: 'Find out whether it is one message type, one dependency, or everything.'}
      - {label: 'Redrive the whole DLQ immediately', next: bad1, quality: bad, note: 'Without knowing why they failed, they will just fail again — or cause damage.'}
      - {label: 'Purge the DLQ to stop the alert', next: bad2, quality: bad, note: 'Deleting 12,000 invoices to silence an alert.'}
  bad1:
    text: All 12,000 fail again within minutes and land back in the DLQ, and the PDF service gets 12,000 extra requests. You've learned nothing new.
    options:
      - {label: 'Look at the errors', next: s2, quality: good}
  bad2:
    text: Customers will not receive 12,000 invoices, and finance will find out at month-end. You have to recover the data from logs, if you can.
    verdict: bad
  s2:
    text: |
      Every error is `ConnectError: pdf-renderer:8080` starting at 09:30. The PDF renderer's deploy failed at 09:29. The messages themselves are fine.
    options:
      - {label: 'Roll back the renderer, then make the consumer back off on dependency-wide errors instead of dead-lettering', next: s3, quality: good, note: 'Fix the cause, and stop treating an outage as bad messages.'}
      - {label: 'Raise maxReceiveCount from 5 to 500', next: s3b, quality: ok, note: 'It reduces dead-lettering during outages, but now genuinely bad messages loop 500 times.'}
  s3b:
    text: Fewer messages hit the DLQ during the next outage, but a malformed invoice now retries 500 times and delays others. You still need to distinguish outages from bad messages.
    verdict: ok
  s3:
    text: The renderer is healthy again. What about the 12,000 messages in the DLQ?
    options:
      - {label: 'Redrive them at a throttled rate, relying on the idempotent invoice key to skip any already sent', next: done, quality: good}
      - {label: 'Redrive them all at full speed', next: done2, quality: ok}
  done:
    text: All invoices go out within 20 minutes with no duplicates, and you add a circuit breaker that pauses consumption when the renderer's error rate spikes.
    verdict: good
  done2:
    text: It works, but the burst briefly overloads the renderer you just rolled back, causing a second wave of failures. Throttle redrives next time.
    verdict: ok
debrief: |
  A DLQ spike is either **bad messages** (data or code problem, specific to some messages) or a **bad dependency** (everything fails the same way). The response differs: fix and redrive the first; pause and back off for the second, so good messages never reach the DLQ.
```

```bug
title: Consumer error handling
prompt: Which lines make this consumer fragile?
lang: python
code: |
  def handle(msg):
      for attempt in range(1000):
          try:
              process(msg)
              return ack(msg)
          except Exception as e:
              time.sleep(5)
      send_to_dlq(msg)
bug: [2, 6, 7]
explain: |
  **Line 2:** a thousand attempts at 5 s each ties up this worker (and, in an ordered consumer, the whole partition) for over an hour per bad message. **Line 6** treats every exception the same — validation errors that will never succeed get retried a thousand times, while dependency outages should pause the whole consumer, not each message. **Line 7** sleeps inline instead of using delayed redelivery or retry topics, so the worker does nothing useful while waiting. Classify errors, use few inline attempts, push delayed retries back through the broker, and dead-letter permanent failures with their error context.
fix: |
  def handle(msg):
      try:
          process(msg)
          ack(msg)
      except PermanentError as e:            # validation, missing references
          send_to_dlq(msg, error=e, attempts=msg.attempts)
          ack(msg)
      except DependencyDown:
          breaker.trip()                     # pause consumption; do not burn attempts
          nack(msg, requeue=True)
      except TransientError:
          retry_later(msg, delay=backoff(msg.attempts))   # via retry topic / delayed redelivery
          ack(msg)
```

```interview
say: |
  "Consumers classify failures. Transient errors are retried through delayed redelivery — retry topics at 1 and 10 minutes — so the main stream keeps moving. Permanent errors go to a DLQ with the payload, error and attempt count; anything arriving there alerts the owning team. Dependency-wide failures trip a circuit breaker that pauses consumption instead of dead-lettering good messages. After a fix we redrive from the DLQ, throttled, relying on idempotent processing with the original message IDs. We alert on per-partition lag age and DLQ inflow."
followups:
  - q: Why not just retry forever?
    a: Permanent failures never succeed, so infinite retries waste capacity and, in ordered consumers, block everything behind the bad message. Bound attempts and park the rest.
  - q: How do you handle ordering when one message fails?
    a: Decide per domain. If events are independent or idempotent "latest state" updates, skip and dead-letter. If later events depend on it, park the key — divert its subsequent events — while other keys continue.
  - q: What makes a redrive safe?
    a: The root cause is fixed, the fix has been tested on a sample, processing is idempotent with the original IDs, and replay is throttled while you watch errors and downstream load.
weak: |
  "Failed messages go to a DLQ." No classification, no owner, no alerting, no redrive plan, and every outage floods the DLQ with good messages.
strong: |
  Classifies failures, retries out of band with bounded backoff, handles poison messages in ordered streams, owns and alerts on the DLQ, and redrives safely and idempotently.
```

```recall
prompt: Explain why a consumer should treat "this message is invalid" differently from "the database is down", and what it should do in each case.
points:
  - An invalid message fails permanently — retrying the same message won't help
  - It should be dead-lettered with error context after at most a few attempts, so it doesn't block or waste capacity
  - A database outage affects every message, so the messages themselves are fine
  - The consumer should pause or back off as a whole (circuit breaker), not dead-letter good messages, then resume when the dependency recovers
model: |
  An invalid message — bad schema, a reference that will never exist — fails the same way every time, so retries waste capacity and can block an ordered partition. Dead-letter it quickly with the payload and error so someone can fix the code or the data. A database outage is different: every message fails, but none of them is bad. Dead-lettering would fill the DLQ with good work that then has to be redriven. Instead, detect the dependency-wide failure, trip a breaker or back off the whole consumer, keep messages in the queue, and resume when the database is back.
```

```questions
- kind: check
  prompt: A message fails validation because a required field is missing. What should the consumer do?
  choices:
    - text: Dead-letter it with the error context so it can be fixed, rather than retrying it repeatedly
      correct: true
    - text: Retry it with exponential backoff for an hour
      why: The same bytes fail the same way every time.
    - text: Drop it silently
      why: The data is lost and nobody learns about the bug.
    - text: Stop the consumer until someone fixes it
      why: That blocks every good message to protect one bad one, unless strict ordering requires it.
  explanation: Permanent failures go to a DLQ quickly. Retries are for things that can heal.
- kind: check
  type: multi
  prompt: Which make a dead-letter queue genuinely useful? Select all that apply.
  choices:
    - text: Alerts to the owning team when messages arrive
      correct: true
    - text: The original payload, error details and attempt count stored with each message
      correct: true
    - text: A documented, throttled redrive procedure
      correct: true
    - text: Retention long enough to investigate and fix
      correct: true
    - text: Auto-purging messages after an hour to keep it tidy
      why: That deletes the evidence and the work before anyone can act.
  explanation: A DLQ is a work queue for humans. Without ownership, context and redrive, it's just a place where data dies quietly.
- kind: check
  prompt: Every message has failed with "connection refused" to the database for 5 minutes. What's the best behaviour?
  choices:
    - text: Pause or back off consumption (circuit breaker) instead of dead-lettering every message
      correct: true
    - text: Dead-letter each message after 3 attempts
      why: That moves thousands of good messages into the DLQ, all of which then need redriving.
    - text: Retry each message immediately in a loop
      why: That hammers the recovering database and burns CPU.
    - text: Delete the queue
      why: That loses all pending work.
  explanation: A dependency-wide failure isn't a message problem. Stop consuming, keep messages in the queue, and resume when it recovers.
- kind: check
  type: numeric
  prompt: Retries wait 30 s, 1 min, 2 min, 4 min and 8 min between attempts. How many minutes pass between the first attempt and the sixth?
  answer: 15.5
  unit: minutes
  tolerance: 0.02
  explanation: 0.5 + 1 + 2 + 4 + 8 = 15.5 minutes. Retry schedules set how long a failing message stays invisible to everyone, so align them with latency expectations.
- kind: fire
  prompt: One malformed message sits at offset 5,200 in a Kafka partition, and the consumer retries it indefinitely without committing. What happens to later messages in that partition?
  choices:
    - text: They all wait — the partition's progress is stuck at that offset
      correct: true
    - text: Kafka skips the bad message automatically after a few tries
      why: Kafka has no per-message failure handling. Progress is just the committed offset.
    - text: Other consumers in the group take over the later messages
      why: A partition is owned by one consumer at a time.
    - text: The messages are deleted
      why: Retention deletes by age or size, not because a consumer is stuck.
  explanation: Kafka consumers need their own retry topics and DLQs, and alerts on per-partition lag, so one poison message can't stall a partition silently.
- kind: fire
  prompt: Why route Kafka retries through separate delay topics instead of sleeping in the consumer?
  choices:
    - text: The main partition keeps flowing while failed messages wait elsewhere for their retry delay
      correct: true
    - text: Retry topics guarantee success on the second attempt
      why: They only change where and when the message waits.
    - text: Sleeping isn't possible in Kafka consumers
      why: It's possible, which is exactly the trap.
    - text: Retry topics make messages smaller
      why: Size doesn't change.
  explanation: Moving failures out of band preserves throughput and avoids blocking ordered partitions on a backoff.
- kind: fire
  prompt: After fixing a bug, you redrive 50,000 dead-lettered messages, some of which partly succeeded before failing. What must be true?
  choices:
    - text: Processing is idempotent with the original message identities, and redrive is throttled
      correct: true
    - text: Messages get new IDs so they're treated as new
      why: New IDs defeat deduplication and can repeat side effects.
    - text: Redrive runs at maximum speed to finish quickly
      why: Unthrottled redrive can overload downstream systems and cause a new incident.
    - text: The DLQ must be purged first
      why: Purging deletes the messages you're trying to recover.
  explanation: Redrive replays work that may have partly happened. Keep the identities, rely on idempotency, and pace it.
- kind: fire
  level: advanced
  prompt: Per-account ordering matters, and one account's event is poison. How do you keep other accounts flowing without breaking that account's ordering?
  choices:
    - text: Park the key — dead-letter the bad event and divert that account's later events to a holding queue until it's resolved
      correct: true
    - text: Skip the bad event and keep processing the account's later events
      why: Later events may depend on the skipped one, which breaks the account's ordering.
    - text: Stop the whole partition until the event is fixed
      why: That blocks thousands of unrelated accounts.
    - text: Reorder the partition
      why: You can't reorder a log, and doing so would break the ordering guarantee anyway.
  explanation: Key-level parking isolates the failure to the affected key while preserving its order and letting everyone else proceed.
- kind: fire
  type: multi
  prompt: Which signals should alert on a consumer pipeline? Select all that apply.
  choices:
    - text: Age of the oldest unprocessed message or per-partition lag in time
      correct: true
    - text: Rate of messages entering the DLQ
      correct: true
    - text: Retry rate by error type
      correct: true
    - text: Whether the consumer process is running
      why: A stuck consumer still runs. Liveness says nothing about progress.
  explanation: Progress and failure signals catch stuck partitions, poison messages and dependency problems that "process is up" misses.
```
