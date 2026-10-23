---
id: design-chat
category: casebook
skill: retries
title: Design a chat system
minutes: 22
summary: A WhatsApp/Slack-style messenger — one-to-one and group conversations, delivery and read receipts, presence, offline push and history. The connection is never the source of truth. Messages are persisted with per-conversation sequence numbers before delivery, gateways route through a backplane, and every client resumes from its last acknowledged sequence.
objectives:
  - Scope and size a messaging system, including connections and message throughput
  - Design send, deliver, store and resume with ordering and at-least-once delivery deduplicated on the client
  - Model receipts, presence and group fan-out at scale
  - Plan storage, failure handling and evolution
sources:
  - ['Discord engineering: How Discord stores trillions of messages', 'https://discord.com/blog/how-discord-stores-trillions-of-messages']
  - ['Slack engineering: Real-time messaging', 'https://slack.engineering/real-time-messaging/']
  - ['WhatsApp: Encryption overview (Signal protocol)', 'https://faq.whatsapp.com/820124435853543']
case: chat
---

## 1. Requirements

**Functional:** 1:1 chats and groups (up to 1,000 members), send text and media, message history across devices, delivery and read receipts, online/last-seen presence, push notifications when offline.

**Non-functional:** 500M daily active users; messages delivered to online recipients in < 500 ms p99; **no message loss** once the sender sees "sent"; order preserved within a conversation; history kept indefinitely; multi-device.

