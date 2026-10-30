---
id: service-quality
category: foundations
skill: capacity
title: Latency, throughput and availability
minutes: 17
summary: Three numbers describe how a service behaves — how long each request takes, how many complete per second, and how often eligible requests get the promised result. They interact in non-obvious ways. Averages hide the tail, fan-out amplifies it, queues explode near full utilisation, and availability multiplies across dependencies.
objectives:
  - Read latency distributions with percentiles and explain why the tail matters more under fan-out
  - Use Little's Law to connect throughput, latency and concurrency
  - Explain why latency rises sharply as utilisation approaches 100%, and pick a sensible headroom
  - Compose availability across serial and redundant components, and alert on error-budget burn rate
sources:
  - ['Dean & Barroso, The Tail at Scale (CACM 2013)', 'https://research.google/pubs/the-tail-at-scale/']
  - ['Google SRE Book: Monitoring distributed systems', 'https://sre.google/sre-book/monitoring-distributed-systems/']
  - ['Google SRE Workbook: Alerting on SLOs', 'https://sre.google/workbook/alerting-on-slos/']
---

> [!incident] The tail at scale
> Google's "The Tail at Scale" paper describes a service whose individual servers answered in about 10 ms, with a 99th percentile of one second. One slow server in a hundred barely mattered for single requests. But a user request that fans out to 100 servers waits for the slowest one — so **63%** of user requests took over a second. Nothing was broken. That was just arithmetic.

## Latency is a distribution, not a number

- **p50 (median):** half of requests are faster than this.
- **p99:** 1 in 100 requests is slower. For a page that makes 30 requests, most page views include at least one of those.
- **Mean:** pulled up by outliers, yet still hides how bad they are. A mean of 60 ms can coexist with a p99 of 2 s.

Always ask: which percentile, measured where, over which window, and do failed and timed-out requests count?

```sim
name: percentile
title: Tails and fan-out
challenges:
  - {text: 'With no fan-out, raise slow requests from 1% to 2%: p99 jumps to the slow latency while the median barely moves', metric: p99, op: '>', value: 500, and: [{metric: fanout, op: '==', value: 1}, {metric: tail, op: '>=', value: 2}]}
  - {text: 'Raise fan-out to 50. What share of user requests now touch at least one slow call?', metric: slowShare, op: '>=', value: 39, and: [{metric: fanout, op: '>=', value: 50}]}
  - {text: 'Turn on hedging and bring the user-facing p99 back down at fan-out 50', metric: hedge, op: '==', value: true, and: [{metric: fanout, op: '>=', value: 50}]}
takeaway: |
  With fan-out N, the chance a user request hits at least one backend call slower than the backend's p99 is **1 − 0.99ᴺ** — 26% at N = 30, 63% at N = 100. Backend p99 becomes user p50. Hedged requests (send a second copy after the p95 and use whichever answers first) cut the tail for a few percent of extra load. So do timeouts with fallbacks, and removing sources of slowness (GC pauses, cold caches, noisy neighbours).
```

```predict
prompt: A service reports a mean latency of 45 ms and nobody complains in testing. In production, users report occasional 3-second page loads. Each page makes 40 backend calls in parallel. What should you look at first?
choices:
  - The mean latency over a longer window
  - The backend's p99 and p99.9 latency, because with 40 calls per page, rare slow calls hit many pages
  - CPU usage of the web servers
  - The number of servers
answer: 1
reveal: |
  At 40 parallel calls per page, a backend p99 of 3 s means 1 − 0.99⁴⁰ ≈ **33%** of page loads include at least one 3-second call. The mean can look excellent while a third of users suffer. Track percentiles per dependency and the user-facing latency, not averages.
```

## Throughput and Little's Law

**Throughput** is completed work per unit time. It's capped by the most constrained resource, not by the number of servers you have.

**Little's Law** connects the three quantities for any stable system: *L = λ × W*

- **L** — average number of requests in the system (in flight, concurrency)
- **λ** — arrival rate (= throughput, when stable)
- **W** — average time each request spends in the system

It's indispensable for sizing: thread pools, connection pools, and how much concurrency a dependency must support.

```calc
title: Size a connection pool with Little's Law
prompt: A service handles **4,000 requests/s** at peak. Each request holds a database connection for **25 ms** on average. How many connections are in use on average across the fleet?
answer: 100
unit: connections
tolerance: 1.03
steps: |
  L = λ × W = 4,000/s × 0.025 s = **100** concurrent connections. Size the pool with headroom for bursts and slow periods (if query time degrades to 100 ms during an incident, the same traffic needs 400). That's also why slow queries exhaust connection pools: latency rises, so concurrency rises, at constant traffic.
```

