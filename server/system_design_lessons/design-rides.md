---
id: design-rides
category: casebook
skill: concurrency
title: Design a ride-hailing service
minutes: 20
summary: Uber-style ride hailing combines three very different workloads — a firehose of ephemeral driver locations, a latency-sensitive geospatial matching problem with a hard invariant (one active trip per driver), and a durable trip state machine that money depends on. Each gets the storage and consistency model it needs.
objectives:
  - Separate ephemeral location data, matching and durable trip state, and size each
  - Design location ingestion and an in-memory geo index sharded by region
  - Match riders to drivers with offers and an atomic, lease-based assignment
  - Model the trip lifecycle durably and handle city-level hotspots
sources:
  - ['Uber engineering: H3 — hexagonal hierarchical spatial index', 'https://www.uber.com/blog/h3/']
  - ['Uber engineering: How Uber’s real-time market platform scales (Ringpop)', 'https://www.uber.com/blog/ringpop-open-source-nodejs-library/']
  - ['Lyft engineering: Matchmaking in Lyft Line', 'https://eng.lyft.com/matchmaking-in-lyft-line-9c2635fe62c4']
case: rides
---

## 1. Requirements

- Drivers go online and send locations; riders request a ride from A to B; the system offers the trip to a nearby driver, who accepts; both see live progress; the trip completes and is paid.
- **800k drivers online at peak**, a location every **4 s**; ~20k requests/min in the largest cities at peak.
- Match within a few seconds. **A driver is never assigned two active trips; a trip never has two drivers.**
- Trip state is durable and survives server failures; riders see the driver's position every few seconds.

```sort
prompt: What storage and consistency does each kind of data need?
buckets: [Ephemeral, in memory, Durable and strongly consistent, Durable, eventually consistent / analytical]
items:
  - {text: "A driver's current position", bucket: 0, why: 'Overwritten every 4 s and worthless after ~30 s. Keep the latest in memory with a TTL.'}
  - {text: 'Trip 991: rider, driver, state, pickup and drop-off, fare', bucket: 1, why: 'Money and disputes depend on it. Use transactional storage with atomic state transitions.'}
  - {text: "A driver's availability (free, offered, on trip)", bucket: 1, why: 'Guards the one-trip-per-driver invariant, so changes must be atomic.'}
  - {text: 'GPS breadcrumbs of every trip for receipts and fraud analysis', bucket: 2, why: 'High volume, append-only. Stream to a log and a cheap store; not on the hot path.'}
  - {text: 'Demand heatmap per hexagon for surge pricing', bucket: 2, why: 'Aggregates computed continuously from events. Slight lag is fine.'}
```

## 2. Estimates

```calc
title: Location firehose
prompt: '**800,000** drivers each send a location every **4 seconds**. Each update is about **100 bytes**. What ingress bandwidth does the location service handle, in **MB/s**?'
answer: 20
unit: MB/s
tolerance: 1.02
steps: |
  800,000 ÷ 4 = 200,000 updates/s × 100 B = **20 MB/s**. The bandwidth is easy; the **update rate** is the challenge for any disk-backed spatial index. Holding the latest positions in memory needs only 800k × ~200 B ≈ 160 MB per copy — trivial — so the design question is sharding by geography and handling fan-out to riders watching drivers.
```

## 3. Architecture

```arch
title: Ride hailing core
nodes:
  - {id: driver, label: Driver app, kind: client, x: 0, y: 0}
  - {id: loc, label: Location service, kind: service, x: 1, y: 0, note: 'sharded by city'}
  - {id: geo, label: Geo index, kind: cache, x: 2, y: 0, note: 'H3 cell → drivers, TTL'}
  - {id: stream, label: Location stream, kind: stream, x: 3, y: 0}
  - {id: rider, label: Rider app, kind: client, x: 0, y: 2}
  - {id: trip, label: Trip service, kind: service, x: 1, y: 2}
  - {id: match, label: Matching, kind: service, x: 2, y: 1}
  - {id: db, label: Trips DB, kind: db, x: 2, y: 2, note: 'state machine'}
  - {id: push, label: Push gateway, kind: service, x: 3, y: 1}
edges:
  - [driver, loc, 'location / 4 s']
  - [loc, geo, 'upsert']
  - [loc, stream, 'append']
  - [rider, trip, 'request ride']
  - [trip, match, 'find driver']
  - [match, geo, 'nearby']
  - [match, db, 'assign (atomic)']
  - [push, driver, 'offer']
  - [push, rider, 'driver position']
paths:
  - label: Request and match
    steps:
      - [rider, trip, 'POST /trips {pickup, dropoff} with an idempotency key → trip 991 created in state REQUESTED']
      - [trip, match, 'Matching for the pickup''s city shard']
      - [match, geo, 'Look up drivers in the pickup''s H3 cell and expanding rings; filter available ones; rank by ETA']
      - [match, db, 'Atomically reserve the best driver: driver free → OFFERED(991), lease 15 s']
      - [push, driver, 'Send the offer to the driver''s app; accept within 15 s or the offer moves to the next candidate']
      - [match, db, 'On accept: trip REQUESTED → ACCEPTED with this driver, and driver OFFERED → ON_TRIP, in one transaction']
```

