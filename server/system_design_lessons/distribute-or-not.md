---
id: distribute-or-not
category: foundations
skill: requirements
title: Do you need to distribute at all?
minutes: 16
summary: Every distributed system buys scale, availability or low latency with network failures, partial outages and operational weight. Before choosing a design, decide which of reliability, scalability and maintainability you actually need, size the load, and check whether one well-run machine with a replica would do. Add machines when a measured limit forces it, and know what you are signing up for when you do.
objectives:
  - Define reliability, scalability and maintainability and separate faults from failures
  - Describe load with load parameters and check whether a single node suffices
  - Name what distribution buys and what it costs, and choose between managed and self-run
  - Grow a system one step at a time, each step justified by a measured limit
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapters 1 and 2', 'https://dataintensive.net/']
  - ['Google SRE Book: Embracing risk', 'https://sre.google/sre-book/embracing-risk/']
  - ['McSherry, Isard & Murray, Scalability! But at what COST? (HotOS 2015)', 'https://www.usenix.org/system/files/conference/hotos15/hotos15-paper-mcsherry.pdf']
  - ['Fallacies of distributed computing (Deutsch)', 'https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing']
---

> [!story] Fourteen services for twenty requests a second
> A new product team, determined not to repeat its predecessors' mistakes, started with a message bus, a service per entity, a sharded database and a service mesh. Peak traffic in the first year was twenty requests a second. Every feature touched four services and two queues. A bug that would have been one stack trace was a chase across dashboards. Latency was worse than the monolith it replaced, because every call became a network hop, and two engineers spent most of their time on the platform. A single Postgres instance and one application would have served the load for years, with room to spare.

## Three things you want

A data system is judged on three, often competing, properties.

- **Reliability.** It keeps working correctly, at the right performance, even when things go wrong.
- **Scalability.** It copes as load grows. "Scalable" on its own means nothing; the meaningful question is *"if the load grows in this particular way, what are our options?"*
- **Maintainability.** Many people can work on it productively over years: **operability** (easy to run), **simplicity** (little accidental complexity) and **evolvability** (easy to change).

Distribution is one tool for the first two and a cost to the third. It is worth asking, before reaching for it, which property you are short of.

### Faults are not failures

A **fault** is one component deviating from its spec. A **failure** is the whole system no longer serving users. You can't make faults impossible, so the goal is a design where faults don't become failures. Kinds of fault:

- **Hardware.** Disks fail. With a mean time to failure of 10 to 50 years per disk, a cluster of 10,000 disks should expect about one failure a day. Redundancy (RAID, spare machines) handles it. Larger fleets increasingly tolerate the loss of whole machines through software.
- **Software.** Systematic bugs hit many nodes at once: a bad input that crashes every server, a leap second, a runaway process, a cascading failure. They are correlated, so redundancy alone doesn't help. Process isolation, careful assumptions, monitoring and letting processes crash and restart do.
- **People.** Operators make mistakes, and one study of large internet services found configuration errors to be the leading cause of outages. Good abstractions, safe sandboxes, fast rollbacks, gradual rollouts and clear monitoring reduce the damage.

```calc
title: How many disks die a day?
prompt: A storage cluster has 10,000 disks, each with a mean time to failure of about 27 years (10,000 days). On average, how many disks fail per day?
answer: 1
unit: disks per day
tolerance: 1.3
steps: |
  Each disk fails about once per 10,000 days, so across 10,000 disks you expect 10,000 ÷ 10,000 = **1 failure per day**. Hardware faults at scale are routine, not exceptional, which is why storage systems replicate and why "the disk never failed in testing" proves little.
```

## Scalability starts with describing load

Before deciding how to cope with growth, say what the load *is*, with a few numbers called **load parameters**. The right ones depend on the system: requests per second, the read-to-write ratio, simultaneously active users, the hit rate of a cache, the number of followers per account. Which parameter matters can be surprising. For a social timeline, posting rate is modest, and the real driver is **fan-out**: each post must reach every follower, and a few accounts have millions (see the feed fan-out lesson). Then describe performance with percentiles, not averages (see the service quality lesson), and ask two questions: *when load rises and resources stay the same, what happens to performance?* and *how much more resource do I need to keep performance the same?*

There is no generic "scalable architecture". A design that handles 100,000 small reads per second looks nothing like one for a few huge writes per minute. Choose for the load you actually have, and for the next order of magnitude, not three orders beyond.

## One machine goes a long way

Modern servers are large. Rented machines routinely offer dozens of cores, terabytes of memory and tens of terabytes of fast SSD. Well-tuned relational databases handle thousands to tens of thousands of simple transactions per second on a single primary, and data that fits in a few terabytes fits on one node.