## Utilisation and the knee

A server at 50% utilisation and one at 95% don't differ by a factor of two in latency: the busy one can be ten or twenty times slower, because arriving requests increasingly find the server busy and **queue**. For a simple queue, waiting time scales roughly with **ρ / (1 − ρ)**, where ρ is utilisation: 1× at 50%, 4× at 80%, 9× at 90%, 19× at 95%.

That's why services run with headroom (often 50–70% at peak), and why a "small" traffic increase can tip a hot system over.

```sim
name: queue
title: Where the knee is
intro: Random arrivals and random job sizes, like real traffic. Ten workers each finish about 2 jobs/s, so capacity is 20 jobs/s.
config:
  controls: [arrival, workers, random]
  initial: {arrival: 10, workers: 10, rate: 2, random: true}
challenges:
  - {text: 'At 50% utilisation (10 arrivals/s), note the p99 wait', metric: utilization, op: '<=', value: 55}
  - {text: 'Push utilisation to 90% (18 arrivals/s) — how much worse is the p99 wait?', metric: utilization, op: '>=', value: 90, and: [{metric: utilization, op: '<', value: 100}]}
  - {text: 'Turn off randomness at 90%. Deterministic traffic barely queues. Variability is what causes waiting.', metric: utilization, op: '>=', value: 90, and: [{metric: random, op: '==', value: false}]}
takeaway: |
  Waiting comes from **variability plus utilisation**. Perfectly regular traffic could run at 99%, but real arrivals are bursty and job sizes vary, so queues form long before 100%. Leave headroom, reduce variance (smaller, more uniform units of work), and watch saturation signals — queue length, pool waits — rather than CPU alone.
```

## Availability

Availability is the fraction of **eligible requests** that get the promised result, or the fraction of time a service is usable, over a window. Request-based measurement ("99.9% of valid requests succeed") is usually closer to user experience than uptime pings.

| Availability | Downtime / year | Downtime / 30 days |
|---|---|---|
| 99% | 3.65 days | 7.2 hours |
| 99.9% | 8.8 hours | 43 minutes |
| 99.95% | 4.4 hours | 22 minutes |
| 99.99% | 53 minutes | 4.3 minutes |
| 99.999% | 5.3 minutes | 26 seconds |

**Serial dependencies multiply:** if a request needs five services, each at 99.9%, the best case is 0.999⁵ ≈ **99.5%**. **Redundancy helps only if failures are independent:** two replicas at 99% each give 99.99% *if* they never fail together — a shared bad deploy or a region outage makes them fail together.

```sim
name: nines
title: Compose availability
challenges:
  - {text: 'Chain 6 components at 99.9% and see the end-to-end availability fall below three nines', metric: total, op: '<', value: 99.9, and: [{metric: serial, op: '>=', value: 6}]}
  - {text: 'Add a second independent replica of every component and get back above 99.99%', metric: total, op: '>', value: 99.99, and: [{metric: redundancy, op: '>=', value: 2}]}
```

```sort
prompt: "Checkout works today. For each change, does the share of checkout requests that succeed go up, go down, or barely move?"
buckets: [Goes up, Goes down, Barely moves]
items:
  - {text: 'Adding a synchronous call to a new fraud-scoring service in the checkout path', bucket: 1, why: 'One more serial dependency multiplies in another failure probability.'}
  - {text: 'Moving an existing synchronous fraud check off the request path: accept the order, then score it in the background', bucket: 0, why: 'It leaves the critical path, so its failures no longer fail checkout.'}
  - {text: 'Adding a second replica of the order service, in the same rack and shipped by the same deploy pipeline', bucket: 2, why: 'The replicas share their likely failure causes (rack power, a bad deploy), so they mostly fail together. Redundancy only multiplies away independent failures.'}
  - {text: 'Giving the optional recommendations call a 100 ms timeout and a fallback (show none when it is slow or down)', bucket: 0, why: 'A failing optional dependency now degrades the page instead of failing it.'}
  - {text: 'Retrying every failed downstream call three times with no backoff', bucket: 1, why: 'During a partial outage, retries multiply load and can turn a blip into a full outage.'}
```

> [!senior] Alert on burn rate, not on every error
> An SLO of 99.9% over 30 days has a budget of 43 minutes of failures. A **burn rate** of 1 spends it exactly over the window; a burn rate of 14.4 spends 2% of the budget in one hour. Google's SRE workbook recommends paging on fast burns (e.g. 14.4× over 1 h *and* 5 m) and ticketing slow burns (e.g. 1× over 3 days). That catches outages quickly without paging for every blip.

