---
id: overload
category: reliability
skill: operations
title: Overload, backpressure and circuit breakers
minutes: 16
summary: Every system has a limit. Past it, a system with no defences doesn't slow down gracefully — it collapses, serving nobody, and can stay collapsed after the trigger goes away. Bound queues and concurrency, shed load early and by priority, push back on producers, isolate failures with bulkheads and circuit breakers, and degrade features before you fail requests.
objectives:
  - Explain congestion collapse and metastable failures, and why unbounded queues make them worse
  - Apply admission control, load shedding by priority, and backpressure
  - Use timeouts, circuit breakers and bulkheads to stop one failing dependency taking everything down
  - Design graceful degradation (brownouts) and know which features to drop first
sources:
  - ['Google SRE Book: Handling overload', 'https://sre.google/sre-book/handling-overload/']
  - ['AWS Builders Library: Using load shedding to avoid overload', 'https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/']
  - ['Bronson et al., Metastable Failures in Distributed Systems (HotOS 2021)', 'https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf']
---

> [!story] The outage that outlived its cause
> A cache cluster restarted during a routine deploy, and for 30 seconds the database took every read. It slowed; clients timed out after 2 seconds and retried; the retries doubled the load; the database slowed further. The cache came back within a minute, but the database stayed pinned at 100% for 40 more — busy serving requests whose clients had already given up and retried. This is a **metastable failure**: the trigger was brief, but the system had entered a self-sustaining overloaded state, and only shedding load deliberately got it out.

## What overload looks like without defences

Below capacity, a server completes everything. Past capacity, a naive server:

- queues requests in unbounded buffers, so latency grows until callers time out,
- keeps working on requests nobody is waiting for any more,
- triggers client retries that add more load,
- runs out of memory, threads or connections and starts failing **everything**, including cheap requests it could have served.

Throughput of useful work (**goodput**) collapses instead of plateauing. The fix is to decide in advance what to reject, and to reject it early and cheaply.

## Admission control and load shedding

- **Bound concurrency** (in-flight requests per instance) and **bound queues.** A request that would wait longer than its deadline should be rejected *now* with a fast `503` or `429` and `Retry-After`, not queued.
- **Shed by priority:** health checks and payment captures before recommendations, logged-in checkouts before anonymous browsing, interactive traffic before batch jobs.
- **Shed early:** at the load balancer or edge, before expensive work starts. A rejection should cost a fraction of a millisecond.
- **Use deadlines:** drop requests whose caller's deadline has already passed (propagated deadline headers). Finishing them is pure waste.
- **Prefer LIFO under overload** for some queues: the newest requests are the ones whose clients are still waiting.

```sim
name: queue
title: Bounded versus unbounded queues under overload
intro: Arrivals at 30/s against a capacity of 20/s — a sustained 50% overload.
config:
  controls: [arrival, workers, cap]
  initial: {arrival: 30, workers: 10, rate: 2, random: true, cap: 0}
challenges:
  - {text: 'With no queue limit, watch every request wait longer and longer (p99 wait over 60 s)', metric: p99Wait, op: '>', value: 60}
  - {text: 'Bound the queue so the p99 wait for accepted work stays under 10 s, by rejecting the excess', metric: p99Wait, op: '<', value: 10, and: [{metric: rejected, op: '>', value: 0}]}
takeaway: |
  An unbounded queue during sustained overload serves everyone badly — eventually every request exceeds its client's timeout, so goodput falls to zero while the server stays 100% busy. A bounded queue serves the requests it accepts quickly and rejects the rest fast, so those clients can back off or try elsewhere.
```

## Backpressure

**Backpressure** propagates "slow down" upstream instead of buffering forever: bounded channels that block producers, TCP flow control, `429` with `Retry-After`, Kafka consumers pausing fetches, reactive streams' demand signals. The goal is that the slowest component sets the pace of the whole pipeline, rather than buffers growing until something crashes.

## Timeouts, circuit breakers and bulkheads

