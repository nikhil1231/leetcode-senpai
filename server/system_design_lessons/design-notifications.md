---
id: design-notifications
category: casebook
skill: retries
title: Design a notification service
minutes: 20
summary: A shared platform that other teams call to reach users by push, email, SMS and in-app inbox. The hard parts aren't sending — they're keeping a 50-million-message campaign from delaying a password reset, never sending the same notification twice, honouring preferences and quiet hours, and surviving third-party providers that throttle and fail.
objectives:
  - Design an accept-and-queue API with idempotency and priority lanes
  - Apply preferences, quiet hours, deduplication and per-user rate limits in the pipeline
  - Integrate rate-limited, unreliable providers with backoff, circuit breakers and failover
  - Fan out campaigns in batches and track delivery status end to end
sources:
  - ['Apple: Sending notification requests to APNs', 'https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns']
  - ['Firebase Cloud Messaging: Throttling and quotas', 'https://firebase.google.com/docs/cloud-messaging/concept-options#throttling-and-quotas']
  - ['Uber engineering: Uber’s real-time push platform', 'https://www.uber.com/blog/real-time-push-platform/']
case: notifications
---

## 1. Requirements

- **Callers** (other services) send "notify user U about event E" with a category (security, transactional, social, marketing).
- **Channels:** push (APNs/FCM), email, SMS, in-app inbox.
- **Scale:** 1B notifications/day; campaigns of 50M at once.
- **Latency:** security and transactional (OTP, password reset, order shipped) within seconds; marketing can take hours.
- **Correctness:** at most one delivery per notification per channel, even if callers retry.
- **User control:** opt-outs per category and channel; quiet hours for non-urgent categories; frequency caps.
- **Providers** throttle and fail; SMS costs money and attracts fraud.

```predict
prompt: All notifications share one queue, and marketing launches a 50M-message campaign at 09:00. A user requests a password reset at 09:01. With a single FIFO queue processing 20k messages/s, how long might the reset email wait?
choices:
  - Seconds — the queue is fast
  - Around 40 minutes — it sits behind 50M marketing messages
  - It's sent first because it's important
  - It's dropped
answer: 1
reveal: |
  50M ÷ 20k/s = 2,500 s ≈ 42 minutes. A FIFO doesn't know what matters. Separate **priority lanes** — distinct queues with dedicated (or strictly prioritised) consumers and provider capacity — keep transactional traffic flowing regardless of bulk load.
```

## 2. API and data

```http
POST /v1/notifications
Idempotency-Key: order-881-shipped
{ "user_id": 42, "category": "transactional", "template": "order_shipped",
  "data": {"order": 881}, "channels": ["push", "email"] }
-> 202 {notification_id}
```

- `notifications(notification_id, idempotency_key UNIQUE per caller, user_id, category, template, data, created_at)`
- `deliveries(notification_id, channel, status, provider_message_id, attempts, updated_at)` — one row per channel, with a state machine: pending → sent → delivered | failed | suppressed.
- `preferences(user_id, category, channel, enabled)`, `quiet_hours(user_id, start, end, tz)`
- `devices(user_id, device_token, platform, last_seen)` — invalid tokens are pruned from provider feedback.

## 3. Pipeline

```arch
title: Notification pipeline
nodes:
  - {id: caller, label: Calling service, kind: service, x: 0, y: 1}
  - {id: api, label: Notify API, kind: service, x: 1, y: 1, note: 'idempotency'}
  - {id: hi, label: Priority queue, kind: queue, x: 2, y: 0, note: 'security, transactional'}
  - {id: lo, label: Bulk queue, kind: queue, x: 2, y: 2, note: 'social, marketing'}
  - {id: proc, label: Processors, kind: worker, x: 3, y: 1, note: 'prefs, quiet hours, render'}
  - {id: push, label: Push sender, kind: worker, x: 4, y: 0}
  - {id: mail, label: Email sender, kind: worker, x: 4, y: 1}
  - {id: sms, label: SMS sender, kind: worker, x: 4, y: 2}
  - {id: prov, label: APNs / FCM / email / SMS, kind: external, x: 5, y: 1}
edges:
  - [caller, api, 'POST']
  - [api, hi, 'urgent']
  - [api, lo, 'bulk']
  - [hi, proc, '']
  - [lo, proc, '']
  - [proc, push, '']
  - [proc, mail, '']
  - [proc, sms, '']
  - [push, prov, '']
  - [mail, prov, '']
  - [sms, prov, '']
paths:
  - label: Order shipped
    steps:
      - [caller, api, 'POST with Idempotency-Key order-881-shipped. A retry returns the same notification_id.']
      - [api, hi, 'Persist the notification + outbox; route the transactional category to the priority lane']
      - [hi, proc, 'Load preferences (cached): push yes, email yes; not in quiet hours (transactional bypasses them anyway); under the frequency cap']
      - [proc, push, 'Render the template per channel and locale; enqueue one delivery per channel']
      - [push, prov, 'Send via APNs/FCM within the per-provider rate limit; record the provider message ID; mark sent']
```

