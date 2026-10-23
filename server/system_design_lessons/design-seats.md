---
id: design-seats
category: designs
skill: concurrency
title: Design seat reservations without double booking, end to end
minutes: 20
summary: A full walkthrough of the reservation case — a browse path that may be 10 seconds stale, hold and confirm transitions that must be authoritative, expiry that never depends on a cron job, retries that can't double-book, partitioning by event, and a waiting room for the on-sale stampede. The core idea is two paths with two different guarantees.
objectives:
  - Separate the stale-tolerant browse path from the authoritative hold and confirm path
  - Specify schema and atomic predicates for hold, confirm and expiry, with retry-safe identities
  - Partition by event and protect hot on-sales with admission control
  - Walk through races, failure modes and evolution with concrete mechanisms
sources:
  - ['PostgreSQL: Explicit locking', 'https://www.postgresql.org/docs/current/explicit-locking.html']
  - ['Cloudflare: Waiting Room', 'https://developers.cloudflare.com/waiting-room/']
  - ['Ticketmaster engineering: Smart Queue (virtual waiting room)', 'https://business.ticketmaster.com/business-solutions/smart-queue/']
case: seats
---

> [!tip] The case contract
> A signed-in user can hold an available seat for five minutes and confirm the hold. Payment is out of scope; confirmation is a local state transition. **At most one confirmed reservation per seat.** Many users and servers may request the same seat concurrently. Expired holds can't be confirmed; only the hold owner may confirm. Client retries must not create additional reservations or change a completed confirmation. **Browsing may be 10 seconds stale; holds and confirmations use authoritative state.**

## 1. Two paths, two guarantees

```sort
prompt: Which path, with which guarantee, serves each request?
buckets: [Browse path (cached, ≤ 10 s stale), Authoritative path (primary DB, atomic)]
items:
  - {text: 'Render the seat map for event 812', bucket: 0, why: 'Thousands of viewers per seat change. A cached map refreshed every few seconds is fine, because the hold step re-checks.'}
  - {text: 'Hold seat 14C', bucket: 1, why: 'An ownership transition. It must check current state at the authority.'}
  - {text: 'Confirm hold h_91', bucket: 1, why: 'The invariant-protecting transition. Atomic predicate on the primary.'}
  - {text: 'Show "3 seats left in this section"', bucket: 0, why: 'A display count derived from the cached map.'}
  - {text: 'Show the user their own active holds and expiry timers', bucket: 1, why: 'Read-your-writes: users must see their own holds accurately, so read from the primary (cheap — one user''s rows).'}
```

## 2. Estimates

```faded
title: Size it
prompt: Complete the estimates.
text: |
  A large venue has 60,000 seats; we host up to 2,000 events at once, so about [[#120]] million seat rows are live. At ~200 bytes each that's ~24 GB — [[one primary with replicas|a 100-node cluster|an in-memory cache only]].

  On a normal day, holds arrive at ~200/s overall. For a stadium on-sale, 500,000 users arrive in minutes, but there are only 60,000 seats, so at most [[60,000 successful holds|500,000 successful holds|unlimited holds]] per cycle of hold expiry.

  The seat map for a hot event might be viewed 20,000 times per second. Served from a cache refreshed every 2 s, the database sees about [[#0.5]] seat-map queries per second for that event.
explain: The data is modest; contention and read amplification are the challenge. Cache the browse path aggressively and protect the hold path with admission control.
```

## 3. Schema and API

```sql
CREATE TABLE seats (
  event_id        BIGINT NOT NULL,
  seat_id         TEXT   NOT NULL,           -- '14C'
  status          TEXT   NOT NULL,           -- available | held | booked
  hold_id         UUID,
  held_by         BIGINT,
  hold_expires_at TIMESTAMPTZ,
  booking_id      UUID,                      -- client-supplied confirmation identity
  PRIMARY KEY (event_id, seat_id)
);
-- The invariant, enforced again by the database:
CREATE UNIQUE INDEX one_booking_per_seat ON seats (event_id, seat_id) WHERE status = 'booked';
```

```http
GET  /v1/events/{event}/seats                      -> seat map (cached, may lag ≤ 10 s)
POST /v1/events/{event}/seats/{seat}/holds         -> 201 {hold_id, expires_at} | 409 taken
POST /v1/holds/{hold_id}/confirm  {booking_id}     -> 200 {booking_id}         | 410 expired | 403 not yours
GET  /v1/me/holds                                  -> my holds (primary)
```