When a dependency fails slowly (a hung database, a struggling payments API), every caller thread that waits on it is stuck, and the caller runs out of threads for *everything else*. Three defences:

- **Timeouts** on every remote call, inside the caller's deadline.
- **Circuit breakers:** track the dependency's failure rate. When it crosses a threshold, **open** the circuit and fail fast (or serve a fallback) without calling it. After a cool-off, go **half-open** and let a trial request through; close again on success.
- **Bulkheads:** separate resource pools per dependency (thread pools, connection pools, concurrency limits), so a slow recommendations service can exhaust *its* pool without touching checkout's.

```sim
name: circuit
title: A circuit breaker in action
challenges:
  - {text: 'Turn the breaker off and watch threads pile up waiting on the dead dependency', metric: exhausted, op: '>', value: 0, and: [{metric: breaker, op: '==', value: false}]}
  - {text: 'Turn it on and tune it so no thread exhaustion occurs during the outage', metric: exhausted, op: '==', value: 0, and: [{metric: breaker, op: '==', value: true}]}
takeaway: |
  Without a breaker, every request waits for the full timeout against a dead dependency, worker threads run out, and the caller fails for everyone. With one, after a short burst of failures the caller fails fast, keeps its threads, and probes periodically to notice recovery. Shorter timeouts help too — but only a breaker stops paying the timeout on every request.
```

```predict
prompt: A product page calls inventory, reviews and recommendations through a single shared pool of 200 threads. Recommendations hangs. What happens to the page — and to checkout, which shares the same pool?
choices:
  - Only recommendations fail; everything else is fine
  - Threads blocked on recommendations fill the shared pool, so product pages and checkout start failing too
  - The load balancer routes around recommendations
  - Recommendations time out instantly, so nothing happens
answer: 1
reveal: |
  A shared pool turns one slow dependency into a failure of everything that uses the pool. **Bulkheads** — a separate, small pool or concurrency limit per dependency — contain it: recommendations exhausts its 20 threads and fails fast, while checkout's pool is untouched. Add a timeout and a circuit breaker, and the page renders without recommendations.
```

## Graceful degradation

Decide ahead of time which features are optional, and switch them off under load rather than failing core flows:

```sort
prompt: Under severe overload on an e-commerce site, what should happen to each feature?
buckets: [Keep serving, Degrade (simplify or serve stale), Turn off first]
items:
  - {text: 'Checkout and payment capture', bucket: 0, why: 'Revenue-critical. Protect it with reserved capacity and priority.'}
  - {text: 'Personalised recommendations', bucket: 2, why: 'Expensive and optional. Hide the widget or show static best-sellers.'}
  - {text: 'Product pages', bucket: 1, why: 'Serve cached or slightly stale pages, drop live stock counts, simplify reviews.'}
  - {text: 'Search', bucket: 1, why: 'Fall back to simpler queries, smaller result sets or cached popular queries.'}
  - {text: 'Analytics event collection from the browser', bucket: 2, why: 'Sample heavily or buffer — nobody is harmed by losing some events.'}
  - {text: 'Login', bucket: 0, why: 'Without it, nobody can check out. Keep it serving.'}
```

> [!senior] Brownouts beat blackouts
> Build degradation as feature flags you can flip in seconds, ideally automatically when load or latency crosses a threshold. Test them (game days), because a degradation path that's never exercised fails when you need it. Shedding 10% of optional work early is far better than failing 100% of requests late.

```bug
title: An overloaded service's configuration
prompt: Which lines make this service collapse under overload rather than degrade?
lang: yaml
code: |
  server:
    max_concurrent_requests: unlimited
    request_queue: unbounded
  dependencies:
    recommendations: {timeout_ms: 30000, retries: 3}
    payments:        {timeout_ms: 5000,  retries: 1}
  thread_pool: shared        # one pool for all dependencies
bug: [2, 3, 5, 7]
explain: |
  **Lines 2–3:** unlimited concurrency and an unbounded queue mean overload turns into ever-growing latency and memory use instead of fast rejections. Bound both, and reject with 503 and Retry-After. **Line 5:** a 30-second timeout with 3 retries on an optional dependency can hold a thread for two minutes per request — it should have a short timeout, no retries, a circuit breaker and a fallback. **Line 7:** a shared pool lets that slow optional dependency starve payments. Give each dependency its own bulkhead.
```

