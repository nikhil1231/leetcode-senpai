---
id: testing-strategy
category: quality
skill: quality
title: 'Testing strategy: from unit tests to chaos'
minutes: 17
summary: A test suite is a portfolio. Many fast unit tests, fewer integration tests against real dependencies, and a handful of end-to-end journeys (the pyramid) catch most bugs at the lowest cost. Test doubles stand in for slow or unreliable parts, and fakes age better than mocks. Contract tests let services evolve without a shared staging environment. Property-based tests find the edge cases you didn't think of. Load, stress, spike and soak tests each answer a different question, and chaos engineering checks that resilience works before an outage tests it for you.
objectives:
  - Explain the test pyramid and its alternatives, and what each layer is for
  - Tell dummies, stubs, spies, mocks and fakes apart, and choose between them
  - Describe consumer-driven contract testing and when it replaces end-to-end tests
  - Write property-based tests and explain shrinking
  - Choose between load, stress, spike and soak tests, and run a chaos experiment safely
sources:
  - ['Martin Fowler, The Practical Test Pyramid (Ham Vocke)', 'https://martinfowler.com/articles/practical-test-pyramid.html']
  - ['Martin Fowler, Mocks Aren''t Stubs', 'https://martinfowler.com/articles/mocksArentStubs.html']
  - ['Pact documentation: consumer-driven contract testing', 'https://docs.pact.io/']
  - ['Hypothesis documentation (property-based testing for Python)', 'https://hypothesis.readthedocs.io/']
  - ['Principles of Chaos Engineering', 'https://principlesofchaos.org/']
  - ['Google Testing Blog: Flaky tests at Google and how we mitigate them', 'https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html']
---

## The pyramid

- **Unit tests**: one function or class, in memory, milliseconds each. Thousands of them. They pin down logic and make refactoring safe.
- **Integration tests**: your code against a real dependency (a real Postgres in a container, a real HTTP server), seconds each. They catch the bugs unit tests can't: SQL that doesn't run, serialisation mismatches, transaction behaviour.
- **End-to-end tests**: the deployed system through its UI or public API. Slow, flaky, expensive to debug, and the only proof that the whole thing works. Keep a handful, covering the journeys that make money.

The shape matters because cost and flakiness grow as you go up while the precision of a failure goes down. An **ice-cream cone** (mostly manual and end-to-end tests) is the anti-pattern: slow feedback and failures nobody can localise. Kent C. Dodds' **testing trophy** argues for more integration tests in front-end and service code, where the unit is too thin to be worth isolating. The common thread: test behaviour through public interfaces, as close to real as is still fast and deterministic.

**Flaky tests** (pass and fail without a code change) destroy trust: people re-run until green and miss real failures. Usual causes are timing (sleeps instead of waiting for a condition), shared state between tests, test order, real clocks and network calls. Quarantine and fix them; never just retry forever.

## Test doubles

| Double | What it does | Example |
|---|---|---|
| **Dummy** | Fills a parameter, never used | A `None` logger |
| **Stub** | Returns canned answers | `rates.get()` always returns 1.2 |
| **Spy** | A stub that records how it was called | Count the emails "sent" |
| **Mock** | Pre-programmed with expectations; fails if calls don't match | `expect(gateway.charge).calledWith(40)` |
| **Fake** | A working, simpler implementation | An in-memory repository, a local S3 like MinIO |

Mocks verify **interactions** and couple tests to *how* code works, so refactors break tests even when behaviour is unchanged. Fakes and stubs let you assert on **state and outcomes**, which survives refactoring. A good rule: don't mock what you don't own. Wrap a third-party SDK in your own small interface (an adapter), test your code against a fake of that interface, and test the adapter against the real thing in a few integration tests.

```sort
prompt: Which kind of test double is each?
buckets: [Stub, Spy, Mock, Fake]
items:
  - {text: 'An in-memory UserRepository backed by a dict', bucket: 3, why: 'A real, simplified implementation.'}
  - {text: 'A clock that always returns 2026-01-01T00:00Z', bucket: 0, why: 'A canned answer.'}
  - {text: 'An email sender that records each call so the test can assert two emails went out', bucket: 1, why: 'Records calls for later assertions.'}
  - {text: 'A payment gateway set up to fail the test unless charge(40, "usd") is called exactly once', bucket: 2, why: 'Expectations checked by the double itself.'}
  - {text: 'SQLite standing in for Postgres', bucket: 3, why: 'A working substitute (with dialect differences to watch).'}
```

## Contract tests

With many services, end-to-end tests across all of them become slow and fragile, and a shared staging environment becomes a bottleneck. **Consumer-driven contract testing** (Pact is the common tool) replaces most of them:

