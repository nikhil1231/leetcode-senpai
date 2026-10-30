---
id: guarantees
category: foundations
skill: requirements
title: Turn requirements into guarantees
minutes: 15
summary: A design can only be judged against what it promises. Strong candidates spend the first minutes converting a vague prompt into functional scope, measurable targets, correctness invariants and explicit non-goals — because every later decision is a trade-off against those, and "it depends" needs something to depend on.
objectives:
  - Separate functional requirements, non-functional targets, invariants and non-goals
  - Turn vague qualities ("fast", "reliable", "scalable") into SLIs and SLOs with numbers and a measurement window
  - Write invariants that must hold under concurrency and failure, and know which operations need them
  - Run the clarifying conversation at the start of an interview efficiently
sources:
  - ['Google SRE Book: Service Level Objectives', 'https://sre.google/sre-book/service-level-objectives/']
  - ['Google SRE Workbook: Implementing SLOs', 'https://sre.google/workbook/implementing-slos/']
  - ['PostgreSQL: Constraints', 'https://www.postgresql.org/docs/current/ddl-constraints.html']
case: seats
---

> [!story] "Make it scalable"
> A candidate is asked to design a ticketing system. They spend 25 minutes on Kafka, sharding and multi-region replication. With ten minutes left, the interviewer asks: "Can two people end up with the same seat?" The candidate realises they never decided — and the architecture they built makes it hard to guarantee. The interviewer's notes: *strong on components, never established what the system had to promise.*

## Four kinds of statement

| Kind | Question it answers | Example (seat booking) |
|---|---|---|
| **Functional requirement** | What can users do? | Browse an event's seats; hold a seat for 5 minutes; confirm a held seat |
| **Non-functional target** | How well, measured how? | p99 hold latency < 300 ms at 2,000 holds/s peak; 99.95% of confirmations succeed per 30 days |
| **Invariant** | What must *always* be true, even under races and failures? | At most one confirmed booking per seat; a hold can only be confirmed by its owner before it expires |
| **Non-goal / out of scope** | What are we deliberately not designing? | Payments, refunds, seat maps rendering, fraud |

Invariants are the ones candidates forget, and they are what make designs hard. "Users can book seats" is easy. "**No seat is ever sold twice, even when 10,000 people click the last seat at the same instant**" is the actual problem.

```sort
prompt: Classify each statement from a ride-hailing prompt.
buckets: [Functional, Non-functional target, Invariant, Non-goal]
items:
  - {text: 'Riders can request a ride and see the driver approaching on a map', bucket: 0, why: 'A capability users have.'}
  - {text: 'Driver location updates reach the rider within 2 s, p95', bucket: 1, why: 'A measurable quality target with a percentile.'}
  - {text: 'A driver is assigned to at most one active trip at a time', bucket: 2, why: 'Must hold under concurrent matching requests — that is an invariant, enforced at a write.'}
  - {text: 'We will not design the pricing/surge algorithm', bucket: 3, why: 'An explicit scope cut that keeps the discussion focused.'}
  - {text: 'A completed trip is charged exactly once', bucket: 2, why: 'A correctness rule that must survive retries and crashes.'}
  - {text: 'The matching service handles 50,000 ride requests per minute at peak', bucket: 1, why: 'A throughput target that sizes the system.'}
  - {text: 'Drivers can go online and offline', bucket: 0, why: 'A capability.'}
```

## From adjectives to SLOs

"Fast", "reliable" and "scalable" can't be checked. Convert each into a **service level indicator** (what you measure) and an **objective** (the target, over a window):

- **SLI:** the proportion of valid requests to `POST /holds` that succeed within 300 ms, measured at the load balancer.
- **SLO:** 99.9% over a rolling 30 days.
- **SLA:** a contract with consequences (credits, penalties) — usually looser than the internal SLO, so you have room to react before you owe anything.

Good SLIs are **ratios of good events to valid events** measured as close to the user as practical. Percentile latency targets need a workload ("at 2,000 holds/s").

```faded
title: Rewrite a vague requirement
prompt: Turn "the API should be fast and reliable" into something checkable.
text: |
  **Latency SLI:** the proportion of valid `GET /seats` requests served within 200 ms, measured at the [[load balancer|developer laptop|database]].

  **Latency SLO:** at least 99% of requests within that threshold over a rolling [[30-day|1-minute|lifetime]] window, at up to 20,000 requests/s.

  **Availability SLO:** 99.9% of valid requests return a non-5xx response. Over 30 days that allows about [[#43.2]] minutes' worth of failed requests — our **error budget**.

  If we burn the budget early, we [[slow down risky releases and focus on reliability|ignore it until next quarter|raise the SLO]].
explain: Every number needs a unit, a measurement point and a window. The error budget turns the SLO into a decision tool — it tells you when to spend effort on features versus reliability.
```

