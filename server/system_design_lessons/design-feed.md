---
id: design-feed
category: casebook
skill: capacity
title: Design a social news feed
minutes: 22
summary: The home feed of a Twitter/Instagram-style product — post, follow, and read a ranked timeline in under 200 ms for hundreds of millions of users. The design hinges on the fan-out decision, ID-only timelines hydrated at read time, a ranking stage with a latency budget, counters that can't be single rows, and media that never touches your app servers.
objectives:
  - Scope and size a feed system, and find the dominant costs
  - Design hybrid fan-out with timeline storage, hydration and ranking within a latency budget
  - Handle hot counters, media delivery, pagination over ranked results and deletes
  - Present failure modes and evolution for a large read-heavy social system
sources:
  - ['Twitter: The infrastructure behind Twitter — scale (2017)', 'https://blog.x.com/engineering/en_us/topics/infrastructure/2017/the-infrastructure-behind-twitter-scale']
  - ['Meta engineering: Serving Facebook Multifeed (2015)', 'https://engineering.fb.com/2015/03/10/production-engineering/serving-facebook-multifeed-efficiency-performance-gains-through-redesign/']
  - ['Instagram engineering: Sharding & IDs at Instagram', 'https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c']
case: feed
---

## 1. Requirements

**Functional:** create a post (text plus up to 4 images), follow/unfollow, view a home feed of followed accounts' posts (ranked), like and comment, view a user's profile timeline.

**Non-functional:** 300M daily active users; feed p99 < 200 ms (excluding image download); posts visible to followers within ~5 s typically; feeds may be slightly stale; availability prioritised over strict consistency for feeds, but a user always sees their own new post immediately.