1. The **consumer**'s tests run against a mock provider and record what they need: "GET /users/42 returns 200 with `id` and `email`".
2. That **contract** is published to a broker.
3. The **provider**'s CI replays every consumer's contract against the real provider and fails if any expectation breaks.
4. Before deploying either side, a "can I deploy?" check confirms the versions in production are compatible.

The provider learns exactly which fields consumers use, so it can remove the unused ones safely. Schema-based approaches (OpenAPI or protobuf compatibility checks in CI) cover similar ground with less ceremony.

## Property-based tests

Example-based tests check the cases you thought of. **Property-based** tests state something that should hold for *all* inputs and let a library (Hypothesis, QuickCheck, fast-check) generate hundreds of them, including nasty ones: empty lists, zero, negative numbers, huge integers, NaN, unicode. When a case fails, the library **shrinks** it to a minimal failing example.

Good properties:

- **Round trips**: `decode(encode(x)) == x`.
- **Invariants**: sorting preserves length and contents, and the output is ordered.
- **Oracles**: the fast implementation agrees with a slow, obviously correct one.
- **Idempotence**: `normalise(normalise(x)) == normalise(x)`.

```bug
title: A property test that found a bug
prompt: Hypothesis reports `test_split_evenly` failing with the shrunk example total=1, parts=2. Which line of `split_evenly` is the bug?
lang: python
code: |
  def split_evenly(total: int, parts: int) -> list[int]:
      """Split `total` pence into `parts` amounts that differ by at most 1p."""
      base = total // parts
      remainder = total - base * parts
      out = [base] * parts
      for i in range(remainder - 1):
          out[i] += 1
      return out

  @given(st.integers(0, 10**9), st.integers(1, 1000))
  def test_split_evenly(total, parts):
      out = split_evenly(total, parts)
      assert sum(out) == total
      assert max(out) - min(out) <= 1
bug: [6]
explain: |
  The remainder pennies should go to the first `remainder` parts, but `range(remainder - 1)` hands out one too few, so a penny goes missing whenever there's a remainder. For total=1, parts=2: base 0, remainder 1, and the loop runs zero times, giving [0, 0], which sums to 0. Example tests like (100, 4) have no remainder and pass. The property "the parts sum to the total" fails at once, and shrinking makes the failure readable. Fix: `range(remainder)`.
```

## Performance tests: four shapes

Each answers a different question, and passing one says nothing about the others:

- **Load test**: expected peak traffic for a while. "Do we meet the SLO at the load we plan for?"
- **Stress test**: ramp up until something breaks. "Where is the ceiling, what breaks first, and does it fail gracefully and recover?"
- **Spike test**: a sudden jump. "Do autoscaling, connection pools and caches cope with a step change?" (A marketing push, or a retry storm after an outage.)
- **Soak (endurance) test**: normal load for hours or days. "Does anything degrade over time?" Memory leaks, descriptor leaks, growing queues, log disks filling, connection churn.

Measure latency **percentiles** (p99 and above, not averages), error rates and saturation, and generate load from a realistic mix of requests from outside the system under test. Watch for **coordinated omission**: a load generator that waits for each slow response before sending the next stops sending at exactly the moment the system struggles, hiding the worst latency. Open-model tools (k6's arrival-rate executors, wrk2, Gatling's open injection) avoid it.

```sim
name: loadshape
title: Four test shapes, one flawed service
intro: 'The service has three planted flaws. Run each kind of test and see which flaws it exposes. (Turn a flaw off to see a clean run.)'
challenges:
  - {text: 'Pass a load test even though all three flaws are present', metric: pass, op: '==', value: 1, and: [{metric: shape, op: '==', value: 'load'}]}
  - {text: 'Find the memory leak', metric: foundLeak, op: '==', value: 1}
  - {text: 'Find all three planted flaws', metric: foundAll, op: '==', value: 1}
takeaway: |
  A passing load test says only that this shape of traffic works. Stress tests find ceilings and bottlenecks, spike tests find slow scaling, and only a long soak finds leaks. Pick the shapes that match the risks you have.
```

## Chaos engineering

Resilience features (retries, failover, circuit breakers, autoscaling) that never run don't work when needed. **Chaos engineering** runs controlled experiments to find weaknesses before users do:

1. Define **steady state** as a measurable business metric (orders per minute, successful logins), not CPU.
2. **Hypothesise** it holds when something fails: "if one availability zone's instances die, orders per minute stays within 5%."
3. **Inject** the failure: kill instances, add latency to a dependency, drop packets, fill a disk, expire a certificate.
4. **Limit the blast radius**: start in staging, then a small slice of production, with a stop button and clear abort conditions.
5. Learn, fix, and automate the experiment so it keeps running.

Netflix's Chaos Monkey, which randomly terminates production instances, made instance loss routine. **Game days** rehearse bigger scenarios (a region failover, a database restore) with the team that would be paged.

