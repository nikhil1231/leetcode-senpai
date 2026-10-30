---
id: estimates
category: foundations
skill: capacity
title: Back-of-envelope estimation
minutes: 16
summary: An estimate is useful when it changes a decision — one database or twenty, a cache or not, a CDN or not. Learn a handful of numbers, convert rates and totals carefully with units, keep one significant figure, and always add peak factors, replication and headroom.
objectives:
  - Convert daily volumes to average and peak QPS, storage growth and bandwidth with units
  - Estimate server, shard and backlog counts, including headroom and recovery capacity
  - Present estimates so they drive design decisions rather than decorate the whiteboard
sources:
  - ['Jeff Dean: Numbers everyone should know (via Google talk)', 'https://static.googleusercontent.com/media/research.google.com/en//people/jeff/stanford-295-talk.pdf']
  - ['Colin Scott: Latency numbers every programmer should know (interactive)', 'https://colin-scott.github.io/personal_website/research/interactive_latency.html']
  - ['Google SRE Book: Handling overload', 'https://sre.google/sre-book/handling-overload/']
---

> [!story] The estimate that saved a quarter
> A team proposed sharding Postgres across 16 nodes for a new messaging feature "because it needs to scale". A reviewer spent five minutes on the whiteboard: 2M daily users × 20 messages = 40M writes/day ≈ **460 writes/s** average, maybe 2,000/s at peak; 40M × 1 KB ≈ 40 GB/day, ~15 TB/year. One well-provisioned Postgres primary with replicas handles that write rate easily; storage needed a retention plan and maybe partitioning by month, not sharding. The 16-node design was shelved, and the feature shipped two months earlier.

## The numbers to carry

The constants this lesson leans on — seconds in a day, powers of two, the latency ladder, what one machine can do — are in the previous lesson, **Numbers to know**. Learn them there; here we use them.

## The method

```order
prompt: Order the steps of a capacity estimate for a new feature.
items:
  - State the assumptions (users, actions per user, object sizes, read:write ratio)
  - Convert daily totals to average per-second rates
  - Apply a peak factor (and growth over the planning horizon)
  - Compute storage per day and over the retention period, including replication and indexes
  - Compute bandwidth and the number of servers/shards needed, with headroom
  - Say which design decision the numbers change
explain: The last step is the point. "So one primary with read replicas is plenty, but media must go to object storage behind a CDN" is an estimate doing its job.
```

```calc
title: Daily to per-second
prompt: A service gets **300 million** API requests per day. Assume peak traffic is **3×** the average. What is the peak request rate, in requests/second?
answer: 10400
unit: req/s
tolerance: 1.2
hint: Divide by ~86,400 (or 10⁵ for a quick estimate), then multiply by the peak factor.
steps: |
  300M ÷ 86,400 ≈ **3,500 req/s** average (the quick 10⁵ shortcut gives 3,000). Peak ≈ 3 × 3,500 ≈ **10,400 req/s**. At ~2,000 req/s per app server with 50% headroom you'd want around 10 servers at peak — a decision you can now defend.
```

> [!mistake] Rate versus total
> A daily total (300M requests/day) and a rate (3,500 requests/s) differ by a factor of ~10⁵. Going from total to rate you *divide* by 86,400; multiplying by it instead is off by ten billion. A user count is neither: turn it into actions per day first. Keep units on every line: `requests/day`, `requests/s`, `bytes/request`.

## Storage and bandwidth

**Storage** = records/day × bytes/record × days retained × replication factor (+ indexes, often 20–100% extra).

**Bandwidth** = requests/s × bytes/response. Separate ingress (uploads) from egress (downloads), and separate small metadata from media: media dominates bytes and goes to object storage and a CDN.