```calc
title: How much downtime is 99.95%?
prompt: An SLO of **99.95%** availability over a **30-day** month allows how many minutes of total failure?
answer: 21.6
unit: minutes
tolerance: 1.1
steps: |
  30 days × 24 h × 60 min = 43,200 minutes. 0.05% of that is **21.6 minutes**. Each extra nine divides it by ten: 99.9% → 43.2 min, 99.99% → 4.3 min. A single bad deploy that takes ten minutes to roll back spends half the 99.95% budget — which is why deployment safety (canaries, fast rollback) is an availability feature.
```

## Invariants: write them like a test

A good invariant is phrased so you could write a test that tries to break it with concurrency and crashes:

- "At most one `CONFIRMED` booking per `(event_id, seat_id)`." → a unique constraint, or a conditional update.
- "Balance never goes negative." → a check constraint, or `UPDATE … SET balance = balance - x WHERE balance >= x`.
- "Each payment request results in at most one charge." → an idempotency key with a uniqueness guarantee.

Then ask which operations need **strong** guarantees and which can be **relaxed**. Browsing available seats can be 10 seconds stale; confirming a seat cannot. Spelling this out per operation lets you cache aggressively where it's safe and coordinate only where it's required.

```predict
prompt: A booking prompt says "show available seats; let users hold and confirm a seat". Which operation most needs a strong correctness guarantee?
choices:
  - Rendering the seat map for browsing
  - Confirming a held seat
  - Showing how many people are viewing the event
  - Listing upcoming events
answer: 1
reveal: |
  Confirmation changes ownership and must respect "one owner per seat" under concurrency. Browsing can show a slightly stale map — a user might see a seat as free and lose the race at hold time, which is acceptable if the hold/confirm step is authoritative. Deciding this per operation is what allows the read path to be cached and the write path to be correct.
```

## Non-goals protect the design

Out-of-scope statements aren't laziness; they make trade-offs visible. "Payments are out of scope; confirmation is a local state change" lets you focus on the hold/confirm invariant. If the interviewer later asks about payments, it's an *extension*, and you can discuss how it would change the design (sagas, reservation timeouts) without having muddled the baseline.

```bug
title: Spot the untestable requirements
prompt: A team's requirements doc for a file-sharing feature. Click the lines that can't be tested as written.
lang: text
code: |
  Users can upload files up to 2 GB and share them via link.
  The system must be highly scalable.
  Upload acknowledgement means the file is durably stored in two regions.
  Downloads should be fast.
  p95 time-to-first-byte for downloads < 150 ms in EU and US.
  Only the owner and invited users can access a private file.
  The service should have good availability.
bug: [2, 4, 7]
explain: |
  Lines 2, 4 and 7 are adjectives: there's no number, workload, measurement point or window. Compare line 5 ("p95 TTFB < 150 ms in EU and US"), which you can measure and alert on, and line 3, which defines exactly what "acknowledged" promises. Rewrite them as, for example, "sustain 5,000 concurrent uploads at peak", "p95 download throughput ≥ 50 MB/s for files over 100 MB", and "99.9% of valid requests succeed over 30 days".
```

## The clarifying conversation

In an interview you have about five minutes for this. Ask questions that **change the design**, state assumptions for the rest, and write everything down where the interviewer can see it.