(The composite primary key already guarantees one row per seat; the partial unique index documents the booking invariant and would catch a design change that introduced separate booking rows.)

## 4. Architecture

```arch
title: Reservations
nodes:
  - {id: user, label: User, kind: client, x: 0, y: 1}
  - {id: wr, label: Waiting room, kind: cdn, x: 1, y: 1, note: 'on-sales only'}
  - {id: api, label: Reservation API, kind: service, x: 2, y: 1, note: stateless}
  - {id: map, label: Seat-map cache, kind: cache, x: 2, y: 0, note: 'rebuilt every 2 s'}
  - {id: db, label: Postgres primary, kind: db, x: 3, y: 1, note: 'partitioned by event'}
  - {id: rep, label: Replica, kind: db, x: 3, y: 0}
  - {id: sweep, label: Expiry sweeper, kind: worker, x: 3, y: 2, note: 'housekeeping only'}
edges:
  - [user, wr, 'join queue']
  - [wr, api, 'admitted']
  - [api, map, 'browse']
  - [map, rep, 'refresh']
  - [api, db, 'hold / confirm']
  - [sweep, db, 'reset expired']
paths:
  - label: Browse
    steps:
      - [user, wr, 'Normal days: the waiting room is a pass-through']
      - [wr, api, 'GET seat map']
      - [api, map, 'Served from a per-event cached map (up to ~2–4 s old, inside the 10 s allowance)']
      - [map, rep, 'Refreshed from a replica every 2 s per active event']
  - label: Hold and confirm
    steps:
      - [user, wr, 'Admitted (immediately, or after the queue during an on-sale)']
      - [wr, api, 'POST hold for 14C']
      - [api, db, 'Conditional UPDATE: available, or held with hold_expires_at < now() → held by this user, new hold_id, expiry now()+5 min. One row = success; zero = taken.']
      - [api, db, 'Confirm: UPDATE … SET status=booked, booking_id WHERE hold_id, held_by, status=held, hold_expires_at ≥ now()']
  - label: Expiry
    steps:
      - [sweep, db, 'Every 30 s, reset expired holds to available so the seat map looks right. Correctness never depends on this.']
```

## 5. Races, step by step

```timeline
title: Expiry versus confirmation at the deadline
intro: Alice's hold expires at 12:05:00.000. She clicks confirm at 12:04:59.9 on a slow network; Bob tries to hold the same seat at 12:05:00.2.
lanes: [Alice, Bob, Database]
state: {Seat: 'held by Alice (expires 12:05:00)'}
steps:
  - {lane: Alice, to: Database, text: 'confirm arrives at 12:05:00.4 (db clock)'}
  - {lane: Bob, to: Database, text: 'hold arrives at 12:05:00.3 (db clock)'}
  - {lane: Database, to: Database, text: "Bob's UPDATE runs first: hold expired (12:05:00.3 > 12:05:00) → seat held by Bob", set: {Seat: 'held by Bob'}}
  - {lane: Database, to: Alice, text: "Alice's confirm: hold_id no longer matches → 0 rows → 410 Hold expired"}
find:
  prompt: Which fact decides the outcome fairly and deterministically?
  answer: 2
  explain: |
    Both requests are judged against **one clock** (the database's `now()`) inside atomic updates, which the database serialises. Bob's request arrived after the expiry, so his claim of an expired hold is valid; Alice's confirm then fails the `hold_id` check. Had Alice's confirm reached the database at 12:04:59.9, she'd have won and Bob's hold would have matched 0 rows. Using the client's clock, or a sweeper's timing, would make this outcome arbitrary.
```

```predict
prompt: Alice's confirm succeeds, but the response is lost. Her app retries with the same booking_id. What does the server return?
choices:
  - 410 — the hold no longer exists because the seat is booked
  - 200 with the same booking_id — the server sees the seat booked with this booking_id and treats it as a retry
  - A second booking
  - 409 Conflict
answer: 1
reveal: |
  The confirm UPDATE matches 0 rows (status is already booked), so the handler reads the seat: booked, with booking_id equal to the one in the request, so this is a retry of a completed confirmation and it returns the original result. That meets "retries must not change the result of a completed confirmation".
```

## 6. Hot events and partitioning