```calc
title: Five years of photos
prompt: A photo app stores **2 million** new photos per day at an average of **500 KB** each. Ignoring thumbnails, how much raw storage do five years need, before replication? Answer in **TB**.
answer: 1825
unit: TB
tolerance: 1.1
steps: |
  2M × 500 KB = 1 TB/day. × 365 ≈ 365 TB/year. × 5 ≈ **1,825 TB ≈ 1.8 PB**. With 3× replication (or ~1.4× with erasure coding) that's 2.5–5.5 PB. Conclusion: this is object-storage territory, priced per GB-month, with lifecycle rules moving old photos to cheaper storage classes. Nobody puts it in a relational database.
```

Use the estimator to explore how assumptions move the conclusions:

```sim
name: estimator
title: Capacity estimator
intro: Each row shows the working, so you can practise saying it out loud.
challenges:
  - {text: 'Model a 500M-DAU social app where 5% of writes carry a 1 MB photo. Watch storage move from terabytes to petabytes.', metric: total, op: '>', value: 1000000000000000}
takeaway: |
  The structure never changes: **users × actions → per second → × peak**, then **× size → per day → × retention × replication**. The interesting part is which inputs dominate. Here it's usually attachments: a small share of large objects outweighs everything else, which is why media gets its own storage tier and delivery path.
```

## Servers, shards and backlogs

**Servers** = peak load ÷ (per-server capacity × target utilisation). Plan to survive losing an instance or a zone: with three zones you need each pair to carry the full load.

**Shards** — from whichever limit binds first: write throughput, storage per node, or working-set memory.

**Backlogs** — if arrivals exceed completions, the backlog grows at the difference. To drain a backlog of B within time T while arrivals continue at λ, you need a completion rate of λ + B/T.

```faded
title: Recovery capacity for a job queue
prompt: Complete the reasoning.
text: |
  Jobs arrive at 300/s. Each worker completes 10 jobs/s, so 30 workers exactly match arrivals — at [[100%|50%|30%]] utilisation, with no room for bursts.

  A dependency outage stops processing for 10 minutes. Jobs keep arriving, so the backlog reaches 300 × 600 = [[#180000]] jobs.

  To drain that backlog within 30 minutes while new jobs keep arriving, completions must reach 300 + 180,000 ÷ 1,800 = [[#400]] jobs/s, which needs [[#40]] workers.

  So a fleet sized "exactly for peak" turns every outage into a long tail of delayed jobs. We'd run around 45 workers, or autoscale on [[queue age|CPU of the broker|number of producers]].
explain: Capacity planning needs recovery headroom, not just steady state. The drain rate is the completion rate *minus* the arrival rate, which is why matching arrivals exactly means a backlog never shrinks.
```

```calc
title: How many database shards?
prompt: A chat service must sustain **120,000 message writes/s** at peak. One database node handles **15,000 writes/s**, and you want each node at no more than **60%** of capacity. How many primary shards do you need?
answer: 14
unit: shards
range: [14, 16]
steps: |
  Budget per node = 15,000 × 0.6 = 9,000 writes/s. Shards = 120,000 ÷ 9,000 ≈ 13.3, so round up to **14**; 13 would run each node above 60%. Any answer from 14 to 16 is right (in practice 16, a power of two that leaves room for growth). Also check storage: if each message is 500 bytes, 120k/s at peak (~40k average) is about 1.7 TB/day — so storage and retention may force more shards than throughput does.
```

```predict
prompt: You estimate 2,000 writes/s at peak, and a single managed Postgres primary comfortably handles 10,000/s. An interviewer asks whether you'd shard. Best answer?
choices:
  - Yes — sharding is always required at scale
  - No sharding now; one primary with replicas fits with 5× headroom. Partition tables by time for retention, and name the trigger (e.g. sustained >50% of write capacity or >2 TB hot data) for sharding by user_id later
  - No — databases scale vertically forever
  - Use a NoSQL database instead to avoid the question
answer: 1
reveal: |
  Estimates exist to justify **not** adding complexity as much as adding it. A strong answer gives the headroom, the evolution path (shard key and trigger), and what would change the decision. That's what "senior" sounds like.
```