```incident
title: The first five minutes
intro: |
  Interviewer: *"Design a URL shortener."* You have about five minutes before you should start sketching. Choose how to spend them.
start: s1
nodes:
  s1:
    text: What do you say first?
    options:
      - {label: '"Let me confirm the core use cases: create a short link, redirect, and maybe custom aliases and expiry. Are analytics in scope?"', next: s2, quality: good, note: 'Scope first, with the optional features named so the interviewer can include or cut them.'}
      - {label: '"I''d use a NoSQL database with consistent hashing for this."', next: bad1, quality: bad, note: 'A technology choice with no requirements behind it.'}
      - {label: '"How many engineers will work on this?"', next: s1b, quality: ok, note: 'Occasionally relevant, but it rarely changes a whiteboard design.'}
  bad1:
    text: 'Interviewer: "Why NoSQL? What are the access patterns?" You don''t know yet, because you haven''t asked. You''ve spent credibility and time.'
    options:
      - {label: 'Step back and ask about use cases and scale', next: s2, quality: ok}
  s1b:
    text: '"Assume a small team." It doesn''t change much. Time is ticking.'
    options:
      - {label: 'Ask about use cases and scope', next: s2, quality: good}
  s2:
    text: 'Interviewer: "Create and redirect. Custom aliases yes, analytics later. Links never expire." What next?'
    options:
      - {label: '"What scale? I''ll assume ~100M new links a month and a 100:1 read:write ratio unless you''d like different numbers."', next: s3, quality: good, note: 'Proposing numbers is faster than waiting for them, and shows estimation instincts.'}
      - {label: '"What programming language should I use?"', next: s2b, quality: bad, note: "Doesn't affect the system design."}
  s2b:
    text: '"Whatever you like." No progress.'
    options:
      - {label: 'Ask about scale', next: s3, quality: good}
  s3:
    text: 'Interviewer: "Sounds fine." What is the most valuable remaining question?'
    options:
      - {label: '"If a link''s destination is changed or disabled, how quickly must redirects reflect it?"', next: done, quality: good, note: 'This freshness requirement decides how aggressively the redirect path can be cached.'}
      - {label: '"Should the short code be 6 or 7 characters?"', next: done2, quality: ok, note: 'You can derive that from the scale estimate yourself.'}
      - {label: '"Should I use Redis?"', next: done3, quality: bad}
  done:
    text: 'Interviewer: "Within a minute is fine." You now have scope, scale, a freshness bound and a durability expectation (acknowledged links must not vanish). Every later choice can be justified against them.'
    verdict: good
  done2:
    text: You can work that out (62^7 ≈ 3.5 trillion codes), but you've missed the freshness question that shapes the caching design. You'll need to come back to it.
    verdict: ok
  done3:
    text: '"You tell me." The interviewer wants you to derive components from requirements, not ask permission for them.'
    verdict: bad
debrief: |
  Good clarifying questions **change the design**: scope (what's in, what's out), scale (propose numbers), and the one or two *guarantees* that matter (here, freshness of redirects and durability of created links). Technology and trivia questions waste the minutes that matter most.
```

```interview
ask: How would you define the requirements and guarantees for a seat-booking system before starting the design?
say: |
  "Before drawing anything: in scope are holding and confirming seats; payments and seat-map rendering are out. Targets — 2,000 holds/s at peak, p99 under 300 ms, 99.95% of confirmations succeed monthly. The invariant is at most one confirmed booking per seat, and a hold is confirmable only by its owner before expiry, even under concurrent requests and retries. Browsing can be about 10 seconds stale; holds and confirmations must be authoritative. I'll design the write path for the invariant first, then optimise reads."
followups:
  - q: Why distinguish invariants from SLOs?
    a: SLOs can be missed occasionally and you spend error budget. Invariants can't be violated at all without corrupting data, so they need mechanisms (constraints, conditional writes, idempotency) rather than capacity.
  - q: How do you pick an SLO?
    a: From user impact and cost. Measure where users feel it, set a target a bit tighter than the contract, and choose the window. A higher target costs disproportionately more, so ask what the product needs.
  - q: What if the interviewer won't give numbers?
    a: Propose reasonable ones, state them as assumptions, and show how the design would change if they were 10× different.
weak: |
  Starts with technology choices. "It needs to be fast and scalable." Never says what must always be true, so concurrency and retries are never designed for.
strong: |
  Writes scope, numbers with percentiles and windows, invariants phrased as testable rules, and non-goals. Says which operations can be relaxed and which must be strong, then designs from there.
```

```recall
prompt: What is the difference between an SLO and an invariant? Give one example of each for a payments service.
points:
  - An SLO is a measurable target that can be missed by a small, budgeted amount (e.g. 99.9% of payments succeed within 2 s over 30 days)
  - An invariant is a rule that must never be violated (e.g. a payment request is charged at most once)
  - SLOs are met with capacity, redundancy and operations; invariants need correctness mechanisms such as constraints, idempotency keys and transactions
  - Missing an SLO spends error budget; breaking an invariant corrupts data or money
model: |
  An SLO is a statistical target — "99.9% of valid payment requests complete successfully within 2 s, measured over 30 days." Occasional misses are expected and come out of an error budget. An invariant is absolute — "each payment request is charged at most once," or "an account balance never goes below zero." You don't meet invariants with more servers; you meet them with mechanisms that hold under concurrency and failure: idempotency keys with unique constraints, conditional updates, transactions.
```