```calc
title: Is one machine enough?
prompt: An API server has 16 cores. Each request needs about 2 ms of CPU. Ignoring I/O waits, how many requests per second can one machine sustain at 100% CPU?
answer: 8000
unit: requests/s
tolerance: 1.1
steps: |
  Each core handles 1 s ÷ 0.002 s = 500 requests per second, so 16 cores handle 16 × 500 = **8,000 requests/s** at saturation. Run at about 50% for headroom and you can serve 4,000 requests/s on one machine, far above what twenty requests a second needs, and a second machine already gives you redundancy.
```

A single-node design (plus a replica and backups) is dramatically easier to reason about. Transactions are real, joins are cheap, there is no partial failure between components, and one process has one set of logs. Many systems that were distributed early have since been consolidated.

## What distribution buys, and what it costs

| You may need it for | Because |
|---|---|
| **Scale** | Data or load exceeds one machine's disk, memory, CPU or network |
| **Fault tolerance and availability** | A single machine, or one datacentre, is a single point of failure |
| **Latency** | Users on other continents need a nearby replica |
| **Elasticity** | Load swings widely, so you want to add and release capacity |
| **Isolation** | Different workloads (analytics, transactions) shouldn't interfere |

| It costs | Which looks like |
|---|---|
| **Partial failure** | Some nodes or links are down while the rest run. Calls can time out with the result unknown |
| **Unreliable networks and clocks** | Latency spikes, packet loss, partitions, skewed timestamps |
| **Consistency problems** | Replicas disagree, concurrent writes conflict, transactions span nodes |
| **Operational weight** | Deploys, schema changes, monitoring, tracing, on-call and upgrades across many parts |
| **Harder debugging and testing** | A bug is an interaction, not a line of code |

Each extra component also multiplies the chance something is broken. Five dependencies that each work 99.9% of the time are jointly up only about 99.5% of the time (see the nines simulator). Distribution has to buy more availability than the failure modes it adds.

```sim
name: nines
key: b960
title: Availability maths
intro: Compose availability across dependencies and redundant copies.
```

## Grow in steps, each justified by a number

```arch
title: How a system grows
nodes:
  - {id: users, label: Users, kind: client, x: 0, y: 1}
  - {id: app, label: App server, kind: service, x: 1, y: 1, note: 'stateless'}
  - {id: db, label: Primary database, kind: db, x: 2, y: 1}
  - {id: rep, label: Read replica, kind: db, x: 3, y: 0, note: 'step 2'}
  - {id: cache, label: Cache, kind: cache, x: 2, y: 0, note: 'step 3'}
  - {id: q, label: Queue and workers, kind: stream, x: 2, y: 2, note: 'step 4'}
  - {id: shard, label: Shards, kind: db, x: 3, y: 2, note: 'last resort'}
edges:
  - [users, app, 'requests']
  - [app, db, 'reads and writes']
  - [app, rep, 'reads']
  - [app, cache, 'hot reads']
  - [app, q, 'slow work']
  - [db, shard, 'when one primary can''t keep up']
paths:
  - label: Step 1: one app, one database
    steps:
      - [users, app, 'Start here: one stateless app server and one managed database, with backups and monitoring.']
      - [app, db, 'Index the queries. Most "scaling problems" at this size are missing indexes and N+1 queries.']
  - label: Step 2: add copies for reads and availability
    steps:
      - [app, rep, 'A read replica takes read load and doubles as a standby. Accept some replication lag.']
  - label: Step 3: cache and queue
    steps:
      - [app, cache, 'Put hot, rarely changing reads in a cache, but only after measuring a read bottleneck.']
      - [app, q, 'Move slow work (emails, reports) behind a queue so requests stay fast.']
  - label: Step 4: split the data
    steps:
      - [db, shard, 'Shard only when a measured write or storage limit on one primary is truly reached. It is the step that is hardest to undo.']
```

The order is deliberate: vertical scaling and simple fixes first, replicas and caches next, queues for slow work, and sharding last, because each step trades simplicity for capacity and some are hard to reverse. **Measure** before each step: the metric that proves the limit (CPU, p99 latency, disk, write rate) should come first, and a number should tell you how far you must go.

```sort
prompt: Which of these is a good reason to distribute now?
buckets: [A measured reason, Not yet]
items:
  - {text: 'The primary database is at 90% CPU on writes at peak, and indexes are already tuned', bucket: 0, why: 'A measured, specific limit that a bigger machine or sharding must answer.'}
  - {text: 'We might get 100 million users someday', bucket: 1, why: 'Plan for the next order of magnitude, not a hypothetical.'}
  - {text: 'Users in Asia see 400 ms latency and we have 30% of traffic there', bucket: 0, why: 'A latency requirement with real users: a regional replica or edge is justified.'}
  - {text: 'The architecture diagram looks more professional with microservices', bucket: 1, why: 'Not a requirement.'}
  - {text: 'One machine is a single point of failure for a revenue-critical service', bucket: 0, why: 'Availability needs redundancy, which means at least a second node.'}
  - {text: 'A blog post said big companies use Kafka', bucket: 1, why: 'Different scale and constraints.'}
```