## 4. Deep dives

### Deduplication at every hop

```timeline
title: A sender crashes mid-send
lanes: [Push sender, Delivery table, APNs]
state: {Delivery: pending, 'Pushes on phone': '0'}
steps:
  - {lane: Push sender, to: Delivery table, text: "claim delivery (n-55, push): pending → sending, lease 60 s", set: {Delivery: sending}}
  - {lane: Push sender, to: APNs, text: 'send with apns-collapse-id n-55', set: {'Pushes on phone': '1'}}
  - {lane: Push sender, to: Delivery table, text: "mark sent, provider id", set: {Delivery: sent}}
crashes:
  - after: 1
    label: after APNs accepted, before marking sent
    verdict: duplicate
    text: The lease expires and another sender retries. APNs accepts a second push — but the shared collapse ID (and a client-side dedupe on notification_id) means the user sees one notification. For email and SMS, pass the notification ID as the provider's idempotency or reference key where supported, and accept that a rare duplicate is possible where it isn't.
  - after: 0
    label: after claiming, before sending
    verdict: safe
    text: The lease expires, another sender claims it and sends once.
```

### Providers fail and throttle

- **Per-provider token buckets** matching their documented quotas, so you slow down instead of getting banned.
- **Circuit breakers** per provider: on sustained errors, stop sending, keep messages queued, and probe.
- **Failover** for SMS and email across two providers; push has no alternative to APNs/FCM.
- **Retry with backoff** for transient errors; **don't retry** permanent ones (invalid token → delete the device; hard bounce → suppress the address).

```sort
prompt: How should each provider response be handled?
buckets: [Retry later with backoff, Stop and fix data (no retry), Slow down the whole channel]
items:
  - {text: 'APNs 410 Unregistered (device token no longer valid)', bucket: 1, why: 'The app was uninstalled. Delete the token, because retrying will never work.'}
  - {text: 'Email provider 503 for one request', bucket: 0, why: 'Transient. Retry with backoff.'}
  - {text: 'SMS provider 429 Too Many Requests', bucket: 2, why: 'You exceeded the quota. Reduce the send rate for that provider, not just this message.'}
  - {text: 'Hard bounce: mailbox does not exist', bucket: 1, why: 'Suppress the address. Repeated sends to bad addresses damage sender reputation.'}
  - {text: 'Timeout talking to FCM', bucket: 0, why: 'Unknown outcome. Retry with the same collapse key so a duplicate is merged.'}
```

### Campaigns

A 50M campaign isn't 50M API calls from the marketing tool. It's one campaign record plus a **segment** (a user query). A campaign scheduler expands the segment in batches (say 10k users per task), applies preferences, quiet hours (often sending at a local time per timezone) and frequency caps, and feeds the **bulk lane** at a controlled rate.

```calc
title: How long does the campaign take?
prompt: A **50M**-user campaign goes through the bulk lane. After preferences and opt-outs, **60%** of users are eligible for push. The push sender is allotted **15,000 pushes/s** (the rest is reserved for the priority lane). How many **minutes** to send all eligible pushes?
answer: 33
unit: minutes
tolerance: 1.05
steps: |
  50M × 0.6 = 30M pushes ÷ 15,000/s = 2,000 s ≈ **33 minutes**. Meanwhile the priority lane keeps its own capacity, so password resets stay instant. If the campaign must land at 09:00 local time in each timezone, the scheduler spreads it across timezone waves anyway.
```

