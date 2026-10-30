---
id: request-flow
category: foundations
skill: requirements
title: Follow a request through a system
minutes: 15
summary: Before drawing boxes, trace one request end to end — DNS, connections, edge, load balancer, service, data stores and back — with a latency budget for every hop. Most real design flaws are visible on that trace: an unenforced ownership check, a state change with no durable home, a timeout that leaves work running after the caller gave up.
objectives:
  - Trace a request through DNS, TCP/TLS, CDN, load balancer, service, cache and database, naming what each hop does
  - Build a latency budget and explain why the first request on a new connection is slow
  - Place authentication, authorisation and validation at the right boundary
  - Set timeouts that shrink down the call chain and propagate deadlines
sources:
  - ['MDN: An overview of HTTP', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview']
  - ['Cloudflare: What happens in a TLS handshake', 'https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/']
  - ['gRPC: Deadlines', 'https://grpc.io/docs/guides/deadlines/']
---

> [!story] The checkout that charged twice
> A mobile client called `POST /orders` with a 5-second timeout. The API gateway allowed 10 seconds, the order service called the payment provider with a 30-second timeout, and the payment provider was slow that afternoon. The client gave up at 5 s and retried; the gateway forwarded the retry; both requests eventually reached the payment provider. Every individual timeout looked "reasonable". Traced end to end, the design charged customers twice whenever payments took longer than five seconds.

## The whole trip

Click through the paths. Every hop costs time, and every hop is a place where something can fail or be enforced.

```arch
title: One API request, end to end
nodes:
  - {id: client, label: Mobile app, kind: client, x: 0, y: 1}
  - {id: dns, label: DNS resolver, kind: external, x: 0, y: 0}
  - {id: edge, label: CDN / edge, kind: cdn, x: 1, y: 1, note: 'TLS, WAF, cache'}
  - {id: lb, label: Load balancer, kind: lb, x: 2, y: 1, note: 'L7, health checks'}
  - {id: api, label: Order service, kind: service, x: 3, y: 1, note: 'auth, rules'}
  - {id: cache, label: Redis, kind: cache, x: 3, y: 0}
  - {id: db, label: Postgres, kind: db, x: 3, y: 2, note: 'source of truth'}
edges:
  - [client, dns, 'resolve']
  - [client, edge, 'HTTPS']
  - [edge, lb, 'origin pull']
  - [lb, api, 'HTTP/2']
  - [api, cache, 'GET']
  - [api, db, 'BEGIN … COMMIT']
paths:
  - label: Cold first request
    steps:
      - [client, dns, 'DNS lookup: api.shop.com → edge IP. Cached locally after this (≈0 ms); uncached 20–100 ms.']
      - [client, edge, 'TCP handshake (1 RTT) + TLS 1.3 handshake (1 RTT) to the nearest PoP, then the request itself. RTT to a nearby PoP ≈ 10–30 ms.']
      - [edge, lb, 'Not cacheable (POST). The edge forwards over a warm, pooled connection to the origin region — no new handshakes.']
      - [lb, api, 'The L7 load balancer picks a healthy instance and adds X-Request-ID for tracing.']
      - [api, cache, 'Validate the token (signature check, no network), look up the product price in Redis: ~0.5 ms.']
      - [api, db, 'One transaction: check stock, insert order, commit. ~5 ms. The order now survives a crash of this process.']
  - label: Warm repeat request
    steps:
      - [client, edge, 'The connection is kept alive and reused: no DNS, no handshakes. Just one RTT for the request.']
      - [edge, lb, 'Pooled origin connection']
      - [lb, api, 'Same path, same instance or a different one — the service is stateless']
      - [api, db, 'Transaction and response']
```

## Where the time goes

| Step | Typical cost | Notes |
|---|---|---|
| DNS (uncached) | 20–100 ms | Cached by OS/browser for the record's TTL |
| TCP handshake | 1 RTT | Before any data |
| TLS 1.3 handshake | 1 RTT | TLS 1.2 needs 2 RTTs; resumption can make it 0 |
| HTTP/3 (QUIC) | 1 RTT for transport + TLS combined | Avoids head-of-line blocking on lossy networks |
| Request + response | 1 RTT + server time | Plus transfer time for large bodies |
| Same-datacentre service hop | 0.2–1 ms | Per call — fan-out multiplies it |
| Database transaction (simple) | 1–10 ms | Commit latency includes the durable write |

> [!numbers] Round trips are the unit
> London ↔ New York is about **70–80 ms** RTT; London ↔ Sydney about **250–280 ms**. Light in fibre covers about **200 km per millisecond** one way, so no engineering removes these — you remove *round trips*, or move the endpoint closer (edge PoPs, regional deployments).

```calc
title: The cost of a cold connection
prompt: A user in Sydney calls an API hosted only in Virginia, with no CDN. RTT is **200 ms**, DNS is uncached and takes **50 ms**, and the server takes **20 ms** to respond. With TCP + TLS 1.3, how long until the response arrives, in ms?
answer: 670
unit: ms
tolerance: 1.05
hint: Count round trips — TCP handshake, TLS handshake, then the request — and add DNS and server time.
steps: |
  DNS 50 + TCP 200 + TLS 200 + request/response 200 + server 20 = **670 ms**. The *second* request on the same connection costs only 200 + 20 = 220 ms. Terminating TLS at an edge PoP 10 ms away turns the handshakes into 2 × 10 ms, leaving one long round trip over the edge's warm connection — around 280 ms in total. Connection reuse and edge termination matter more than micro-optimising the server.
```

```predict
prompt: Your service's p50 latency is 30 ms, but users on mobile networks complain the *first* action after opening the app takes over a second. The server logs show 30 ms for that request too. What's the most likely explanation?
choices:
  - The server logs are wrong
  - DNS, TCP and TLS setup on a fresh connection over a high-latency mobile link happen before the server sees the request
  - The database is cold for the first request
  - HTTP is slower than HTTPS
answer: 1
reveal: |
  Server-side timing starts when the request arrives. Everything before that — radio wake-up, DNS, TCP and TLS handshakes, each costing one or more mobile RTTs of 100+ ms — is invisible to it. Measure from the client (real-user monitoring), keep connections alive, pre-connect on app start, and terminate TLS close to users.
```

## Who checks what, where

Every request carries claims ("I am user 17", "show order 9001"). Each hop has a job:

- **Edge / gateway:** TLS termination, coarse rate limiting, WAF rules, rejecting obviously bad traffic. Cheap checks that protect everything behind.
- **Authentication** (who is calling) can happen at the gateway — e.g. verifying a JWT signature — and be passed inward as a trusted header.
- **Authorisation** (may *this* caller act on *this* resource) belongs in the service that owns the resource, because only it knows that order 9001 belongs to user 17. A gateway can't make that decision without the data.
- **Validation** of input happens before any state changes, and **again at the database** through constraints for the invariants that matter.

> [!mistake] Hiding the button is not access control
> If the UI hides "view other users' orders" but `GET /orders/9001` returns any order to any authenticated user, the system has no authorisation — just a UI. Attackers call your API directly. This class of bug (broken object-level authorisation, often called IDOR) is consistently at the top of API security risk lists.

```sort
prompt: Which layer should own each check?
buckets: [Edge / gateway, Owning service, Database constraint]
items:
  - {text: 'Reject requests over 10 MB or from abusive IPs', bucket: 0, why: 'Cheap and generic: stop it before it costs anything downstream.'}
  - {text: 'Verify the JWT signature and expiry', bucket: 0, why: 'Authentication can be centralised: the gateway proves who is calling and passes the identity inward. (Services may verify again — defence in depth.)'}
  - {text: 'Order 9001 may only be viewed by the user who placed it', bucket: 1, why: 'Object-level authorisation needs the resource data, which only the owning service has.'}
  - {text: 'At most one confirmed booking per seat, even under concurrent requests', bucket: 2, why: 'A unique constraint holds no matter which code path, server or race attempts the write.'}
  - {text: 'A coupon can only be applied if the cart total exceeds £50', bucket: 1, why: 'Business rules live in the service that owns them.'}
  - {text: 'An order row must reference an existing customer', bucket: 2, why: 'A foreign key enforces referential integrity at the source of truth.'}
```

## Timeouts must shrink down the chain

Each caller should wait **less** than the caller above it, and pass its remaining time down. Otherwise a lower layer keeps working on a request that nobody is waiting for — and a retry from above starts a second copy.

```timeline
title: Timeouts that grow down the chain
intro: Client timeout 5 s; gateway 10 s; order service calls the payment provider with 30 s. The provider is slow today (8 s).
lanes: [Client, Gateway, Order service, Payment provider]
state: {Charges: '0', 'Client sees': '…'}
steps:
  - {lane: Client, to: Gateway, text: 'POST /orders (attempt 1)'}
  - {lane: Gateway, to: Order service, text: forward}
  - {lane: Order service, to: Payment provider, text: 'charge £40 (waits up to 30 s)'}
  - {lane: Client, to: Client, text: 't = 5 s: client times out', set: {'Client sees': 'timeout'}}
  - {lane: Client, to: Gateway, text: 'POST /orders (attempt 2, no idempotency key)'}
  - {lane: Gateway, to: Order service, text: forward}
  - {lane: Order service, to: Payment provider, text: 'charge £40 again'}
  - {lane: Payment provider, to: Order service, text: 't = 8 s: first charge succeeds', set: {Charges: '1'}}
  - {lane: Payment provider, to: Order service, text: 't = 13 s: second charge succeeds', set: {Charges: '2 ⚠'}}
find:
  prompt: Which step turns a slow dependency into a double charge?
  answer: 4
  explain: |
    The retry at step 5 starts a second, independent order while the first is still running below — because nothing told the lower layers the client had given up, and the retry carries no idempotency key. Fixes, in combination: **deadlines that shrink** down the chain (the service should get, say, 4.5 s and cancel its work when it expires), **idempotency keys** so a retried order maps to the same charge, and **cancellation propagation** where the protocol supports it (gRPC deadlines do this natively).
```

```bug
title: Review a timeout configuration
prompt: A team's service config for a user-facing endpoint with a **2 s** SLO. Which lines are wrong?
lang: yaml
code: |
  client:
    timeout_ms: 2000
    retries: 2
  gateway:
    upstream_timeout_ms: 5000
  profile_service:
    db_timeout_ms: 1500
    recommendations_timeout_ms: 3000
    retries_on_timeout: 3
bug: [5, 8, 9]
explain: |
  **Line 5:** the gateway waits 5 s for a request the client abandons at 2 s, so work continues for nobody (and a client retry overlaps it). **Line 8:** a 3 s budget for an optional downstream call can never fit inside a 2 s end-to-end budget. Optional calls should get a small slice and a fallback. **Line 9:** three retries at this layer *multiply* with the client's two retries — up to 3 × 4 = 12 attempts against a dependency that is already slow. Retry at one layer, with backoff, and only for idempotent operations.
```

> [!senior] Deadline propagation
> Rather than static per-hop timeouts, pass an absolute **deadline** with the request (gRPC does this automatically; with HTTP use a header such as `X-Request-Deadline`). Each service computes `remaining = deadline − now − safety margin`, uses it for downstream calls, and stops work once it passes. This keeps budgets consistent as call graphs change, and stops orphaned work from piling up during incidents.

```order
prompt: Put the life of a typical authenticated write request in order.
items:
  - DNS resolves the hostname and the client opens (or reuses) a TLS connection to the edge
  - The edge applies rate limits and WAF rules, then forwards to the origin load balancer
  - The load balancer picks a healthy instance of the owning service
  - The service authenticates the caller and checks they may act on this resource
  - The service validates input and commits the change in a database transaction
  - The service responds with the result; the client's connection stays open for reuse
explain: Notice that the state change happens last, after every check — and that the response only promises what has been committed. Each arrow is also a place to measure latency and a place a timeout can fire.
```

```interview
ask: Walk me through a create-order request in your ordering system, from the client sending it to receiving a response.
say: |
  "Let me trace one request first. The client resolves DNS and opens TLS to the nearest edge, which rate-limits and forwards over a warm connection to our load balancer. The order service authenticates the token, checks this user owns the cart, validates it and commits the order in one Postgres transaction before responding. The budget's roughly one RTT to the edge plus ~10 ms of server time. I'd give each hop a shrinking deadline and make the create idempotent, so a client retry after a timeout can't create a second order."
followups:
  - q: Where do you enforce authorisation?
    a: In the service that owns the resource, on every request, because only it knows who owns order 9001. The gateway can authenticate and do coarse checks; object-level checks need the data.
  - q: Why is the first request slower than the rest?
    a: Connection setup — DNS, TCP and TLS each add round trips before the request is sent. Keep-alive and connection pooling amortise it; edge termination shortens each round trip.
  - q: How should timeouts relate across layers?
    a: Each layer's timeout must be shorter than its caller's, ideally by passing a deadline down. Retry in one place only, with backoff and idempotency, so retries don't multiply across layers.
weak: |
  Draws "Client → Server → DB" and moves on to sharding. No idea where the time goes, where authorisation happens, or what a timeout means for the state change.
strong: |
  Walks one request through every hop with rough latencies, places authN/authZ/validation correctly, identifies the durable commit point, and sets shrinking deadlines plus idempotency for retries.
```

```recall
prompt: A client times out after 3 seconds while the server is still processing its request. Explain what state the system might be in, and what the design should do about it.
points:
  - A timeout means the outcome is unknown — the work may have completed, be in progress, or have failed
  - The server may keep working after the client stops waiting, unless deadlines or cancellation propagate
  - A retry can duplicate the operation unless it carries an idempotency key the server deduplicates on
  - Downstream timeouts should be shorter than upstream ones (deadline propagation), and retries should happen at one layer with backoff
model: |
  The client only knows it stopped waiting. The order may already be committed, may still be in flight, or may have failed — and unless the deadline is propagated, the server and its dependencies keep working for nobody. If the client retries blindly, a second order can be created. The design should pass a shrinking deadline down the chain so lower layers stop when the caller gives up, make the create idempotent with a client-generated key so a retry returns the original result, and retry in one place only, with backoff.
```

```questions
- kind: check
  prompt: Which component should decide whether user 17 may view order 9001?
  choices:
    - text: The order service, which owns order data and can check ownership on every request
      correct: true
    - text: The API gateway, because it already validated the user's token
      why: The gateway knows who is calling, but not who owns order 9001. Object-level authorisation needs the resource data.
    - text: The mobile app, by only showing the user's own orders
      why: Clients can be bypassed by calling the API directly.
    - text: The load balancer, using sticky sessions
      why: Routing has nothing to do with permission to access data.
  explanation: Authentication can be centralised. Authorisation on a specific object must happen where the object's ownership is known, on every request.
- kind: check
  type: numeric
  prompt: RTT to the server is 100 ms and DNS is cached. Using TCP and TLS 1.3 on a brand-new connection, with 10 ms of server time, how long until the client has the response (ms)?
  answer: 310
  unit: ms
  tolerance: 0.04
  explanation: TCP handshake (100) + TLS 1.3 handshake (100) + request/response (100) + server time (10) = 310 ms. On a reused connection it's 110 ms.
- kind: check
  type: order
  prompt: Order these timeout settings from the outermost caller to the innermost dependency, as a correct design would set them.
  items:
    - Mobile client — 4 s
    - API gateway — 3.5 s
    - Order service's call to inventory — 1 s
    - Inventory service's database query — 300 ms
  explanation: Each layer gives its dependencies less time than it has itself, leaving room to respond with a useful error or fallback before its own caller gives up.
- kind: check
  type: multi
  prompt: A client's request timed out and it retries. Which design choices prevent the retry from creating a duplicate order? Select all that apply.
  choices:
    - text: An idempotency key generated by the client and reused on the retry, deduplicated by the server
      correct: true
    - text: Propagating a deadline so the server stops the first attempt's work once the client has given up
      correct: true
    - text: Retrying at three different layers for reliability
      why: Retries at several layers multiply the attempts and the duplicates.
    - text: Raising the client timeout to 60 seconds so it never times out
      why: It still times out eventually, users get a terrible experience, and network failures still cause retries.
  explanation: Idempotency makes duplicates harmless. Deadline propagation stops orphaned work. Together with retrying in one place, they make timeouts safe.
- kind: fire
  prompt: Why does terminating TLS at a CDN edge close to users reduce latency for a distant origin, even for uncacheable POST requests?
  choices:
    - text: The handshake round trips happen over the short user-to-edge path, and the edge reuses a warm connection to the origin
      correct: true
    - text: The CDN caches POST responses
      why: POSTs are generally not cacheable. The gain comes from where the handshakes happen.
    - text: Encryption is skipped between the edge and the origin
      why: The edge-to-origin leg is normally encrypted too. It just uses a long-lived, already-established connection.
    - text: The CDN compresses the request body
      why: Compression helps bandwidth, not handshake round trips.
  explanation: Connection setup costs round trips. Making those round trips short (to the edge) and reusing a long-lived connection over the long leg removes most of the cold-connection penalty.
- kind: fire
  prompt: A user-facing endpoint has a 2 s budget. The service calls an optional recommendations service. What timeout policy makes sense for that call?
  choices:
    - text: A small slice of the budget (e.g. 200 ms) with a fallback that renders without recommendations
      correct: true
    - text: The full 2 s, because recommendations improve conversion
      why: That leaves no budget for everything else, and one slow dependency delays the whole page.
    - text: No timeout, so recommendations always appear
      why: Without a timeout, a hung dependency hangs every request that calls it.
    - text: 5 s with three retries
      why: That's longer than the whole budget, and the retries multiply the load on a struggling service.
  explanation: Optional dependencies get small, bounded budgets and a graceful fallback, so their slowness degrades the page rather than failing it.
- kind: fire
  prompt: Server-side metrics show a p50 of 40 ms, but real-user monitoring shows 900 ms for the first interaction after app launch. What explains the gap?
  choices:
    - text: Connection setup (DNS, TCP, TLS) over a high-latency mobile network happens before the server sees the request
      correct: true
    - text: The server clock is wrong
      why: That wouldn't produce a consistent pattern tied to app launch.
    - text: The database is slower for mobile users
      why: The server measures the database time too, and it reports 40 ms.
    - text: HTTP/2 is slower than HTTP/1.1
      why: HTTP/2 generally reduces connection overhead by multiplexing requests.
  explanation: Server timing starts when the request arrives. Client-side setup costs several mobile round trips. Fix it with connection reuse, pre-connecting and edge termination.
- kind: fire
  level: advanced
  prompt: Each of three layers retries a failed call up to 3 times (4 attempts each). In the worst case, how many requests can hit the innermost dependency for one user action?
  choices:
    - text: 64
      correct: true
    - text: 12
      why: Retries multiply across layers rather than add. Each outer attempt triggers a full set of inner attempts.
    - text: 9
      why: That counts 3 retries × 3 layers. Attempts multiply as 4 × 4 × 4.
    - text: 4
      why: That's one layer on its own.
  explanation: 4 × 4 × 4 = 64. Layered retries turn a slow dependency into an amplified outage. Retry at one layer, with backoff and a retry budget.
- kind: fire
  type: multi
  prompt: Which of these belong at the edge or gateway rather than inside each service? Select all that apply.
  choices:
    - text: TLS termination
      correct: true
    - text: Coarse per-client rate limiting
      correct: true
    - text: Rejecting oversized request bodies
      correct: true
    - text: Checking that a user owns the document they are editing
      why: Object ownership needs the owning service's data.
    - text: Enforcing that inventory never goes negative
      why: That's an invariant for the service and its database to enforce at the write.
  explanation: Generic, cheap, data-independent checks belong at the edge to protect everything behind it. Resource-specific rules and invariants belong with the data.
```