```recall
prompt: You join a team whose only tests are a slow end-to-end suite that is red a third of the time. Outline how you'd improve their testing strategy.
points:
  - Quarantine and fix flaky tests (timing, shared state, real clocks and network) so red means broken
  - Push most checks down to fast unit and integration tests against real dependencies in containers
  - Keep a small set of end-to-end tests for critical journeys only
  - Use contract tests between services instead of a shared staging environment
  - Add property-based tests for tricky logic, plus load, soak and chaos testing for the risks that matter
model: |
  First make the signal trustworthy: quarantine flaky tests, then fix the usual causes (sleeps instead of waiting for conditions, shared data between tests, real clocks, live network calls), so a red build means something is broken. Then reshape the suite into a pyramid. Write unit tests for the domain logic and integration tests against real dependencies in containers (Postgres, Redis) for the data layer, and run them on every commit in minutes. Cut the end-to-end suite to the five or ten journeys that matter most. Between services, add consumer-driven contract tests so teams can deploy independently without a shared staging environment. Where logic is tricky (money, parsing, scheduling), add property-based tests. And match performance and resilience testing to the risks: load tests for planned peaks, soak tests before releases with long-running processes, and small chaos experiments on the failover paths we rely on.
```

```questions
- kind: check
  prompt: A refactor that doesn't change behaviour breaks 40 tests. What's the most likely cause?
  choices:
    - text: The tests use mocks that assert on internal interactions rather than on outcomes
      correct: true
    - text: The refactor must have changed behaviour
      why: The premise is that it didn't.
    - text: There are simply too many unit tests for a codebase of this size
      why: The number isn't the problem; what they assert is.
    - text: The tests need longer timeouts
      why: These fail deterministically.
  explanation: Assert on state and results through public interfaces; prefer fakes to mocks.
- kind: check
  prompt: What does a soak test find that a 30-minute load test usually doesn't?
  choices:
    - text: Problems that build up over time, like memory leaks or a filling disk
      correct: true
    - text: The maximum throughput the system can reach before it breaks
      why: That's a stress test.
    - text: Whether autoscaling copes with a sudden jump
      why: That's a spike test.
    - text: Whether the API contract is correct
      why: That's a contract test.
  explanation: Run expected load for hours or days and watch trends.
- kind: check
  prompt: What does shrinking do in property-based testing?
  choices:
    - text: Reduces a failing input to a minimal example that still fails
      correct: true
    - text: Reduces the number of generated cases to speed up the whole run
      why: It acts after a failure, not before.
    - text: Compresses the test database
      why: Unrelated.
    - text: Removes redundant properties
      why: Properties are written by you.
  explanation: A failure on total=1, parts=2 is easier to debug than on a 9-digit total.
- kind: check
  prompt: In consumer-driven contract testing, who runs the contract against the real provider?
  choices:
    - text: The provider's CI, replaying every consumer's published expectations
      correct: true
    - text: The consumer, by calling the provider's staging environment
      why: That's an integration or end-to-end test.
    - text: Nobody; the contract is documentation
      why: It's executable.
    - text: A QA team, manually, before each release
      why: It's automated.
  explanation: The provider can't ship a change that breaks a consumer's recorded needs.
- kind: fire
  prompt: Which layer of the test pyramid should have the most tests?
  choices:
    - text: Unit tests
      correct: true
    - text: End-to-end tests
      why: The tip, the fewest.
    - text: Manual exploratory tests
      why: Valuable, but not automated volume.
  explanation: Fast, precise, cheap.
- kind: fire
  prompt: An in-memory repository used in tests is which kind of double?
  choices:
    - text: Fake
      correct: true
    - text: Mock
      why: A mock checks expected calls.
    - text: Dummy
      why: A dummy is never used.
  explanation: A working, simplified implementation.
- kind: fire
  prompt: Which test ramps load until the system breaks?
  choices:
    - text: Stress test
      correct: true
    - text: Soak test
      why: Soak runs steady load for a long time.
    - text: Smoke test
      why: A quick check that the basics work.
  explanation: It finds the ceiling and the first bottleneck.
- kind: fire
  prompt: What is the first step of a chaos experiment?
  choices:
    - text: Define steady state as a measurable business metric
      correct: true
    - text: Kill a random production instance and watch what happens
      why: Not before you know what "fine" looks like.
    - text: Disable monitoring to avoid alerts
      why: You need monitoring most during an experiment.
  explanation: Then hypothesise, inject, limit blast radius, learn.
- kind: fire
  prompt: What is coordinated omission in load testing?
  choices:
    - text: A generator that waits on slow responses, so it under-reports the worst latency
      correct: true
    - text: Leaving some endpoints out of the test plan so they are never exercised
      why: That's just incomplete coverage.
    - text: Several generators hitting the same server
      why: That's distributed load generation.
  explanation: Use open-model, arrival-rate load generators.
```
