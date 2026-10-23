---
id: scaling
category: reliability
skill: capacity
title: Find the bottleneck before scaling
minutes: 16
summary: Throughput is capped by the most constrained resource in the path, so adding capacity anywhere else changes nothing — or makes things worse by piling more load onto the bottleneck. Measure first, climb the scaling ladder from cheap to expensive, remember that coordination limits how far parallelism helps, and autoscale on signals that reflect real saturation.
objectives:
  - Locate the limiting resource with utilisation, saturation and error signals (USE and RED)
  - Compare vertical and horizontal scaling, and explain the limits Amdahl's law and the Universal Scalability Law describe
  - Apply the scaling ladder — fix work, cache, replicate, go async, then partition — and justify each step
  - Configure autoscaling with the right metric, warm-up and scale-in safety
sources:
  - ['Brendan Gregg: The USE Method', 'https://www.brendangregg.com/usemethod.html']
  - ['Neil Gunther: Universal Scalability Law', 'http://www.perfdynamics.com/Manifesto/USLscalability.html']
  - ['Google SRE Book: Handling overload', 'https://sre.google/sre-book/handling-overload/']
---

> [!story] Twice the servers, half the throughput
> An API team doubled its application fleet from 20 to 40 instances before a launch. Throughput went *down*. Each instance held a pool of 50 database connections; 40 × 50 = 2,000 connections against a Postgres server configured for 500. New instances queued for connections, timed out and retried, and the database burned CPU managing connection churn. The bottleneck had always been the database. Scaling the tier in front of it just added contenders.

## Throughput follows the narrowest point

A request path is a pipeline: load balancer → API → cache → database → downstream services. Its throughput is the **minimum** of each stage's capacity. Find the stage at its limit:

- **USE method** (per resource): **U**tilisation, **S**aturation (queueing, waiting), **E**rrors. CPU, memory, disk, network, connection pools, thread pools, locks.
- **RED method** (per service): **R**ate, **E**rrors, **D**uration. Where does latency accumulate in a trace?

Saturation is the telling signal. A pool with requests waiting for connections, a run queue longer than the core count, a lock with waiters — those are bottlenecks even when CPU looks idle.

```sim
name: bottleneck
title: Where's the bottleneck?
intro: Each lever adds cost. A load counts as served only if every tier stays under 90% utilisation. Serve it at the lowest monthly cost you can find.
challenges:
  - {text: 'At 8,000 req/s, find the first bottleneck and fix it with the cheapest change', metric: served, op: '==', value: 1, and: [{metric: load, op: '>=', value: 8000}]}
  - {text: 'Serve 30,000 req/s for under $8,000 a month', metric: served, op: '==', value: 1, and: [{metric: load, op: '>=', value: 30000}, {metric: cost, op: '<', value: 8000}]}
  - {text: 'Add API instances until database connections become the limit — more servers, less throughput', metric: bottleneck, op: '==', value: DB connections}
takeaway: |
  Each fix moves the bottleneck somewhere else. API instances are cheap until their connection pools exceed what the database can accept. A cache cuts read load more cheaply than a bigger database, and replicas help only with the reads that are left. Sizing means knowing every stage's limit and the order in which you'll hit them.
```

## Vertical versus horizontal

- **Vertical (scale up):** a bigger machine. Simple, no distribution logic, and modern machines are huge (hundreds of cores, terabytes of RAM). But there's a ceiling, a single point of failure, and big-instance pricing that rises faster than capacity.
- **Horizontal (scale out):** more machines. Near-unlimited and fault tolerant, but it needs stateless services, partitioned data and coordination — all of which cost latency and complexity.

Stateless tiers scale out easily. Stateful ones (databases) usually go up first, then out through replicas, then partitioning, in that order, because each step is harder to undo.

## Why parallelism stops helping

**Amdahl's law:** if a fraction *s* of the work is serial (can't be parallelised), speedup with N workers is at most 1 / (s + (1 − s)/N), approaching 1/s however many workers you add.

**Universal Scalability Law:** adds a **coherency** cost — workers coordinating with each other (locks, cache invalidation, consensus) — that grows roughly with N². Past a point, adding nodes *reduces* throughput. That's the "twice the servers, half the throughput" curve.

```calc
title: Amdahl's ceiling
prompt: A batch job is **5%** serial (planning and a final merge) and 95% perfectly parallel. What's the maximum speedup with **unlimited** workers?
answer: 20
unit: '×'
tolerance: 1.01
steps: |
  Speedup ≤ 1 / s = 1 / 0.05 = **20×**. With 32 workers it's 1 / (0.05 + 0.95/32) ≈ 12.5×; with 128 it's ≈ 17.4×. After a few dozen workers, the serial 5% dominates. To go faster you shrink the serial part (parallel merge, pre-planning) rather than adding workers.
```

## The scaling ladder

Climb from cheap and reversible to expensive and permanent:

