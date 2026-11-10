---
id: clocks-ordering
category: distributed
skill: concurrency
title: Time, clocks and ordering
minutes: 22
summary: Machines don't share a clock, and the one they have lies quietly. Time-of-day clocks jump and drift, so sorting events by timestamp loses acknowledged writes; monotonic clocks measure durations but mean nothing across machines; logical clocks and version vectors order events by what could have influenced what. When an agreed order must be final, you need total order broadcast, which is consensus in disguise.
objectives:
  - Choose between time-of-day and monotonic clocks, and say how wrong a clock reading can be
  - Show how last-write-wins on timestamps drops a causally later write, and what each alternative keeps
  - Order events with Lamport timestamps and detect concurrency with version vectors
  - Explain why uniqueness needs total order broadcast, and how Spanner's TrueTime waits out clock uncertainty
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapters 8 and 9', 'https://dataintensive.net/']
  - ['Lamport, Time, Clocks, and the Ordering of Events in a Distributed System (1978)', 'https://lamport.azurewebsites.net/pubs/time-clocks.pdf']
  - ['Corbett et al., Spanner: Google’s Globally Distributed Database', 'https://research.google/pubs/spanner-googles-globally-distributed-database-2/']
  - ['Cloudflare: How and why the leap second affected Cloudflare DNS', 'https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/']
---

> [!incident] The second that went backwards
> At midnight UTC on 1 January 2017 a leap second was inserted. Cloudflare's DNS software measured elapsed time by subtracting two readings of the wall clock and assumed the result could never be negative. Around the leap second it was, a code path that should have been impossible ran, and a share of DNS lookups failed until the fix rolled out. Nothing was wrong with the network or the hardware. A program had treated "time of day" as if it were a stopwatch.

## Two clocks, two jobs

A machine has two kinds of clock, and mixing them up is the commonest mistake.

| | Time-of-day clock | Monotonic clock |
|---|---|---|
| Answers | "What is the date and time?" | "How long since some arbitrary starting point?" |
| Examples | `System.currentTimeMillis()`, `clock_gettime(CLOCK_REALTIME)` | `System.nanoTime()`, `clock_gettime(CLOCK_MONOTONIC)` |
| Can jump backwards | Yes: NTP resets, leap seconds, a user changing it | Never. It may speed up or slow down slightly (up to about 0.05% under NTP slewing) |
| Comparable across machines | Only as far as NTP keeps them in step | No. The absolute value is meaningless |
| Use it for | Showing a date, certificate expiry, coarse "created at" | **Timeouts, durations, rate limiting, lease countdowns** |

Rule of thumb: **durations come from a monotonic clock; dates come from the wall clock; and a wall-clock timestamp from another machine is an opinion, not a fact.**

## How wrong can a clock be?

Wrong by more than you think, and wrong silently. A broken CPU or network card crashes something and gets fixed. A drifting clock keeps running and corrupts data without an error.

- **Drift.** Quartz oscillators run fast or slow with temperature. Google plans for 200 parts per million, which is 6 ms between syncs 30 seconds apart, and about **17 seconds a day** if never corrected.
- **NTP error.** Over the public internet the best you can hope for is tens of milliseconds, and congestion produces spikes of a second or more. A firewall that silently blocks NTP lets a clock wander for weeks.
- **Steps and smears.** An NTP correction can move a clock forwards or backwards in one jump. Leap seconds make a minute 59 or 61 seconds long, which is why large providers "smear" the extra second across a day instead.
- **Pauses look like jumps.** A virtual machine that loses its CPU for tens of milliseconds, or a process stalled by garbage collection, sees the clock leap forward when it resumes.
- **Devices you don't control** may have any date at all.

```calc
title: How far does a clock drift?
prompt: A server's clock drifts at 200 ppm (parts per million) and nobody corrects it. How many seconds off is it after a full day (86,400 seconds)?
answer: 17.3
unit: seconds
tolerance: 1.1
steps: |
  200 ppm = 200 / 1,000,000 = 0.0002. Over 86,400 s that is 86,400 × 0.0002 ≈ **17.3 seconds**. Over a 30-second sync interval it is 30 × 0.0002 = 6 ms. A drift that sounds negligible per second is a long time in a database.
```