## 4. Deep dive: never double-assign

```timeline
title: Two requests reach the same driver
lanes: [Matcher A (rider 1), Matcher B (rider 2), Drivers table]
state: {'Driver 7': free}
steps:
  - {lane: Matcher A (rider 1), to: Drivers table, text: 'both see driver 7 as nearest and free (from the geo index)'}
  - {lane: Matcher A (rider 1), to: Drivers table, text: "UPDATE drivers SET state='offered', trip=991, offer_expires=now()+15s WHERE id=7 AND state='free' → 1 row", set: {'Driver 7': 'offered to trip 991'}}
  - {lane: Matcher B (rider 2), to: Drivers table, text: 'same UPDATE for trip 992 → 0 rows'}
  - {lane: Matcher B (rider 2), to: Matcher B (rider 2), text: 'fall through to the next candidate, driver 12'}
find:
  prompt: What guarantees that only one trip gets driver 7?
  answer: 1
  explain: |
    The geo index is a hint (it may be seconds stale). The decision is the conditional UPDATE at the authoritative drivers record, which the database serialises, so exactly one matcher's `WHERE state='free'` is true. The offer carries an expiry, so a driver who never responds is released automatically — checked by the predicate, not by a cleanup job.
```

```predict
prompt: The driver accepts at second 14.9 of a 15-second offer, but their phone is on a slow network and the accept arrives at second 15.3. Meanwhile the matcher, seeing the offer expired, offered the trip to another driver. What should happen?
choices:
  - Both drivers get the trip
  - The late accept fails its condition (offer for this driver and trip, not expired, by the server clock) and the driver is told the offer has gone
  - The first driver always wins because they pressed first
  - The trip is cancelled
answer: 1
reveal: |
  Just like seat holds: the accept is a conditional update — `trip.state = REQUESTED AND offer.driver = me AND offer.expires_at >= now()` — judged by one authoritative clock. A slow network loses the race fairly and deterministically. A generous offer window and a "still available?" re-offer improve the experience.
```

## 5. The trip state machine

```order
prompt: Order a normal trip's states.
items:
  - REQUESTED — the rider asked; matching in progress
  - ACCEPTED — a driver accepted the offer (atomic with driver ON_TRIP)
  - ARRIVED — the driver is at pickup
  - IN_PROGRESS — the rider is on board
  - COMPLETED — dropped off; fare finalised and payment triggered (via an outbox)
explain: Each transition is a conditional update from an expected state (so duplicate or late events can't move a trip backwards), with side effects — notifications, payment, receipts — published through an outbox. Cancellations branch off from REQUESTED, ACCEPTED or ARRIVED with their own fees and rules.
```

```bug
title: Trip transition handler
prompt: Which lines let a trip get into an impossible state?
lang: python
code: |
  def complete_trip(trip_id, driver_id, fare):
      trip = db.get_trip(trip_id)
      trip.state = "COMPLETED"
      trip.fare = fare
      db.save(trip)
      payments.charge(trip.rider_id, fare)
bug: [3, 6]
explain: |
  **Line 3** sets COMPLETED without checking the current state or the driver. A duplicate or stale request can "complete" a cancelled trip, or a trip belonging to another driver. Use `UPDATE trips SET state='COMPLETED' … WHERE id=? AND driver_id=? AND state='IN_PROGRESS'` and check the row count. **Line 6** charges synchronously after saving, with no idempotency: a retry charges twice, and a crash between save and charge means no charge at all. Publish a TripCompleted event through an outbox in the same transaction, and charge idempotently keyed by the trip ID.
```