```order
prompt: Order these responses to a database that's running out of capacity, from what you should try first to last.
items:
  - Measure — find the slow queries and the saturated resource
  - Fix the work — add the missing index, remove N+1 queries, fetch fewer columns
  - Cache hot reads in front of the database
  - Add read replicas and route tolerant reads to them
  - Move non-urgent work off the request path (async processing)
  - Scale vertically to a larger instance
  - Partition (shard) the data
explain: The early steps often deliver 10× gains for days of work; sharding delivers more headroom for months of work and permanent complexity. Vertical scaling sits late here because it's a fine stopgap, but it doesn't fix inefficient work — and it's often perfectly reasonable to do it earlier as a quick, reversible way to buy time.
```

```predict
prompt: The API tier's CPU is at 25% while p99 latency has tripled and throughput has flattened. Someone proposes doubling the API instances. What should you check first?
choices:
  - Nothing — doubling instances always helps latency
  - Saturation further down — database CPU, lock waits, connection pool waits, a slow downstream service
  - The API's memory leak
  - The DNS TTL
answer: 1
reveal: |
  Low CPU with rising latency means requests are **waiting**, not computing. Something downstream is saturated, and more API instances would send it even more concurrent requests. Look at pool wait times, database CPU and I/O, lock contention, and traces showing where time accumulates.
```

## Autoscaling done right

Autoscaling adds capacity automatically, but only helps if it reacts to the right signal, fast enough, without flapping:

- **Scale on saturation or demand** — request rate per instance, concurrency, queue age — not CPU alone for I/O-bound services.
- **Account for warm-up:** new instances need seconds to minutes (JIT warm-up, cache fill, connection setup). Scale ahead of demand with predictive or scheduled scaling for known peaks.
- **Scale in slowly** (cooldowns, conservative thresholds) and drain connections first.
- **Respect downstream limits:** autoscaling a tier in front of a fixed-capacity database just moves the failure. Cap the maximum, or size connection pools so the total stays within database limits (or use a connection pooler such as PgBouncer).

```bug
title: An autoscaling policy
prompt: This policy scales a service that mostly waits on a database and an external API. Which lines will misbehave?
lang: yaml
code: |
  min_instances: 2
  max_instances: 400
  scale_out_when: cpu_percent > 70 for 1m
  scale_in_when: cpu_percent < 40 for 1m
  db_pool_size_per_instance: 50
bug: [2, 3, 4, 5]
explain: |
  **Line 3:** an I/O-bound service shows low CPU while overloaded, so this may never scale out when requests pile up. Scale on in-flight requests or latency instead. **Line 4:** scaling in after one minute of low CPU causes flapping, and kills instances mid-request unless draining is configured. Use longer windows and cooldowns. **Lines 2 and 5** together allow 400 × 50 = 20,000 database connections — far beyond what the database can accept — so scaling out at peak overloads the very bottleneck. Cap instances to what the downstream can serve, or put a connection pooler in between.
```

```interview
say: |
  "Before adding servers I'd find the limiting resource. At 8k rps the API is fine, but the database is at 85% CPU on three queries. The plan in order: fix those queries with a composite index, cache product reads (about 90% hit rate), route the remaining tolerant reads to replicas, and move order emails to a queue. That gives roughly 5× headroom without sharding. The API autoscales on concurrency, capped so its total connection pools stay under the database's limit via PgBouncer. Sharding by tenant is the next step, triggered at about 60% sustained write capacity."
followups:
  - q: How do you find the bottleneck?
    a: Look for saturation — queues, waits, run-queue length, pool exhaustion — per resource (USE), and follow where latency accumulates per service (RED and traces). CPU alone misleads for I/O-bound work.
  - q: Why might adding servers reduce throughput?
    a: Coordination and contention costs grow with N — connection limits, lock contention, cache coherency. The Universal Scalability Law captures that retrograde region.
  - q: Vertical or horizontal for the database?
    a: Vertical first, because it's simple and reversible, along with efficiency fixes, caching and replicas. Partition when a single primary's write or storage limits are in sight, choosing the shard key from access patterns.
weak: |
  "Add more servers and a load balancer, then shard the database." No measurement, no notion of where the bottleneck is or that scaling one tier can overload another.
strong: |
  Measures saturation, fixes work before adding capacity, climbs the ladder with reasons and triggers, understands Amdahl and USL limits, and configures autoscaling on the right signal within downstream limits.
```

```recall
prompt: Explain why adding more API servers can fail to increase throughput — or even reduce it — and what you should do instead.
points:
  - Throughput is limited by the most constrained resource, which may be downstream (database, locks, connection pool, external API)
  - More API servers add concurrent requests to that bottleneck without adding its capacity
  - Extra instances can exceed connection limits or increase contention and coordination costs, reducing throughput (USL)
  - Instead measure saturation, fix or offload work at the bottleneck (indexes, caching, replicas, async), and cap upstream concurrency to what downstream can serve
model: |
  A request path is only as fast as its slowest stage. If the database, a lock, a connection pool or an external API is saturated, extra API servers just send it more concurrent requests: queues get longer, timeouts and retries rise, and connection limits get exceeded, so throughput can actually fall as coordination and contention grow. The right move is to measure saturation per resource, find the limiting one, and relieve it — fix slow queries, cache reads, move reads to replicas, take work off the request path — while capping upstream concurrency (pool sizes, max instances, a connection pooler) so the bottleneck isn't overwhelmed.
```