**Out of scope:** ads, search, direct messages, recommendations of unfollowed accounts (a candidate source we'll name but not design).

```predict
prompt: What dominates the cost of this system?
choices:
  - Storing post text
  - Feed reads — hundreds of thousands per second, each needing a merged, ranked, hydrated list of posts from many accounts
  - User signups
  - Follow/unfollow operations
answer: 1
reveal: |
  Reads outnumber posts by orders of magnitude, and each read logically merges posts from hundreds of followed accounts. Hence precomputing timelines (fan-out on write) for most accounts — and the celebrity exception. Media bytes dominate *bandwidth*, which is why images go through object storage and a CDN.
```

## 2. Estimates

```faded
title: Size the feed
prompt: Fill in the estimates.
text: |
  300M DAU × 10 feed loads/day = 3B loads/day ≈ [[#35000]] loads/s on average, ~100k/s at peak.

  300M DAU × 0.5 posts/day = 150M posts/day ≈ 1,700 posts/s, ~5k/s at peak.

  Median follower count 200, so typical fan-out at peak ≈ 5,000 × 200 = [[#1000000]] timeline inserts/s — feasible in a sharded in-memory store, *excluding* celebrities.

  Timeline storage: 300M users × 800 post IDs × 8 bytes ≈ [[1.9 TB|19 GB|190 TB]] in memory (before replication) — a sizeable but ordinary Redis/Memcached-class cluster.

  Media: if 30% of posts carry 2 images of 300 KB, that's ~27 TB of new images per day, so [[object storage behind a CDN|the posts database|the timeline cache]].
explain: The numbers point at the architecture — precompute timelines, keep them as IDs in memory, push media out to object storage and CDN, and treat celebrities separately.
```

## 3. API and data

```http
POST /v1/posts                 {text, media_ids[]}          -> 201 {post_id}
POST /v1/users/{id}/follow                                  -> 204
GET  /v1/feed?cursor=…&limit=30                             -> 200 {items[], next_cursor}
POST /v1/posts/{id}/likes                                   -> 204   (idempotent per user)
POST /v1/media/upload-url      {content_type, size}         -> presigned PUT
```

- **Posts:** sharded by `post_id` (Snowflake-style, time-sortable) in a sharded relational or wide-column store; author's profile timeline sharded by `author_id`, clustered by `post_id DESC`.
- **Follows:** `follows(follower_id, followee_id)` and the reverse index `followers(followee_id, follower_id)`, each sharded by its first column.
- **Timelines:** `timeline:{user_id}` → capped list of post IDs (800) in a sharded in-memory store.
- **Counters:** likes/comments counts in sharded counters, cached.

## 4. Architecture

```arch
title: Feed system
nodes:
  - {id: client, label: App, kind: client, x: 0, y: 1}
  - {id: post, label: Post service, kind: service, x: 1, y: 0}
  - {id: pdb, label: Posts store, kind: db, x: 2, y: 0}
  - {id: bus, label: Event stream, kind: stream, x: 2, y: 1}
  - {id: fan, label: Fan-out workers, kind: worker, x: 3, y: 1}
  - {id: tl, label: Timeline cache, kind: cache, x: 3, y: 2, note: 'IDs, sharded'}
  - {id: feed, label: Feed service, kind: service, x: 1, y: 2}
  - {id: rank, label: Ranker, kind: service, x: 2, y: 2, note: '30 ms budget'}
  - {id: cdn, label: CDN, kind: cdn, x: 0, y: 0}
edges:
  - [client, post, 'POST /posts']
  - [post, pdb, 'store']
  - [post, bus, 'PostCreated (outbox)']
  - [bus, fan, 'consume']
  - [fan, tl, 'push IDs']
  - [client, feed, 'GET /feed']
  - [feed, tl, 'read IDs']
  - [feed, rank, 'score candidates']
  - [client, cdn, 'images']
paths:
  - label: Publish
    steps:
      - [client, post, 'The client has already uploaded images to object storage via presigned URLs; it posts text + media IDs']
      - [post, pdb, 'Store the post (and append to the author''s profile timeline)']
      - [post, bus, 'Emit PostCreated through an outbox']
      - [fan, tl, 'For authors under ~500k followers, push the post ID onto each active follower''s timeline in batches; celebrities are skipped']
  - label: Read the feed
    steps:
      - [client, feed, 'GET /feed']
      - [feed, tl, 'Read ~800 candidate IDs from the user''s timeline, plus recent posts of the few celebrities they follow (from the posts store, cached)']
      - [feed, rank, 'Score ~500 candidates with a lightweight model; keep the top 30']
      - [feed, pdb, 'Hydrate the 30 posts, authors and counts in batch from caches; drop deleted, blocked or private items; return with a cursor']
      - [client, cdn, 'Images load from the CDN by URL']
```

## 5. Deep dives

### Fan-out strategy

```sim
name: fanout
title: Tune the hybrid
config: {initial: {strategy: hybrid, posts: 5000, avgFollowers: 200, reads: 100000, follows: 300}}
challenges:
  - {text: 'Find a celebrity threshold that keeps timeline inserts under 5M/s and feed reads under 6 queries each', metric: writes, op: '<', value: 5000000, and: [{metric: perRead, op: '<', value: 6}, {metric: strategy, op: '==', value: hybrid}]}
```

### Pagination over a ranked feed

Ranked feeds can't page by `created_at`: scores change between requests and new items arrive. A common approach: rank once per session into a short-lived **feed snapshot** (the ordered list of IDs, cached for ~10 minutes), and page through it with an index cursor. Pull-to-refresh builds a new snapshot. This avoids duplicates and skips across pages.

### Hot counters

A viral post can receive 100k likes per minute. A single `like_count` row would be a hot spot:

```bug
title: The like endpoint
prompt: Which lines will fail under a viral post?
lang: python
code: |
  @app.post("/v1/posts/{post_id}/likes")
  def like(user, post_id):
      db.execute("INSERT INTO likes (post_id, user_id) VALUES (%s, %s)", post_id, user.id)
      db.execute("UPDATE posts SET like_count = like_count + 1 WHERE id = %s", post_id)
      cache.delete(f"post:{post_id}")
bug: [3, 4, 5]
explain: |
  **Line 3** isn't idempotent: a double-tap or retry inserts a second like (use a primary key on `(post_id, user_id)` with ON CONFLICT DO NOTHING, and only count when a row was inserted). **Line 4** makes every like contend on one row of a hot post — row-lock contention and replication load. Use sharded counters or aggregate like events from a stream into periodic increments. **Line 5** deletes the hot post's cache entry on every like, causing a refill storm on exactly the post everyone is reading. Update counts asynchronously and let the display count lag by seconds.
fix: |
  @app.post("/v1/posts/{post_id}/likes")
  def like(user, post_id):
      inserted = db.execute("""INSERT INTO likes (post_id, user_id) VALUES (%s, %s)
                               ON CONFLICT DO NOTHING""", post_id, user.id).rowcount
      if inserted:
          events.publish("PostLiked", post_id=post_id)   # aggregated into sharded counters
```

### Your own post, immediately

Fan-out takes seconds, so the author's own feed read would miss the new post. Merge the author's recent posts (from the posts store or a short-lived client-side insert) into their feed — read-your-writes for the author only.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Timeline cache shard lost | Rebuild that user's timeline on demand by pulling recent posts from followed accounts (slower first load), then repopulate |
| Fan-out backlog (event spike) | Feeds are a little stale; monitor fan-out lag; authors still see their own posts |
| Ranker slow | Fall back to recency ordering after a 30 ms budget — degrade, don't fail |
| Celebrity posts | Read-time merge, never fan-out storms |
| Deleted or private content | Hydration filters every item on every read |

```order
prompt: Order these evolution steps.
items:
  - "Launch: pull-based feed from a sharded posts store (simple, fine at small scale)"
  - "Reads grow: precomputed timelines with fan-out on write for everyone"
  - "First celebrity storms: hybrid fan-out with a follower threshold"
  - "Engagement focus: candidate generation + ML ranking within a latency budget"
  - "Global users: regional read replicas and timeline caches, writes homed by user region"
explain: Real products followed roughly this path. Each step answered a measured pain — read cost, celebrity write storms, engagement — rather than being designed in up front.
```

```interview
say: |
  "Reads dominate — about 100k feed loads a second at peak — so most timelines are precomputed. Posting stores the post and emits an event; fan-out workers push post IDs into each active follower's capped Redis list, except for accounts above ~500k followers, which are merged at read time. A feed read takes ~800 candidate IDs plus celebrity posts, ranks ~500 with a 30 ms budget, hydrates the top 30 from caches while filtering deletes and privacy, and pages through a short-lived ranked snapshot. Likes are idempotent rows plus sharded, eventually consistent counters. Images go client → presigned S3 → CDN. Authors see their own posts immediately via a read-time merge."
followups:
  - q: How do you rebuild a lost timeline?
    a: On cache miss, pull recent posts from the accounts the user follows (and celebrity posts), rank and repopulate. Slower once, then fast again.
  - q: How do you paginate a ranked feed?
    a: Freeze a ranked snapshot of IDs per session for a short time and page through it by position; refresh builds a new one.
  - q: How are deletes handled?
    a: Timelines hold IDs only; hydration checks existence, visibility and blocks on every read, and background cleanup removes stale IDs.
weak: |
  "Store posts in a DB and query all followed users' posts sorted by time" for 300M users, or pure push that melts on celebrities. No hydration, counters or media plan.
strong: |
  Estimates drive a hybrid fan-out with ID timelines, a ranking budget with fallback, snapshot pagination, sharded counters, CDN media, read-your-writes for authors and explicit failure handling.
```

```recall
prompt: Describe what happens, end to end, when a user with 800 followers posts, and then when one follower opens their feed.
points:
  - The post is stored durably and a PostCreated event is emitted (via an outbox)
  - Fan-out workers push the post ID onto the capped timelines of the author's active followers
  - The follower's feed read takes timeline IDs plus recent celebrity posts as candidates and ranks them
  - The top items are hydrated in batch from caches (filtering deleted, blocked or private content) and returned with a cursor; images load from the CDN
model: |
  The post service writes the post to the sharded posts store and, through an outbox, emits PostCreated. Fan-out workers look up the author's followers in batches, skip inactive ones, and push the post ID onto each follower's capped timeline list in the in-memory store. When a follower opens the app, the feed service reads their ~800 timeline IDs, adds recent posts from the handful of celebrity accounts they follow, scores the candidates within a short latency budget, and hydrates the top 30 — post bodies, authors, counts — from caches, dropping anything deleted, private or blocked. The response carries a cursor into a short-lived ranked snapshot, and images are fetched from the CDN.
```

```questions
- kind: check
  prompt: Why do feed systems store post IDs, not full posts, in timelines?
  choices:
    - text: Storage stays small, and edits, deletes and privacy changes apply at hydration time without rewriting millions of timelines
      correct: true
    - text: IDs load faster from disk than posts
      why: The bigger win is avoiding copies, not raw speed.
    - text: Posts can't be cached
      why: They're cached separately and hydrated by ID.
    - text: To avoid needing a posts store
      why: The posts store is the source of truth.
  explanation: Indirection keeps fan-out cheap and makes changes take effect immediately.
- kind: check
  type: numeric
  prompt: At peak, 5,000 posts/s are published with a median of 200 followers. How many timeline inserts per second is that (ignoring celebrities)?
  answer: 1000000
  unit: inserts/s
  tolerance: 0.01
  explanation: 5,000 × 200 = 1,000,000 inserts/s, handled by a sharded in-memory store and batched pipelines.
- kind: check
  type: multi
  prompt: Which belong in the feed read path? Select all that apply.
  choices:
    - text: Reading precomputed timeline IDs
      correct: true
    - text: Merging recent posts from followed celebrity accounts
      correct: true
    - text: Ranking candidates within a latency budget, with fallback to recency
      correct: true
    - text: Hydrating and filtering deleted, private or blocked content
      correct: true
    - text: Synchronously recomputing every like count from the likes table
      why: Counts come from cached, eventually consistent counters.
  explanation: Candidates, rank, hydrate, filter — with every step bounded in time.
- kind: check
  prompt: How should a ranked feed be paginated without duplicates or skips?
  choices:
    - text: Page through a short-lived ranked snapshot of IDs created for the session
      correct: true
    - text: Use OFFSET over a live ranking
      why: Scores and new items shift positions between requests.
    - text: Use created_at cursors
      why: Ranked order isn't chronological.
    - text: Return everything in one response
      why: That's unbounded and slow.
  explanation: Freezing the ranking for the session gives stable pages. Refresh rebuilds it.
- kind: fire
  prompt: A viral post gets 100k likes per minute and its like_count row becomes a hotspot. What's the fix?
  choices:
    - text: Idempotent like rows plus sharded or stream-aggregated counters displayed with slight lag
      correct: true
    - text: Lock the post row for each like
      why: That's the hotspot.
    - text: Disable likes on popular posts
      why: That's a product regression, not a design.
    - text: Store likes only in the client
      why: That loses data and allows abuse.
  explanation: Separate the exact per-user fact from the approximate aggregate, and spread the aggregate's writes.
- kind: fire
  prompt: An author posts, then immediately opens their feed, and the post isn't there yet. Why, and what's the fix?
  choices:
    - text: Fan-out is asynchronous; merge the author's own recent posts into their feed at read time
      correct: true
    - text: The post failed
      why: It's stored. Fan-out simply hasn't reached the author's timeline yet.
    - text: Caches are broken
      why: This is expected asynchrony, not breakage.
    - text: Wait 10 minutes
      why: Users expect to see their own post immediately.
  explanation: Provide read-your-writes for the author while everyone else gets eventual delivery.
- kind: fire
  prompt: A timeline cache shard is lost. How do affected users get feeds?
  choices:
    - text: Rebuild on demand by pulling recent posts from followed accounts, rank, and repopulate the cache
      correct: true
    - text: They see empty feeds until morning
      why: That's an unnecessary outage.
    - text: Restore timelines from database backups of the cache
      why: Timelines are derived data, rebuilt from the source.
    - text: Fan out every post ever again
      why: That's wildly expensive. Pull for the affected users instead.
  explanation: Derived caches should be rebuildable from sources of truth through a slower path.
- kind: fire
  level: advanced
  prompt: The ranking service is slow. What should the feed service do?
  choices:
    - text: Enforce a ranking time budget and fall back to recency ordering when it's exceeded
      correct: true
    - text: Wait for ranking however long it takes
      why: The whole feed's p99 would blow up.
    - text: Return an error
      why: An unranked feed beats no feed.
    - text: Retry ranking three times
      why: That makes latency worse.
  explanation: Optional enrichment needs budgets and graceful fallbacks.
- kind: fire
  type: order
  prompt: Order the feed read steps.
  items:
    - Read timeline IDs and celebrity candidates
    - Rank the candidates within a budget
    - Hydrate the top items from caches
    - Filter deleted, private and blocked content
    - Return items with a cursor
  explanation: Cheap candidate generation, bounded ranking, batch hydration, then safety filtering.
```