```interview
ask: How would you keep an e-commerce platform responsive during a traffic surge when downstream services become slow or unavailable?
say: |
  "Each instance caps in-flight requests and keeps a short bounded queue. Anything that would wait past its propagated deadline gets an immediate 503 with Retry-After. Shedding happens by priority — checkout and login over browsing, browsing over batch — at the edge where possible. Each dependency has its own bulkhead pool, a timeout inside the caller's budget, and a circuit breaker with a fallback. Optional features like recommendations, live stock counts and reviews sit behind degradation flags that trip automatically on latency. Clients retry with jittered backoff and a retry budget, so we don't create a retry storm."
followups:
  - q: Why reject requests rather than queue them?
    a: Queued requests that outlive their client's timeout are wasted work that delays everyone else. Fast rejections keep goodput high and let clients back off or go elsewhere.
  - q: How does a circuit breaker help a dependency recover?
    a: Failing fast stops the flood of requests and retries against it, giving it room to recover, while half-open probes detect when it's healthy again.
  - q: What's a metastable failure?
    a: An overloaded state that sustains itself after the trigger is gone — usually through retries, timeouts and cold caches — and needs deliberate load reduction to escape.
weak: |
  "Autoscale and add retries." Unbounded queues, shared pools and aggressive retries — the recipe for collapse.
strong: |
  Bounds concurrency and queues, sheds early by priority with deadlines, isolates dependencies with bulkheads, timeouts and breakers, degrades optional features first, and coordinates retries with budgets.
```

```recall
prompt: Explain how a circuit breaker works (its states and transitions), and why it helps both the caller and the failing dependency.
points:
  - "Closed: requests flow normally while the breaker tracks failure rate or latency"
  - "Open: once failures cross a threshold, calls fail fast (or use a fallback) without contacting the dependency"
  - "Half-open: after a cool-off, a few trial requests test the dependency; success closes the breaker, failure reopens it"
  - The caller keeps its threads and latency instead of waiting on timeouts, and the dependency gets relief from traffic and retries so it can recover
model: |
  In the closed state calls go through while the breaker counts failures and slow responses. When the failure rate crosses a threshold within a window, it opens: calls fail immediately or return a fallback, without touching the dependency. After a cool-off period it goes half-open and lets a few trial requests through. If they succeed it closes again; if not it reopens. The caller stops burning threads and seconds on timeouts against something that's down, so it can keep serving everything else, and the struggling dependency stops getting hammered by requests and retries, which is often what lets it recover.
```