```questions
- kind: check
  prompt: API CPU is 30%, the database is at 95% CPU, and latency is rising. What's the best next step?
  choices:
    - text: Investigate and relieve the database — slow queries, indexes, caching, replicas
      correct: true
    - text: Double the API instances
      why: That adds load to the saturated database.
    - text: Increase the API's thread count
      why: More concurrency into the same bottleneck.
    - text: Lower the load balancer timeout
      why: That turns slowness into errors without fixing it.
  explanation: Scale or fix the limiting resource. Everything else just changes where requests wait.
- kind: check
  type: numeric
  prompt: A job is 10% serial. What's the maximum possible speedup with unlimited parallel workers (Amdahl's law)?
  answer: 10
  unit: '×'
  tolerance: 0.01
  explanation: 1 ÷ 0.10 = 10×. Shrinking the serial portion is the only way past that ceiling.
- kind: check
  type: multi
  prompt: Which are signs of saturation (a bottleneck) even when CPU looks fine? Select all that apply.
  choices:
    - text: Requests waiting for a database connection from the pool
      correct: true
    - text: Growing lock wait times
      correct: true
    - text: A rising queue of pending work
      correct: true
    - text: Rising latency with flat throughput
      correct: true
    - text: Low CPU on its own
      why: Low CPU can just mean threads are waiting on something else.
  explanation: Bottlenecks show up as waiting. Measure queues and wait times, not just utilisation.
- kind: check
  type: order
  prompt: Order these database scaling steps from cheapest and most reversible to most expensive.
  items:
    - Fix slow queries and add the right indexes
    - Cache hot reads
    - Add read replicas
    - Shard the data
  explanation: Cheap efficiency gains first; permanent architectural changes last, once measurements justify them.
- kind: fire
  prompt: Why can scaling an API tier from 20 to 40 instances reduce throughput?
  choices:
    - text: Total connections or contention against a shared database can exceed its limits, adding overhead and timeouts
      correct: true
    - text: Load balancers can't handle 40 instances
      why: They handle far more.
    - text: Stateless services can't scale horizontally
      why: They can. That's why they're stateless.
    - text: More instances always mean more latency
      why: Only when they increase pressure on a bottleneck.
  explanation: Retrograde scaling comes from contention and coordination on shared resources. Cap concurrency to what downstream can take.
- kind: fire
  prompt: An I/O-bound service autoscales on CPU above 70%. What's the risk?
  choices:
    - text: It may never scale out while requests queue, because waiting threads use little CPU
      correct: true
    - text: It will scale out too quickly
      why: CPU stays low for I/O-bound work, so the policy barely triggers.
    - text: CPU metrics aren't available in the cloud
      why: They are. The problem is that they're the wrong signal.
    - text: It will scale in to zero
      why: The minimum instance count prevents that.
  explanation: Scale I/O-bound services on concurrency, request rate per instance or latency.
- kind: fire
  prompt: What does the Universal Scalability Law add beyond Amdahl's law?
  choices:
    - text: A coherency cost that grows with the number of nodes, so throughput can decrease past a point
      correct: true
    - text: The idea that serial work limits speedup
      why: That's Amdahl's law itself.
    - text: Proof that horizontal scaling is always linear
      why: It shows the opposite.
    - text: A formula for cache hit rates
      why: Unrelated.
  explanation: Coordination between workers (locks, consistency traffic) makes very large clusters slower per added node — eventually slower in total.
- kind: fire
  level: advanced
  prompt: 60 API instances each have a 25-connection pool, and the database accepts at most 800 connections. What should you do before letting autoscaling go to 120 instances?
  choices:
    - text: Add a connection pooler (e.g. PgBouncer) or shrink per-instance pools so the total stays within the database limit
      correct: true
    - text: Nothing — the database will queue extra connections
      why: Beyond max_connections it refuses them, and each connection costs memory even below that.
    - text: Raise the database connection limit to 10,000
      why: Every connection costs memory and scheduling overhead. Throughput falls long before that.
    - text: Disable autoscaling permanently
      why: The goal is to scale within limits, not to stop scaling.
  explanation: 60 × 25 = 1,500 already exceeds 800, and 120 instances would make it 3,000. Pool centrally and bound the total.
- kind: fire
  type: multi
  prompt: Which make autoscaling behave well? Select all that apply.
  choices:
    - text: Scaling on a signal that tracks real demand or saturation
      correct: true
    - text: Accounting for instance warm-up, with scheduled or predictive scaling for known peaks
      correct: true
    - text: Slow, conservative scale-in with connection draining
      correct: true
    - text: Maximums that respect downstream capacity
      correct: true
    - text: Scaling in after one minute below threshold
      why: That causes flapping and churn.
  explanation: Good autoscaling reacts to the right signal, early enough, without oscillating or overwhelming dependencies.
```
