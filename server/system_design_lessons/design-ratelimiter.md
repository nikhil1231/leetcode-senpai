---
id: design-ratelimiter
category: casebook
skill: capacity
title: Design a distributed rate limiter
minutes: 20
summary: Turning the rate-limiting algorithms into a service — where the check runs, how 200 gateways share counters at 2 million checks a second within 2 ms, how rules reach every gateway, what to do with a key sending half of all traffic, how limits behave across regions, and what happens when the limiter itself fails.
objectives:
  - Choose where enforcement runs (in-process library, sidecar or central service) and justify it with a latency budget
  - Size and shard the counter store, and implement an atomic sliding-window check
  - Distribute and roll out limit rules safely, including shadow mode
  - Handle hot keys, multiple regions and limiter failure with per-endpoint policies
sources:
  - ['Stripe: Scaling your API with rate limiters', 'https://stripe.com/blog/rate-limiters']
  - ['Envoy: Global rate limiting', 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting']
  - ['Cloudflare: How we built rate limiting capable of scaling to millions of domains', 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/']
case: ratelimiter
---

## 1. Requirements

- Enforce per-API-key limits ("100 req/s, bursts to 200") and per-endpoint limits, plus per-IP limits for anonymous traffic.
- **Scale:** 200 gateway instances, **2M requests/s** at peak, 5M API keys.
- **Latency:** the check adds **< 2 ms p99**.
- **Correctness:** limits are approximately right (a few percent over is acceptable); plan changes apply within a minute.
- **Failure:** a limiter outage must not take the API down, but login and SMS sending must stay protected.

```predict
prompt: Each of the 200 gateways enforces "100 req/s per key" with its own in-memory counter, and a client's requests are spread evenly by the load balancer. What does the client effectively get?
choices:
  - 100 req/s — the limit is per key
  - Up to about 20,000 req/s — each gateway allows 100 independently
  - 0.5 req/s — the limit is divided by the gateways automatically
  - It depends only on the client's IP
answer: 1
reveal: |
  Independent local counters multiply the limit by the number of instances that see the key. The options are a shared counter (accurate, adds a network hop), dividing the budget locally (inaccurate when traffic is uneven or the fleet resizes), or a hybrid of local buckets that sync with a central store. The latency budget decides which.
```

## 2. Where does the check run?

```sort
prompt: Match each deployment option with its main trade-off.
buckets: [In-gateway library + shared Redis, Central rate-limit service (gRPC), Local buckets synced periodically]
items:
  - {text: 'One network hop to Redis per check (~0.3–1 ms); simplest; gateways need the library in their language', bucket: 0, why: 'The common default — e.g. a Lua script in Redis called directly from the gateway.'}
  - {text: 'One hop to the service, which itself talks to the counter store; language-agnostic, central rule management, an extra component that must be highly available', bucket: 1, why: "Envoy's global rate-limit service follows this model."}
  - {text: 'No hop on the request path; counts sync every ~100 ms, so the limit can be exceeded briefly during bursts', bucket: 2, why: 'Fastest and most resilient. Accuracy depends on the sync interval and fleet size.'}
```

We'll use **in-gateway enforcement with a sharded Redis cluster** for keyed limits (accurate, ~1 ms), plus **local token buckets** as a fallback and for coarse per-IP limits at the edge.

## 3. Sizing the counter store

```calc
title: How many Redis shards?
prompt: Every request performs **one** atomic Lua call (sliding-window counter) for its API key. Peak is **2,000,000 requests/s**. A Redis shard handles about **100,000** such calls per second, and you want shards at most **50%** busy. How many primary shards?
answer: 40
unit: shards
tolerance: 1.02
steps: |
  2,000,000 ÷ (100,000 × 0.5) = **40** primary shards, each with a replica. Keys hash across shards (Redis Cluster slots), and each key's counters live on one shard, so the check is a single round trip. Memory is small: 5M keys × 2 counters × ~100 bytes ≈ 1 GB. Throughput, not memory, sizes the cluster.
```

```faded
title: A sliding-window counter in Redis
prompt: Complete the logic of the Lua script (runs atomically on one shard).
text: |
  Keys: `rl:{key}:{window}` for the current and previous one-second windows (the braces force both into the [[same cluster slot|same database|same gateway]]).

  The script increments the current window's counter and sets its TTL to [[2 windows|1 day|forever]] so old windows disappear.

  It estimates the rolling count as `previous × (1 − elapsed_fraction_of_current_window) + current`. If that exceeds the limit, the request is rejected — and the increment [[is undone or not applied, so rejected requests don't consume budget|is kept anyway|is doubled]].

  The script returns the remaining budget and the reset time, so the gateway can set `RateLimit-Remaining` and `Retry-After` on the response.
explain: One atomic script per request — no read-then-write race, no non-atomic EXPIRE — returning what the response headers need.
```

## 4. Architecture

```arch
title: Rate limiting architecture
nodes:
  - {id: client, label: Client, kind: client, x: 0, y: 1}
  - {id: edge, label: Edge / CDN, kind: cdn, x: 1, y: 1, note: 'per-IP floods'}
  - {id: gw, label: API gateways ×200, kind: service, x: 2, y: 1, note: 'limiter library + local fallback'}
  - {id: redis, label: Redis Cluster ×40, kind: cache, x: 3, y: 0, note: 'counters'}
  - {id: cfg, label: Rules service, kind: service, x: 3, y: 2, note: 'plans, overrides'}
  - {id: api, label: Backend services, kind: service, x: 4, y: 1}
edges:
  - [client, edge, 'request']
  - [edge, gw, 'forward']
  - [gw, redis, 'EVALSHA check']
  - [cfg, gw, 'push rules (watch)']
  - [gw, api, 'allowed']
paths:
  - label: Allowed request
    steps:
      - [client, edge, 'Edge rules drop obvious floods per IP before they cost anything']
      - [edge, gw, 'The gateway authenticates the API key and looks up its plan''s rules in local memory']
      - [gw, redis, 'One atomic Lua call per applicable rule key (key limit, endpoint limit) — ~1 ms']
      - [gw, api, 'Under limit → forward, adding RateLimit-* headers to the response']
  - label: Rule change
    steps:
      - [cfg, gw, 'A plan upgrade is saved; the rules service pushes the change to every gateway''s in-memory rule cache within seconds (polling as backup)']
```

## 5. Deep dives

### Hot keys

One enterprise key sends 600k req/s — 30% of all traffic, all on one Redis shard. Options: give that key a **local pre-aggregation** step (each gateway batches its increments for the key every 50 ms and checks against a per-gateway share of the limit), **split the key's counter** across N sub-keys and sum them, or give very large customers a dedicated limiter shard. Accuracy drops slightly; the shard survives.

### Rolling out rules safely: shadow mode

New or tightened limits run in **shadow mode** first: evaluate and log "would have rejected" without rejecting. Check who would be affected, then enforce. A bad limit pushed straight to enforcement is an outage you caused yourself.

### Multiple regions

A global limit across regions needs either cross-region counter traffic (slow) or a split of the budget per region (each region gets a share, rebalanced periodically from observed traffic). Most APIs enforce per region with a share of the global limit, accepting small overshoot.

```bug
title: Gateway limiter integration
prompt: Which lines make the API fragile or the limits wrong?
lang: python
code: |
  def check(request):
      rules = db.query("SELECT * FROM rules WHERE plan=%s", request.plan)   # every request
      for rule in rules:
          try:
              allowed = redis.eval(SLIDING_WINDOW, rule.key(request), rule.limit)
          except RedisError:
              return reject(503)
          if not allowed:
              return reject(429)
      return allow()
bug: [2, 7]
explain: |
  **Line 2** queries the rules database on every request — 2M queries a second against a config store, adding latency and making the database a single point of failure. Cache rules in gateway memory and push updates. **Line 7** fails closed for every endpoint: a Redis blip rejects all traffic, turning a limiter problem into a full outage. Fall back to a local token bucket (approximate limits) for ordinary endpoints, and fail closed only for login, SMS and similar abuse-sensitive endpoints. (A 429 should also carry Retry-After and RateLimit headers.)
fix: |
  def check(request):
      for rule in rule_cache.for_plan(request.plan):              # in memory, pushed by rules service
          try:
              allowed, remaining, reset = redis.eval(SLIDING_WINDOW, rule.key(request), rule.limit)
          except RedisError:
              if rule.fail_closed:                                # login, SMS, OTP
                  return reject(503)
              allowed, remaining, reset = local_bucket(rule, request).take()
          if not allowed:
              return reject(429, retry_after=reset, remaining=0)
      return allow(remaining=remaining)
```

```timeline
title: Redis shard failover during peak
lanes: [Gateway, Redis primary, Redis replica]
state: {Mode: 'shared counters', 'Limit accuracy': exact}
steps:
  - {lane: Gateway, to: Redis primary, text: 'check key k-123 → allowed'}
  - {lane: Redis primary, to: Redis primary, text: 'primary crashes'}
  - {lane: Gateway, to: Gateway, text: 'calls time out after 5 ms → local token bucket', set: {Mode: 'local fallback', 'Limit accuracy': 'approximate (per-gateway share)'}}
  - {lane: Redis replica, to: Redis replica, text: 'replica promoted (~10 s)'}
  - {lane: Gateway, to: Redis replica, text: 'circuit closes, shared counting resumes', set: {Mode: 'shared counters', 'Limit accuracy': exact}}
```

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Redis shard down | Short timeout (~5 ms), then a local fallback bucket; abuse-sensitive endpoints fail closed |
| Rules service down | Gateways keep their last known rules; changes are delayed |
| Hot key overloads a shard | Pre-aggregate locally or split the key's counter |
| Bad rule deployed | Shadow mode first; rules are versioned and can be rolled back instantly |

```interview
say: |
  "Enforcement runs in the gateways: per request, one atomic Lua sliding-window check per applicable rule against a 40-shard Redis Cluster, about 1 ms, sized at 2M checks/s with 50% headroom. Rules live in gateway memory, pushed by a rules service, and new limits run in shadow mode before enforcing. Responses are 429 with Retry-After and RateLimit headers. If Redis is unreachable after a 5 ms timeout, ordinary endpoints fall back to local token buckets with a per-gateway share of the limit; login and SMS fail closed. Hot enterprise keys use local pre-aggregation, and multi-region limits are split per region."
followups:
  - q: Why a sliding-window counter rather than a fixed window?
    a: Fixed windows let 2× the limit through around boundaries. The sliding-window counter needs two counters per key and closely approximates a true rolling count.
  - q: How do you keep the check under 2 ms?
    a: One round trip to an in-region Redis shard with a single Lua call, rules cached in memory, and a tight timeout with a local fallback so a slow shard can't add latency.
  - q: How would you enforce a global limit across three regions?
    a: Split the budget per region based on recent traffic and rebalance periodically. Exact global counting would need cross-region round trips on every request.
weak: |
  "Use Redis INCR per user." Non-atomic or fixed-window counting, rules fetched per request, fail-closed everywhere, no sizing.
strong: |
  Places enforcement with a latency budget, sizes and shards counters, uses an atomic sliding-window script, distributes rules with shadow mode, handles hot keys and regions, and sets fail-open versus fail-closed per endpoint.
```

```recall
prompt: Explain how 200 gateway instances can enforce a single "100 requests per second per API key" limit, and what happens if the shared counter store fails.
points:
  - Local per-instance counters would multiply the limit by the number of instances seeing the key
  - A shared, sharded counter store (e.g. Redis Cluster) is updated with one atomic script per request, keyed by the API key
  - The script implements a sliding-window or token-bucket check and returns the decision and remaining budget for headers
  - On store failure, gateways time out quickly and fall back to approximate local buckets for ordinary endpoints, failing closed only for abuse-sensitive ones
model: |
  If each gateway counted on its own, a client spread across 200 gateways could make 200 times its limit. Instead each check runs one atomic Lua script on the Redis shard that owns that API key: it updates a sliding-window counter and returns allow or deny plus the remaining budget for the RateLimit headers. Because the script is atomic, concurrent requests can't race past the limit. If the shard is unreachable, gateways give up after a few milliseconds and use a local token bucket with their share of the limit, so the API stays up with approximate limits — except endpoints like login or SMS, which fail closed because letting abuse through there is worse.
```

```questions
- kind: check
  type: numeric
  prompt: 1.5M checks/s, one Lua call each; a shard handles 100k calls/s and should stay at or below 60%. How many shards?
  answer: 25
  unit: shards
  tolerance: 0.01
  explanation: 1,500,000 ÷ 60,000 = 25 shards. Throughput, not memory, sizes the cluster.
- kind: check
  prompt: Why are both sliding-window counter keys for one API key forced into the same Redis Cluster slot (e.g. with {key} hash tags)?
  choices:
    - text: The Lua script must read and update both atomically on a single shard
      correct: true
    - text: To save memory
      why: Memory use is the same.
    - text: Redis requires all keys in one slot
      why: Only multi-key operations and scripts need it.
    - text: To make them expire together
      why: TTLs are set per key anyway.
  explanation: Multi-key atomic scripts in Redis Cluster need every key in the same hash slot.
- kind: check
  type: multi
  prompt: What should happen if the counter store becomes unreachable? Select all that apply.
  choices:
    - text: Time out quickly so the limiter doesn't add latency
      correct: true
    - text: Fall back to approximate local buckets for ordinary endpoints
      correct: true
    - text: Fail closed for login and SMS endpoints
      correct: true
    - text: Reject all API traffic until it recovers
      why: That turns a limiter outage into a full outage.
  explanation: Choose the failure mode per endpoint, and keep latency bounded.
- kind: check
  prompt: Why should gateways cache rate-limit rules in memory instead of reading them per request?
  choices:
    - text: Reading a config store 2M times a second adds latency and makes it a single point of failure
      correct: true
    - text: Rules never change
      why: They change. Pushing updates keeps the caches fresh.
    - text: Databases can't store rules
      why: They can — just don't query them on the hot path.
    - text: To enforce rules differently on each gateway
      why: The goal is consistency across gateways.
  explanation: Hot-path configuration should be local, with push-based updates and polling as a backup.
- kind: fire
  prompt: What's shadow mode for a new rate limit?
  choices:
    - text: Evaluating and logging "would reject" decisions without enforcing, to see the impact before turning it on
      correct: true
    - text: Applying the limit only at night
      why: That's scheduling, not shadowing.
    - text: Hiding the limit from customers
      why: Limits should be documented.
    - text: Running the limiter on replicas
      why: Unrelated.
  explanation: Shadowing prevents self-inflicted outages from mistuned limits.
- kind: fire
  prompt: One API key generates 30% of traffic and overloads its Redis shard. What helps?
  choices:
    - text: Pre-aggregate the key's increments locally on each gateway, or split its counter across sub-keys
      correct: true
    - text: Add more shards
      why: The key still lives on one shard.
    - text: Remove the limit for that key
      why: That removes protection from your biggest consumer.
    - text: Switch to a fixed window
      why: Same hot key, worse accuracy.
  explanation: Hot keys need key-specific handling, trading a little accuracy for spreading load.
- kind: fire
  prompt: How do most systems enforce a "global" limit across several regions?
  choices:
    - text: Split the budget into per-region shares based on recent traffic, and rebalance periodically
      correct: true
    - text: A cross-region synchronous counter on every request
      why: That adds tens of milliseconds and a cross-region dependency to every request.
    - text: Ignore other regions
      why: Each region would allow the full limit.
    - text: Only allow traffic in one region
      why: That defeats multi-region.
  explanation: Exactness costs latency. A per-region share is the usual compromise.
- kind: fire
  level: advanced
  prompt: Why can the in-process local-fallback mode let a client exceed its limit, and why is that acceptable briefly?
  choices:
    - text: Each gateway enforces only its share and can't see the others; a small, temporary overshoot is better than an outage or zero protection
      correct: true
    - text: It can't exceed the limit
      why: Uneven traffic can exceed a per-gateway share.
    - text: Local buckets have no limit
      why: They do, scaled to a share.
    - text: It's never acceptable
      why: For capacity-protection limits, brief approximation is the standard trade-off.
  explanation: Graceful degradation of accuracy beats either failing open completely or failing closed completely.
- kind: fire
  type: order
  prompt: Order the steps of a request through the limiter.
  items:
    - Edge drops floods per IP
    - Gateway authenticates the key and loads rules from memory
    - One atomic counter check per applicable rule
    - Forward with RateLimit headers, or return 429 with Retry-After
  explanation: Cheap checks first, one round trip for keyed limits, and an informative response either way.
```
