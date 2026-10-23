---
id: rate-limiting
category: reliability
skill: capacity
title: Rate limiting algorithms
minutes: 15
summary: Rate limits protect capacity, enforce fairness between clients and cap the cost of abuse. The algorithm decides how bursts are treated — a fixed window lets twice the limit through at a boundary, a token bucket allows controlled bursts, a leaky bucket smooths everything into a steady stream. At scale the hard parts are the shared counter, the key you limit on, and what happens when the limiter itself fails.
objectives:
  - Compare fixed window, sliding log, sliding window counter, token bucket and leaky bucket by accuracy, burst behaviour and cost
  - Implement a distributed limiter with atomic operations and reason about local versus global limits
  - Choose limit keys, scopes and responses (429 and rate-limit headers)
  - Decide whether the limiter fails open or closed, and distinguish rate limits from quotas
sources:
  - ['Cloudflare: How we built rate limiting capable of scaling to millions of domains', 'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/']
  - ['Stripe: Scaling your API with rate limiters', 'https://stripe.com/blog/rate-limiters']
  - ['IETF draft: RateLimit header fields for HTTP', 'https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/']
---

> [!story] The limit that allowed double
> An API advertised "100 requests per minute" using a fixed-window counter keyed by `user:minute`. A scraper discovered it could send 100 requests at 12:00:59 and another 100 at 12:01:00 — 200 requests in two seconds, every minute, without ever being rejected. Nothing was buggy; the algorithm counts per calendar window, not per rolling minute. The team switched to a sliding-window counter, and the scraper's burst dropped to the intended rate.

## The algorithms

| Algorithm | How it works | Bursts | Memory per key | Accuracy |
|---|---|---|---|---|
| **Fixed window** | Count requests in the current clock window (e.g. this minute); reset at the boundary | Up to 2× the limit across a boundary | 1 counter | Approximate |
| **Sliding log** | Store every request timestamp; count those in the last window | None beyond the limit | One entry per request | Exact, expensive |
| **Sliding window counter** | Weight the previous window's count by how much of it overlaps the rolling window, plus the current count | Small error | 2 counters | Very close (Cloudflare reported ~0.003% wrong decisions) |
| **Token bucket** | Tokens refill at rate r up to capacity b; each request takes one | Allows bursts up to b, then r | 2 numbers | Exact for its model |
| **Leaky bucket (queue)** | Requests enter a queue drained at a constant rate | Smoothed — excess waits or is dropped | Queue | Exact; adds delay |

Try each against the boundary attack, a steady stream, a burst after silence, and sustained abuse:

```sim
name: ratelimit
title: Compare rate limiters
challenges:
  - {text: 'Fixed window plus the boundary pattern: see more than the limit allowed within one second', metric: maxInAnySecond, op: '>', value: 10, and: [{metric: algo, op: '==', value: fixed}, {metric: pattern, op: '==', value: boundary}]}
  - {text: 'Find an algorithm that never allows more than the limit in any 1-second span on the boundary pattern', metric: maxInAnySecond, op: '<=', value: 10, and: [{metric: pattern, op: '==', value: boundary}]}
  - {text: 'With the bursty pattern, use a token bucket to absorb an initial burst, then hold the steady rate', metric: rejected, op: '>', value: 0, and: [{metric: algo, op: '==', value: token}, {metric: pattern, op: '==', value: bursty}]}
takeaway: |
  Fixed windows are cheap but leak bursts at boundaries. Sliding logs are exact but store every request. The sliding-window counter is the practical compromise for "N per period". Token buckets express "average r, bursts up to b", which suits APIs whose clients legitimately burst. Leaky buckets turn bursts into delay — good in front of a fragile downstream, bad for interactive latency.
```