```questions
- kind: check
  prompt: Why does an unbounded request queue make sustained overload worse?
  choices:
    - text: Waits grow until requests exceed their clients' timeouts, so the server spends its capacity on work nobody is waiting for
      correct: true
    - text: Unbounded queues reject requests too early
      why: They never reject anything. That's the problem.
    - text: Queues reduce throughput when lightly loaded
      why: Light load isn't the issue.
    - text: They make health checks fail first
      why: Not necessarily. Everything just gets slower.
  explanation: Bounded queues with fast rejection keep accepted work fast and let rejected clients back off.
- kind: check
  type: order
  prompt: Order a circuit breaker's state transitions during a dependency outage and recovery.
  items:
    - Closed — requests flow and failures are counted
    - Open — the failure threshold is crossed and calls fail fast
    - Half-open — after a cool-off, trial requests are allowed through
    - Closed — trials succeed and normal traffic resumes
  explanation: The breaker stops calls while the dependency is down and probes cautiously to detect recovery.
- kind: check
  type: multi
  prompt: Which practices help a service degrade rather than collapse under overload? Select all that apply.
  choices:
    - text: Bounded concurrency with fast 503 or 429 rejections and Retry-After
      correct: true
    - text: Shedding lower-priority traffic first
      correct: true
    - text: Dropping requests whose deadline has already passed
      correct: true
    - text: Per-dependency bulkheads and circuit breakers
      correct: true
    - text: Retrying every failure immediately three times
      why: Immediate retries amplify the overload.
  explanation: Decide what to reject, reject it early and cheaply, isolate failures, and don't multiply load.
- kind: check
  prompt: What is a bulkhead in system design?
  choices:
    - text: An isolated resource pool (threads, connections, concurrency) per dependency or workload, so one can't exhaust resources shared by others
      correct: true
    - text: A firewall rule
      why: Bulkheads isolate capacity, not network access.
    - text: A type of database index
      why: Unrelated.
    - text: A retry policy
      why: Retries are separate.
  explanation: Like a ship's watertight compartments, bulkheads contain the damage from a slow or failing dependency.
- kind: fire
  prompt: A cache restart triggers a database overload that persists for 40 minutes after the cache is back. What kind of failure is this, and how do you get out?
  choices:
    - text: A metastable failure sustained by retries and timeouts; escape by shedding load or cutting retries until the system recovers
      correct: true
    - text: A hardware failure; replace the database
      why: Nothing is broken. The load pattern is self-sustaining.
    - text: A DNS issue; lower the TTL
      why: Unrelated.
    - text: Normal behaviour that fixes itself in seconds
      why: It persisted for 40 minutes.
  explanation: Metastable states need deliberate intervention — shedding, pausing retries, warming caches — to drop load below capacity.
- kind: fire
  prompt: An optional recommendations call has a 30 s timeout and 3 retries. What should change?
  choices:
    - text: A short timeout (hundreds of ms), no retries, a circuit breaker and a fallback with no recommendations
      correct: true
    - text: A longer timeout so recommendations always load
      why: That ties up threads and slows pages for an optional feature.
    - text: More retries
      why: They multiply load on a struggling service.
    - text: Moving it into the checkout thread pool
      why: That would let it starve checkout.
  explanation: Optional dependencies get small budgets and graceful fallbacks, so their failures can't hurt core flows.
- kind: fire
  prompt: Where is the cheapest place to shed load?
  choices:
    - text: As early as possible — at the edge or load balancer, before expensive work starts
      correct: true
    - text: After the database query completes
      why: By then most of the cost has been paid.
    - text: In the client's browser after rendering
      why: The server has already done all the work.
    - text: Nowhere — never shed load
      why: Then overload sheds load for you, by failing everything.
  explanation: A rejection should cost almost nothing. The later you reject, the more capacity you've wasted.
- kind: fire
  level: advanced
  prompt: Under overload, why might a server process its queue in LIFO order instead of FIFO?
  choices:
    - text: The newest requests are the ones whose clients are most likely still waiting; the oldest have probably already timed out
      correct: true
    - text: LIFO is always fairer
      why: It's less fair, but it maximises useful work during overload.
    - text: LIFO uses less memory
      why: Memory use is the same.
    - text: FIFO isn't possible with bounded queues
      why: It's possible. It's just worse during overload.
  explanation: During overload, FIFO serves requests whose callers have given up. LIFO (with deadlines) maximises goodput.
- kind: fire
  type: multi
  prompt: Which features should usually be turned off first when an online store is overloaded? Select all that apply.
  choices:
    - text: Personalised recommendations
      correct: true
    - text: Non-essential analytics collection
      correct: true
    - text: Live "N people are viewing this" counters
      correct: true
    - text: Payment capture
      why: Revenue-critical. Protect it.
    - text: Login
      why: Everything else depends on it.
  explanation: Rank features by business value and cost. Drop expensive, optional ones first.
```