Because a reading is really a range, it helps to think of every timestamp as "now, give or take ε". Most APIs hide ε. If you ever need it, Google's Spanner exposes it directly: its TrueTime API returns an **earliest and a latest** possible time, and Spanner delays committing a transaction until its uncertainty interval has passed. Two transactions whose intervals don't overlap are then known to be in order. That works because Google puts GPS receivers or atomic clocks in each datacentre to keep ε at a few milliseconds, which most systems can't afford.

## Last-write-wins: the data it loses

A very common conflict rule says "keep the write with the higher timestamp." It is simple and makes replicas converge, and it is the only built-in rule in some databases. Try it. Client A writes `x = 1`. Fifty milliseconds later, having read it, client B writes `x = 2` through a node whose clock is a little slow.

```sim
name: lwwclock
title: Whose write survives?
intro: Skew B's clock and watch last-write-wins throw away a write that was unambiguously later. Then try Lamport timestamps and version vectors, and make the writes concurrent.
challenges:
  - {text: 'With last-write-wins, make B''s causally later write get discarded by slowing B''s clock', metric: lostCausal, op: '==', value: 1, and: [{metric: strategy, op: '==', value: lww}]}
  - {text: 'Keep the skewed clock and switch strategy so no causally ordered write is lost, whatever the skew', metric: lostCausal, op: '==', value: 0, and: [{metric: skew, op: '<', value: -49}, {metric: usesLogical, op: '==', value: 1}]}
  - {text: 'Make the writes concurrent and find the strategy that keeps both', metric: siblings, op: '==', value: 1}
takeaway: |
  Last-write-wins loses an acknowledged write as soon as one clock is behind by more than the real gap between the writes, and it silently drops one of any two concurrent writes. Lamport timestamps never reorder causally related writes, but they can't tell "concurrent" from "ordered", so one concurrent write still vanishes. Version vectors detect concurrency and hand both values back for the application to merge.
```

Three more things to know about LWW. It can't tell a quick sequence from true concurrency. Two nodes can stamp different writes with the same millisecond, so you need a tiebreaker (which can itself misorder causality). And it is acceptable for caches and similar data you can afford to lose. For anything else, the safe way to use it is to **write each key once and never update it** (a fresh UUID per write).

```predict
prompt: A multi-leader store keeps the write with the later timestamp. Datacentre 1's clock is 40 ms ahead of datacentre 2's. A user updates a record in DC1, and 10 ms later (having seen the update) the same user changes it again in DC2. What do the replicas end up with?
choices:
  - The second update, since it happened later in real time
  - The first update, because DC1's fast clock gave it the larger stamp
  - Both updates merged automatically, since both came from the same user
  - An error reported to the user, because the database notices the stamps are out of order
answer: 1
reveal: |
  The first write is stamped T + 40 (DC1's fast clock) and the second T + 10 on DC2's accurate clock, so the first has the larger stamp and wins. The second, which was causally later, is silently discarded and nobody is told. Skew only has to exceed the real gap between the writes. NTP-grade skew of tens of milliseconds is bigger than most gaps between a user's actions.
```

## Logical clocks: order without time

If timestamps can't be trusted to order events, order them by what could have *influenced* what. Event A **happened before** B if B knows about A, depends on it or builds on it. Two events are **concurrent** if neither knows about the other, and that is about knowledge, not about overlapping in real time.

A **Lamport timestamp** is a pair (counter, node ID). Each node increments its counter for every event it performs, attaches the pair to each message it sends, and on receiving a message sets its own counter to the larger of its value and the sender's. Ordering is by counter, then node ID. The key property is that if A happened before B then A's timestamp is smaller, so the order never contradicts causality.