## Build or buy, host or manage

- **Managed services** (a hosted database, queue or cache) hand you backups, patching, failover and scaling for a price, and remove undifferentiated work. They can lock you in, and costs can climb at scale, but for most teams the operational time saved is worth more.
- **Self-hosting** gives control and can be cheaper at large, steady scale, at the cost of the skills and on-call needed to run it well.
- **Cloud-native** data systems often separate **compute from storage**, keeping data in object storage and spinning compute up and down. That brings elasticity and cheap storage, and changes the trade-offs of latency and cost.

Whichever you choose, keep the **system of record simple**, separate analytics from transactions (copy data out rather than running big scans on the live database), and make the choice reversible where you can.

```predict
prompt: A startup's single Postgres instance is at 35% CPU and 40% disk at peak, with a replica and nightly backups. The CTO proposes splitting into microservices with per-service databases "to prepare for scale". What is the best response?
choices:
  - Agree, since it is easier to split early than late
  - Keep the monolith, watch the metrics, and step up only when a number demands it
  - Shard the database now by user ID to prepare for growth in the next year
  - Replace Postgres with a distributed NoSQL store that scales horizontally by design
answer: 1
reveal: |
  Nothing measured is near a limit. Splitting early adds network failures, distributed transactions and operational weight, and the boundaries are guessed before the product is understood. Keep it boring, instrument it, and choose the next step by evidence. A well-structured monolith can still be modular, so a later split along real seams is possible.
```

```faded
title: Fill in the framing facts
prompt: Fill each gap from memory.
text: |
  A [[fault|failure|bug]] is one component deviating from its spec, while a [[failure|fault|retry]] is the whole system no longer serving users.

  Scalability is meaningless without describing load with [[load parameters|averages|marketing claims]], such as requests per second or fan-out.

  A cluster of 10,000 disks with a 10,000-day mean time to failure loses about [[#1]] disk per day.

  Sharding should come [[last|first|never]] in the order of scaling steps, because it is hard to undo.
explain: Distinguish faults from failures, describe load numerically, expect routine hardware faults, and escalate complexity only when measured.
```

```recall
prompt: A team proposes a distributed, sharded architecture for a new product. How do you decide whether it's justified?
points:
  - State the requirements in numbers: load parameters, data size, availability target and latency target
  - Check whether one well-provisioned database with a replica and backups meets them, with headroom
  - Weigh the costs of distribution: partial failures, consistency problems, operations and debugging
  - Adopt each step (replica, cache, queue, then shards) when a measured limit demands it
model: |
  I'd ask for numbers: peak requests per second, the read-write ratio, the size of the data now and in a year, and the availability and latency targets. Then I'd check whether a single well-sized database with a replica and backups covers those with headroom, because that is far simpler to run and reason about. Distribution brings partial failures, replicas that disagree, transactions that span nodes, more to monitor and harder debugging, so each step needs a justification. I would add a replica for reads and availability first, then caching or queues where measurements show a bottleneck, and consider sharding only when a single primary's write or storage limit is actually in sight.
```

```interview
ask: We expect to grow fast. Should we start with microservices and a sharded database?
say: |
  "I'd start with a modular monolith and a single managed relational database with a replica and backups. Fast growth is a reason to measure and to keep the design easy to change, not to pay the cost of distribution up front. I'd define the load parameters, set a few SLOs, and instrument the system so I can see which limit we approach first. Then I'd respond in order: indexes and query fixes, a bigger instance, read replicas, a cache for hot reads, a queue for slow work, and sharding last. Keeping module boundaries clean means that if we do need to split services, we split along real seams instead of guessed ones."
followups:
  - q: Isn't it harder to migrate later?
    a: Some steps are, which is why I keep the data model clean and avoid decisions that block sharding, like unbounded cross-entity joins. But migrating to meet a real need is cheaper than carrying complexity for a need that may never come.
  - q: What would make you shard sooner?
    a: A write rate or storage size a single primary can't handle even after tuning and scaling up, or a data-locality requirement.
  - q: What about availability?
    a: A replica and automated failover give most of the benefit. Multiple regions are justified when the cost of an outage or latency requirement says so.
weak: |
  "Microservices scale better, so start there." No numbers, no costs, no step plan.
strong: |
  Quantifies load, defaults to the simplest design that meets targets with headroom, escalates by evidence, and keeps seams clean.
```

