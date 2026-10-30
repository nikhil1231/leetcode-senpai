---
id: stateless-balancing
category: apis
skill: capacity
title: Stateless services and load balancing
minutes: 16
summary: Horizontal scaling works when any instance can serve any request, so state lives in shared stores or in verifiable tokens, never in one process's memory. A load balancer then spreads work, removes unhealthy instances and lets you deploy without dropping requests — if its algorithm, health checks and draining are designed rather than defaulted.
objectives:
  - Explain what makes a service stateless and where session state should live (shared store vs signed tokens)
  - Compare L4 and L7 load balancing and algorithms — round robin, least outstanding requests, power of two choices, consistent hashing
  - Design liveness and readiness checks that remove bad instances without causing cascading restarts
  - Deploy and scale without dropping in-flight requests, and balance across regions
sources:
  - ['Mitzenmacher, The Power of Two Choices in Randomized Load Balancing', 'https://www.eecs.harvard.edu/~michaelm/postscripts/mythesis.pdf']
  - ['Kubernetes: Liveness, readiness and startup probes', 'https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/']
  - ['AWS Builders Library: Implementing health checks', 'https://aws.amazon.com/builders-library/implementing-health-checks/']
---

> [!story] The health check that restarted everything
> A team pointed their Kubernetes **liveness** probe at an endpoint that queried the database. One evening the database had a 40-second failover. Every pod's liveness check failed at once, so Kubernetes restarted every pod — at the moment the database came back and the pods were needed most. The cold-starting fleet then stampeded the database. A 40-second blip became a 15-minute outage, caused entirely by the health check.

## What "stateless" means

An instance is **stateless** if it can be killed at any moment and any other instance can serve the next request. The *product* still has state — users, carts, sessions — but it lives somewhere shared:

| Where state lives | Example | Trade-off |
|---|---|---|
| Shared store | Sessions in Redis; carts in a database | One extra lookup per request; the store must be highly available |
| Signed token held by the client | JWT carrying user ID, roles and expiry | No lookup, but you can't easily revoke it before it expires; keep it small |
| Instance memory (*not* stateless) | Sessions in a server's heap | Lost on restart or deploy; forces sticky routing; uneven load |

Common hybrid: short-lived access tokens (5–15 minutes) verified locally by every service, plus a refresh token checked against a store, so revocation takes effect within one access-token lifetime.

## L4 versus L7

- **L4 (transport)** balancers route TCP/UDP connections by IP and port. They're very fast and protocol-agnostic, but can't see HTTP — one long-lived HTTP/2 connection carrying thousands of requests sticks to one backend.
- **L7 (application)** balancers terminate HTTP: they can route by path or header, retry idempotent requests, balance **per request** (essential for HTTP/2 and gRPC), add tracing headers, and terminate TLS. They cost more CPU and add a hop.

> [!mistake] gRPC behind an L4 balancer
> gRPC multiplexes many requests over one long-lived HTTP/2 connection. An L4 balancer balances *connections*, so a client that opened one connection sends all its traffic to one server, no matter how many you add. Use an L7 proxy (Envoy, a cloud L7 LB) or client-side balancing.

## Choosing an algorithm

- **Round robin:** simple and fine when requests and servers are uniform. Terrible when one server is slow, because it keeps getting its share.
- **Least connections / least outstanding requests:** sends work to whoever has the least in flight, so a slow server naturally gets less. Needs a view of every backend's load.
- **Power of two choices:** pick two backends at random, send to the less loaded. Almost as good as global least-loaded, with no global state — the default in many modern proxies.
- **Consistent hashing on a key** (user ID, tenant): sends the same key to the same backend, useful for local caches or affinity, at the cost of hot keys and rebalancing on changes.

```sim
name: loadbalancer
title: Algorithms, slow servers and sticky sessions
challenges:
  - {text: 'Make server 2 slow and use round robin. Watch its queue grow while the others idle.', metric: p99, op: '>', value: 300, and: [{metric: algo, op: '==', value: rr}, {metric: dead, op: '==', value: 0}]}
  - {text: 'Switch to least outstanding requests and bring p99 back under 150 ms with the slow server still there', metric: p99, op: '<', value: 150, and: [{metric: algo, op: '==', value: least}]}
  - {text: 'Turn on sticky sessions with sessions in server memory, then kill server 3 — count the logged-out users', metric: loggedOut, op: '>', value: 10, and: [{metric: dead, op: '==', value: 1}, {metric: sticky, op: '==', value: true}]}
  - {text: 'Move sessions to a shared store and kill server 3 again: nobody is logged out', metric: loggedOut, op: '==', value: 0, and: [{metric: dead, op: '==', value: 1}, {metric: sessions, op: '==', value: shared}]}
takeaway: |
  Load-aware algorithms route around slowness that round robin feeds. Sticky sessions with in-memory state couple users to individual machines: a crash or deploy logs them out, and hot users make load uneven. Shared session storage (or signed tokens) makes every instance interchangeable.
```