```timeline
title: Lamport counters in action
lanes: [Node 1, Node 2, Node 3]
state: {'Node 1': '0', 'Node 2': '0', 'Node 3': '0'}
steps:
  - {lane: Node 1, to: Node 1, text: 'local write → counter 1', set: {'Node 1': '1'}}
  - {lane: Node 1, to: Node 2, text: 'sends (1, N1) · Node 2 jumps to max(0, 1) + 1', set: {'Node 2': '2'}}
  - {lane: Node 2, to: Node 3, text: 'sends (2, N2) · Node 3 jumps to max(0, 2) + 1', set: {'Node 3': '3'}}
  - {lane: Node 3, to: Node 3, text: 'local write → counter 4, stamped (4, N3)', set: {'Node 3': '4'}}
  - {lane: Node 1, to: Node 1, text: 'independent local write → counter 2, stamped (2, N1)', set: {'Node 1': '2'}}
find:
  prompt: Which step creates an event that is concurrent with Node 3's write, yet still sorts before it?
  answer: 4
  explain: |
    Node 1's second write (2, N1) and Node 3's write (4, N3) never exchanged a message, so they're concurrent. But their stamps still sort: (2, N1) before (4, N3). A Lamport timestamp gives a total order consistent with causality, but you can't read concurrency back out of it. For that you need version vectors.
```

A **version vector** keeps one counter per replica instead of one. Comparing two vectors tells you whether one write includes the other (so the later one overwrites it) or neither does (so they are concurrent siblings that must be merged). That is what the lessons on leaderless stores call "detecting concurrent writes". It costs space proportional to the number of replicas, which is why Lamport timestamps are used where a bare order is enough.

## When an order has to be final: total order broadcast

Lamport timestamps order events after the fact. They don't help a node that must decide **right now**. Take "usernames must be unique." Two nodes each receive a request for `alice`. Each could compare Lamport stamps, but neither knows whether a request with a lower stamp is still on its way from the other. To be sure, a node would have to ask every other node, and it would stall whenever one was down.

What you need is an order that is *final*: **total order broadcast**. Every message is delivered to every node, none are lost, and all nodes see them in the same order, with no message ever slipped into an earlier position once later ones have been delivered. In effect it is an append-only log that every node reads identically.

```arch
title: Total order broadcast as a shared log
nodes:
  - {id: c1, label: Client 1, kind: client, x: 0, y: 0}
  - {id: c2, label: Client 2, kind: client, x: 0, y: 2}
  - {id: log, label: Replicated log, kind: stream, x: 1, y: 1, note: 'one agreed order'}
  - {id: n1, label: Replica 1, kind: service, x: 2, y: 0, note: 'applies in order'}
  - {id: n2, label: Replica 2, kind: service, x: 2, y: 1, note: 'applies in order'}
  - {id: n3, label: Replica 3, kind: service, x: 2, y: 2, note: 'applies in order'}
edges:
  - [c1, log, 'claim alice']
  - [c2, log, 'claim alice']
  - [log, n1, 'entry 41, then 42']
  - [log, n2, 'entry 41, then 42']
  - [log, n3, 'entry 41, then 42']
paths:
  - label: Two claims for one username
    steps:
      - [c1, log, 'Client 1 asks for alice and the log accepts it as entry 41.']
      - [c2, log, 'Client 2 asks for alice and the log accepts it as entry 42.']
      - [log, n1, 'Every replica applies 41 first: alice is taken. Entry 42 then fails the uniqueness check, the same way everywhere.']
```

This one idea covers a lot. **State machine replication**: if every replica applies the same writes in the same order, they stay identical. **Serialisable transactions** run as deterministic stored procedures. **Lock services** that hand out fencing tokens. Raft's replicated log, ZooKeeper's Zab and etcd all provide it. Getting a log that stays consistent across failures is exactly the consensus problem, which is why the two are equivalent in difficulty. The consensus lesson covers how Raft does it.

