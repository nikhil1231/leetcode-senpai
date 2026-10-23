---
id: design-links
category: designs
skill: reads
title: Design a link shortener, end to end
minutes: 20
summary: A full walkthrough of the classic read-heavy design — requirements, estimates, API, schema, code generation, the redirect path with caches and a CDN, the 60-second freshness promise, analytics off the hot path, and how it fails and evolves. Every component is justified by a number or a guarantee.
objectives:
  - Turn the prompt into scope, scale, a freshness bound and an ownership invariant
  - Size the system and choose code generation, schema and storage from the estimates
  - Design a redirect path whose every cache layer respects a 60-second freshness bound
  - Explain failure behaviour and the triggers for each evolution step
sources:
  - ['MDN: HTTP redirections (301 vs 302 vs 307/308)', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections']
  - ['MDN: Cache-Control', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control']
  - ['Google Safe Browsing API (malicious URL checks)', 'https://developers.google.com/safe-browsing']
case: links
---

> [!tip] How to use this walkthrough
> Each section mirrors a phase of a 45-minute interview. Before reading each one, pause and decide what *you* would say — then check it against the activities.

## 1. Requirements (5 minutes)

The case: authenticated owners create, update and disable short links; visitors resolve a code to its destination.

- **Functional:** create (optionally with a custom alias), resolve (redirect), update the destination, disable, list my links.
- **Scale:** 10M active links; **20,000 resolutions/s** at peak; **20 writes/s**.
- **Freshness:** a destination change or disable must take effect **within 60 seconds everywhere**.
- **Durability:** an acknowledged creation survives an application-server crash.
- **Invariant:** owners may modify only their own links; disabled or unknown codes must not redirect.
- **Out of scope for the baseline:** analytics dashboards, billing. (Click counting is a natural extension.)

```predict
prompt: Which single requirement most constrains the read-path design?
choices:
  - 20 writes per second
  - '"Changes take effect within 60 seconds everywhere"'
  - 10 million links
  - Custom aliases
answer: 1
reveal: |
  The read rate pushes you towards caching, and the freshness bound limits *how* you cache: every layer — CDN, application cache, browser — must add up to at most 60 seconds of staleness, or be explicitly invalidated. It rules out permanent 301 redirects cached by browsers, and long CDN TTLs without purges. Ten million links and 20 writes/s are, by contrast, small.
```

## 2. Estimates (5 minutes)

```faded
title: Size the system
prompt: Fill in the estimates.
text: |
  **Storage:** 10M links × ~500 bytes (code, destination URL, owner, flags, timestamps, version) ≈ [[#5]] GB, plus indexes. That fits comfortably on [[one database node with a replica|a 50-node cluster|a single laptop with no replica]].

  **Writes:** 20/s is trivial for a relational primary.

  **Reads:** 20,000 resolutions/s at peak. A single Postgres primary *could* serve simple primary-key lookups at that rate, but with no headroom. With a cache at a 95% hit rate, the database sees about [[#1000]] reads/s.

  **Codes:** with base62, 7 characters give 62⁷ ≈ [[3.5 trillion|35 million|350]] codes — far more than needed, so we can afford random codes and still rarely collide.

  **Bandwidth:** a redirect response is ~500 bytes, so 20k/s ≈ [[#10]] MB/s. Negligible.
explain: The estimates say this is a small-data, read-heavy, latency-sensitive system. No sharding needed. The design effort belongs on the read path and the freshness guarantee.
```

## 3. API

```http
POST   /v1/links              {destination, alias?}       -> 201 {code, short_url}   (Idempotency-Key header)
GET    /v1/links?cursor=…                                  -> 200 my links, cursor-paginated
PATCH  /v1/links/{code}       {destination?, enabled?}     -> 200   (If-Match: version)
GET    /{code}                                             -> 302 Location: destination | 404 | 410
```

- Owner endpoints authenticate and check `owner_id` on every update (object-level authorisation).
- Resolution is public and unauthenticated, and must be fast.
- **302 (or 307), not 301:** 301 is "moved permanently" and browsers may cache it indefinitely, which would break the 60-second freshness promise for updates and disables. `Cache-Control: max-age` on the 302 controls how long downstream caches keep it.

## 4. Data model and code generation

```sql
CREATE TABLE links (
  code         TEXT PRIMARY KEY,          -- 7-char base62, or a custom alias
  owner_id     BIGINT NOT NULL,
  destination  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  version      BIGINT NOT NULL DEFAULT 1, -- bumped on every change (cache + concurrency control)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON links (owner_id, created_at DESC, code);   -- "my links" listing
```

```sort
prompt: Evaluate each code-generation approach for this service.
buckets: [Good choice, Workable with care, Poor choice]
items:
  - {text: 'Random 7-character base62 code, INSERT with the primary-key constraint, retry on conflict', bucket: 0, why: 'Unguessable, no coordination, and collisions are extremely rare at 10M codes in a 3.5-trillion space. The constraint makes them safe.'}
  - {text: 'Base62-encode an auto-increment ID', bucket: 1, why: 'No collisions and short codes, but codes are sequential (enumerable, leaks volume). Scramble with a reversible permutation if that matters.'}
  - {text: 'First 7 characters of MD5(destination URL)', bucket: 2, why: 'Two owners shortening the same URL collide (and can then edit each other''s link unless you add owner and salt), and truncated hashes still collide. Gains nothing over random.'}
  - {text: 'Custom alias chosen by the user, inserted with the same unique constraint', bucket: 0, why: 'Same table, same constraint — 409 Conflict if taken. Add a blocklist for reserved or offensive words.'}
```

## 5. The read path

```arch
title: Link shortener architecture
nodes:
  - {id: visitor, label: Visitor, kind: client, x: 0, y: 1}
  - {id: cdn, label: CDN edge, kind: cdn, x: 1, y: 1, note: 'max-age ≤ 30 s'}
  - {id: resolve, label: Resolve service, kind: service, x: 2, y: 1, note: stateless}
  - {id: cache, label: Redis, kind: cache, x: 3, y: 0, note: 'TTL 20 s, DEL on write'}
  - {id: db, label: Postgres, kind: db, x: 3, y: 1, note: 'primary + replica'}
  - {id: owner, label: Owner, kind: client, x: 1, y: 2}
  - {id: api, label: Links API, kind: service, x: 2, y: 2}
  - {id: log, label: Click stream, kind: stream, x: 3, y: 2, note: 'analytics later'}
edges:
  - [visitor, cdn, 'GET /aB3xK9q']
  - [cdn, resolve, 'miss']
  - [resolve, cache, 'GET link:aB3xK9q']
  - [resolve, db, 'miss → SELECT']
  - [owner, api, 'PATCH']
  - [api, db, 'UPDATE … version+1']
  - [api, cache, 'DEL']
  - [resolve, log, 'click event (async)']
paths:
  - label: Hot link
    steps:
      - [visitor, cdn, 'The edge has the 302 cached (max-age 30). Answered in ~10 ms. The origin never sees it.']
  - label: Cold link
    steps:
      - [visitor, cdn, 'Edge miss']
      - [cdn, resolve, 'Forwarded to a resolve instance']
      - [resolve, cache, 'Redis miss']
      - [resolve, db, 'SELECT destination, enabled FROM links WHERE code = $1 (primary-key lookup, ~1 ms). Cache the result — including "not found" — for 20 s.']
      - [resolve, log, 'Emit a click event asynchronously. Never block the redirect on analytics.']
  - label: Owner disables a link
    steps:
      - [owner, api, 'PATCH /v1/links/aB3xK9q {enabled:false}, If-Match: version 3']
      - [api, db, 'UPDATE … SET enabled=false, version=4 WHERE code=$1 AND owner_id=$2 AND version=3']
      - [api, cache, 'DEL link:aB3xK9q (best effort). A missed delete is still bounded by the 20 s TTL.']
```

## 6. Deep dive: proving the 60-second bound

The freshness promise must hold even when invalidation fails. Budget it across every layer:

```calc
title: Worst-case staleness
prompt: |
  Redis entries have a **20 s** TTL (filled from the primary). The CDN caches 302s with `max-age=30`. Browsers get `Cache-Control: private, max-age=0`. Ignore invalidation entirely. What's the worst-case time before a disable is visible to every visitor, in seconds?
answer: 50
unit: s
tolerance: 1.02
steps: |
  A Redis entry filled just before the disable lives up to 20 s. The CDN can fetch that stale entry at the last moment and keep it for 30 s more. 20 + 30 = **50 s** — inside the 60 s promise with a 10 s margin, without relying on any invalidation. Explicit Redis deletes and CDN purges make the usual case near-instant, but the guarantee doesn't depend on them. Filling Redis from a lagging replica would add the replica lag to the bound.
```

```timeline
title: A disable racing a cache refill
intro: The stale refill race from the caching lessons, applied here. Does the 60 s bound survive it?
lanes: [Resolver, Owner API, Redis, Postgres]
state: {Postgres: 'enabled', Redis: '(empty)'}
steps:
  - {lane: Resolver, to: Redis, text: 'GET link → miss'}
  - {lane: Resolver, to: Postgres, text: 'SELECT → enabled, dest=https://shop.example'}
  - {lane: Owner API, to: Postgres, text: 'UPDATE enabled=false; COMMIT', set: {Postgres: 'disabled'}}
  - {lane: Owner API, to: Redis, text: 'DEL link (nothing there yet)'}
  - {lane: Resolver, to: Redis, text: 'SET link = enabled, TTL 20 s', set: {Redis: 'enabled ⚠ until TTL'}}
find:
  prompt: Which step reintroduces the stale "enabled" value?
  answer: 4
  explain: |
    The late refill. Because the TTL caps it at 20 s (and the CDN adds 30 s), the bound still holds — that's why the TTL is the guarantee and invalidation is the optimisation. If the product later demands *immediate* disables (a follow-up interviewers like), you'd add versioned fills or leases, a short delayed second delete, and CDN purge on disable, and you might bypass edge caching for links flagged as disabled.
```

## 7. Failure modes

| Failure | Effect | Mitigation |
|---|---|---|
| Redis down | Every resolve hits Postgres (20k/s) | Size the primary + replica to survive it briefly; per-instance in-memory LRU; CDN absorbs hot links |
| Primary down | Creates and updates fail; resolves continue from cache and replica | Automated failover; resolves read from the replica on a miss |
| App server crash after commit, before response | Client retries the create | Idempotency key returns the original link |
| Malicious destinations | Shortener used for phishing | Safe Browsing check on create, a disable path for abuse reports, rate limits per account |
| Hot viral link | One key hammered | CDN caching plus in-process cache, already covered |

```bug
title: Review the resolve handler
prompt: Which lines break a requirement?
lang: python
code: |
  @app.get("/{code}")
  def resolve(code):
      link = cache.get(code)
      if link is None:
          link = db.replica.get_link(code)
          cache.set(code, link, ex=3600)
      analytics.record_click_sync(code, request.headers)
      return redirect(link.destination, status=301)
bug: [6, 7, 8]
explain: |
  **Line 6:** a one-hour TTL breaks the 60-second freshness bound whenever an invalidation is missed (and doesn't cache "not found" deliberately — `link` may be `None`, which then crashes the next line). **Line 7:** synchronous analytics puts a non-essential dependency on the critical path, so its latency and outages become redirect latency and outages. Emit an async event instead. **Line 8:** a 301 may be cached by browsers indefinitely, so a later disable never reaches visitors who already followed the link. Use 302/307 with an explicit short Cache-Control. It also never checks `enabled`, so disabled links still redirect.
```

## 8. Evolution

```order
prompt: Order the evolution steps as load grows, each with its trigger.
items:
  - "Baseline: stateless resolvers, Postgres primary + replica, Redis cache-aside, CDN with short max-age"
  - "Trigger — Redis CPU or network nearing limits on hot keys: add a per-instance in-memory cache with a 5 s TTL"
  - "Trigger — click analytics needed: stream click events to Kafka and aggregate in a columnar store"
  - "Trigger — links grow past what one primary stores comfortably (hundreds of millions): partition by code hash"
  - "Trigger — global latency targets: multi-region read replicas and resolvers, with writes to one region"
explain: Each step answers a measured trigger, not a hypothetical. A strong answer states the trigger along with the step.
```

```interview
say: |
  "It's tiny data and read-heavy: 10M links is about 5 GB, but there are 20k redirects/s and a 60-second freshness bound. Postgres stores links keyed by a random 7-character base62 code with a unique constraint; creates take idempotency keys and updates check owner and version. Resolution goes CDN (max-age 30) → stateless resolver → Redis (TTL 20, DEL on write) → Postgres, so worst-case staleness is 50 s even if invalidation fails, and I return 302s rather than 301s. Unknown and disabled codes are cached as negatives too. Clicks are emitted asynchronously. If Redis dies, the replica and CDN carry the load while it recovers."
followups:
  - q: What if disables must be immediate?
    a: Purge the CDN entry and delete the Redis key on disable, protect against refill races with versioned fills or leases, add a delayed second delete, and optionally don't edge-cache links with a recent disable. Then the TTL becomes only a safety net.
  - q: How do you prevent enumeration of codes?
    a: Random codes from a 3.5-trillion space make guessing unproductive. Add rate limiting on 404s per IP, and never use sequential codes without scrambling.
  - q: How would you count clicks?
    a: Emit an event per redirect to a stream asynchronously, aggregate in a stream processor into per-link counters or a columnar store, and accept slightly delayed counts. Never write a counter row synchronously per click.
weak: |
  Jumps to "hash the URL with MD5 and shard by hash," uses 301s, ignores freshness, ownership and failure.
strong: |
  Derives everything from the estimates and the freshness bound, proves the staleness budget across layers, explains code generation and collisions, keeps analytics off the hot path, and lists failure modes and evolution triggers.
```

```recall
prompt: Explain how you'd guarantee that disabling a short link takes effect within 60 seconds, even if a cache invalidation is lost.
points:
  - Use temporary redirects (302/307) with explicit short Cache-Control, never permanent 301s that browsers may cache indefinitely
  - Give every cache layer a TTL so the sum of TTLs along the read path (e.g. Redis 20 s + CDN 30 s = 50 s) is within 60 s
  - Invalidate on write (DEL in Redis, CDN purge) to make the usual case fast, but don't depend on it for the guarantee
  - Account for refill races and replica lag in the bound (fill from the primary or add lag to the budget)
model: |
  The guarantee comes from bounded TTLs, not from invalidation. Redirects are 302s with explicit short Cache-Control, so browsers don't keep them. Each layer has a TTL — Redis 20 seconds, CDN 30 seconds — so even a value refilled from stale data right before the disable can survive at most 50 seconds, inside the 60-second promise. On every update we also delete the Redis key and can purge the CDN, so in practice disables apply within a second or two, but a lost delete or a stale-refill race only degrades to the TTL bound. Redis is filled from the primary, or the replica lag is added to the budget.
```

```questions
- kind: check
  prompt: Why should the redirect use 302 (or 307) rather than 301?
  choices:
    - text: Browsers may cache 301s indefinitely, so later updates and disables wouldn't reach those visitors
      correct: true
    - text: 302 is faster to process
      why: Speed is identical. Cacheability is the difference.
    - text: 301 isn't supported by browsers
      why: It is supported.
    - text: 302 is required for HTTPS
      why: Both work over HTTPS.
  explanation: Temporary redirects plus explicit Cache-Control keep freshness under your control.
- kind: check
  type: numeric
  prompt: Redis caches links for 25 s and the CDN for 30 s. With no invalidation, what's the worst-case staleness in seconds?
  answer: 55
  unit: s
  tolerance: 0.01
  explanation: 25 + 30 = 55 s. Downstream caches can fetch an almost-expired upstream copy and keep it for their own full TTL.
- kind: check
  type: multi
  prompt: Which belong in the create-link flow? Select all that apply.
  choices:
    - text: An idempotency key so a retried create returns the same link
      correct: true
    - text: Inserting the code with a unique constraint and retrying on conflict
      correct: true
    - text: Checking the destination against a malicious-URL list
      correct: true
    - text: Truncating MD5(destination) to 7 characters as the code
      why: Different owners shortening the same URL collide, and truncated hashes collide anyway.
  explanation: Creation must be retry-safe, collision-safe and abuse-aware.
- kind: check
  prompt: 10M links at about 500 bytes each. What does the storage estimate imply?
  choices:
    - text: About 5 GB — one database node with a replica is plenty; no sharding needed
      correct: true
    - text: About 5 TB — shard immediately
      why: That's off by 1,000×.
    - text: Too much for Postgres
      why: It's a small dataset.
    - text: It must live in Redis only
      why: Redis is a cache here. The durable source stays in Postgres.
  explanation: Estimates justify the simple design and redirect effort to the read path and freshness.
- kind: fire
  prompt: Click analytics are recorded synchronously in the redirect handler. What's the problem?
  choices:
    - text: Analytics latency and outages become redirect latency and outages
      correct: true
    - text: Clicks are counted twice
      why: Not inherently.
    - text: Redirects can't include analytics
      why: They can, asynchronously.
    - text: The CDN blocks analytics
      why: CDN-cached redirects simply aren't seen by the origin — a separate consideration.
  explanation: Keep non-essential work off the critical path. Emit an event and aggregate it elsewhere.
- kind: fire
  prompt: Why cache "not found" results for unknown codes?
  choices:
    - text: Bots requesting random codes would otherwise send every request to the database (cache penetration)
      correct: true
    - text: To make 404s faster to render
      why: That's a side benefit. Protecting the database is the point.
    - text: Because unknown codes become valid automatically
      why: They don't.
    - text: The CDN requires it
      why: It doesn't.
  explanation: Negative caching (short TTL) plus rate limiting on 404s protects the source of truth.
- kind: fire
  prompt: Redis fails during peak. What protects Postgres from 20,000 lookups per second?
  choices:
    - text: The CDN absorbs hot links, per-instance caches absorb more, and the primary plus replica are sized to survive the remainder briefly
      correct: true
    - text: Nothing is needed — Postgres scales infinitely
      why: It has limits.
    - text: Return errors for all redirects until Redis returns
      why: That's an unnecessary full outage.
    - text: Switch to 301 redirects
      why: That breaks freshness and doesn't help immediately.
  explanation: Layered caches and capacity planning for the miss path keep the service up while the cache recovers.
- kind: fire
  level: advanced
  prompt: An interviewer adds "disables must take effect immediately". What's the best set of changes?
  choices:
    - text: Purge the CDN and delete the Redis key on disable, prevent refill races (versioned fills or leases), and add a delayed second delete
      correct: true
    - text: Set every TTL to 1 second
      why: That destroys hit rates and still allows a second of staleness, plus refill races.
    - text: Remove all caches
      why: Then the database takes 20k/s directly.
    - text: Use 301 redirects
      why: Permanent redirects are cached longer, not shorter.
  explanation: Immediate disables need reliable invalidation at every layer plus race protection. The TTL remains only a safety net.
- kind: fire
  type: order
  prompt: Order the phases of presenting this design in an interview.
  items:
    - Clarify scope, scale, the freshness bound and the ownership invariant
    - Estimate storage, read rate and code space
    - Define the API and data model
    - Draw the architecture and trace a hit, a miss and a disable
    - Deep-dive the freshness bound and failure modes
    - Describe evolution triggers
  explanation: Requirements and numbers first, then interfaces, then the flow, then the deep dives that show judgement.
```
