---
id: concurrent-holds
category: distributed
skill: concurrency
title: Holds, expiry and contended inventory
minutes: 16
summary: Booking a seat, reserving stock or claiming a time slot is the same problem — many requests race for something scarce, a temporary hold must expire reliably, and confirmation must check ownership, state and deadline in one atomic step. Get the predicate right at the authority, use one clock, and design for the stampede when ten thousand people want the last item.
objectives:
  - Write atomic claim and confirm predicates that hold under concurrency and retries
  - Make expiry correct without depending on cleanup jobs, using a single authoritative clock
  - Choose between conditional writes, row locks and distributed locks for holds
  - Handle extreme contention (flash sales) with queueing, waiting rooms and pre-allocated inventory
sources:
  - ['PostgreSQL: Explicit locking (FOR UPDATE, SKIP LOCKED)', 'https://www.postgresql.org/docs/current/explicit-locking.html']
  - ['Amazon DynamoDB: Condition expressions', 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html']
  - ['Cloudflare: Waiting Room', 'https://developers.cloudflare.com/waiting-room/']
case: seats
---

> [!story] The concert that sold out in 90 seconds — twice
> A ticketing site checked seat availability with a SELECT, then wrote the booking. On a normal day the race window was a few milliseconds and nobody noticed. For a stadium tour on-sale, 1.4 million people arrived in the first minute, many clicking the same front-row seats. Hundreds of seats were sold to two or three people each. The fix wasn't faster servers — it was moving the check into the write, and putting a queue in front of the on-sale so the database saw thousands of requests a second instead of a million.

## Claim: the condition and the change are one statement

Holding seat 14C must succeed for exactly one request, even if 500 arrive in the same millisecond across 40 servers:

```sql
UPDATE seats
SET    status = 'held', held_by = $user, hold_id = $hold_id,
       hold_expires_at = now() + interval '5 minutes'
WHERE  event_id = $event AND seat_id = $seat
  AND  (status = 'available'
        OR (status = 'held' AND hold_expires_at < now()))   -- an expired hold is claimable
RETURNING hold_id;
-- 1 row: you hold it.  0 rows: someone else does.
```

The database serialises updates to that row, so exactly one request's predicate is true. No application-level lock is needed — and none would work on its own, because a mutex inside one process can't coordinate 40 servers.

```timeline
title: Two users, one seat, two designs
lanes: [User A, User B, Database]
state: {'Seat 14C': available, 'Holds granted': '0'}
steps:
  - {lane: User A, to: Database, text: 'SELECT status → available'}
  - {lane: User B, to: Database, text: 'SELECT status → available'}
  - {lane: User A, to: Database, text: "UPDATE seats SET status='held' WHERE seat='14C'", set: {'Seat 14C': 'held by A', 'Holds granted': '1'}}
  - {lane: User B, to: Database, text: "UPDATE seats SET status='held' WHERE seat='14C'", set: {'Seat 14C': 'held by B', 'Holds granted': '2 ⚠'}}
find:
  prompt: Which step creates the double hold?
  answer: 3
  explain: |
    B's update has no condition, so it overwrites A's hold based on a stale read. Put the check in the write — `… WHERE seat = '14C' AND status = 'available'` — and B's update matches 0 rows, so B is told the seat has gone. (Alternatively `SELECT … FOR UPDATE` makes B wait for A's transaction and then see 'held'.)
```

## Confirm: check everything, once

Confirmation turns a hold into a booking. The predicate must check **who**, **which hold**, **what state** and **the deadline** together, and be safe to retry:

```sql
UPDATE seats
SET    status = 'booked', booking_id = $booking_id
WHERE  event_id = $event AND seat_id = $seat
  AND  status = 'held'
  AND  hold_id = $hold_id          -- this specific hold, not just this user
  AND  held_by = $user
  AND  hold_expires_at >= now()    -- the authority's clock, not the browser's
RETURNING booking_id;
```

If it updates 0 rows, look at the row to answer the user: already booked with this `booking_id`? Return success (it was a retry). Expired, or held by someone else? Explain that.

```bug
title: A hold-and-confirm service
prompt: Which lines let a seat be double-booked, or let an expired hold be confirmed?
lang: python
code: |
  def confirm(user, seat_id, client_now):
      seat = db.get_seat(seat_id)
      if seat.held_by != user.id:
          raise NotYourHold()
      if seat.hold_expires_at < client_now:
          raise HoldExpired()
      db.execute("UPDATE seats SET status='booked' WHERE id=%s", seat_id)
      return {"status": "booked"}
bug: [5, 7]
explain: |
  **Line 5** trusts the *client's* clock: a user whose device clock is ten minutes slow can confirm an expired hold. Expiry must use one authoritative clock — the database's `now()`. **Line 7** is an unconditional write after a read: between the checks and the UPDATE the hold can expire and be re-claimed by someone else, and this overwrites their hold. Put every check in the UPDATE's WHERE clause and test the affected row count. It's also not retry-safe: a lost response followed by a retry should return the existing booking, not an error.
fix: |
  def confirm(user, seat_id, hold_id, booking_id):
      row = db.execute("""UPDATE seats SET status='booked', booking_id=%s
                          WHERE id=%s AND status='held' AND hold_id=%s AND held_by=%s
                            AND hold_expires_at >= now() RETURNING booking_id""",
                       booking_id, seat_id, hold_id, user.id)
      if row:
          return {"status": "booked", "booking_id": row.booking_id}
      current = db.get_seat(seat_id)
      if current.status == "booked" and current.booking_id == booking_id:
          return {"status": "booked", "booking_id": booking_id}   # retried confirmation
      raise HoldNoLongerValid(current.status)
```

## Expiry without trusting the cleanup job

A background job that resets expired holds to `available` is useful for tidiness and for accurate seat maps — but **correctness must not depend on it**. If the job is down for an hour, expired holds must still be unconfirmable (the confirm predicate checks the deadline) and claimable by others (the claim predicate treats expired holds as free).

```predict
prompt: The hold-cleanup job crashed at 10:00 and nobody noticed until 11:00. A user whose hold expired at 10:05 clicks "Confirm" at 10:30. With the predicates above, what happens?
choices:
  - The booking succeeds because the hold row still says 'held'
  - The confirm matches 0 rows because hold_expires_at < now(), and the user is told the hold expired
  - The database crashes
  - The seat becomes available to everyone except this user
answer: 1
reveal: |
  Expiry is evaluated at decision time, inside the conditional update, using the database clock. The cleanup job is only housekeeping; the seat could have been claimed by someone else at 10:06, because the claim predicate also treats expired holds as available. Correctness lives in the predicates, not in the timeliness of background work.
```

## Choosing a mechanism

```sort
prompt: Which mechanism fits each situation best?
buckets: [Conditional UPDATE at the database, Row lock (SELECT … FOR UPDATE), Distributed lock service]
items:
  - {text: 'Claim one seat if it is free', bucket: 0, why: 'One row, one atomic predicate. The simplest correct answer.'}
  - {text: 'Hold four adjacent seats together, all or nothing', bucket: 1, why: 'Lock the rows in seat-ID order inside a transaction, check all four, then update. A conditional multi-row update with a count check also works.'}
  - {text: 'Ensure only one instance of the nightly seat-release job runs at a time', bucket: 2, why: 'Coordinating processes rather than rows — a lease from etcd or ZooKeeper, with idempotent work.'}
  - {text: 'Decrement stock for one SKU when an order is placed', bucket: 0, why: '`UPDATE … SET stock = stock - 1 WHERE sku = ? AND stock > 0` checks and decrements atomically.'}
```

## When everyone wants the same thing

A conditional update is correct under any contention, but **correctness isn't capacity**. If 200,000 requests a second hit the same few hundred rows, they serialise on row locks, connection pools fill, latencies explode and the database becomes the bottleneck for everyone, including people buying other things.

Patterns for flash sales and on-sales:

- **Virtual waiting room:** admit users at a rate the backend can handle (e.g. 2,000/min), queue the rest with an honest position, and randomise arrival order within the opening window so bots gain nothing from being early.
- **Pre-allocate inventory into tokens:** for 10,000 identical units, put 10,000 tokens in a fast store (Redis list, `DECR` counter) and let a request proceed to the database only if it pops a token. The database sees about 10,000 requests, not 2 million. Reconcile tokens with the durable store afterwards.
- **Shard hot inventory:** split one SKU's stock across N rows (`stock_shard_0..N-1`) and decrement a random one, falling back to others when a shard is empty.
- **Hold briefly, release reliably:** short hold windows (2–10 minutes) keep inventory moving; abandoned carts return stock automatically.

```calc
title: How long is the queue?
prompt: For a ticket on-sale, **900,000** users enter the waiting room at opening. The backend can complete **3,000** purchase flows per minute. With fair random ordering, how many **hours** does the last person wait (ignoring people who leave)?
answer: 5
unit: hours
tolerance: 1.03
steps: |
  900,000 ÷ 3,000 = 300 minutes = **5 hours**. Tickets will run out long before that, so a good waiting room tells people their position, estimates whether inventory is likely to remain, and stops admitting once everything is held or sold — instead of letting 900,000 people wait five hours for nothing.
```

```incident
title: Flash sale at noon
intro: |
  12:00:00. A limited sneaker drop: 5,000 pairs, one SKU per size. Traffic jumps from 2k to 180k requests/s. The orders database CPU is at 100%, p99 checkout latency is 14 s, and other products' checkouts are also failing.
start: s1
nodes:
  s1:
    text: First move?
    options:
      - {label: 'Turn on the waiting room for the drop page, admitting 1,500 users per minute', next: s2, quality: good, note: 'Protects the database and the rest of the store immediately.'}
      - {label: 'Scale the API from 50 to 300 instances', next: bad1, quality: bad, note: 'More instances send more concurrent updates to the same hot rows.'}
      - {label: 'Increase the database connection limit from 500 to 5,000', next: bad2, quality: bad, note: 'Thousands more connections contending on the same row locks and the same CPUs.'}
  bad1:
    text: Lock waits double, connections hit the database's limit, and errors rise to 70%, now affecting every checkout.
    options:
      - {label: 'Enable the waiting room', next: s2, quality: good}
  bad2:
    text: The database spends its time context-switching and managing lock queues. Throughput drops while latency rises.
    options:
      - {label: 'Enable the waiting room', next: s2, quality: good}
  s2:
    text: The database recovers to 60% CPU and the rest of the store is healthy. Admitted users still contend on 12 size rows. Next?
    options:
      - {label: 'Pre-load per-size token counters in Redis; only users who get a token reach the database transaction', next: s3, quality: good, note: 'The database sees about 5,000 purchase transactions instead of hundreds of thousands of attempts.'}
      - {label: 'Remove the conditional check to make updates faster', next: bad3, quality: bad, note: 'Fast and wrong: oversells.'}
  bad3:
    text: You sell 7,300 pairs of a 5,000-pair drop. Customer service will spend a week cancelling orders.
    verdict: bad
  s3:
    text: All 5,000 pairs are held within 4 minutes. Some held carts are abandoned. What happens to them?
    options:
      - {label: 'Holds expire after 10 minutes; the expired tokens return to the counter and the queue admits more users', next: done, quality: good}
      - {label: 'Manually release them tomorrow', next: done2, quality: ok}
  done:
    text: Sold out cleanly at 12:31 with no oversells, and the rest of the store never noticed.
    verdict: good
  done2:
    text: Correct, but 400 pairs sit in dead carts while real customers are told it's sold out. Automate expiry next time.
    verdict: ok
debrief: |
  Correctness comes from atomic predicates at the authority; **capacity** comes from controlling how many requests reach it. Waiting rooms and pre-allocated tokens protect the database, and reliable expiry keeps scarce inventory moving.
```

```interview
say: |
  "Holding a seat is one conditional UPDATE: set held, hold ID and expiry WHERE the seat is available or its hold has expired, using the database's now(). Confirm is another conditional UPDATE checking status, hold ID, user and hold_expires_at ≥ now(), with a client booking ID so retries return the same booking. The cleanup job only tidies the seat map — correctness never depends on it. For big on-sales, a waiting room admits users at the rate the database can serve, and for general admission we pre-allocate inventory tokens in Redis so only token holders reach the transaction."
followups:
  - q: Why not a Redis lock per seat?
    a: The database row is already a perfectly good lock with the right scope, and the conditional write is atomic at the authority. A separate lock adds a second system that can disagree with the data, and needs fencing to be safe.
  - q: Whose clock decides expiry?
    a: One authoritative clock — the database's — evaluated inside the conditional write. Never the client's, and never comparisons across application servers' clocks.
  - q: What if 500k people want the last 1,000 seats?
    a: The predicates stay correct, but you protect capacity with a waiting room and admission control, give honest queue positions, and stop admitting once everything is held.
weak: |
  "Check availability, then book it; use a lock if needed." Read-then-write races, client clocks, expiry dependent on cron, and no plan for stampedes.
strong: |
  Atomic claim and confirm predicates at the authority, one clock, retry-safe confirmation, expiry correct without cleanup, the right lock scope, and explicit capacity protection for flash crowds.
```

```recall
prompt: Write out (in words) every condition a seat confirmation must check, and explain why they must all be checked in one atomic statement.
points:
  - The seat is currently in the held state
  - The hold is this specific hold (hold ID) and belongs to this user
  - The hold hasn't expired, judged by the authoritative database clock
  - All checks and the state change happen atomically (one conditional update or locked transaction), otherwise the hold can expire or be re-claimed between check and write; retries return the existing booking
model: |
  Confirmation must verify that the seat is still in the held state, that the hold is the specific hold being confirmed (matching hold ID) and belongs to the requesting user, and that its expiry time is still in the future according to the database's clock. These conditions go in the WHERE clause of the same UPDATE that sets the seat to booked, and the code checks that exactly one row changed. If they're checked in a separate read first, the hold can expire and someone else can claim the seat in between, and the unconditional write would steal their seat. A booking ID supplied by the client lets a retried confirmation recognise it already succeeded.
```

```questions
- kind: check
  prompt: Which statement correctly claims an available seat under concurrency?
  choices:
    - text: "`UPDATE seats SET status='held', held_by=? WHERE id=? AND status='available'`, then check that 1 row changed"
      correct: true
    - text: SELECT the seat, check it's available in code, then UPDATE it unconditionally
      why: Two requests can both pass the check before either writes.
    - text: Lock a mutex in the API process, then update
      why: Requests on other servers don't share that mutex.
    - text: INSERT a hold row without any uniqueness constraint
      why: Duplicates can be inserted concurrently.
  explanation: Putting the check inside the write lets the database serialise it. Exactly one request matches.
- kind: check
  type: multi
  prompt: Which conditions belong in a hold confirmation's WHERE clause? Select all that apply.
  choices:
    - text: status = 'held'
      correct: true
    - text: hold_id matches the hold being confirmed
      correct: true
    - text: held_by matches the requesting user
      correct: true
    - text: hold_expires_at >= now() (database clock)
      correct: true
    - text: hold_expires_at >= the client's timestamp
      why: Client clocks can be wrong or manipulated.
  explanation: The transition must re-validate the current entitlement atomically, using one authoritative clock.
- kind: check
  prompt: The cleanup job that releases expired holds is down. What must still be true?
  choices:
    - text: Expired holds can't be confirmed and can be claimed by others, because the predicates check expiry themselves
      correct: true
    - text: Expired holds remain valid until the job runs
      why: That makes correctness depend on background timing.
    - text: All seats become unavailable
      why: Claims treat expired holds as available.
    - text: Confirmations must be blocked until the job is fixed
      why: Not if the predicates handle expiry.
  explanation: Background jobs tidy up. Decisions evaluate expiry at the moment they're made.
- kind: check
  type: numeric
  prompt: 600,000 users join a waiting room and the backend completes 4,000 purchase flows per minute. How many minutes until the last user is admitted?
  answer: 150
  unit: minutes
  tolerance: 0.02
  explanation: 600,000 ÷ 4,000 = 150 minutes. Inventory usually runs out first, so communicate likely availability and stop admitting when it's gone.
- kind: fire
  prompt: A confirmation's response is lost and the client retries. What should the service return?
  choices:
    - text: The existing booking, recognised by the client-supplied booking ID
      correct: true
    - text: An error saying the seat is no longer held
      why: That's technically true, but the user did book it. Tell them so.
    - text: A second booking
      why: The seat can only have one booking.
    - text: Nothing
      why: The client needs an answer.
  explanation: Retry-safe confirmation checks whether the seat is already booked with this booking ID and returns that result.
- kind: fire
  prompt: During a flash sale, 200,000 requests per second contend on 12 inventory rows and the database saturates. What helps most immediately?
  choices:
    - text: Admission control (a waiting room) so only a sustainable rate reaches the database
      correct: true
    - text: Scale out the API servers
      why: That increases contention on the same rows.
    - text: Raise the database connection limit
      why: More concurrent contenders on the same locks makes it worse.
    - text: Remove the conditional check
      why: That oversells.
  explanation: Correctness is already handled by predicates. Capacity needs fewer concurrent attempts reaching the hot rows.
- kind: fire
  prompt: Why pre-allocate 10,000 inventory tokens in Redis for a 10,000-unit drop?
  choices:
    - text: Only requests that pop a token reach the database, so it handles about 10,000 transactions instead of millions of attempts
      correct: true
    - text: Redis replaces the database as the source of truth
      why: The durable store remains authoritative. Tokens gate access and are reconciled afterwards.
    - text: It makes holds permanent
      why: Holds still expire, and expired holds return their tokens.
    - text: It prevents bots entirely
      why: Bot defence needs separate controls.
  explanation: A cheap, fast gate in front of the expensive, correct path shields the database from hopeless attempts.
- kind: fire
  level: advanced
  prompt: A customer holds 4 adjacent seats (all or nothing). How do you avoid deadlocks while locking them?
  choices:
    - text: Lock the rows in a consistent order (e.g. by seat ID) in one transaction, check all, then update
      correct: true
    - text: Lock them in the order the user clicked
      why: Two users locking overlapping seats in different orders can deadlock.
    - text: Use four separate transactions
      why: Then it's no longer all or nothing.
    - text: Skip locking because conditional updates suffice for groups
      why: A single conditional multi-row update can work, but it needs a count check. Separate per-row updates break atomicity.
  explanation: A consistent lock order removes deadlock cycles, and one transaction gives all-or-nothing behaviour.
- kind: fire
  type: multi
  prompt: Which make waiting-room queues fair and resistant to bots? Select all that apply.
  choices:
    - text: Randomising order among everyone who arrives before the sale opens
      correct: true
    - text: Admitting users at a fixed sustainable rate
      correct: true
    - text: Showing honest queue positions and stopping admission when inventory is gone
      correct: true
    - text: Admitting whoever refreshes fastest
      why: That rewards bots and hammers the system.
  explanation: Randomised entry removes the advantage of being early or automated, and rate-limited admission protects the backend.
```