```calc
title: Token bucket burst
prompt: A token bucket has capacity **50** and refills at **10 tokens/s**. It's been idle long enough to be full. A client sends **200** requests as fast as it can. How many are allowed in the first **5 seconds**?
answer: 100
unit: requests
tolerance: 1.02
steps: |
  The full bucket allows an immediate burst of **50**, and then refills at 10/s, allowing another 10 × 5 = **50** over the next five seconds — **100** in total. After that it's a steady 10/s. Capacity sets the burst size; refill rate sets the long-run average.
```

## Distributed limiting

With 50 API instances, a per-instance counter of 100/minute lets a client make 5,000 requests a minute if requests are spread evenly. Options:

- **Central counters** in Redis (or similar): every request does an atomic increment-and-check for its key. Accurate; adds a network hop and makes the limiter a critical dependency.
- **Local limits with a share of the global budget:** each instance enforces limit ÷ N (approximate, and wrong when traffic is uneven or N changes).
- **Hybrid:** local token buckets that periodically sync with a central store — fast, roughly accurate, the approach many edge networks take.

The increment and the check must be **atomic**:

```bug
title: A Redis fixed-window limiter
prompt: Which lines make this limiter leak or misbehave under concurrency?
lang: python
code: |
  def allow(user_id, limit=100):
      key = f"rl:{user_id}:{int(time.time() // 60)}"
      count = redis.get(key) or 0
      if int(count) >= limit:
          return False
      redis.incr(key)
      redis.expire(key, 60)
      return True
bug: [3, 6, 7]
explain: |
  **Lines 3–6** are a read-check-write race: 50 concurrent requests all read 99 and all pass, letting 149 through. Use the atomic result of `INCR` — increment first, then compare the returned value. **Line 7** sets the TTL in a separate command. If the process dies between `INCR` and `EXPIRE`, the key never expires (a slow memory leak, and a permanent block if the window key were reused). Do both atomically with a pipeline/MULTI or a Lua script. (It's also a fixed window, with the boundary-burst behaviour.)
fix: |
  LUA = """
  local n = redis.call('INCR', KEYS[1])
  if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return n
  """
  def allow(user_id, limit=100):
      key = f"rl:{user_id}:{int(time.time() // 60)}"
      return redis.eval(LUA, 1, key, 60) <= limit
```

## Keys, scopes and responses

- **What to limit on:** API key or account (fairness between customers), user, IP (anonymous traffic; beware shared IPs behind NAT), endpoint (expensive endpoints get tighter limits), or a combination. Often several layers at once.
- **Where:** coarse limits at the edge or gateway (cheap, protects everything); fine-grained limits in the service that knows the cost of each operation.
- **Respond with `429 Too Many Requests`**, a `Retry-After` header, and ideally rate-limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) so well-behaved clients can pace themselves.
- **Quotas** (10,000 calls per month, a billing concept) differ from **rate limits** (100 per second, a capacity concept). Many APIs have both.

```sort
prompt: Which limit fits each goal?
buckets: [Per IP at the edge, Per API key or account, Per endpoint (cost-weighted), Monthly quota]
items:
  - {text: 'Stop a botnet hammering the login page', bucket: 0, why: 'Anonymous traffic has no account yet — IP (plus device and behaviour signals) at the edge is the first line.'}
  - {text: 'Stop one customer starving others on a shared API', bucket: 1, why: 'Fairness is per customer, whichever IPs they come from.'}
  - {text: 'Protect an expensive report-generation endpoint', bucket: 2, why: 'Weight by cost: 5 reports a minute even if the general limit is 1,000 calls a minute.'}
  - {text: 'Enforce the free tier of 10,000 calls a month', bucket: 3, why: "A billing allowance, tracked durably over a long period, not a capacity guard."}
```

## When the limiter fails

If Redis is unreachable, does every request get rejected (**fail closed**) or allowed (**fail open**)?

- **Fail open** for limits that protect fairness and soft capacity: a limiter outage shouldn't become an API outage. Keep a local fallback bucket per instance so it degrades to approximate limits rather than none.
- **Fail closed** for limits that protect security or money: login and OTP attempts, SMS sending (toll fraud), free-trial abuse.