> [!senior] Leases and the pause
> A lease says "you are leader until time T." Checking `now < T` and then acting is unsafe for two separate reasons. If `T` was set by another machine and `now` comes from your own clock, skew makes the check wrong. And even with a monotonic clock, your process can be paused between the check and the act, long enough for the lease to expire. Safety has to come from the thing you write to rejecting a stale holder, which is what a fencing token does, not from the holder's own sense of time.

```bug
title: A lease check
prompt: This leader handles requests only while it believes its lease is valid. Which lines are unsafe?
lang: python
code: |
  def serve(lease, requests):
      for req in requests:
          if lease.expires_at - time.time() < 10:
              lease = lease.renew()
          if time.time() < lease.expires_at:
              storage.write(req.key, req.value)
bug: [3, 5, 6]
explain: |
  **Lines 3 and 5** compare a wall-clock reading from this machine with an expiry timestamp that another machine set, using `time.time()`, which can step backwards or be skewed. An expired lease can look valid, or a valid one expired. Use a monotonic clock for the countdown. **Line 6** is the deeper bug. Even with correct clocks, the process can pause after line 5 and write after the lease has expired, while a new leader is already writing. The write must carry a fencing token that `storage` checks, so a stale leader's write is rejected.
fix: |
  def serve(lease, requests):
      for req in requests:
          if lease.remaining_monotonic() < 10:
              lease = lease.renew()
          storage.write(req.key, req.value, fencing_token=lease.token)  # storage rejects old tokens
```

```sort
prompt: Which tool fits each need?
buckets: [Monotonic clock, Time-of-day clock, Lamport timestamp or version vector, Total order broadcast / consensus]
items:
  - {text: 'Timing out an RPC after 2 seconds', bucket: 0, why: 'A duration. Wall-clock steps would make it fire early or never.'}
  - {text: 'Showing when an order was placed', bucket: 1, why: 'A human-readable date. Accuracy to a few seconds is enough.'}
  - {text: 'Deciding which of two edits to a shared note was based on the other', bucket: 2, why: 'A causality question. Version vectors answer it without trusting clocks.'}
  - {text: 'Making sure two users can never both register the same username', bucket: 3, why: 'A decision that must be final immediately, so every node needs the same agreed order.'}
  - {text: 'Measuring how long a request took inside one process', bucket: 0, why: 'An interval on one machine is exactly what monotonic clocks are for.'}
  - {text: 'Tagging each change with a number that never contradicts what caused it', bucket: 2, why: 'That is what Lamport timestamps guarantee.'}
```

```faded
title: Fill in the clock facts
prompt: Fill each gap from memory.
text: |
  Durations should be measured with a [[monotonic|time-of-day|Lamport]] clock, because a time-of-day clock can [[jump backwards|run exactly in step with other machines|never be wrong by more than a millisecond]].

  A clock drifting at 200 ppm is about [[#17]] seconds off after a day.

  Last-write-wins loses a causally later write whenever the writer's clock is behind by more than the [[real gap between the writes|replication lag|network round trip]].

  To detect that two writes were concurrent you need [[version vectors|Lamport timestamps|wall-clock timestamps]], and to make an order final you need [[total order broadcast|a faster clock|more replicas]].
explain: Time of day is for people, durations come from a monotonic clock, causality from logical clocks, and finality from a replicated log.
```

```recall
prompt: Explain why ordering events by wall-clock timestamp is unsafe in a distributed database, and what you would use instead.
points:
  - Clocks drift and are only synchronised to within tens of milliseconds (or worse), so timestamps from different machines can't be compared precisely
  - A write that happened later can get an earlier timestamp, so last-write-wins silently discards a causally later write
  - Time-of-day clocks can also step backwards, and pauses make a process's idea of "now" stale
  - Use logical clocks or version vectors to order by causality and detect concurrency, and a replicated log (consensus) when the order must be final
model: |
  Each machine's clock is only approximately right: it drifts, NTP corrections move it, and the error is often tens of milliseconds or more. So two timestamps from different machines can't be compared at the resolution events happen. A write that really came second can carry the smaller number, and a last-write-wins store then throws it away without any error. Time-of-day clocks can even step backwards on one machine. The safe approach is to order by causality: Lamport timestamps give an order that never contradicts cause and effect, version vectors also reveal concurrent writes so they can be merged, and when a decision has to be final immediately (a uniqueness constraint), you put the operations through a replicated log, which is consensus.
```