## 6. Hotspots and scale

- **Shard by city (or region):** matching, locations and supply-demand are local, so a city maps to a set of shards, and huge cities split further by cell ranges.
- **Events end (concerts, flights landing):** demand spikes in a few cells. Surge pricing (from per-hexagon supply and demand) rebalances supply; matching expands rings and may batch requests every second or two to optimise assignments globally.
- **Rider tracking:** the push gateway sends the assigned driver's position only to that trip's rider, not to everyone nearby.

```interview
ask: How would you design location tracking, driver matching and trip management for a ride-hailing service at scale while preventing conflicting driver assignments?
say: |
  "Three workloads. Locations: 200k updates/s into a location service sharded by city, keeping each driver's latest position in an in-memory H3-cell index with a TTL and streaming breadcrumbs to Kafka. Matching: look up the pickup cell and expanding rings, rank available drivers by ETA, and reserve one with a conditional update — free → offered, with a 15-second expiry — so two trips can never get one driver. Acceptance is another conditional transaction that moves the trip to ACCEPTED and the driver to ON_TRIP. Trips are a durable state machine in a transactional database, each transition conditional on the expected state, with side effects like payment via an outbox and idempotent charges."
followups:
  - q: Why not put locations in the trips database?
    a: 200k writes a second of data that's useless after seconds would overload a transactional store for no benefit. Keep the latest in memory, and history in a log.
  - q: What if the geo index says a driver is free but they just took another trip?
    a: The index is a hint. The conditional reservation on the authoritative driver record fails, and matching moves to the next candidate.
  - q: How do you handle a stadium emptying?
    a: Finer cells and dedicated shards for the area, surge pricing to attract supply, batched matching to optimise assignments, and admission control on requests if needed.
weak: |
  Writes every location to the main database, matches by querying it with distance calculations, and assigns drivers with read-then-write.
strong: |
  Separates ephemeral, transactional and analytical data; uses an in-memory cell index sharded by city; reserves drivers with conditional updates and expiring offers; enforces a state machine with conditional transitions; and plans for hotspots.
```

```recall
prompt: Explain how the system guarantees a driver is never assigned to two trips at the same time, even though matching runs on many servers using slightly stale location data.
points:
  - The geo index (possibly stale) only proposes candidates; it never decides assignment
  - Reservation is a conditional update on the authoritative driver record (state must be free), so exactly one concurrent attempt succeeds
  - Offers carry an expiry checked in the predicates, so unresponsive drivers are released without relying on cleanup jobs
  - Acceptance atomically moves the driver to ON_TRIP and the trip to ACCEPTED in one transaction, conditional on the offer still being valid
model: |
  Matchers read the in-memory geo index to find nearby candidates, but that index is only a hint and may be a few seconds out of date. To claim a driver, a matcher runs a conditional update on the driver's authoritative record — set offered to this trip WHERE state is free. The database serialises concurrent attempts, so only one succeeds and the others move on to their next candidate. The offer has an expiry time that the predicates check against the server clock, so a driver who doesn't respond is freed automatically. When the driver accepts, one transaction moves the driver to ON_TRIP and the trip to ACCEPTED, but only if that offer is still current and unexpired.
```

```bug
style: critique
title: A candidate's ride-hailing design
prompt: The candidate describes matching riders to drivers. Which claims would you push back on?
lang: text
code: |
  Drivers send location every 4 seconds to a location service that keeps the latest position in memory, indexed by geohash cell.
  Every location update is also written synchronously to the trips database.
  Matching queries nearby cells for available drivers and offers the trip to the best one.
  Two concurrent requests may offer the same driver; whichever accept arrives first wins, and the other rider is re-matched.
  A driver is assigned with a conditional write: set trip only if the driver's current trip is empty.
  Busy downtown cells are split more finely so each cell holds a manageable number of drivers.
bug: [2, 4]
explain: |
  **Line 2:** location pings are a firehose of ephemeral data (hundreds of thousands per second); writing each one to the transactional database overloads it for no benefit. Keep the latest location in memory and sample to a log for analytics. **Line 4:** "first accept wins" with no atomic guard is how a driver ends up double-assigned. The conditional write in line 5 is what must decide, and offers should reserve the driver briefly so two riders are never offered the same one.
```