```interview
ask: How would you estimate traffic and storage needs for a social platform with 100 million daily active users posting text and media, and relate those estimates to design?
say: |
  "Let me size it. 100M DAU × 10 reads and 1 write a day is about 1B reads and 100M writes per day: ~12k reads/s and ~1.2k writes/s on average, roughly 3× at peak, so 35k and 3.5k. Writes fit on one primary with headroom; reads want a cache plus replicas. At 1 KB per record that's ~100 GB/day or ~36 TB/year before replication — so we'll partition by time and archive. Media at 10% of writes × 1 MB is about 10 TB/day, so that goes to object storage behind a CDN."
followups:
  - q: How accurate do these numbers need to be?
    a: Within an order of magnitude. Their job is to choose between designs — one node or twenty, cache or not — so one significant figure and explicit assumptions are enough.
  - q: What do you add on top of the average?
    a: A peak factor (2–10× depending on the product), growth over the planning horizon, replication and indexes for storage, and utilisation headroom so you can lose an instance or a zone and still drain backlogs.
  - q: Which number usually dominates?
    a: Usually media bytes for storage and bandwidth, and the read path for request rate. Find the dominant term early and design for it.
weak: |
  Skips estimation, or writes pages of arithmetic that never lead to a decision. Mixes up per-day and per-second, forgets peaks and replication.
strong: |
  States assumptions, converts carefully with units, rounds sensibly, adds peak and replication, finds the dominant term, and explicitly says which design choices follow from the numbers.
```

```recall
prompt: Walk through how you'd estimate the storage needed for a messaging feature over three years, naming each factor you include.
points:
  - Messages per day from users × messages per user
  - Bytes per message, including metadata (and attachments handled separately)
  - Multiply by days of retention (3 years ≈ 1,095 days)
  - Multiply by replication factor and add index or overhead allowance
model: |
  Start with volume: daily active users × messages per user per day. Multiply by the average size per message including metadata — say 500 bytes to 1 KB — and treat attachments separately because they dominate and live in object storage. Multiply by about 1,100 days for three years, then by the replication factor (×3) and add 20–50% for indexes and overhead. Then say what follows: for example, 30 TB of hot data means time-based partitioning and tiering old messages to cheaper storage.
```