```interview
ask: A teammate wants to resolve conflicting writes in our multi-region store by keeping the one with the latest timestamp. What do you say?
say: |
  "Latest timestamp means last-write-wins, and it depends on the clocks of different machines agreeing, which they only do to within tens of milliseconds, and sometimes much worse. If a region's clock is slow by more than the real gap between two edits, the edit that really came second gets the smaller timestamp and is silently thrown away, and it also can't tell a quick follow-up from a truly concurrent edit. If the data is a cache, that's fine. Otherwise I'd keep per-key version vectors, return both values when they're concurrent, and merge them in the application or with a CRDT. For the few invariants that must be exact, like unique usernames, I'd route those operations through a single leader or a consensus log."
followups:
  - q: Could we make the clocks accurate enough?
    a: Only with real investment. Google's Spanner uses GPS and atomic clocks and still waits out a few milliseconds of uncertainty on commit. Ordinary NTP can't be trusted to be better than the gap between related writes, so the design shouldn't depend on it.
  - q: What do Lamport timestamps give us that wall clocks don't?
    a: An order that is always consistent with causality, because each message carries the sender's counter and receivers jump past it. They can't reveal concurrency, which is why version vectors exist.
  - q: How do you enforce unique usernames across regions?
    a: A total order: send the claims through one leader per username range or a consensus log, so every replica decides in the same order and the second claim fails everywhere.
weak: |
  "Use the timestamp. If clocks are off, we'll sync them with NTP." Treats clocks as accurate, ignores silent data loss and concurrency.
strong: |
  Names the failure (a skewed clock discards a later write), distinguishes causal from concurrent, offers version vectors or CRDTs for merging, and uses consensus for invariants that need a final order.
```