```bug
title: The notify endpoint
prompt: Which lines cause duplicates, lost messages or ignored preferences?
lang: python
code: |
  @app.post("/v1/notifications")
  def notify(req):
      for channel in req.channels:
          provider_for(channel).send(req.user_id, render(req, channel))
      db.insert("notifications", req)
      return 200
bug: [4, 5]
explain: |
  **Line 4** sends synchronously to providers inside the API call, with no preference, quiet-hour or opt-out check, no rate limiting, and no idempotency — a caller retry after a timeout sends everything again, and a slow provider makes the API slow. **Line 5** records the notification only after sending, so a crash in between leaves no record to retry or deduplicate from. Persist with the idempotency key first, return 202, and let the queued pipeline apply preferences and send with per-provider limits.
```

```interview
say: |
  "Callers POST with an idempotency key; we persist the notification and an outbox entry, return 202, and route by category into a priority lane for security and transactional traffic and a bulk lane for social and marketing, each with dedicated capacity. Processors apply opt-outs, quiet hours and frequency caps, render per channel and locale, and create one delivery row per channel. Senders claim deliveries with leases, enforce per-provider token buckets and circuit breakers, pass collapse or idempotency keys, delete invalid tokens and suppress bounces. Campaigns expand segments in batches into the bulk lane. Delivery status flows back from provider callbacks."
followups:
  - q: How do you prevent duplicates?
    a: Idempotency keys at the API, one delivery row per (notification, channel) claimed with a lease, provider collapse or idempotency keys, and client-side dedupe on notification_id for push.
  - q: The SMS provider is down for 20 minutes. What happens?
    a: Its circuit breaker opens, SMS deliveries stay queued (or fail over to a secondary provider), and urgent OTPs can fall back to another channel if the user allows it. Then sends drain at the provider's rate limit.
  - q: How do quiet hours work across timezones?
    a: Store each user's timezone. Non-urgent notifications falling in quiet hours are scheduled for the window's end (a delay queue), while security notifications bypass quiet hours.
weak: |
  "The API calls APNs and SendGrid directly." No queueing, priorities, preferences, idempotency, provider limits or status tracking.
strong: |
  Accept-and-queue with idempotency, priority lanes, a preference-aware pipeline, lease-based senders with provider rate limits, breakers and failover, batched campaigns, and delivery tracking.
```

```recall
prompt: Explain how you'd make sure a password-reset email is sent within seconds while a 50M-message marketing campaign is running.
points:
  - Classify notifications by category and route security and transactional ones to a separate priority lane (queue)
  - Give the priority lane dedicated consumers and reserved provider capacity (rate-limit budget)
  - Feed the campaign into a bulk lane at a controlled rate, expanded from a segment in batches
  - Monitor queue age per lane and alert if the priority lane's age exceeds seconds
model: |
  Categories map to lanes. The reset email is "security", so it goes to a priority queue with its own consumers and a reserved slice of each provider's rate limit, while the campaign is expanded in batches by a scheduler into a bulk queue and drained at whatever rate is left. Because they never share a FIFO or a provider budget, 50M marketing messages can't sit in front of the reset email. I'd alert on the priority lane's oldest-message age — anything over a few seconds is an incident — and let bulk lag by minutes or hours without concern.
```

```bug
style: critique
title: A candidate's notification platform
prompt: The candidate describes a shared notification service for push, email and SMS. Which claims would you push back on?
lang: text
code: |
  All notifications go through one queue, processed first in, first out.
  Each request carries an idempotency key, so a caller's retry does not send twice.
  User preferences and quiet hours are checked before sending.
  Provider calls are retried with backoff, and permanently failing tokens are removed.
  A 50-million-user marketing campaign is enqueued at once so it finishes as fast as possible.
  Delivery status from providers is recorded for each message.
bug: [1, 5]
explain: |
  **Lines 1 and 5:** in one FIFO queue, a 50M-message campaign enqueued at once delays every password reset and 2FA code behind it. Separate queues (or priorities) by class, and rate-limit campaigns so they drain without starving transactional traffic or tripping provider limits.
```