```questions
- kind: check
  type: numeric
  prompt: A feature handles 50 million writes per day with a peak factor of 4. What's the peak write rate in writes/second? (Use 86,400 s per day.)
  answer: 2315
  unit: writes/s
  tolerance: 0.15
  explanation: 50M ÷ 86,400 ≈ 579/s average × 4 ≈ 2,315/s peak. The 10⁵ shortcut gives 2,000 — close enough to make the same decision.
- kind: check
  prompt: Jobs arrive at 200/s and 220/s can be completed. A 20,000-job backlog exists. How long does draining it take?
  choices:
    - text: About 1,000 seconds (~17 minutes)
      correct: true
    - text: About 91 seconds
      why: That divides the backlog by the total completion rate and ignores the 200/s of new arrivals still coming in.
    - text: About 100 seconds
      why: That divides by the arrival rate. Only the surplus capacity drains the backlog.
    - text: It never drains
      why: It drains, slowly, because completions exceed arrivals by 20/s.
  explanation: Drain rate = completions − arrivals = 20/s. 20,000 ÷ 20 = 1,000 s. Small headroom means long recoveries.
- kind: check
  type: multi
  prompt: Which factors belong in a storage estimate for a 5-year retention requirement? Select all that apply.
  choices:
    - text: Records per day × bytes per record
      correct: true
    - text: Retention period in days
      correct: true
    - text: Replication factor (or erasure-coding overhead)
      correct: true
    - text: Index and metadata overhead
      correct: true
    - text: Peak requests per second
      why: Peak rate sizes servers and throughput. Storage depends on total volume over time.
  explanation: Storage = volume/day × size × retention × replication (+ overhead). Peak QPS drives compute and throughput, not bytes stored.
- kind: check
  prompt: An estimate shows peak writes of 1,500/s, and one database primary handles 10,000/s. What's the most senior conclusion?
  choices:
    - text: One primary with replicas fits; plan time-based partitioning for retention and state the trigger that would justify sharding later
      correct: true
    - text: Shard immediately across 16 nodes to be safe
      why: That adds operational complexity the numbers don't justify.
    - text: Estimates are unreliable, so assume the worst case
      why: Estimates exist precisely to avoid guessing at the worst case.
    - text: Switch to a database that never needs sharding
      why: Every database has limits. The question is when you hit them.
  explanation: Good estimation justifies the simplest design that fits with headroom, and names the measurable condition that would change the decision.
- kind: fire
  type: numeric
  prompt: A video platform receives 500 hours of uploaded video per minute. At about 1 GB per hour of stored video (one rendition), how many TB of new video arrive per day?
  answer: 720
  unit: TB/day
  tolerance: 0.05
  explanation: 500 h/min × 1,440 min/day = 720,000 hours/day × 1 GB = 720,000 GB ≈ 720 TB/day — before transcoding into several renditions, which multiplies it again.
- kind: fire
  prompt: Roughly how long does a round trip between Europe and the US east coast take?
  choices:
    - text: About 70–90 ms
      correct: true
    - text: About 1 ms
      why: That's closer to a round trip inside one datacentre.
    - text: About 1 second
      why: That's far slower than the physics of fibre allows.
    - text: About 10 µs
      why: That's memory-access territory, not network.
  explanation: Light in fibre covers about 200 km per millisecond. Transatlantic round trips are tens of milliseconds, which is why chatty cross-region designs are slow.
- kind: fire
  prompt: Each app server handles 2,000 req/s. Peak is 30,000 req/s, you target 60% utilisation, and you must survive losing one of three zones. How many servers?
  choices:
    - text: About 38 (25 for peak at 60%, scaled up so any two zones can carry the full load)
      correct: true
    - text: 15
      why: That's 30,000 ÷ 2,000 — no headroom and no zone failure tolerance.
    - text: 25
      why: That covers utilisation headroom but not losing a zone.
    - text: 100
      why: That's far more than the arithmetic supports.
  explanation: 30,000 ÷ (2,000 × 0.6) = 25. To survive a zone loss, the remaining two-thirds must carry the load, so 25 × 1.5 ≈ 38, spread evenly across zones.
- kind: fire
  type: multi
  prompt: Which are common estimation mistakes? Select all that apply.
  choices:
    - text: Multiplying a daily total by 86,400 instead of dividing
      correct: true
    - text: Forgetting the peak-to-average factor
      correct: true
    - text: Ignoring replication when sizing storage
      correct: true
    - text: Producing numbers that don't lead to any design decision
      correct: true
    - text: Rounding to one significant figure
      why: That's good practice. Precision beyond an order of magnitude is false confidence.
  explanation: Keep units on every line, add peaks and replication, and end with a decision. Rounding is fine; unit errors aren't.
- kind: fire
  level: advanced
  prompt: An estimate says the hot working set is 400 GB and each cache node has 64 GB usable. Throughput needs only 2 nodes. How many cache nodes do you plan for?
  choices:
    - text: About 8 — memory, not throughput, is the binding constraint (400 ÷ 64 ≈ 7, plus headroom)
      correct: true
    - text: 2, because throughput fits
      why: The working set won't fit, so the hit rate would collapse.
    - text: 1, with a larger TTL
      why: TTL doesn't create memory.
    - text: 400
      why: That's GB, not nodes.
  explanation: Size against every limit — throughput, memory, storage, connections — and take the largest requirement. Different limits bind for different components.
```