```questions
- kind: check
  prompt: Which clock should a service use to decide that an upstream call has taken longer than 2 seconds?
  choices:
    - text: A monotonic clock
      correct: true
    - text: The time-of-day clock, since NTP keeps it accurate to the millisecond across the whole fleet
      why: NTP can step the clock, so a duration measured with it can be negative or wildly wrong.
    - text: A Lamport timestamp attached to the request by the upstream service
      why: Lamport counters count events, not elapsed time.
    - text: The upstream's own clock, copied from a timestamp in its response header
      why: You would trust another machine for a duration you can measure yourself.
  explanation: Durations belong to the monotonic clock, which only moves forward. Its absolute value is meaningless, so compare only differences taken on the same machine.
- kind: check
  prompt: Last-write-wins keeps the write with the higher timestamp. Under what condition does it discard a write that was causally later than another?
  choices:
    - text: The later writer's clock is behind by more than the real gap
      correct: true
    - text: Only when the two writes carry exactly the same timestamp, which is rare in practice
      why: Skew alone can reorder writes that were seconds apart.
    - text: Only when replication between the nodes is configured to be synchronous
      why: Replication mode does not change how timestamps compare.
    - text: Never, because causality guarantees that a later write gets the higher timestamp
      why: That would need perfectly synchronised clocks, which do not exist.
  explanation: The later write's stamp is its real time plus its clock's error. If that error is more negative than the real gap, it sorts earlier and is dropped.
- kind: check
  prompt: What can a version vector tell you that a Lamport timestamp cannot?
  choices:
    - text: Whether two writes were concurrent
      correct: true
    - text: The real wall-clock time at which each write was accepted by its replica
      why: Neither is a measure of real time.
    - text: Which write reached the network first when two clients sent at once
      why: Both order by causality, not by arrival.
    - text: Whether the link between two replicas was partitioned at the time
      why: Neither detects partitions.
  explanation: Lamport stamps always give a total order, so concurrent events still sort one before the other. A version vector shows when neither write includes the other.
- kind: check
  type: multi
  prompt: Which of these make a wall-clock reading unreliable for ordering events across machines? Select all that apply.
  choices:
    - text: Quartz drift between NTP syncs
      correct: true
    - text: NTP corrections that step the clock
      correct: true
    - text: A VM pause that makes the clock jump forward
      correct: true
    - text: Using 64-bit integers for timestamps
      why: The width of the integer isn't the problem. The source of the value is.
  explanation: Drift, steps and pauses all move a clock away from true time, and none raises an error. Integer width is irrelevant.
- kind: check
  prompt: Why is a total order of Lamport timestamps not enough to enforce "usernames are unique"?
  choices:
    - text: A node deciding now cannot know a lower-stamped claim is not in flight
      correct: true
    - text: Lamport timestamps cannot be compared across nodes because each node keeps its own counter
      why: They can. They give a total order.
    - text: Lamport timestamps require synchronised wall clocks, which these nodes lack
      why: They need no clocks at all, only counters.
    - text: Two nodes can never produce the same counter value, so ties are impossible
      why: Equal counters are possible. The node ID breaks the tie.
  explanation: The order only becomes known once you've seen every operation. To decide immediately, you need to know the order is final, which is what total order broadcast provides.
- kind: fire
  prompt: A clock drifts at 200 ppm. About how far off is it after 30 seconds without a sync?
  choices:
    - text: About 6 ms
      correct: true
    - text: About 60 ms, if the drift were 2,000 ppm instead
      why: That would be ten times the drift.
    - text: About 0.6 ms, if the drift were only 20 ppm
      why: That would be a tenth of the drift.
    - text: About 6 seconds of error accumulated over the half minute
      why: That is 200,000 ppm.
  explanation: 30 s × 0.0002 = 0.006 s.
- kind: fire
  prompt: What does Spanner's TrueTime API return that ordinary clock APIs don't?
  choices:
    - text: An earliest and a latest bound on the current time
      correct: true
    - text: A Lamport counter that increases with every call made by the local node
      why: TrueTime is a physical clock with an error bound.
    - text: The identity of the current leader for the requested key range
      why: It is a time API.
    - text: A guaranteed-exact timestamp that carries zero uncertainty
      why: It admits uncertainty. That is the point.
  explanation: The interval lets Spanner wait out the uncertainty before committing, so non-overlapping intervals are known to be in order.
- kind: fire
  prompt: Which is a correct use of last-write-wins on timestamps?
  choices:
    - text: A cache where an occasional lost update is harmless
      correct: true
    - text: Merging concurrent edits to a shared document between two collaborators
      why: One of the edits would be discarded.
    - text: Updating a bank balance from several branches at the same moment
      why: A lost update is real money.
    - text: Enforcing that a username is claimed by exactly one person
      why: That needs an agreed, final order.
  explanation: LWW is acceptable when losing a write costs little, or when each key is written once and never updated.
- kind: fire
  type: order
  prompt: Order these from weakest to strongest ordering guarantee.
  items:
    - Wall-clock timestamps
    - Lamport timestamps (consistent with causality)
    - Version vectors (also detect concurrency)
    - Total order broadcast (final, agreed order)
  explanation: Wall clocks guarantee nothing across machines. Lamport timestamps respect causality, version vectors add concurrency detection, and total order broadcast gives every node the same final sequence.
- kind: fire
  prompt: A leader checks "my lease hasn't expired", then its process pauses for 40 seconds before it writes. What protects the data?
  choices:
    - text: The storage layer rejecting writes with an older fencing token
      correct: true
    - text: A longer lease, so that a long pause can no longer outlast it
      why: A longer pause can always exceed it.
    - text: A more accurate clock on the leader, synced with the lock service
      why: Accuracy does not help when the process is not running.
    - text: Checking the lease twice, before and after preparing the write
      why: The pause can fall between the second check and the write too.
  explanation: Safety must be enforced by the resource being written to, not by the holder's belief about time.
```