- **Partition by event_id** (declarative partitions or shards): every hold or confirm touches one event's data, so it stays single-partition, and a hot event can be moved to dedicated capacity.
- **Waiting room for on-sales:** admit users at the rate the hold path sustains, randomise order among early arrivals, show honest positions, and stop admitting when everything is held.
- **Short holds** keep inventory circulating; expired holds rejoin the pool instantly because the claim predicate treats them as available.

```calc
title: Admission rate for an on-sale
prompt: The hold path can sustain **1,500 hold attempts/s** for one event with headroom. On average each admitted user makes **3** hold attempts (seats get taken) over about **60 seconds** of browsing. How many users per **minute** should the waiting room admit?
answer: 30000
unit: users/min
tolerance: 1.05
steps: |
  Each admitted user generates 3 attempts per minute. 1,500 attempts/s × 60 = 90,000 attempts per minute ÷ 3 = **30,000 users/min**. With 500,000 people queued that's about 17 minutes to admit everyone — and a 60,000-seat stadium will be fully held well before then, so the room should stop admitting and say so.
```

## 7. Failure modes and evolution

| Situation | Behaviour |
|---|---|
| Primary unreachable (failover in progress) | Holds and confirms fail fast with "try again" — never decide ownership from the cache or a replica. Browsing continues from the cached map. |
| Seat-map cache stale or down | Rebuild from the replica; worst case the map lags, and holds still check authoritatively. |
| Sweeper down | Seat map shows expired holds as held for longer; claims and confirms are still correct. |
| Duplicate confirm submissions | The same booking_id returns the same result. |

```order
prompt: Order these evolution steps by when you'd add them as the business grows.
items:
  - "Baseline: one Postgres primary + replica, conditional updates, a cached seat map, a sweeper"
  - Waiting room for announced on-sales
  - Partition seats by event, moving mega-events to dedicated capacity
  - Push seat-map changes to browsers over SSE instead of polling, for big events
  - Add payments with a saga — hold, then charge, then confirm, or release on failure
explain: Payment is out of scope for the baseline, but it's the classic follow-up. It turns confirm into a multi-step saga with compensations (release the hold if the charge fails, refund if confirmation fails after the charge).
```

```interview
say: |
  "Two paths. Browsing serves a per-event seat map cached and rebuilt from a replica every 2 seconds — inside the 10-second allowance. Holds and confirms go to the primary as single conditional UPDATEs on the seat row, judged by the database clock: a hold succeeds only if the seat is available or its hold has expired; a confirm requires the matching hold_id, owner, status held and an unexpired deadline. Confirms carry a client booking_id, so retries return the same result. Expiry correctness lives in those predicates; the sweeper only tidies the map. Seats are partitioned by event, and on-sales go through a waiting room admitting about 30k users a minute."
followups:
  - q: Why not a distributed lock per seat?
    a: The seat row is already the right lock, and a conditional update is atomic at the authority. A separate lock system adds failure modes and still needs fencing.
  - q: What happens during primary failover?
    a: Holds and confirms fail fast with a retry message. We never decide ownership from cached or replica data, while browsing continues.
  - q: How would payments change it?
    a: Confirm becomes a saga — keep the hold, charge with an idempotency key, then confirm. On a charge failure release the hold; on a confirm failure after charging, refund. Extend holds during payment within limits.
weak: |
  Reads availability, then writes the booking; uses the cache to decide holds; cron-based expiry; no retry identity; no plan for on-sales.
strong: |
  Separates stale browsing from authoritative transitions, writes precise predicates with one clock, makes confirm retry-safe, decouples expiry correctness from housekeeping, partitions by event and adds admission control for stampedes.
```

```recall
prompt: Explain why the browse path can be cached and stale while the hold path cannot, and what stops a stale seat map from causing a double booking.
points:
  - Browsing only displays availability; showing a seat as free when it isn't costs at most a failed hold attempt
  - Holds and confirms change ownership, which is protected by the one-owner invariant
  - The hold is a conditional update against the primary that re-checks current state atomically, regardless of what the map said
  - So a stale map can cause disappointment ("seat just taken") but never two owners
model: |
  The seat map is informational: if it's a few seconds behind, the worst case is that someone clicks a seat that was just taken and gets a "sorry, taken" response. Holding and confirming change who owns a seat, so they go to the primary and run as atomic conditional updates that check the seat's current status (or expired hold) at that instant, using the database clock. Whatever the user saw in the cached map, the database lets exactly one request win. Staleness can cost a retry, never a double booking — which is why we can cache the read path aggressively.
```