```predict
prompt: The central Redis used for rate limiting goes down. Your limiter is configured to fail closed for all endpoints. What happens?
choices:
  - Only abusive clients are blocked
  - Every API request is rejected — the rate limiter has become a single point of failure for the whole API
  - Requests are queued until Redis returns
  - Limits are enforced locally automatically
answer: 1
reveal: |
  Failing closed turns a limiter outage into a full outage. For most endpoints, fail open with a local per-instance fallback limit (approximate but safe), and reserve fail-closed for security-sensitive paths such as login attempts and SMS sending, where letting abuse through is worse than briefly blocking everyone.
```

```interview
say: |
  "Two layers. At the edge, per-IP limits stop floods before they reach us. In the gateway, per-API-key limits use a sliding-window counter in Redis — an atomic Lua script, about 0.5 ms — with cost weights for expensive endpoints. Responses are 429 with Retry-After and RateLimit headers. Each gateway instance keeps a local token bucket as a fallback, so if Redis is down we fail open to approximate limits, except login and SMS, which fail closed. Monthly quotas are tracked separately in the billing database."
followups:
  - q: Why not a fixed window?
    a: It lets up to 2× the limit through around window boundaries. A sliding-window counter fixes that with two counters per key and a small, bounded error.
  - q: How do you limit across 50 instances?
    a: A shared counter with atomic operations (Redis plus Lua), or local buckets that sync periodically. Per-instance limits alone multiply the effective limit by the instance count.
  - q: Token bucket or leaky bucket?
    a: Token bucket when clients may legitimately burst and you just need to bound the average. Leaky bucket when a downstream needs a smooth, constant rate and added delay is acceptable.
weak: |
  "Count requests per minute in Redis." A non-atomic counter, a fixed window, no thought about keys, distribution or failure mode.
strong: |
  Picks an algorithm by burst semantics, implements it atomically for distributed enforcement, layers keys and scopes, returns useful headers, and decides fail-open versus fail-closed per endpoint.
```

```recall
prompt: Explain why a fixed-window rate limiter can allow twice the limit, and how a sliding-window counter or token bucket avoids it.
points:
  - A fixed window resets its count at clock boundaries
  - A client can send the full limit at the end of one window and again at the start of the next, so 2× the limit within a short span
  - A sliding-window counter weights the previous window's count by its overlap with the rolling window, approximating a true rolling count
  - A token bucket bounds bursts by its capacity and the long-run rate by its refill rate, independent of clock boundaries
model: |
  A fixed window counts requests per calendar minute and resets the counter at :00. A client can send 100 requests at 12:00:59 and 100 more at 12:01:00, all allowed, so 200 requests land in two seconds against a "100 per minute" limit. A sliding-window counter keeps the previous and current window counts and estimates the rolling count as previous × (fraction of the previous window still inside the last 60 s) + current, so the boundary trick fails. A token bucket ignores clock windows entirely: bursts can never exceed its capacity, and sustained traffic can't exceed its refill rate.
```