```faded
title: Reason about a fan-out page
prompt: Complete the analysis.
text: |
  The product page calls 20 backend services in parallel. Each has p99 = 400 ms and p50 = 20 ms. The page's latency is roughly the [[slowest of the 20 calls|average of the 20 calls|fastest call]].

  The chance that at least one call exceeds its p99 is 1 − 0.99²⁰ ≈ [[#18]]%, so the page's p80-ish latency is around 400 ms even though each backend's median is 20 ms.

  Each service is 99.9% available and all 20 are required, so the page succeeds about [[#98]]% of the time. Making 15 of them optional, with fallbacks, raises that to about 0.999⁵ ≈ 99.5%.

  At 3,000 page views/s with a 400 ms page time, Little's Law says about [[#1200]] page requests are in flight at once.
explain: Fan-out turns rare backend events into common user events, both for latency (the max of N) and for availability (the product of N). Optional dependencies with timeouts and fallbacks fix both.
```

```interview
ask: Your e-commerce product page calls about 20 backend services in parallel. How would you set its latency and availability targets, and keep meeting them at peak traffic?
say: |
  "I'd set targets in percentiles — say p99 under 300 ms at peak load — and measure them at the edge, including errors. Since the page fans out to many services, backend tails dominate, so each dependency gets a timeout and a fallback, and I'd consider hedging for the slowest read calls. For capacity I'd run around 60% utilisation at peak, because queueing delay rises steeply beyond that, and use Little's Law to size pools. Availability composes, so anything not essential to the request goes async or optional."
followups:
  - q: Why not just report average latency?
    a: Averages hide the tail. With fan-out or many requests per session, most users experience the tail. Report p50, p99 and p99.9 per endpoint and per dependency.
  - q: What's Little's Law used for in practice?
    a: Sizing concurrency — thread pools, connection pools, worker counts — and explaining why slower latency at the same traffic exhausts pools.
  - q: Why not run servers at 95% to save money?
    a: Queueing delay grows with ρ/(1−ρ), so latency explodes and there's no headroom for bursts, failovers or a lost instance.
weak: |
  "Average latency is 50 ms, so it's fast. We'll have five nines." No percentiles, no notion of fan-out, no idea how availability composes.
strong: |
  Uses percentiles with workload and measurement point, explains tail amplification, sizes with Little's Law, keeps utilisation headroom with a reason, and composes availability across dependencies.
```

```recall
prompt: Explain why a page that calls 50 backend services in parallel can be slow for most users even though each backend is fast for 99% of requests.
points:
  - The page waits for the slowest of its parallel calls (latency is the max)
  - The probability that at least one of N calls is slow is 1 − (1 − p)^N, which grows quickly with N
  - With 50 calls and a 1% slow rate, about 40% of page loads include a slow call
  - Mitigations such as timeouts with fallbacks, hedged requests, fewer calls, or fixing the sources of slowness
model: |
  The page can't render until its slowest call returns, so its latency is the maximum of 50 latencies. If each call is slow 1% of the time, the chance that none of the 50 is slow is 0.99⁵⁰ ≈ 60%, so about 40% of page loads hit at least one slow call — the backend's p99 has become a common user experience. Fixes: give each call a timeout and a fallback, hedge the slow tail by resending after the p95, reduce the number of calls per page, and attack the causes of slowness such as GC pauses and cold caches.
```

