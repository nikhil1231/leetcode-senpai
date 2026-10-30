---
id: tradeoffs
category: designs
skill: operations
title: Explain decisions and evolve a simple design
minutes: 15
summary: Senior system design is judgement made visible. Every component should answer a requirement, name its cost, mention the alternative you rejected, and state what would make you change your mind. Start simple, distinguish reversible from irreversible decisions, put numbers on trade-offs, and treat interviewer pushback as an invitation to reason — not a verdict.
objectives:
  - Express each decision as requirement → choice → cost → alternative → reconsideration trigger
  - Distinguish one-way-door from two-way-door decisions, and spend effort accordingly
  - Quantify trade-offs (cost versus availability, consistency versus latency, build versus buy)
  - Run a 45-minute design interview and handle pushback with evidence
sources:
  - ['Michael Nygard: Documenting architecture decisions (ADRs)', 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions']
  - ['Amazon 2015 shareholder letter (one-way and two-way doors)', 'https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders']
  - ['Martin Fowler: MonolithFirst', 'https://martinfowler.com/bliki/MonolithFirst.html']
---

> [!story] The interview that went right
> Two candidates design the same ride-sharing system. The first draws twenty boxes — Kafka, Cassandra, Redis, Elasticsearch, a service mesh — and, asked why Cassandra, says "it scales". The second draws six boxes, says "Postgres, because trips need transactions and 3,000 writes a second fits on one primary with headroom; I'd move driver locations to an in-memory geo index because 200k updates a second of ephemeral data doesn't belong in Postgres", and when challenged on Postgres replies with the numbers and the trigger for sharding. The second design is simpler and the candidate scores higher, because every choice is *explained*.

## The shape of a good decision

**Requirement → choice → cost → alternative → trigger to revisit.**

> "Trips need multi-row transactions (assign driver + create trip atomically), and peak writes are about 3,000/s, so I'll use one Postgres primary with two replicas. The cost is a write ceiling around 10–20k/s and a single region for writes. I considered DynamoDB, which scales writes further but makes the assignment transaction harder. I'd revisit when sustained writes pass 50% of the primary's capacity, sharding by city."

```faded
title: Turn a weak justification into a strong one
prompt: Fill in a strong explanation for adding a cache.
text: |
  **Weak:** "Add Redis to make it fast."

  **Strong:** "Product reads peak at 40k/s and the database budget is 4k/s, so we need a [[≥ 90%|≥ 10%|100%]] hit rate. Product data tolerates 30 seconds of staleness, so cache-aside with a 30 s TTL plus delete-on-write fits. The cost is [[extra infrastructure, a staleness window and a miss-path we must protect|nothing at all|losing durability of product data]]. The alternative, [[read replicas alone|deleting the database|a bigger logo]], would need about ten replicas for the same load. I'd revisit if hit rate fell below 90% — for example if traffic became long-tail."
explain: The strong version ties the component to a number, a freshness requirement, a cost, a rejected alternative and an observable trigger. That is the format interviewers are listening for.
```

## One-way and two-way doors

Amazon popularised the distinction: **two-way doors** are reversible — make them quickly, learn, and change course. **One-way doors** are expensive to undo — slow down, gather evidence and get them right.

```sort
prompt: How reversible is each decision?
buckets: [Two-way door (cheap to change), One-way door (expensive to change)]
items:
  - {text: 'Cache TTL of 30 s versus 60 s', bucket: 0, why: 'A config change. Measure and adjust.'}
  - {text: 'The shard key for a 50 TB table', bucket: 1, why: 'Changing it means migrating every row while live — months of work.'}
  - {text: 'Number of worker instances', bucket: 0, why: 'Autoscaling changes it every hour.'}
  - {text: 'The public API contract that thousands of third-party apps integrate with', bucket: 1, why: 'Breaking changes force every client to migrate. Version carefully.'}
  - {text: 'Which managed Redis provider to use behind a cache-aside layer', bucket: 0, why: 'A cache can be swapped behind an interface with little data migration.'}
  - {text: 'The event schema published to 40 consuming teams', bucket: 1, why: 'Consumers depend on it independently. Evolve compatibly or version it.'}
```

## Putting numbers on trade-offs

```calc
title: Is multi-region worth it?
prompt: Multi-region active-active would add **$40,000/month** in infrastructure. Your single-region service is expected to suffer about **4 hours** of regional outage per year, and downtime costs about **$5,000 per minute** in lost revenue. What is the expected annual cost of regional downtime, in **millions of dollars**?
answer: 1.2
unit: '$M / year'
tolerance: 1.03
steps: |
  4 hours = 240 minutes × $5,000 = **$1.2M per year** of expected downtime cost, versus $480k/year for multi-region. On these numbers it pays off — before counting the engineering cost and complexity of multi-region data, which may still tip the balance towards a cheaper warm standby (minutes of RTO) instead. The point isn't the answer; it's that the decision is argued with numbers.
```

Other recurring axes:

- **Consistency versus latency and availability** — per operation (see the consistency lesson).
- **Simplicity versus flexibility** — one Postgres database versus a polyglot zoo. Every new system needs operating, on-call and expertise.
- **Monolith versus microservices** — start with a well-structured monolith (or a few services) and split along real seams when team or scaling pressures demand it. Distributed systems are a cost, not a feature.
- **Build versus buy** — managed services trade money and control for time and operational burden.

```bug
title: Review a design proposal
prompt: These are excerpts from a design doc for a B2B invoicing product (2,000 customers, about 50 writes/s). Which lines are unjustified complexity or unsupported claims?
lang: text
code: |
  We will split the system into 14 microservices from day one for scalability.
  Invoices are stored in Postgres; multi-row transactions keep totals consistent.
  We will add Kafka, Cassandra and Elasticsearch to be ready for any future use case.
  Search over invoices uses Postgres full-text search until volume justifies a dedicated engine.
  The system will be infinitely scalable.
  We will revisit sharding when sustained writes exceed 5,000/s or data exceeds 2 TB.
bug: [1, 3, 5]
explain: |
  **Line 1:** fourteen services for a small team at 50 writes/s buys network calls, distributed transactions and operational load without a requirement driving it — prefer a modular monolith and split along proven seams. **Line 3:** adding three distributed systems "for any future use case" has no requirement behind it, and each one is an on-call burden. **Line 5:** "infinitely scalable" is a slogan, not a claim anyone can evaluate. Lines 2, 4 and 6 are good: each choice has a reason, a simple default and an explicit trigger for change.
```

## Running the interview

```order
prompt: Order a 45-minute system design interview.
items:
  - "Clarify requirements and state assumptions (about 5 minutes)"
  - "Estimate the numbers that drive design decisions (about 5 minutes)"
  - "Define the API and the core data model (about 5 minutes)"
  - "Draw the high-level design and trace the key flows end to end (about 10 minutes)"
  - "Deep-dive two or three hard parts: the invariant, the bottleneck, the failure modes (about 15 minutes)"
  - "Summarise trade-offs, risks and how the design evolves (about 5 minutes)"
explain: Interviewers often steer the deep dives. Leave room for them, and keep the earlier phases tight. The summary is where you show judgement — what you'd watch, what you'd change, and why.
```

```incident
title: The interviewer pushes back
intro: |
  You've proposed a single Postgres primary with replicas for a messaging app's metadata (conversations, membership, read receipts) at about 8,000 writes/s peak. The interviewer says: **"Postgres won't scale for this. Why not Cassandra?"**
start: s1
nodes:
  s1:
    text: How do you respond?
    options:
      - {label: '"Good point — let me look at what it would cost us." Then compare: 8k writes/s fits on a large primary with headroom; membership changes need transactions; Cassandra would scale writes but complicate those. State the trigger for switching or sharding.', next: s2, quality: good, note: 'Engage with evidence, acknowledge the trade-off, keep the decision explicit.'}
      - {label: '"You''re right, I''ll switch to Cassandra."', next: bad1, quality: bad, note: 'Abandoning a reasoned choice without analysis shows no judgement.'}
      - {label: '"Postgres scales fine, I don''t want to change it."', next: bad2, quality: bad, note: 'Defensive and without evidence.'}
  bad1:
    text: 'Interviewer: "OK — how do you handle adding a user to a group conversation and updating the member count atomically now?" You haven''t thought about it, and the design is now inconsistent with its own requirements.'
    verdict: bad
  bad2:
    text: 'Interviewer: "Why?" You have no numbers ready, and the conversation stalls.'
    options:
      - {label: 'Walk through the numbers and trade-offs', next: s2, quality: ok}
  s2:
    text: 'Interviewer: "And when traffic grows 10×?"'
    options:
      - {label: 'At 80k writes/s, a single primary won''t do. Shard by conversation_id (all membership and receipts for a conversation co-locate), or move high-volume receipts to a wide-column store while keeping membership transactional.', next: done, quality: good, note: 'Shows how the design evolves and which part changes first.'}
      - {label: '"We''ll add more replicas."', next: done2, quality: bad, note: 'Replicas scale reads, not writes.'}
  done:
    text: 'Interviewer nods: "Good — that''s exactly the split I''d make." You showed the decision holds today, and how and when it changes.'
    verdict: good
  done2:
    text: 'Interviewer: "Replicas don''t help writes." A recoverable slip, but it undermines the earlier reasoning.'
    verdict: bad
debrief: |
  Pushback is usually a probe, not a correction. Respond with the requirement, the numbers, the cost of the alternative, and the trigger for change. Being willing to change *with reasons* — and showing the evolution path — scores far higher than either capitulating or digging in.
```

```interview
ask: How would you justify the key design decisions in your ride-hailing system and explain when and how you would evolve it?
say: |
  "Let me summarise the trade-offs. I chose one Postgres primary because trips need transactions and 3k writes/s fits with headroom — revisit at 50% capacity by sharding on city. Driver locations live in an in-memory geo index because they're 200k ephemeral updates a second, at the cost of losing them on restart, which is fine since drivers resend every 4 seconds. Matching is synchronous because riders wait for it; receipts and analytics are async. The biggest risk is a city-level hotspot during events, which is why matching is sharded by city and protected by admission control."
followups:
  - q: Why not microservices from the start?
    a: Each service boundary adds network failure modes, distributed transactions and operational overhead. I'd start with a modular monolith and well-defined internal boundaries, and split where scaling or team ownership demands it.
  - q: What's the most likely thing to break first?
    a: Name the bottleneck from your estimates — the hot partition, the shared database, the fan-out — and what you'd watch to see it coming.
  - q: What would you do differently with twice the time?
    a: Pick the next-biggest risk and show its mitigation — failure testing, multi-region DR, a specific race condition.
weak: |
  Lists technologies without reasons, claims "infinitely scalable", treats every decision as permanent or every decision as trivial, and folds immediately under pushback.
strong: |
  Justifies each component with requirement, number, cost, alternative and trigger; separates reversible from irreversible choices; quantifies trade-offs; and responds to challenges with evidence and an evolution path.
```

```recall
prompt: Take any component you might add to a design (for example a message queue) and justify it using the five-part decision format.
points:
  - The requirement it serves, ideally with a number (e.g. accept bursts of 5k/s while workers process 2k/s)
  - The specific choice and how it's used
  - Its cost (operational burden, added latency, at-least-once duplicates, monitoring)
  - The alternative considered and why it was rejected, plus the trigger that would make you revisit it
model: |
  "Uploads arrive in bursts of up to 5,000 per second while thumbnail workers sustain 2,000, and users can wait a minute for thumbnails — so I'll accept uploads synchronously and put thumbnail jobs on an SQS queue that workers consume. The cost is another component to operate, at-least-once delivery so the thumbnailer must be idempotent, and the need to monitor queue age. I considered processing inline, but bursts would blow the upload latency target. If sustained arrivals exceed worker capacity — queue age above five minutes for an hour — I'd scale workers or revisit the thumbnail sizes we generate."
```

```questions
- kind: check
  prompt: Which explanation of a design choice is strongest?
  choices:
    - text: The requirement it serves with a number, its cost, the alternative rejected, and the trigger to revisit it
      correct: true
    - text: The technology's name and that it's widely used
      why: Popularity isn't a reason in your context.
    - text: '"It scales"'
      why: That's unfalsifiable and says nothing about this design.
    - text: That a big company uses it
      why: Their requirements aren't yours.
  explanation: Decisions are judged by how well they connect requirements to costs and alternatives, with a clear condition for change.
- kind: check
  type: multi
  prompt: Which are one-way-door decisions (expensive to reverse)? Select all that apply.
  choices:
    - text: The shard key of a very large table
      correct: true
    - text: A public API contract used by many third parties
      correct: true
    - text: The event schema consumed by many teams
      correct: true
    - text: A cache TTL value
      why: It's a configuration change.
    - text: The number of web servers
      why: Autoscaling changes it continuously.
  explanation: Spend analysis on irreversible decisions and move fast on reversible ones.
- kind: check
  type: numeric
  prompt: Downtime costs $2,000 per minute, and you expect 6 hours of outage per year without redundancy. What's the expected annual downtime cost, in thousands of dollars?
  answer: 720
  unit: '$k / year'
  tolerance: 0.02
  explanation: 360 minutes × $2,000 = $720,000 per year. Compare it with the cost of redundancy to make the trade-off explicit.
- kind: check
  type: order
  prompt: Order the phases of a 45-minute design interview.
  items:
    - Requirements and assumptions
    - Back-of-envelope estimates
    - API and data model
    - High-level design and key flows
    - Deep dives on hard parts
    - Trade-offs and evolution
  explanation: Each phase builds on the last. Deep dives without requirements or numbers lack grounding.
- kind: fire
  prompt: An interviewer says "Postgres won't scale for this." What's the best response?
  choices:
    - text: Compare the estimated load with Postgres's capacity, explain what the alternative would cost (e.g. lost transactions), and state when you'd shard or switch
      correct: true
    - text: Switch databases immediately
      why: That abandons a reasoned choice without analysis.
    - text: Insist Postgres scales infinitely
      why: That's false and defensive.
    - text: Ask the interviewer which database they prefer
      why: That hands over the judgement you're meant to show.
  explanation: Pushback is a probe. Answer with numbers, costs and an evolution path.
- kind: fire
  prompt: A small team building a modest product proposes 14 microservices on day one. What's the main concern?
  choices:
    - text: Distribution adds network failures, distributed transactions and operational burden with no requirement justifying it
      correct: true
    - text: Microservices can't use databases
      why: They can.
    - text: Fourteen is an unlucky number
      why: Not an engineering concern.
    - text: Microservices are always slower to write code in
      why: The issue is operational and correctness cost, not typing speed.
  explanation: Start with a modular monolith and split along proven seams when scaling or team needs demand it.
- kind: fire
  prompt: Which statement in a design doc is unhelpful?
  choices:
    - text: The system will be infinitely scalable
      correct: true
    - text: We will revisit sharding when sustained writes exceed 5,000/s
      why: That's an explicit, measurable trigger — good.
    - text: Invoices use Postgres transactions to keep totals consistent
      why: A choice tied to a requirement — good.
    - text: Search uses Postgres full-text search until volume justifies a dedicated engine
      why: A simple default with a reason to change — good.
  explanation: Claims must be checkable. Slogans aren't decisions.
- kind: fire
  level: advanced
  prompt: Multi-region would cost $500k/year more, and expected regional downtime costs $300k/year. What's the most reasonable conclusion?
  choices:
    - text: Pure active-active doesn't pay for itself on these numbers; consider a cheaper warm standby or pilot light that cuts recovery time at lower cost
      correct: true
    - text: Always go multi-region regardless of cost
      why: That ignores the trade-off entirely.
    - text: Ignore availability
      why: $300k/year of downtime is still real.
    - text: The numbers don't matter
      why: They're the basis of the decision.
  explanation: Quantified trade-offs often point to a middle option rather than either extreme.
- kind: fire
  type: multi
  prompt: Which behaviours make a design interview go well? Select all that apply.
  choices:
    - text: Stating assumptions and checking them with the interviewer
      correct: true
    - text: Starting simple and adding components only when a requirement demands them
      correct: true
    - text: Naming failure modes and how the design handles them
      correct: true
    - text: Explaining how the design evolves, with triggers
      correct: true
    - text: Listing every technology you know
      why: Breadth without justification signals the opposite of judgement.
  explanation: Interviewers assess reasoning — requirements, numbers, trade-offs, failures and evolution — not tool inventories.
```