**Out of scope:** end-to-end encryption details (we'll note the implications), voice and video calls, bots.

```sort
prompt: Which guarantee does each feature need?
buckets: [Strict — never lose or reorder, Best effort is fine]
items:
  - {text: 'Message content in a conversation', bucket: 0, why: 'Lost or reordered messages break conversations. Persist and sequence them.'}
  - {text: 'Typing indicators', bucket: 1, why: 'Ephemeral. Dropping one costs nothing, so never persist them.'}
  - {text: '"Online now" presence', bucket: 1, why: 'Approximate is fine. It''s heartbeats with timeouts.'}
  - {text: 'Read receipts', bucket: 0, why: 'Eventually accurate, and monotonic — a message must never go from "read" back to "delivered". Store the highest read sequence per member.'}
  - {text: 'Push notification for a new message', bucket: 1, why: 'Best effort. The app syncs from the server when opened.'}
```

## 2. Estimates

```faded
title: Size the messenger
prompt: Fill in the numbers.
text: |
  500M DAU × 40 messages/day = 20B messages/day ≈ [[#230000]] messages/s on average, maybe ~700k/s at peak.

  At ~200 bytes per message with metadata, 20B × 200 B ≈ [[4 TB|40 GB|400 TB]] of new data per day, so about 1.5 PB/year before replication. This needs a horizontally scalable store.

  Concurrent connections: if 30% of DAU are online at peak, that's 150M WebSockets. At ~500k per gateway, that's [[#300]] gateway servers.

  Each 1:1 message is delivered to one other device set, but a message in a 1,000-member group needs up to [[1,000|1|1,000,000]] deliveries.
explain: Message throughput and storage call for a partitioned wide-column store. Connections call for a large stateless-ish gateway tier. Groups multiply delivery, so large groups need different handling.
```

## 3. Data model

```sql
-- Wide-column (Cassandra/ScyllaDB-style), partitioned by conversation and time bucket.
messages (
  conversation_id  uuid,
  bucket           int,        -- e.g. 10-day window, so partitions don't grow forever
  seq              bigint,     -- per-conversation sequence, assigned at write
  message_id       uuid,       -- client-generated, for idempotent retries
  sender_id        bigint,
  body             blob,       -- ciphertext if end-to-end encrypted
  sent_at          timestamp,
  PRIMARY KEY ((conversation_id, bucket), seq)
) WITH CLUSTERING ORDER BY (seq DESC);

conversation_members (conversation_id, user_id, last_read_seq, last_delivered_seq)
user_conversations   (user_id, last_activity, conversation_id)   -- inbox list, newest first
```

Discord's write-up describes the same shape: messages partitioned by channel and a time bucket, clustered by a time-sortable ID.

## 4. Architecture

```arch
title: Chat system
nodes:
  - {id: a, label: Alice (2 devices), kind: client, x: 0, y: 0}
  - {id: gw1, label: Gateway 12, kind: service, x: 1, y: 0}
  - {id: chat, label: Chat service, kind: service, x: 2, y: 1}
  - {id: store, label: Message store, kind: db, x: 3, y: 1, note: 'per-conversation seq'}
  - {id: bus, label: Pub/sub, kind: stream, x: 2, y: 2}
  - {id: gw2, label: Gateway 87, kind: service, x: 1, y: 2}
  - {id: b, label: Bob, kind: client, x: 0, y: 2}
  - {id: push, label: APNs / FCM, kind: external, x: 3, y: 2}
  - {id: pres, label: Presence, kind: cache, x: 3, y: 0, note: 'TTL heartbeats'}
edges:
  - [a, gw1, 'WebSocket']
  - [gw1, chat, 'send']
  - [chat, store, 'append']
  - [chat, bus, 'publish user:bob']
  - [bus, gw2, 'deliver']
  - [gw2, b, 'frame']
  - [chat, push, 'offline']
  - [gw1, pres, 'heartbeat']
paths:
  - label: Send to an online user
    steps:
      - [a, gw1, 'Alice sends {conversation, message_id (client UUID), body}']
      - [gw1, chat, 'The gateway forwards it to a stateless chat service']
      - [chat, store, 'Assign the next seq for the conversation and append (dedupe by message_id). Ack Alice → one tick "sent".']
      - [chat, bus, 'Publish to the channels of every member device (user:bob, user:alice for her other device)']
      - [gw2, b, 'Gateway 87 pushes the frame. Bob''s client acks the seq → two ticks "delivered" (update last_delivered_seq)']
  - label: Bob is offline
    steps:
      - [chat, store, 'The message is persisted regardless']
      - [chat, push, 'No live connection, so send a push notification (preview or "new message")']
      - [b, gw2, 'Bob opens the app later and resumes: "conversation X after seq 1041" for each changed conversation']
```

## 5. Deep dives

### Ordering and idempotent sends

Order is defined by the server-assigned **per-conversation sequence**, not by client clocks. Assigning it needs a single serialisation point per conversation: the conversation's partition leader, a per-conversation counter (a conditional update or a lightweight transaction), or routing each conversation's writes to one owning chat-service instance. The client's `message_id` makes retries safe — a resend after a timeout finds the existing message and returns its seq.

```timeline
title: A send that times out
lanes: [Alice, Chat service, Message store]
state: {Stored: 'up to seq 1041', 'Alice sees': ''}
steps:
  - {lane: Alice, to: Chat service, text: 'send message_id=m-77 "on my way"'}
  - {lane: Chat service, to: Message store, text: 'append seq 1042 (m-77)', set: {Stored: 'up to 1042'}}
  - {lane: Chat service, to: Alice, text: 'ack seq 1042 … lost (tunnel)', set: {'Alice sees': 'clock icon (pending)'}}
  - {lane: Alice, to: Chat service, text: 'reconnect, resend m-77'}
  - {lane: Chat service, to: Message store, text: 'm-77 already stored at seq 1042 → return 1042, no new row'}
  - {lane: Chat service, to: Alice, text: 'ack seq 1042', set: {'Alice sees': '✓ sent'}}
crashes:
  - after: 1
    label: chat service dies after storing
    verdict: safe
    text: Alice's client never got an ack, so it resends m-77 to another instance, which finds it already stored and returns seq 1042. Without the client message_id this would be a duplicate message.
```

### Receipts and multi-device

Store per member the highest delivered and read sequence (`last_delivered_seq`, `last_read_seq`). These are monotonic counters: only move them forward (`UPDATE … SET last_read_seq = greatest(last_read_seq, $seq)`). In a group, "read by everyone" is when all members' `last_read_seq ≥ seq` — compute it lazily, or show per-member receipts only in small groups.

### Presence

Clients heartbeat every ~30 s; presence entries expire after ~60 s without one. Don't broadcast presence to everyone: fan out only to users who currently have that contact on screen (subscribe on view), and throttle updates. Presence at this scale is a high-churn, low-value signal — treat it like telemetry, not like messages.

### Group fan-out

```predict
prompt: A 1,000-member group receives 50 messages/s during a live event. With per-user channels, each message is published to every member's channel. What's the delivery load, and what changes for very large channels?
choices:
  - 50 deliveries/s — groups are cheap
  - 50,000 member deliveries/s for this one group; very large channels switch to per-channel subscriptions, where each gateway subscribes once and fans out to its local members
  - Impossible — groups can't exceed 100 members
  - The database must store 1,000 copies of each message
answer: 1
reveal: |
  Per-user fan-out multiplies by group size. For big groups or channels, publish once per **channel**, and let each gateway holding members subscribe once and deliver to its local sockets, so cross-node traffic scales with the number of gateways, not members. Storage stays one copy per message either way. Members fetch from the conversation's log, not from per-user copies.
```

```bug
title: Message send handler
prompt: Which lines break ordering or delivery guarantees?
lang: python
code: |
  async def send(user, conv_id, body, client_ts):
      msg = {"conv": conv_id, "sender": user.id, "body": body, "sort_key": client_ts}
      for member in members(conv_id):
          await gateways.push(member, msg)
      await store.insert(msg)
      return {"status": "sent"}
bug: [2, 4, 5]
explain: |
  **Line 2** orders by the client's timestamp. Device clocks are skewed or wrong, so messages reorder, and two messages can share a timestamp. Assign a server-side per-conversation sequence. **Lines 4–5** push to recipients *before* persisting. If the process dies after pushing but before storing, recipients saw a message that history doesn't contain; if a push fails, there's no record to resume from. Persist first (with seq and a client message_id for idempotency), then fan out, and let offline or failed deliveries be caught up through resume-by-seq.
```

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Gateway crash | Clients reconnect (jittered backoff) to another gateway and resume after their last acked seq per conversation |
| Pub/sub hiccup | Some live deliveries are missed; clients detect sequence gaps and fetch the missing range |
| Message store partition unavailable | Sends to affected conversations fail with retry; the client keeps the message pending (clock icon) and resends with the same message_id |
| Push provider down | Offline users see messages when they next open the app (sync on open) |

```order
prompt: Order the steps when Bob's phone reconnects after being offline for an hour.
items:
  - Reconnect to a gateway with backoff and authenticate with a short-lived token
  - Fetch the list of conversations with activity since the last sync (user_conversations)
  - For each, request messages after the last acked seq
  - Render, deduplicating by seq, then ack the highest seq per conversation
  - Send read receipts for conversations the user opens
explain: Sync is pull-based and sequence-driven, so it's correct regardless of which live deliveries or push notifications were missed.
```

```interview
say: |
  "Clients hold WebSockets to a gateway tier, about 300 gateways at 150M concurrent connections. A send goes to a stateless chat service that assigns the next per-conversation sequence, appends to a Cassandra-style table partitioned by (conversation, time bucket), deduplicates by the client message_id, and acks the sender. It then publishes to member channels on a backplane; gateways holding those devices push frames, and clients ack seqs for delivery receipts. Offline members get APNs/FCM pushes and resume by seq when they reconnect. Receipts are monotonic per-member counters, presence is heartbeats with TTL fanned out only to viewers, and big channels use per-channel subscriptions."
followups:
  - q: How do you guarantee ordering?
    a: A server-assigned sequence per conversation from a single serialisation point — the partition leader or a conditional counter — never client timestamps. Clients render by seq and detect gaps.
  - q: What does end-to-end encryption change?
    a: The server stores and routes ciphertext and can't index or search contents. Per-device keys mean messages are encrypted for each recipient device, so multi-device delivery and history sync need device key management (as in the Signal protocol).
  - q: How do you avoid losing a message the sender saw as sent?
    a: "Sent" is shown only after the message is durably stored with a seq. Everything else — live push, notifications — is a delivery optimisation recoverable through resume.
weak: |
  Delivers over the socket and stores later, orders by client timestamps, one table per user's inbox with full copies, broadcasts presence to everyone.
strong: |
  Persist-then-deliver with per-conversation sequences and client message IDs, a gateway-plus-backplane topology, resume by seq, monotonic receipts, scoped presence, and big-group fan-out via channel subscriptions.
```

```recall
prompt: Explain how a chat system guarantees that messages in a conversation are never lost and always appear in the same order for every participant.
points:
  - The sender's message is durably stored before it's acknowledged as sent
  - The server assigns a monotonically increasing per-conversation sequence number, from a single serialisation point, not client clocks
  - Client-generated message IDs make retried sends idempotent
  - Clients render by sequence, ack the highest seq they've processed, and on reconnect fetch everything after it, deduplicating by seq
model: |
  The chat service only tells the sender "sent" after appending the message to durable storage with the next sequence number for that conversation. The sequence comes from one place per conversation — the partition leader or a conditional counter — so every participant sees the same order regardless of device clocks. The client attaches its own message ID, so a resend after a lost ack finds the stored message instead of creating a duplicate. Live delivery is just a fast path: each client acks the highest sequence it has, and after any disconnect it asks for everything after that number, ignoring duplicates.
```

```questions
- kind: check
  prompt: What should define the order of messages in a conversation?
  choices:
    - text: A server-assigned per-conversation sequence number
      correct: true
    - text: The sender device's timestamp
      why: Clocks are skewed and can collide.
    - text: The order in which recipients receive them
      why: That varies per recipient.
    - text: Alphabetical order of message IDs
      why: Random IDs carry no order.
  explanation: One serialisation point per conversation gives every participant the same order.
- kind: check
  type: numeric
  prompt: 500M DAU send 40 messages each per day. What's the average message rate in thousands per second? (86,400 s/day)
  answer: 231
  unit: k messages/s
  tolerance: 0.03
  explanation: 20B ÷ 86,400 ≈ 231k/s on average, with peaks several times higher.
- kind: check
  type: multi
  prompt: Which must happen before a message is shown to the sender as "sent"? Select all that apply.
  choices:
    - text: The message is durably stored
      correct: true
    - text: It has been assigned its conversation sequence number
      correct: true
    - text: It has been delivered to every recipient
      why: That's "delivered" (two ticks), a later state.
    - text: It has been read by the recipient
      why: That's the read receipt.
  explanation: "Sent" means durably accepted. Delivery and read are later, separately tracked states.
- kind: check
  prompt: Why shouldn't presence updates be broadcast to all of a user's contacts?
  choices:
    - text: Presence churns constantly and is low value; fan it out only to viewers who currently have that contact on screen
      correct: true
    - text: Presence is private by law
      why: Privacy settings matter, but the scaling issue is the main reason.
    - text: Presence can't be stored
      why: It's stored with TTLs.
    - text: Contacts don't care
      why: They care — but only when looking.
  explanation: Treat presence like telemetry. Subscribe on view and throttle updates.
- kind: fire
  prompt: A sender's ack is lost and the client resends. What prevents a duplicate message?
  choices:
    - text: The client-generated message_id; the server finds it already stored and returns the original seq
      correct: true
    - text: The server's clock
      why: Clocks don't identify messages.
    - text: TCP retransmission
      why: The resend uses a new connection.
    - text: Nothing — duplicates are acceptable in chat
      why: Duplicate messages are a visible bug.
  explanation: Idempotency keys on sends make retries safe across reconnections.
- kind: fire
  prompt: A client receives seq 1040, then 1043. What should it do?
  choices:
    - text: Detect the gap and fetch 1041–1042 from the server before (or while) rendering
      correct: true
    - text: Ignore the gap
      why: Messages would be missing.
    - text: Reorder by local clock
      why: Local clocks aren't the ordering source.
    - text: Clear the conversation
      why: That throws away valid data.
  explanation: Sequence numbers make missing messages detectable, and resume makes them recoverable.
- kind: fire
  prompt: Why partition the messages table by (conversation_id, time bucket) rather than conversation_id alone?
  choices:
    - text: Long-lived busy conversations would otherwise grow one partition without bound
      correct: true
    - text: Time buckets make messages smaller
      why: Size per message doesn't change.
    - text: To order by sender
      why: Ordering is by seq within the partition.
    - text: Cassandra requires two-part keys
      why: It doesn't. Partition size management is the reason.
  explanation: Bounded partitions keep reads, compaction and repair efficient. Recent buckets are read first.
- kind: fire
  level: advanced
  prompt: A 50,000-member channel would require 50,000 per-user publishes per message. What scales better?
  choices:
    - text: Publish once to a channel topic; each gateway with members subscribes once and delivers to its local sockets
      correct: true
    - text: Store a copy of each message per member
      why: That multiplies storage and writes.
    - text: Limit channels to 100 members
      why: That's a product limit, not a design.
    - text: Deliver only via push notifications
      why: Push is best-effort and rate-limited.
  explanation: Channel subscriptions make cross-node fan-out proportional to the number of gateways, not members.
- kind: fire
  type: order
  prompt: Order the send path.
  items:
    - Client sends with a client message_id
    - Chat service assigns the next conversation seq and appends (deduplicating by message_id)
    - Ack the sender ("sent")
    - Publish to member devices via the backplane
    - Recipient clients ack the seq ("delivered")
  explanation: Persist and sequence first, acknowledge, then deliver — with receipts flowing back as sequence acks.
```