```questions
- kind: check
  type: numeric
  prompt: 1.2M drivers send a location every 3 seconds. How many updates per second is that?
  answer: 400000
  unit: updates/s
  tolerance: 0.01
  explanation: 1,200,000 ÷ 3 = 400,000/s. Keep the latest positions in memory and stream history elsewhere.
- kind: check
  prompt: Where should a driver's current location be stored?
  choices:
    - text: In an in-memory geo index (by cell) with a TTL, sharded by region
      correct: true
    - text: In the transactional trips database, updated every few seconds
      why: That's a high write rate for data that's obsolete within seconds.
    - text: Only on the driver's phone
      why: Matching needs a server-side view.
    - text: In the data warehouse
      why: That's far too slow for matching.
  explanation: Ephemeral, high-churn data belongs in memory. Durable history goes to a log.
- kind: check
  type: multi
  prompt: Which make driver assignment safe under concurrency? Select all that apply.
  choices:
    - text: A conditional update requiring the driver to be free
      correct: true
    - text: Offers with an expiry checked by the server clock
      correct: true
    - text: Acceptance that atomically updates both the trip and the driver
      correct: true
    - text: Trusting the geo index's availability flag
      why: It's a hint, and may be stale.
  explanation: Decisions happen at the authority, atomically, with expiring holds.
- kind: check
  type: order
  prompt: Order the trip states.
  items:
    - REQUESTED
    - ACCEPTED
    - ARRIVED
    - IN_PROGRESS
    - COMPLETED
  explanation: Each transition is conditional on the previous state, so stale or duplicate events can't skip or reverse states.
- kind: fire
  prompt: A duplicate "complete trip" request arrives after the trip was already completed and charged. What prevents a second charge?
  choices:
    - text: The transition requires state IN_PROGRESS (it now matches 0 rows), and the charge is idempotent on the trip ID
      correct: true
    - text: Payment processors never charge twice
      why: They will, unless you send an idempotency key.
    - text: The driver app prevents double taps
      why: Clients can't be relied on — retries and network issues create duplicates.
    - text: Nothing
      why: That's the bug to avoid.
  explanation: Conditional transitions plus idempotent side effects make duplicate events harmless.
- kind: fire
  prompt: Why shard matching by city or region?
  choices:
    - text: Supply, demand and matching are local, so each shard owns its area's data and hotspots stay contained
      correct: true
    - text: To make cities equal in size
      why: They aren't, and big cities split further.
    - text: Because drivers can't cross city lines
      why: They can. Shards handle boundaries with neighbouring lookups.
    - text: For billing
      why: Unrelated.
  explanation: Geographic locality is the natural partition for location-based marketplaces.
- kind: fire
  prompt: A driver's accept arrives after their offer expired and the trip was re-offered. What should happen?
  choices:
    - text: The accept's conditional update fails; tell the driver the offer has gone
      correct: true
    - text: Assign both drivers
      why: That breaks the invariant.
    - text: Prefer the first driver because they tapped first
      why: Client tap times aren't authoritative.
    - text: Cancel the trip
      why: The second offer may succeed.
  explanation: One authoritative clock inside an atomic predicate makes the outcome deterministic.
- kind: fire
  level: advanced
  prompt: A concert ends and 30,000 ride requests hit a few hexagons within ten minutes. What helps most?
  choices:
    - text: Surge pricing from per-cell supply and demand, batched matching every few seconds, and finer shards for the hotspot
      correct: true
    - text: Matching each request strictly first-come-first-served in isolation
      why: Greedy one-by-one matching gives worse global assignments under heavy load.
    - text: Disabling the geo index
      why: Then matching scans everything.
    - text: Telling riders to walk
      why: That's not a system design.
  explanation: Hotspots need economic and algorithmic responses, plus capacity focused where demand is.
- kind: fire
  type: multi
  prompt: Which side effects of completing a trip should go through an outbox? Select all that apply.
  choices:
    - text: Charging the rider
      correct: true
    - text: Sending the receipt email
      correct: true
    - text: Updating the driver's earnings
      correct: true
    - text: Changing the trip's state to COMPLETED
      why: That's the transaction itself, not a side effect of it.
  explanation: Commit the state change and the intent to act together. Perform the effects asynchronously and idempotently.
```