```questions
- kind: check
  prompt: What is the difference between a fault and a failure?
  choices:
    - text: A fault is one component off spec; a failure is the system not serving users
      correct: true
    - text: A fault is a software problem, while a failure is always a hardware problem in a server
      why: Both kinds of fault can be hardware or software.
    - text: They mean the same thing, and the two words are interchangeable in reliability work
      why: The distinction is the point of fault tolerance.
    - text: A failure is planned maintenance downtime, while a fault is any unplanned outage
      why: Not the definition.
  explanation: Fault-tolerant design stops faults becoming failures.
- kind: check
  prompt: Why does "is our system scalable?" not have a useful answer on its own?
  choices:
    - text: It depends on how load grows and what you can add
      correct: true
    - text: Scalability cannot be measured at all, so any claim about it is only marketing
      why: It can be measured per load parameter.
    - text: All systems scale equally well as long as they run on enough cloud machines
      why: They do not.
    - text: It is only about hardware, so the application architecture makes no difference
      why: Architecture matters a great deal.
  explanation: Describe load with parameters, then ask how performance changes as one grows.
- kind: check
  prompt: Which is the strongest reason to move from a single database to a distributed design?
  choices:
    - text: A measured limit that tuning and a bigger machine cannot solve
      correct: true
    - text: Expecting very large growth at some point in the next few years, based on a forecast
      why: A hypothetical, not a measurement.
    - text: Competitors advertising that they run a large microservice architecture
      why: Different scale and constraints.
    - text: The engineering team wanting experience with Kubernetes and service meshes
      why: Not a requirement.
  explanation: Evidence-based steps keep complexity proportional to need.
- kind: check
  type: multi
  prompt: Which are real costs of distributing a system? Select all that apply.
  choices:
    - text: Partial failures and unreliable networks
      correct: true
    - text: Consistency problems between replicas
      correct: true
    - text: More operational work and harder debugging
      correct: true
    - text: A single process crashing takes down everything
      why: That's a single-node risk, not a cost of distribution.
  explanation: Distribution trades single-node simplicity for scale and availability, at the price of these.
- kind: check
  prompt: Five required dependencies each have 99.9% availability. Roughly what availability does a request needing all five get?
  choices:
    - text: About 99.5%
      correct: true
    - text: 99.9%, because each dependency is individually that reliable
      why: Required dependencies multiply.
    - text: 99.99%, because redundancy improves the combined figure
      why: These are all required, so redundancy is not in play.
    - text: About 95%, since the errors compound across all five services
      why: Too pessimistic.
  explanation: 0.999⁵ ≈ 0.995, so each required dependency subtracts from availability.
- kind: fire
  prompt: A cluster has 5,000 disks with a mean time to failure of 5,000 days. How many failures per day, on average?
  choices:
    - text: About 1
      correct: true
    - text: About 0.1
      why: That would be 50,000 days.
    - text: About 10
      why: That would be 500 days.
    - text: About 0.001
      why: Far too low.
  explanation: 5,000 ÷ 5,000 = 1 failure per day.
- kind: fire
  prompt: Which scaling step is hardest to undo?
  choices:
    - text: Sharding the database
      correct: true
    - text: Adding a read replica to the primary instance
      why: Easy to remove.
    - text: Putting a cache in front of the database for hot reads
      why: Can be switched off.
    - text: Adding an index on a frequently filtered column
      why: Easily dropped.
  explanation: Changing how data is partitioned reshapes queries and transactions across the whole system.
- kind: fire
  prompt: For a social timeline, which load parameter often drives cost more than posting rate?
  choices:
    - text: Fan-out (followers per account)
      correct: true
    - text: The number of fonts used by the web client
      why: Irrelevant.
    - text: The clock speed of the application servers
      why: Not a load parameter.
    - text: The colour scheme chosen for the timeline page
      why: Irrelevant.
  explanation: Each post must reach every follower, so the distribution of follower counts sets the work.
- kind: fire
  type: order
  prompt: Order these scaling steps from first to try to last resort.
  items:
    - Fix queries and add indexes
    - - Add a read replica
      - Add a cache and queues for slow work
    - Shard the data
  explanation: Cheap and reversible first, structural and hard to undo last. A read replica and a cache with queues are similar-sized steps, so either can come first.
- kind: fire
  prompt: What is a managed database service mainly buying you?
  choices:
    - text: Operational work done for you
      correct: true
    - text: Unlimited scale with no tuning from your side
      why: Limits remain.
    - text: Freedom from consistency trade-offs entirely
      why: They still apply.
    - text: No bill at all, since the provider absorbs every cost
      why: You pay for it.
  explanation: It trades money and some control for time and reliability.
```