```questions
- kind: check
  type: numeric
  prompt: A single FIFO queue drains 25,000 messages/s, and 45M campaign messages are ahead of a password reset. How many minutes does the reset wait?
  answer: 30
  unit: minutes
  tolerance: 0.02
  explanation: 45M ÷ 25,000 = 1,800 s = 30 minutes. That's why urgent traffic needs its own lane.
- kind: check
  type: multi
  prompt: Which steps belong in the processing pipeline before a notification is sent? Select all that apply.
  choices:
    - text: Check the user's opt-outs for the category and channel
      correct: true
    - text: Apply quiet hours for non-urgent categories
      correct: true
    - text: Apply per-user frequency caps
      correct: true
    - text: Render the template per channel and locale
      correct: true
    - text: Ask the user for permission by email first
      why: Preferences are already stored.
  explanation: Users control what reaches them. The pipeline enforces it consistently for every caller.
- kind: check
  prompt: APNs returns "410 Unregistered" for a device token. What should the sender do?
  choices:
    - text: Stop sending to it and delete or deactivate the token
      correct: true
    - text: Retry with exponential backoff
      why: The app is gone, so it will never succeed.
    - text: Switch to FCM for that token
      why: Tokens are platform-specific.
    - text: Mark the notification delivered
      why: It wasn't.
  explanation: Permanent errors fix the data. Retries are for transient ones.
- kind: check
  prompt: Why does the notify API return 202 instead of sending synchronously?
  choices:
    - text: Providers are slow and fail; queueing keeps callers fast, enables retries, priorities and rate limiting
      correct: true
    - text: Providers require asynchronous calls
      why: They accept synchronous API calls.
    - text: 202 is faster to serialise
      why: Unrelated.
    - text: To hide failures from callers
      why: Status is exposed through delivery tracking.
  explanation: Accept durably, then deliver with the machinery the problem needs.
- kind: fire
  prompt: A push sender crashes after APNs accepted a push but before recording it, and another sender retries. How is a visible duplicate avoided?
  choices:
    - text: Use the notification ID as the APNs collapse ID and deduplicate on the client
      correct: true
    - text: APNs never accepts duplicates
      why: It accepts them unless they're collapsed.
    - text: Don't retry pushes ever
      why: That loses notifications when the send itself failed.
    - text: Send by SMS instead
      why: That doesn't address duplicates.
  explanation: Downstream dedupe keys make at-least-once sending invisible to users.
- kind: fire
  prompt: The SMS provider returns 429 repeatedly. What's the right response?
  choices:
    - text: Lower the send rate for that provider (token bucket or breaker), keep messages queued, and consider a secondary provider
      correct: true
    - text: Retry every message immediately
      why: That deepens the throttling and risks a ban.
    - text: Drop all SMS
      why: Users lose OTPs and alerts.
    - text: Mark them failed permanently
      why: It's a temporary rate limit.
  explanation: Throttling is a channel-level signal. Adapt the rate for the whole provider.
- kind: fire
  prompt: How should a 50M-user campaign be fed into the system?
  choices:
    - text: As one campaign plus a segment that a scheduler expands in batches into the bulk lane at a controlled rate
      correct: true
    - text: 50M individual API calls from the marketing tool as fast as possible
      why: That floods the API and the shared queues.
    - text: Through the priority lane so it finishes faster
      why: That starves urgent traffic.
    - text: A single giant message with all user IDs
      why: That's unbounded and impossible to retry partially.
  explanation: Batching and pacing protect shared capacity and allow per-batch retries.
- kind: fire
  level: advanced
  prompt: A non-urgent notification would arrive during a user's quiet hours (23:00–07:00 in their timezone). What should happen?
  choices:
    - text: Schedule it for delivery at the end of the quiet window (delay queue), unless the category bypasses quiet hours
      correct: true
    - text: Drop it
      why: The user still wants it — just not now.
    - text: Send it anyway
      why: That breaks the preference.
    - text: Convert it to SMS
      why: SMS at night is even more intrusive.
  explanation: Quiet hours defer non-urgent messages. Security messages bypass them.
- kind: fire
  type: order
  prompt: Order the flow of a transactional notification.
  items:
    - Caller POSTs with an idempotency key
    - Persist and route to the priority lane
    - Apply preferences, quiet hours and caps, then render per channel
    - Senders claim deliveries and send within provider rate limits
    - Record provider IDs and update delivery status from callbacks
  explanation: Durable acceptance, policy evaluation, controlled sending, then status tracking.
```