```questions
- kind: check
  type: numeric
  prompt: A request fans out to 30 backend calls in parallel. Each call independently exceeds its p99 latency 1% of the time. What percentage of user requests include at least one slow call?
  answer: 26
  unit: '%'
  tolerance: 0.04
  explanation: 1 − 0.99³⁰ ≈ 0.26 — about 26%. Fan-out turns a 1-in-100 event into a 1-in-4 one.
- kind: check
  prompt: A service processes 2,000 requests/s and each request spends 150 ms in it on average. By Little's Law, how many requests are in flight on average?
  choices:
    - text: 300
      correct: true
    - text: 13
      why: That's 2,000 ÷ 150. Little's Law multiplies the arrival rate by the time in the system.
    - text: 3,000
      why: That's 2,000 × 1.5, a units slip. 150 ms is 0.15 s.
    - text: 2,150
      why: Adding a rate to a time mixes units.
  explanation: L = λW = 2,000/s × 0.15 s = 300 concurrent requests. Size thread and connection pools from this, with headroom.
- kind: check
  type: multi
  prompt: Which statements about utilisation are true? Select all that apply.
  choices:
    - text: Queueing delay rises steeply as utilisation approaches 100%
      correct: true
    - text: More variable arrivals and job sizes cause more waiting at the same utilisation
      correct: true
    - text: Running at 50–70% at peak leaves headroom for bursts and for losing an instance
      correct: true
    - text: Latency rises linearly with utilisation, so 90% is just 1.8× slower than 50%
      why: For a simple queue, waiting grows like ρ/(1−ρ). That's 9× at 90% versus 1× at 50%.
    - text: Low CPU utilisation proves a service has spare capacity
      why: The bottleneck can be elsewhere — locks, connection pools, a downstream dependency — while CPU sits idle.
  explanation: Waiting comes from utilisation plus variability. Watch saturation signals (queue lengths, pool waits), not just CPU.
- kind: check
  prompt: A request depends on four services in series, each 99.9% available with independent failures. What's the best-case end-to-end availability?
  choices:
    - text: About 99.6%
      correct: true
    - text: 99.9%
      why: Serial dependencies multiply, so the whole is less available than any single part.
    - text: 99.99%
      why: That would need redundancy, not a chain of dependencies.
    - text: 96%
      why: That's 99%⁴, not 99.9%⁴.
  explanation: 0.999⁴ ≈ 0.996. Every required dependency lowers availability. Making dependencies optional or asynchronous takes them out of the product.
- kind: fire
  prompt: What do hedged requests do, and what do they cost?
  choices:
    - text: Send a duplicate request if the first hasn't answered by about the p95, use whichever returns first; costs a few percent of extra load
      correct: true
    - text: Send every request twice from the start; halves the load
      why: Duplicating everything doubles the load. Hedging duplicates only the slow tail.
    - text: Cache responses at the edge; costs staleness
      why: That's caching, not hedging.
    - text: Retry failed requests with backoff; costs latency
      why: Hedging targets slow responses, not failed ones.
  explanation: By duplicating only requests that are already slow, hedging trims the tail cheaply. Requests must be safe to duplicate, i.e. idempotent reads.
- kind: fire
  prompt: Average query time rises from 20 ms to 80 ms during an incident, with unchanged traffic. What happens to the number of database connections in use?
  choices:
    - text: It roughly quadruples, which can exhaust the pool and cause timeouts upstream
      correct: true
    - text: It stays the same, because traffic didn't change
      why: By Little's Law, concurrency = rate × time, and time went up 4×.
    - text: It drops, because slower queries mean fewer queries
      why: The arrival rate is unchanged, so each slower query just holds its connection longer.
    - text: It doubles
      why: Concurrency scales linearly with time in the system. The time went up 4×.
  explanation: Latency and concurrency are coupled. Slowdowns exhaust fixed-size pools, which is why one slow dependency cascades.
- kind: fire
  prompt: Two replicas of a service each have 99% availability. When does running both give about 99.99%?
  choices:
    - text: Only if their failures are independent — no shared deploys, hardware, zone or dependencies
      correct: true
    - text: Always, because 1 − 0.01² = 0.9999
      why: The formula assumes independence. Correlated failures make the real number much worse.
    - text: Never, because redundancy doesn't affect availability
      why: Independent redundancy does improve availability dramatically.
    - text: Only if they run on the same machine
      why: The same machine is the most correlated failure domain there is.
  explanation: Redundancy multiplies failure probabilities only when failures are independent. Spread replicas across failure domains and stagger deploys.
- kind: fire
  level: advanced
  prompt: Why do SRE practices alert on error-budget burn rate rather than on any error rate above zero?
  choices:
    - text: Burn rate ties alerts to user impact on the SLO and separates fast outages (page now) from slow leaks (ticket)
      correct: true
    - text: Burn rate is cheaper to compute
      why: Cost isn't the reason. It's about relevance and urgency.
    - text: Errors below the SLO don't need monitoring at all
      why: They're still tracked; they just shouldn't page someone at 3 a.m.
    - text: Burn rate ignores outages shorter than a day
      why: Fast-burn alerts with short windows catch outages within minutes.
  explanation: Paging on every blip creates alert fatigue. Multi-window burn-rate alerts page for fast budget consumption and open tickets for slow consumption.
- kind: fire
  type: numeric
  prompt: An SLO is 99.9% over 30 days. An incident consumes error budget at a burn rate of 14.4 (14.4× the rate that would exactly use the budget over the window). If it continues, how many **hours** until the monthly budget is gone?
  answer: 50
  unit: hours
  tolerance: 0.03
  explanation: A burn rate of 1 uses the budget in exactly 30 days (720 hours); at 14.4× it lasts 720 ÷ 14.4 = 50 hours. Equivalently, each hour at 14.4× spends 2% of the monthly budget — which is why 14.4× over one hour is a common paging threshold.
```