```questions
- kind: check
  prompt: Which data source may decide whether a hold succeeds?
  choices:
    - text: The primary database, via an atomic conditional update
      correct: true
    - text: The cached seat map
      why: The map may be up to 10 seconds stale. Only the authority decides.
    - text: A read replica
      why: Replicas lag, so they can show a seat as free after it's taken.
    - text: The browser's last fetched map
      why: That's the stalest copy of all.
  explanation: Stale-tolerant reads are for display. State transitions use authoritative state, atomically.
- kind: check
  type: multi
  prompt: Which conditions belong in the confirm UPDATE's WHERE clause? Select all that apply.
  choices:
    - text: status = 'held'
      correct: true
    - text: hold_id matches
      correct: true
    - text: held_by is the requesting user
      correct: true
    - text: hold_expires_at >= now()
      correct: true
    - text: The seat appears available in the cached map
      why: The cache is irrelevant to the authoritative decision.
  explanation: Status, identity, ownership and deadline are checked together at the authority.
- kind: check
  prompt: A confirmation succeeded but its response was lost, and the client retries with the same booking_id. What should happen?
  choices:
    - text: Return the existing booking, because the seat is booked with that booking_id
      correct: true
    - text: Return 410, because the hold no longer exists
      why: Technically true, but misleading — the user did book it.
    - text: Book another seat
      why: That violates the retry requirement.
    - text: Return 500
      why: It isn't an error.
  explanation: Client-supplied identities make completed operations recognisable on retry.
- kind: check
  type: numeric
  prompt: The hold path sustains 2,000 attempts/s, and each admitted user makes about 4 attempts per minute. How many users per minute can the waiting room admit?
  answer: 30000
  unit: users/min
  tolerance: 0.02
  explanation: 2,000 × 60 = 120,000 attempts per minute ÷ 4 = 30,000 users/min.
- kind: fire
  prompt: The expiry sweeper has been down for an hour. What's wrong?
  choices:
    - text: Only the seat map — expired holds still show as held; claims and confirms remain correct because the predicates check expiry
      correct: true
    - text: Expired holds can be confirmed
      why: The confirm predicate checks hold_expires_at against now().
    - text: Seats with expired holds can never be claimed
      why: The claim predicate treats expired holds as available.
    - text: All holds become permanent
      why: Expiry is evaluated at decision time.
  explanation: Housekeeping affects presentation. Correctness lives in the transitions.
- kind: fire
  prompt: Why partition seats by event_id?
  choices:
    - text: Every hold and confirm touches one event, so operations stay single-partition, and hot events can be isolated
      correct: true
    - text: To make every event the same size
      why: Events vary hugely in size.
    - text: To allow cross-event transactions
      why: Partitioning by event avoids needing them.
    - text: Because seat IDs repeat across events
      why: The composite key handles that anyway.
  explanation: The shard key follows the unit of contention and transaction — the event.
- kind: fire
  prompt: During a primary failover, what should hold requests do?
  choices:
    - text: Fail fast with a retry message; never decide holds from replicas or caches
      correct: true
    - text: Use the replica to grant holds temporarily
      why: Replicas may be stale, risking double holds.
    - text: Queue them indefinitely
      why: Users need prompt feedback, and the queue could grow without bound.
    - text: Grant every hold and reconcile later
      why: That violates the invariant.
  explanation: Choose consistency over availability for ownership transitions, while browsing stays available.
- kind: fire
  level: advanced
  prompt: Payments are added. Which design keeps the invariant and handles failures?
  choices:
    - text: A saga — keep the hold, charge with an idempotency key, then confirm; release the hold if the charge fails; refund if confirmation fails after charging
      correct: true
    - text: Charge the card inside the database transaction that confirms the seat
      why: External calls inside transactions hold locks and can't be rolled back.
    - text: Confirm first, then charge later in a batch job
      why: That gives away seats without payment, and the batch could fail.
    - text: Use two-phase commit with the payment provider
      why: Providers don't participate in your 2PC.
  explanation: Cross-system workflows use sagas with idempotent steps and compensations.
- kind: fire
  type: order
  prompt: Order the hold flow for an admitted user during an on-sale.
  items:
    - Browse the cached seat map
    - Click a seat, sending a hold request to the API
    - Run the conditional UPDATE on the primary using the database clock
    - On 1 row, return hold_id and expiry; on 0 rows, say the seat was taken
    - The user confirms before expiry with a booking_id
  explanation: A stale view, an authoritative transition, an honest result, then a retry-safe confirmation.
```