```questions
- kind: check
  prompt: With a fixed-window limiter of 100 per minute, what's the maximum a client can get through within 2 seconds?
  choices:
    - text: About 200, by bursting at the end of one window and the start of the next
      correct: true
    - text: 100
      why: The counter resets at the boundary, so the next window grants another 100.
    - text: About 3
      why: Fixed windows don't spread requests evenly.
    - text: Unlimited
      why: Each window is still capped at 100.
  explanation: Boundary bursts are the fixed window's known weakness. Sliding windows and token buckets fix it.
- kind: check
  type: numeric
  prompt: A full token bucket has capacity 20 and refills at 5 tokens per second. A client sends requests as fast as possible. How many are allowed in the first 4 seconds?
  answer: 40
  unit: requests
  tolerance: 0.02
  explanation: 20 immediately, plus 5 × 4 = 20 refilled — 40 in total. After that it's 5 per second.
- kind: check
  prompt: Why must a distributed limiter use an atomic increment-and-check?
  choices:
    - text: Otherwise concurrent requests can all read the same count, all pass the check, and exceed the limit
      correct: true
    - text: Atomic operations are faster
      why: The reason is correctness, not speed.
    - text: Redis requires it
      why: Redis allows non-atomic sequences. That's exactly how the bug happens.
    - text: To make keys expire
      why: Expiry is a separate concern (though it should also be set atomically).
  explanation: Increment first and act on the returned value, or use a Lua script, so the check reflects every concurrent request.
- kind: check
  type: multi
  prompt: Which limits should usually fail closed if the limiter's store is unavailable? Select all that apply.
  choices:
    - text: Login attempts per account
      correct: true
    - text: SMS one-time-password sends
      correct: true
    - text: General per-customer API rate limits
      why: Failing closed here turns a limiter outage into a full API outage. Prefer failing open with local fallbacks.
    - text: Read-only product catalogue requests
      why: Low risk. Keep serving.
  explanation: Fail closed where abuse costs money or security. Fail open, with approximate local limits, where availability matters more.
- kind: fire
  prompt: 40 gateway instances each enforce "100 requests per minute per user" locally, and traffic is spread evenly. What's the effective limit?
  choices:
    - text: Up to about 4,000 per minute
      correct: true
    - text: 100 per minute
      why: Each instance counts only the traffic it sees.
    - text: 2.5 per minute
      why: Local limits don't divide automatically.
    - text: Unlimited
      why: It's bounded, just 40 times too high.
  explanation: Per-instance limits multiply by instance count. Use a shared counter, or divide the budget and sync.
- kind: fire
  prompt: Which algorithm best expresses "an average of 10 per second, with bursts of up to 50 allowed"?
  choices:
    - text: Token bucket with capacity 50 and refill rate 10/s
      correct: true
    - text: Fixed window of 10 per second
      why: That allows no deliberate bursts, and leaks double at boundaries.
    - text: Leaky bucket at 10/s with no queue
      why: That smooths traffic. Bursts would be dropped, not allowed.
    - text: Sliding log of 50 per second
      why: That allows 50 every second — five times the intended average.
  explanation: Capacity is the burst allowance; refill rate is the sustained rate.
- kind: fire
  prompt: What should a rate-limited response contain?
  choices:
    - text: 429 status, Retry-After, and rate-limit headers describing the limit and remaining budget
      correct: true
    - text: 500 status
      why: 500 blames the server and invites immediate retries.
    - text: 200 with an error message in the body
      why: Clients and monitoring branch on status codes.
    - text: 403 Forbidden
      why: 403 means "not allowed at all", not "slow down".
  explanation: Telling clients when to retry, and how much budget remains, prevents retry storms and lets good clients self-pace.
- kind: fire
  level: advanced
  prompt: Cloudflare's sliding-window counter estimates the rolling count from two fixed windows. What's the main trade-off compared with a sliding log?
  choices:
    - text: It uses constant memory per key at the cost of a small approximation error
      correct: true
    - text: It's exact but uses more memory
      why: That describes the sliding log.
    - text: It allows unlimited bursts
      why: It closely tracks the rolling limit.
    - text: It needs synchronised clocks to the nanosecond
      why: Ordinary clock accuracy is enough.
  explanation: Two counters per key scale to millions of keys. The weighted estimate is wrong only in rare edge cases.
- kind: fire
  type: multi
  prompt: Which are distinct from capacity-protecting rate limits? Select all that apply.
  choices:
    - text: Monthly usage quotas tied to billing plans
      correct: true
    - text: Lifetime limits on free-trial actions
      correct: true
    - text: Per-second request caps per API key
      why: That's a rate limit.
    - text: Concurrency limits per instance
      why: That's capacity protection too.
  explanation: Quotas are business allowances tracked durably over long periods. Rate limits protect capacity and fairness over short windows.
```
