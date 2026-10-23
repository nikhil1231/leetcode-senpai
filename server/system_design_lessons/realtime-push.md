---
id: realtime-push
category: apis
skill: operations
title: Real-time delivery — polling, SSE, WebSockets and push
minutes: 16
summary: Chat, live dashboards, collaborative editing and ride tracking need the server to talk first. That means holding millions of open connections, routing each message to whichever machine holds the recipient's connection, and surviving the fact that connections drop constantly — so delivery is built on sequence numbers and replay, not on the socket.
objectives:
  - Choose between short polling, long polling, Server-Sent Events, WebSockets and mobile push for a use case
  - Design a connection-gateway tier with a pub/sub backplane that routes messages to the right connection
  - Guarantee delivery across disconnects with durable storage, sequence numbers, acks and resume
  - Size connection capacity and prevent reconnection storms
sources:
  - ['MDN: Server-sent events', 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events']
  - ['RFC 6455: The WebSocket Protocol', 'https://www.rfc-editor.org/rfc/rfc6455']
  - ['Discord engineering: How Discord handles millions of concurrent users', 'https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users']
---

> [!story] The deploy that DDoSed itself
> A chat company deployed its WebSocket gateways at 14:00 by restarting them all within a minute. Two million clients disconnected and — following the client library's default of "retry after 1 second" — reconnected at once, each performing a TLS handshake, an auth check and a "fetch missed messages" query. The auth service and message store fell over; clients failed and retried again. The deploy took 3 minutes; the outage took 40. Real-time systems fail at their edges: connections, reconnects and catch-up.

## Five ways to get data to a client

| Technique | How it works | Latency | Good for | Costs |
|---|---|---|---|---|
| **Short polling** | Client asks every N seconds | Up to N s | Rare updates, simple clients | Wasted requests; latency vs load trade-off |
| **Long polling** | Server holds the request open until there's data or a timeout | Low | Fallback when nothing else works | A request per message; awkward at scale |
| **Server-Sent Events** | One HTTP response streams events, server → client | Low | Feeds, notifications, live dashboards, LLM token streams | One-way; text only; automatic reconnect with `Last-Event-ID` built in |
| **WebSockets** | Upgraded TCP connection, full duplex | Lowest | Chat, games, collaborative editing | Stateful connections; proxies and LBs must support upgrade; your own heartbeat and resume logic |
| **Mobile push** (APNs/FCM) | Platform delivers to the device, even when the app is closed | Seconds, best effort | Wake the user or app | No delivery guarantee, payload limits, rate limits |

```sort
prompt: Pick the most appropriate transport.
buckets: [Polling, Server-Sent Events, WebSockets, Mobile push]
items:
  - {text: 'A live sports score widget on a news site (server → browser only)', bucket: 1, why: 'One-way streaming over plain HTTP, with built-in reconnect and resume.'}
  - {text: 'Multiplayer game input and state at 20 updates/s each way', bucket: 2, why: 'Bidirectional, frequent, low-latency messages.'}
  - {text: '"Your ride has arrived" while the app is in the background', bucket: 3, why: 'Only the OS push service can reach a backgrounded or closed app.'}
  - {text: 'A nightly batch job status page checked occasionally', bucket: 0, why: 'Updates are rare and latency is irrelevant, so polling every 30 s is simplest.'}
  - {text: 'Streaming tokens of an LLM response into a browser', bucket: 1, why: 'Server → client streaming of text: what SSE was made for.'}
  - {text: 'Collaborative document editing with cursors', bucket: 2, why: 'Both directions, high frequency, low latency.'}
```

## The architecture: gateways plus a backplane

A connection lives on one machine. A message for user B can originate anywhere. So you split the system:

- **Connection gateways** terminate WebSockets/SSE, authenticate, heartbeat, and hold a map of `user → local connections`. They're stateful only in their open connections.
- A **pub/sub backplane** (Redis pub/sub or streams, NATS, Kafka) routes messages to the gateway(s) holding the recipient's connection.
- A **durable message store** is the source of truth. The connection is just a fast path.

```arch
title: Delivering a chat message
nodes:
  - {id: alice, label: Alice, kind: client, x: 0, y: 0}
  - {id: gw1, label: Gateway 1, kind: service, x: 1, y: 0, note: "holds Alice's socket"}
  - {id: chat, label: Chat service, kind: service, x: 2, y: 1}
  - {id: store, label: Message store, kind: db, x: 3, y: 1, note: 'per-conversation sequence'}
  - {id: bus, label: Pub/sub, kind: stream, x: 2, y: 2}
  - {id: gw2, label: Gateway 7, kind: service, x: 1, y: 2, note: "holds Bob's socket"}
  - {id: bob, label: Bob, kind: client, x: 0, y: 2}
  - {id: push, label: APNs / FCM, kind: external, x: 3, y: 2}
edges:
  - [alice, gw1, 'send']
  - [gw1, chat, 'deliver']
  - [chat, store, 'append seq 1042']
  - [chat, bus, 'publish to user:bob']
  - [bus, gw2, 'subscribed']
  - [gw2, bob, 'push frame']
  - [chat, push, 'if offline']
paths:
  - label: Bob is online
    steps:
      - [alice, gw1, 'Alice sends a message over her WebSocket']
      - [gw1, chat, 'The gateway forwards it to the chat service (stateless)']
      - [chat, store, 'Durably append with the next sequence number for the conversation (1042), then ack Alice']
      - [chat, bus, "Publish to channel user:bob. Gateway 7 subscribed when Bob connected"]
      - [bus, gw2, 'Gateway 7 receives the event and finds Bob''s socket(s) locally']
      - [gw2, bob, 'Frame delivered; Bob''s client acks seq 1042']
  - label: Bob is offline
    steps:
      - [chat, store, 'Append seq 1042 — the message is safe regardless of delivery']
      - [chat, push, 'No live connection, so send a push notification (best effort)']
      - [bob, gw2, 'Later, Bob reconnects with "last seen seq 1037" and the gateway replays 1038–1042 from the store']
```

> [!mistake] Broadcasting from local memory
> A WebSocket server that keeps `rooms = {room_id: [sockets]}` in memory and broadcasts to that list works perfectly on one server — and silently drops messages for users connected to the other nineteen once you scale out. Cross-gateway routing needs a backplane.

## Delivery across disconnects

Mobile connections drop when a phone changes network, a tunnel interrupts signal, or an app is backgrounded. Treat the socket as unreliable:

1. **Persist first**, assign a monotonically increasing **sequence number** per conversation (or per user inbox).
2. **Deliver** over the connection if one exists; the client **acks** the highest sequence it has processed.
3. On reconnect, the client sends its **last acked sequence**; the server replays everything after it from the store.
4. The client **deduplicates** by sequence (a replay may overlap what it already received).

```timeline
title: Reconnect and resume
lanes: [Client, Gateway, Message store]
state: {'Client last seq': '1040', Store: 'up to 1040'}
steps:
  - {lane: Gateway, to: Client, text: 'deliver seq 1041', set: {'Client last seq': '1041'}}
  - {lane: Client, to: Gateway, text: 'ack 1041'}
  - {lane: Message store, to: Message store, text: 'seq 1042 and 1043 appended (from other senders)', set: {Store: 'up to 1043'}}
  - {lane: Gateway, to: Client, text: 'deliver 1042 … connection drops mid-frame'}
  - {lane: Client, to: Gateway, text: 'reconnect (backoff + jitter): resume after 1041'}
  - {lane: Gateway, to: Message store, text: 'fetch seq > 1041 → 1042, 1043'}
  - {lane: Gateway, to: Client, text: 'deliver 1042, 1043', set: {'Client last seq': '1043'}}
crashes:
  - after: 3
    label: gateway dies right here
    verdict: safe
    text: The client reconnects to a different gateway and resumes after 1041. Nothing is lost, because the store, not the gateway, is the source of truth.
  - after: 0
    label: client crashes before acking 1041
    verdict: duplicate
    text: On restart it resumes after 1040 and receives 1041 again. Harmless — the client deduplicates by sequence number. At-least-once delivery plus idempotent display.
```

## Capacity: connections are memory and file descriptors

An idle WebSocket costs little CPU but holds kernel buffers, TLS state and your per-connection objects — often tens of kilobytes. Event-driven servers (epoll/kqueue, as in Go, Erlang/Elixir or Node) routinely hold hundreds of thousands to a few million connections per machine.

```calc
title: How many gateway machines?
prompt: At peak **12 million** users are connected. Each connection costs about **40 KB** of memory, and each gateway has **64 GB** of RAM of which you'll use **50%** for connections (leaving headroom to absorb a failed peer's clients). How many gateways?
answer: 15
unit: gateways
tolerance: 1.1
steps: |
  Total = 12M × 40 KB = 480 GB. Usable per gateway = 32 GB. 480 ÷ 32 = **15** gateways (about 800k connections each). Then sanity-check the other limits: file descriptors (raise `ulimit`), heartbeat traffic (12M × one ping per 30 s = 400k pings/s fleet-wide), and how many reconnects per second auth and the message store can absorb when a gateway dies.
```

## Reconnection storms and graceful drains

When a gateway restarts, every client on it reconnects. If all of them do so instantly, they hammer the other gateways, auth and the message store at once.

- **Client backoff with jitter** — randomised delays, growing on repeated failure.
- **Drain gradually** — send close frames (or HTTP/2 GOAWAY) to a fraction of connections at a time over minutes, not all at once.
- **Make reconnects cheap** — resumable sessions or short-lived tokens that gateways validate locally, and replay from a cache of recent messages rather than the database.
- **Shed reconnects** under overload: tell clients "retry after N seconds" instead of accepting work you can't finish.

```predict
prompt: A gateway holding 500,000 connections crashes. Clients reconnect after a fixed 1 s delay. Each reconnect needs an auth check and a "fetch missed messages" query. What's the most likely next failure?
choices:
  - None — the other gateways have spare connection capacity
  - The auth service and message store get ~500k requests in about one second and overload, causing failures and more retries
  - Clients will lose all their messages
  - The load balancer will route everyone back to the crashed gateway
answer: 1
reveal: |
  The connections themselves fit elsewhere; the **synchronised side effects** of reconnecting don't. Jittered backoff spreads 500k reconnects over, say, 30 s (~17k/s). Local token validation and cached recent messages make each one cheap. Load shedding with retry-after keeps the system from collapsing while it catches up.
```

```bug
title: A WebSocket broadcast service
prompt: This service works on one machine. The team just scaled it to 12 instances behind a load balancer. Which lines break?
lang: python
code: |
  rooms = defaultdict(set)              # room_id -> sockets on THIS process

  async def on_connect(ws, user):
      rooms[user.room_id].add(ws)

  async def on_message(ws, user, text):
      for peer in rooms[user.room_id]:  # broadcast to the room
          await peer.send(text)
      # message is never stored
bug: [7, 9]
explain: |
  **Line 7** broadcasts only to sockets on the same process. With 12 instances, users in the same room are spread across machines and miss each other's messages. Publish to a backplane channel per room, and have every instance that holds members subscribe to it. **Line 9:** nothing is persisted, so a user who is briefly disconnected — or connected to an instance that restarts — never sees the message. Persist with a sequence number first, then fan out, and let clients resume from their last sequence.
fix: |
  async def on_connect(ws, user):
      local[user.room_id].add(ws)
      await bus.subscribe(f"room:{user.room_id}", deliver_local)   # once per room per instance
      await replay(ws, user.room_id, after=user.last_seq)

  async def on_message(ws, user, text):
      seq = await store.append(user.room_id, user.id, text)        # durable, ordered
      await bus.publish(f"room:{user.room_id}", {"seq": seq, "text": text})
```

```interview
say: |
  "Clients hold a WebSocket to a gateway tier, which authenticates with a short-lived token, heartbeats and registers the user's connection. Sending a message goes to a stateless chat service that appends it to the conversation log with a sequence number, acks the sender, and publishes to a per-user channel on a pub/sub backplane. The gateways holding that user's sockets push the frame. Offline users get an APNs/FCM notification. On reconnect, clients send their last acked sequence and we replay the gap from the store, so delivery is at-least-once with client-side dedupe. Clients reconnect with jittered backoff, and we drain gateways gradually during deploys."
followups:
  - q: Why not just use WebSockets for everything?
    a: They're stateful, need upgrade support through every proxy and LB, and you must build heartbeats and resume yourself. For server-to-client streams, SSE is simpler and resumes natively. For wake-ups, only mobile push reaches a closed app.
  - q: How do you route a message to the right gateway?
    a: Gateways subscribe to channels for the users or rooms they hold (or register in a presence registry). Publishers send to the channel; only interested gateways receive it.
  - q: How do you guarantee nothing is lost?
    a: The socket is never the source of truth. Persist with a sequence number before delivering, ack by sequence, replay from the last ack on reconnect, and deduplicate on the client.
weak: |
  "Use WebSockets and send the message to the other user." No routing across servers, no persistence, no story for disconnects or reconnect storms.
strong: |
  Picks the transport by use case, separates gateways from stateless logic with a backplane, persists with sequence numbers and resumes on reconnect, sizes connections, and handles reconnect storms and drains.
```

```recall
prompt: A user's phone loses signal for 30 seconds during a chat. Explain how a well-designed system makes sure they get every message, exactly once on screen.
points:
  - Messages are persisted with a per-conversation (or per-inbox) sequence number before or independently of delivery
  - The client acks the highest sequence it has processed
  - On reconnect the client sends its last acked sequence and the server replays everything after it from the store
  - The client deduplicates by sequence number because replays can overlap what it already received
model: |
  Every message is appended to a durable store with an increasing sequence number before it's pushed, so delivery failures can't lose it. While connected, the client acks the highest sequence it has processed. When signal returns it reconnects with backoff and says "I have everything up to 1041"; the gateway reads 1042 onward from the store and sends it. Some of those may already have arrived just before the drop, so the client ignores sequence numbers it has already shown — at-least-once delivery with idempotent display gives exactly-once on screen.
```

```questions
- kind: check
  prompt: A dashboard needs a one-way stream of live metrics from server to browser, and should resume automatically after a disconnect. Which transport fits best?
  choices:
    - text: Server-Sent Events, with Last-Event-ID for resume
      correct: true
    - text: WebSockets, because they're the fastest
      why: They work, but you'd build the heartbeats and resume logic SSE gives you over plain HTTP.
    - text: Mobile push notifications
      why: Push is for waking devices, not continuous streams in a browser.
    - text: Short polling every 100 ms
      why: That wastes requests and still adds latency.
  explanation: SSE is a one-way stream over HTTP with built-in reconnection and resume. Use WebSockets when you need both directions.
- kind: check
  prompt: A chat app scales its WebSocket servers from 1 to 10 instances, and users in the same room stop seeing each other's messages. Why?
  choices:
    - text: Broadcasts only reach sockets on the same instance; a pub/sub backplane is needed to route across instances
      correct: true
    - text: WebSockets can't work behind a load balancer
      why: They can, with upgrade support. The bug is in how messages are routed.
    - text: The database is too slow
      why: Messages aren't being lost to latency. They're never sent to the other servers.
    - text: Each room needs its own load balancer
      why: Routing between instances is the application's job, not the load balancer's.
  explanation: Connection state is per machine. A backplane (Redis pub/sub, NATS, Kafka) lets any instance publish to the instances holding the recipients.
- kind: check
  type: order
  prompt: Order the steps for reliably delivering a chat message to a recipient.
  items:
    - Append the message to durable storage with the next sequence number
    - Acknowledge the sender
    - Publish to the backplane channel for the recipient
    - The recipient's gateway pushes the frame over their connection
    - The recipient's client acks the sequence number
  explanation: Persistence comes first, so delivery can fail without losing anything. Acks by sequence tell the server what to replay after a reconnect.
- kind: check
  type: numeric
  prompt: There are 6 million concurrent connections at about 50 KB each. Each gateway can devote 30 GB to connections. How many gateways are needed?
  answer: 10
  unit: gateways
  tolerance: 0.05
  explanation: 6M × 50 KB = 300 GB, and 300 ÷ 30 = 10. Add headroom so the survivors can absorb a failed gateway's clients.
- kind: fire
  prompt: Why shouldn't a WebSocket connection be treated as the source of truth for message delivery?
  choices:
    - text: Connections drop routinely (network changes, backgrounding, deploys), so messages must be stored and replayed by sequence
      correct: true
    - text: WebSockets corrupt data
      why: TCP gives integrity within a connection. The problem is that connections end.
    - text: WebSockets can't carry binary data
      why: They can.
    - text: WebSockets are slower than HTTP
      why: Speed isn't the issue.
  explanation: Reliable delivery means persisting first and resuming from the last ack. The socket is just a fast path.
- kind: fire
  prompt: A gateway restart causes 400,000 clients to reconnect at once, overloading auth. What's the best mitigation?
  choices:
    - text: Jittered exponential backoff on clients, gradual connection draining on deploy, and cheap locally-verified reconnect tokens
      correct: true
    - text: Make clients reconnect immediately so the outage is shorter
      why: Synchronised reconnects are exactly what overloads auth.
    - text: Add more gateways
      why: Connection capacity isn't the bottleneck. The reconnect side effects are.
    - text: Disable authentication during deploys
      why: That's a security hole, not a mitigation.
  explanation: Spread reconnects in time, avoid mass disconnects, and make each reconnect cheap.
- kind: fire
  prompt: Which is true of mobile push notifications (APNs/FCM)?
  choices:
    - text: They can reach a backgrounded or closed app, but delivery is best-effort with size and rate limits
      correct: true
    - text: They guarantee delivery within one second
      why: Delivery is best-effort and can be delayed or dropped.
    - text: They replace the need to store messages server-side
      why: The app should still fetch from your store when it opens.
    - text: They are bidirectional
      why: Push is one-way, from the platform to the device.
  explanation: Use push to wake the user or app, then sync from your durable store.
- kind: fire
  type: multi
  level: advanced
  prompt: Which make a reconnect after a short outage both lossless and duplicate-free on screen? Select all that apply.
  choices:
    - text: Per-conversation sequence numbers assigned when messages are stored
      correct: true
    - text: The client sends its last processed sequence on reconnect
      correct: true
    - text: The server replays messages after that sequence from storage
      correct: true
    - text: The client deduplicates by sequence number
      correct: true
    - text: Relying on TCP to retransmit across the new connection
      why: TCP retransmits within one connection only. A new connection starts fresh.
  explanation: Sequence-based resume plus client-side dedupe gives at-least-once delivery with exactly-once display.
- kind: fire
  prompt: Twelve million users are connected and each client sends a heartbeat every 30 s. Roughly what heartbeat rate must the gateway fleet handle?
  choices:
    - text: About 400,000 per second
      correct: true
    - text: About 12 million per second
      why: That would be one heartbeat per client every second.
    - text: About 40,000 per second
      why: Check the arithmetic — 12,000,000 ÷ 30.
    - text: Heartbeats are free, so it doesn't matter
      why: They're cheap but not free. At this scale they're a real load.
  explanation: 12M ÷ 30 s = 400k/s. Cheap individually, significant in aggregate — one reason heartbeat intervals are tuned and often piggybacked on traffic.
```