```questions
- kind: check
  prompt: Which of these is an invariant rather than a performance target?
  choices:
    - text: A driver is never assigned to two active trips at once
      correct: true
    - text: 99% of match requests complete within 1 s
      why: That's an SLO. It may be missed by a budgeted amount.
    - text: The system handles 50,000 requests per minute
      why: That's a throughput target.
    - text: Location updates reach riders within 2 s, p95
      why: That's a latency objective with a percentile.
  explanation: An invariant must hold for every operation, including concurrent and retried ones. It needs a correctness mechanism, not just capacity.
- kind: check
  type: numeric
  prompt: An SLO of 99.9% over a 30-day window allows how many minutes of complete outage?
  answer: 43.2
  unit: minutes
  tolerance: 0.02
  explanation: 43,200 minutes × 0.1% = 43.2 minutes. That's the error budget. Spending it early is a signal to prioritise reliability work.
- kind: check
  type: multi
  prompt: Which make a latency requirement testable? Select all that apply.
  choices:
    - text: A percentile (e.g. p99) rather than an average
      correct: true
    - text: A workload at which the target applies (e.g. 2,000 requests/s)
      correct: true
    - text: Where it's measured (e.g. at the load balancer, or on the client)
      correct: true
    - text: A measurement window (e.g. rolling 30 days)
      correct: true
    - text: The word "fast" in bold
      why: An adjective is still an adjective, however it's formatted.
  explanation: A target needs a statistic, a threshold, a workload, a measurement point and a window. Without them, two engineers can disagree about whether it's met.
- kind: check
  prompt: In a seat-booking design, why say that browsing may be 10 seconds stale but confirmation must be authoritative?
  choices:
    - text: It allows heavy caching on the read path while concentrating coordination only on the write that protects the invariant
      correct: true
    - text: It means the system doesn't need a database for browsing
      why: Browsing still reads data, possibly from a cache or replica fed by the database.
    - text: Stale browsing guarantees there will be no double bookings
      why: Staleness has nothing to do with double booking. That's guaranteed at confirmation.
    - text: It makes the system eventually consistent everywhere
      why: The point is that guarantees differ per operation. Confirmation stays strongly consistent.
  explanation: Per-operation guarantees are how real systems get both scale and correctness. Relax where users can tolerate it; coordinate where an invariant is at stake.
- kind: fire
  prompt: The interviewer won't give a traffic number. What's the best move?
  choices:
    - text: Propose a reasonable estimate, state it as an assumption, and note how the design would change at 10× more or less
      correct: true
    - text: Design for a billion requests per second to be safe
      why: Over-design adds complexity you can't justify, and it hides your judgement.
    - text: Skip capacity entirely
      why: Without a workload you can't size anything or justify components.
    - text: Keep asking until they give a number
      why: It wastes time and signals that you can't make assumptions.
  explanation: Making explicit assumptions shows judgement and keeps the conversation moving. Sensitivity ("at 10× this changes") shows depth.
- kind: fire
  prompt: Why might an internal SLO be set tighter than the external SLA?
  choices:
    - text: To get an early warning and time to react before contractual penalties apply
      correct: true
    - text: Because SLAs aren't measured
      why: SLAs are measured, and breaching them has consequences.
    - text: To make dashboards look worse
      why: The point is a safety margin, not looks.
    - text: Because SLOs only apply to internal users
      why: SLOs describe user-facing service quality too.
  explanation: The gap between SLO and SLA is a buffer. You notice and respond to degradation while there's still room before the contract is breached.
- kind: fire
  type: multi
  prompt: Which clarifying questions are likely to change a URL shortener's design? Select all that apply.
  choices:
    - text: How quickly must a destination change or disable be reflected in redirects?
      correct: true
    - text: Roughly how many links are created per month, and what's the read:write ratio?
      correct: true
    - text: Are custom aliases in scope?
      correct: true
    - text: Which IDE should I use?
      why: That doesn't affect the system.
    - text: Should the logo be blue?
      why: That has nothing to do with the architecture.
  explanation: Questions about freshness, scale and scope change caching, storage and ID generation. Questions that don't change the design spend scarce minutes.
- kind: fire
  prompt: How would you enforce "a balance never goes negative" when withdrawals can run concurrently?
  choices:
    - text: A conditional update (`UPDATE … SET balance = balance - x WHERE id = ? AND balance >= x`) or a check constraint, at the database
      correct: true
    - text: Read the balance, check it in application code, then write the new balance
      why: Two concurrent withdrawals can both read the old balance and both pass the check.
    - text: Show users their balance in the UI before they withdraw
      why: Display has no effect on concurrent writes.
    - text: Run withdrawals at night
      why: Scheduling doesn't stop concurrency.
  explanation: Invariants under concurrency need the check and the write to be one atomic operation at the source of truth.
- kind: fire
  level: advanced
  prompt: A team sets an availability SLI as "the health-check endpoint returns 200". What's the main weakness?
  choices:
    - text: The health check can succeed while real user requests fail, so the SLI doesn't reflect user experience
      correct: true
    - text: Health checks are too expensive to run
      why: They're cheap. The problem is what they measure, not what they cost.
    - text: It will report lower availability than reality
      why: It usually reports *higher* availability, because it misses real failures.
    - text: Health checks can't be measured over 30 days
      why: They can. The problem is what they measure.
  explanation: Good SLIs measure real user requests (good events ÷ valid events) near the user. Synthetic checks complement them but miss partial failures, bad data and dependency errors.
```