```predict
prompt: A fleet of 20 servers sits behind round-robin balancing. One server develops a disk problem and becomes 5× slower, but it still passes its health check. What happens to overall p99 latency?
choices:
  - Nothing much — it's only 5% of servers
  - It rises sharply, because 5% of requests still go to the slow server and the p99 lands in that slow 5%
  - It improves, because the other servers get less traffic
  - Round robin automatically skips slow servers
answer: 1
reveal: |
  Round robin sends exactly 1/20 = 5% of requests to the sick server regardless of how it performs. That slow 5% *is* your p99 (and p95). A load-aware algorithm (least outstanding, power of two) would send it less work automatically; **outlier detection** (eject backends whose error rate or latency is far worse than their peers) would remove it. Passing a health check is not the same as being healthy.
```

## Health checks that help rather than hurt

- **Liveness:** "is this process stuck beyond repair?" Failing it causes a **restart**. Keep it local and cheap: is the event loop responding? *Never* depend on a database or other service, or a dependency blip restarts your whole fleet.
- **Readiness:** "should this instance receive traffic right now?" Failing it takes the instance **out of rotation** without restarting it — during start-up, while warming caches, when overloaded, or when a critical dependency is unreachable (with care, so the whole fleet doesn't go unready together).
- **Startup:** gives slow-starting processes time before liveness applies.

```bug
title: Review this probe configuration
prompt: A Kubernetes deployment for an API that depends on Postgres. Which lines will make an outage worse?
lang: yaml
code: |
  livenessProbe:
    httpGet: {path: /health/deep, port: 8080}   # runs SELECT 1 against Postgres
    periodSeconds: 5
    failureThreshold: 1
  readinessProbe:
    httpGet: {path: /health/ready, port: 8080}  # true once caches are warm
    periodSeconds: 5
  terminationGracePeriodSeconds: 0
bug: [2, 4, 8]
explain: |
  **Line 2:** liveness depends on the database, so a database failover makes every pod fail liveness and get restarted together. **Line 4:** one failed check triggers a restart, so a single slow GC pause or blip kills a healthy pod. Use a few consecutive failures. **Line 8:** a zero grace period kills pods instantly on deploy or scale-down, dropping in-flight requests. Give pods time to drain: stop receiving new traffic, finish current requests, then exit.
fix: |
  livenessProbe:
    httpGet: {path: /health/live, port: 8080}   # process-local: event loop responsive
    periodSeconds: 10
    failureThreshold: 3
  readinessProbe:
    httpGet: {path: /health/ready, port: 8080}
    periodSeconds: 5
  terminationGracePeriodSeconds: 30           # with a preStop hook + graceful shutdown
```

## Deploys and scale-in without dropped requests

```timeline
title: Graceful shutdown during a deploy
intro: An instance is being replaced. Inject a crash where a real deploy might cut corners.
lanes: [Load balancer, Old instance, New instance]
state: {'In flight on old': '12 requests', 'Old in rotation': 'yes'}
steps:
  - {lane: New instance, to: New instance, text: 'Start, warm caches, pass readiness'}
  - {lane: Load balancer, to: New instance, text: 'Add the new instance to rotation'}
  - {lane: Load balancer, to: Old instance, text: 'Mark the old instance draining: no new requests', set: {'Old in rotation': 'no'}}
  - {lane: Old instance, to: Old instance, text: 'Finish in-flight requests, close idle keep-alive connections', set: {'In flight on old': '0'}}
  - {lane: Old instance, to: Old instance, text: 'Exit cleanly'}
crashes:
  - after: 1
    label: 'kill the old instance now (no draining)'
    verdict: lost
    text: The 12 in-flight requests fail mid-way. Idempotent GETs might be retried by the LB, but a POST that was half-processed returns an error to the user, who may retry and double-submit if the API isn't idempotent.
  - after: 3
    label: 'kill after draining'
    verdict: safe
    text: Nothing in flight, no new traffic arriving. Users notice nothing — this is why the grace period and draining exist.
```

> [!senior] Long-lived connections complicate draining
> WebSockets, gRPC streams and HTTP keep-alive connections don't end on their own. Draining must actively close them (with a "go away" signal such as HTTP/2 GOAWAY) and let clients reconnect elsewhere — spread over time, or every client reconnects to the remaining instances at once.

## Balancing the balancer, and across regions

A load balancer is itself a single point of failure unless it's redundant: managed cloud LBs are distributed; self-hosted ones run in pairs with a floating IP (VRRP/keepalived) or behind anycast.

Across regions, **DNS-based global load balancing** returns the nearest healthy region's address (subject to DNS TTL caching), and **anycast** advertises one IP from many locations and lets BGP routing pick the nearest. CDNs and global L7 proxies combine both.

```calc
title: Size a stateless fleet that survives a zone failure
prompt: Peak traffic is **24,000 req/s**. One instance handles **800 req/s** at your target utilisation. Instances are spread evenly over **3 zones**, and losing a whole zone must not overload the rest. How many instances in total?
answer: 45
unit: instances
tolerance: 1.05
steps: |
  At peak you need 24,000 ÷ 800 = 30 instances. If one of three zones disappears, the remaining two-thirds must still provide 30, so the total must be 30 ÷ (2/3) = **45** (15 per zone). This "N+1 zones" rule is why stateless tiers usually run at a lower utilisation than you might expect.
```

```interview
ask: How would you design a highly available API tier serving HTTP/2 clients, covering authentication, traffic distribution, health checks, deployments and availability-zone failures?
say: |
  "The API tier is stateless: sessions are short-lived signed access tokens verified locally, with refresh tokens checked against Redis so we can revoke. An L7 load balancer does per-request least-outstanding — or power-of-two — balancing, which matters because the clients use HTTP/2. Liveness is process-local; readiness reflects warm-up and overload. Deploys add new instances, drain old ones and exit after in-flight requests finish. We run three zones sized so any two carry peak."
followups:
  - q: Sticky sessions — yes or no?
    a: Avoid them for correctness. If affinity helps performance (local caches), use consistent hashing on a key and make sure nothing breaks when an instance disappears, because the state must also exist elsewhere.
  - q: JWTs or server-side sessions?
    a: JWTs avoid a lookup per request but can't be revoked before expiry and grow with claims. Server-side sessions are revocable and small but need a highly available store. Common answer — short-lived access JWTs plus a revocable refresh token.
  - q: How do you handle one server that's slow but passes health checks?
    a: Load-aware balancing so it naturally gets less work, plus outlier detection that ejects backends with abnormal error rates or latency compared with their peers.
weak: |
  "Put a load balancer in front and add servers." Sessions in memory, default round robin, a health check that pings the database, and deploys that kill instances.
strong: |
  Explains where state lives and the token trade-off, chooses L7 per-request load-aware balancing with a reason, separates liveness from readiness, drains on deploy, and sizes for zone failure.
```

```recall
prompt: Explain the difference between liveness and readiness checks, and why a liveness check should not depend on the database.
points:
  - Liveness failure restarts the process; it should detect only an unrecoverable, process-local problem
  - Readiness failure removes the instance from load-balancer rotation without restarting it
  - If liveness depends on the database, a database blip fails every instance at once and restarts the whole fleet
  - Mass restarts cause cold starts and stampedes exactly when the dependency recovers, making the outage worse
model: |
  Liveness asks "is this process broken beyond self-repair?" — fail it and the orchestrator restarts the container. Readiness asks "should I get traffic right now?" — fail it and the load balancer stops sending requests but leaves the process running. If liveness checks the database, a short database failover makes every instance fail liveness simultaneously, so the whole fleet restarts together, comes back cold, and stampedes the database just as it recovers. Keep liveness process-local and put dependency awareness, carefully, into readiness or into the request path with timeouts and fallbacks.
```

```questions
- kind: check
  prompt: Why does a gRPC service often stay unbalanced behind an L4 load balancer?
  choices:
    - text: gRPC multiplexes many requests over one long-lived HTTP/2 connection, and L4 balancing distributes connections, not requests
      correct: true
    - text: L4 balancers can't forward HTTP/2 traffic at all
      why: They forward the bytes fine. They just can't see individual requests inside a connection.
    - text: gRPC requires sticky sessions
      why: It doesn't. The imbalance is a side effect of connection-level balancing.
    - text: L4 balancers only support round robin
      why: The algorithm isn't the issue. Connection-level granularity is.
  explanation: Per-request balancing needs an L7 proxy or client-side balancing that understands HTTP/2 streams.
- kind: check
  type: multi
  prompt: Which belong in a liveness check? Select all that apply.
  choices:
    - text: Whether the process's event loop or request threads respond
      correct: true
    - text: Whether the process is deadlocked
      correct: true
    - text: Whether the primary database answers SELECT 1
      why: A database blip would fail every instance and restart the fleet together.
    - text: Whether a downstream payments API is reachable
      why: Restarting your service can't fix someone else's outage.
  explanation: Liveness should detect process-local, unrecoverable states only. Dependency health belongs in timeouts, circuit breakers and (carefully) readiness.
- kind: check
  prompt: A service keeps sessions in instance memory and uses sticky routing. What happens during a rolling deploy?
  choices:
    - text: Users pinned to replaced instances lose their sessions and must log in again
      correct: true
    - text: Nothing, because sticky routing preserves sessions
      why: Stickiness routes users back to the same machine. It doesn't keep data alive when that machine goes away.
    - text: Sessions migrate to the new instances automatically
      why: Nothing copies heap state between processes.
    - text: The load balancer stores the sessions
      why: Load balancers route traffic. They don't store application sessions.
  explanation: In-memory state ties users to machines. A shared session store or signed tokens make instances interchangeable.
- kind: check
  type: numeric
  prompt: Peak is 18,000 req/s and each instance handles 600 req/s at target utilisation. Instances span 3 zones and must survive losing one. How many instances in total?
  answer: 45
  unit: instances
  tolerance: 0.03
  explanation: 18,000 ÷ 600 = 30 needed. Two-thirds of the fleet must cover that, so 30 × 1.5 = 45 (15 per zone).
- kind: fire
  prompt: What's the main advantage of "power of two choices" balancing?
  choices:
    - text: Near-optimal load spreading by comparing just two random backends, with no global coordination
      correct: true
    - text: It always picks the single least-loaded server in the fleet
      why: That needs global state. Two choices gets most of the benefit without it.
    - text: It guarantees the same client always reaches the same server
      why: That's consistent hashing.
    - text: It doubles every request for reliability
      why: It sends one request, to the less loaded of two candidates.
  explanation: Sampling two and picking the lighter one avoids herding onto a single "least loaded" server and dramatically reduces the maximum load compared with pure random choice.
- kind: fire
  prompt: Why might short-lived JWT access tokens be paired with a refresh token checked against a store?
  choices:
    - text: Services verify access tokens locally without a lookup, while revocation takes effect when the access token expires and refresh is denied
      correct: true
    - text: JWTs can't be verified without a database call
      why: Signed JWTs verify locally with a public key. That's their main benefit.
    - text: Refresh tokens make access tokens smaller
      why: Size isn't the reason for the pairing.
    - text: It allows sessions to live in server memory
      why: The point is to avoid server memory entirely.
  explanation: Local verification scales; a revocable refresh path limits how long a stolen or revoked access token remains usable.
- kind: fire
  prompt: During scale-in, instances are terminated immediately and some users see 502 errors. What's missing?
  choices:
    - text: Connection draining — stop routing new requests, let in-flight ones finish, then terminate
      correct: true
    - text: More instances
      why: Scaling in removes instances on purpose. The problem is how they're removed.
    - text: Sticky sessions
      why: Stickiness would make it worse, by pinning users to the instances being removed.
    - text: A longer DNS TTL
      why: DNS has nothing to do with in-flight requests at the load balancer.
  explanation: Graceful shutdown (deregistration, a grace period, closing keep-alives) prevents in-flight requests being cut off.
- kind: fire
  level: advanced
  prompt: One of 30 backends returns errors on 20% of requests but passes its health check. What mechanism removes it automatically?
  choices:
    - text: Outlier detection, which ejects backends whose error rate or latency is much worse than their peers'
      correct: true
    - text: A longer health-check interval
      why: That makes failures slower to detect, and it still checks the wrong signal.
    - text: Round-robin balancing
      why: Round robin keeps sending it exactly its share.
    - text: DNS failover
      why: DNS works at the region level and is slow to change.
  explanation: Health checks test a synthetic path. Passive outlier detection watches real traffic and ejects misbehaving backends temporarily.
- kind: fire
  type: multi
  prompt: Which make a service tier safe to scale horizontally? Select all that apply.
  choices:
    - text: Session state in a shared store or in signed tokens
      correct: true
    - text: Uploaded files written to object storage rather than local disk
      correct: true
    - text: Background jobs claimed from a shared queue rather than an in-process list
      correct: true
    - text: Caching user carts only in instance memory
      why: The cart vanishes when that instance restarts, and other instances can't see it.
    - text: Relying on sticky routing so instances can keep private state
      why: That couples correctness to routing and to the lifetime of individual machines.
  explanation: Anything that must survive an instance or be visible to the others belongs in shared, durable systems.
```
