---
id: feed-fanout
category: specialised
skill: capacity
title: Feeds and the fan-out problem
minutes: 15
summary: A home feed merges posts from everyone you follow. You can do that work when someone posts (fan-out on write — push to every follower's timeline) or when someone reads (fan-out on read — pull and merge at request time). Push makes reads cheap and celebrity posts catastrophically expensive; pull does the reverse. Every large social product ends up with a hybrid.
objectives:
  - Compare fan-out on write and fan-out on read by write amplification, read cost, latency and storage
  - Explain the celebrity problem and design a hybrid with a follower threshold
  - Store timelines efficiently (capped lists of IDs) and hydrate them at read time
  - Handle deletes, edits, privacy changes and inactive users in a fan-out system
sources:
  - ['Twitter engineering (2013): The infrastructure behind Twitter — timelines at scale (InfoQ talk)', 'https://www.infoq.com/presentations/Twitter-Timeline-Scalability/']
  - ['Silberstein et al., Feeding Frenzy: Selectively Materializing Users’ Event Feeds (SIGMOD 2010)', 'https://www.cs.princeton.edu/courses/archive/spr17/cos518/papers/feeding-frenzy.pdf']
  - ['Instagram engineering: Making Instagram.com faster (feed)', 'https://instagram-engineering.com/']
---

> [!incident] One tweet, 30 million writes
> Twitter's early timeline system pushed every tweet into the cached home timeline of every follower. For most users that's a few hundred writes. For an account with tens of millions of followers, a single tweet meant tens of millions of cache writes, and fan-out lag for the biggest accounts could stretch to minutes — some followers saw a celebrity's tweet long after others had replied to it. Twitter moved to a hybrid: push for ordinary accounts, and merge the few very-high-follower accounts in at read time.

## Two ways to build a feed

**Fan-out on write (push):** when Alice posts, a background job inserts the post ID into each follower's precomputed timeline (often a capped Redis list). Reading your feed is one lookup.

**Fan-out on read (pull):** when Bob opens his feed, fetch recent posts from everyone he follows and merge them by time or rank. Posting is a single write.

| | Fan-out on write (push) | Fan-out on read (pull) |
|---|---|---|
| Cost per post | O(followers) timeline inserts | 1 write |
| Cost per feed read | 1 lookup | O(accounts followed) fetches and a merge |
| Read latency | Very low and predictable | Higher, varies with follow count |
| Freshness | Delayed by fan-out lag (seconds; minutes for huge accounts) | Always current |
| Storage | One timeline per user | Only the posts themselves |
| Pain point | Celebrities; inactive users' timelines wasted | Users following thousands; heavy reads |

Reads usually outnumber writes 100:1 or more, which is why push is attractive — until you meet the celebrity.

```sim
name: fanout
title: Push, pull and hybrid
challenges:
  - {text: 'With push and 0.1% of posts from 20M-follower celebrities, see timeline inserts per second explode', metric: writes, op: '>', value: 100000000, and: [{metric: strategy, op: '==', value: push}]}
  - {text: 'Switch to pull and see the read side explode instead', metric: readQueries, op: '>', value: 50000000, and: [{metric: strategy, op: '==', value: pull}]}
  - {text: 'Use the hybrid with a threshold that keeps inserts under 20M/s and reads under 5 queries per feed load', metric: writes, op: '<', value: 20000000, and: [{metric: strategy, op: '==', value: hybrid}, {metric: perRead, op: '<', value: 5}]}
takeaway: |
  Push costs scale with **audience size**; pull costs scale with **how many accounts each reader follows**. The hybrid pushes ordinary posts (cheap, since most accounts have small audiences) and pulls only from the handful of huge accounts a user follows, merging them in at read time. The threshold is a tunable knob, set where the two costs balance.
```

```calc
title: Fan-out write load
prompt: At peak, users publish **6,000 posts/s**. The average post's author has **300** followers. With pure fan-out on write (ignoring celebrities), how many timeline inserts per second is that, in **millions**?
answer: 1.8
unit: million inserts/s
tolerance: 1.02
steps: |
  6,000 × 300 = **1.8 million** inserts/s — feasible with a sharded in-memory store and batched pipelines. Now add one account with 50M followers posting once a minute: that's 50M inserts in a burst, about 830k/s on average from a *single* user. Averages hide the tail of follower counts, which is exactly the celebrity problem.
```

## Storing and serving timelines

- Store **post IDs, not posts:** a timeline is a capped list (e.g. the latest 800 IDs) per user, in a sharded in-memory store. Reading returns IDs, then **hydrates** them — fetching post bodies, author info and counts in batch from caches.
- **Cap and trim:** nobody scrolls back 10,000 items through the precomputed timeline; older pages can fall back to pull.
- **Skip inactive users:** don't fan out to users who haven't opened the app in 30 days. Build their timeline on demand (pull) when they return.
- **Ranking:** modern feeds rank rather than sort chronologically. Candidate generation (pushed timeline plus pulled celebrity posts plus recommendations) feeds a ranking model at read time.

```arch
title: A hybrid feed
nodes:
  - {id: author, label: Author, kind: client, x: 0, y: 0}
  - {id: post, label: Post service, kind: service, x: 1, y: 0}
  - {id: posts, label: Posts store, kind: db, x: 2, y: 0}
  - {id: fan, label: Fan-out workers, kind: worker, x: 1, y: 1}
  - {id: tl, label: Timeline cache, kind: cache, x: 2, y: 1, note: 'capped ID lists'}
  - {id: feed, label: Feed service, kind: service, x: 3, y: 1}
  - {id: reader, label: Reader, kind: client, x: 3, y: 2}
edges:
  - [author, post, 'publish']
  - [post, posts, 'store']
  - [post, fan, 'PostCreated']
  - [fan, tl, 'push IDs']
  - [reader, feed, 'GET /feed']
  - [feed, tl, 'read IDs']
  - [feed, posts, 'celebrity posts + hydrate']
paths:
  - label: Ordinary user posts
    steps:
      - [author, post, 'An author with 400 followers publishes']
      - [post, posts, 'The post is stored durably (the source of truth)']
      - [post, fan, 'A PostCreated event goes to fan-out workers (via an outbox)']
      - [fan, tl, 'Workers push the post ID onto the timelines of 400 followers (skipping inactive ones), trimming each to 800 entries']
  - label: Celebrity posts
    steps:
      - [author, post, 'An account above the threshold (say 1M followers) publishes']
      - [post, posts, 'Stored once. No fan-out at all.']
  - label: Reader opens the feed
    steps:
      - [reader, feed, 'GET /feed']
      - [feed, tl, 'Read the precomputed timeline IDs (pushed posts)']
      - [feed, posts, 'Fetch recent posts from the ~5 celebrities this reader follows, merge, rank, and hydrate the top items']
```

## Deletes, edits and privacy

Fan-out creates copies (of IDs) everywhere, so changes must reach them:

- **Deletes:** because timelines hold only IDs, hydration can drop posts that no longer exist or are hidden — no need to rewrite millions of timelines synchronously. Asynchronous cleanup can remove the IDs later.
- **Edits:** with ID-only timelines, edits show up automatically at hydration.
- **Unfollows and blocks:** filter at read time (check the relationship during hydration), and clean up asynchronously.
- **Privacy changes** (an account goes private): enforce at read time. Never trust that the precomputed timeline is still authorised.

```bug
title: A fan-out worker
prompt: This worker runs for every new post. Which lines cause problems at scale?
lang: python
code: |
  def on_post_created(post):
      followers = db.query("SELECT follower_id FROM follows WHERE followee_id=%s", post.author_id)
      for f in followers:
          redis.lpush(f"timeline:{f}", json.dumps(post.full_body()))
          redis.ltrim(f"timeline:{f}", 0, 799)
bug: [2, 4]
explain: |
  **Line 2** loads every follower in one query and fans out to all of them, including celebrities with tens of millions of followers (minutes of work and a huge burst) and inactive users whose timelines will never be read. Page through followers in batches, skip inactive users, and don't fan out for accounts above a follower threshold. **Line 4** stores the full post body in every timeline, multiplying storage by the follower count and making edits and deletes require rewriting millions of copies. Store just the post ID and hydrate at read time. (Use pipelining so each follower isn't two round trips.)
fix: |
  def on_post_created(post):
      if author_follower_count(post.author_id) > CELEBRITY_THRESHOLD:
          return                                      # merged at read time instead
      for batch in active_followers_in_batches(post.author_id, size=5000):
          with redis.pipeline() as p:
              for f in batch:
                  p.lpush(f"timeline:{f}", post.id)
                  p.ltrim(f"timeline:{f}", 0, 799)
              p.execute()
```

```predict
prompt: A user with 40 million followers deletes a post one minute after publishing it, and the system used fan-out on write with full post bodies copied into timelines. What's the cost of honouring the delete?
choices:
  - One database delete
  - Finding and removing (or rewriting) the copy in up to 40 million timelines — and until that finishes, followers still see the deleted post
  - Nothing, because deleted posts disappear on their own
  - Rebuilding the database
answer: 1
reveal: |
  Copies must be chased down. Storing IDs only and filtering at hydration makes the delete take effect immediately for everyone (the post lookup returns "deleted"), with timeline cleanup done lazily. This is one more reason big accounts are pulled at read time in hybrid designs.
```

```interview
say: |
  "Hybrid fan-out. Posts are stored once; an outbox event triggers fan-out workers that push post IDs onto capped 800-entry Redis timelines for each active follower, in batches. Accounts above about 500k followers skip fan-out; their recent posts are fetched and merged at read time — most users follow only a handful of them. Feed reads take the timeline IDs plus the celebrity candidates, rank them, and hydrate the top 50 from post and user caches, applying deletes, blocks and privacy checks then. Inactive users' timelines are rebuilt on demand when they return."
followups:
  - q: Why not pure push?
    a: Write amplification is proportional to audience size. A celebrity post means tens of millions of inserts and minutes of fan-out lag, plus wasted work for inactive followers.
  - q: Why not pure pull?
    a: Every feed read would query hundreds of accounts and merge, which is expensive and slow given reads outnumber writes by orders of magnitude.
  - q: How do deletes work?
    a: Timelines store IDs only, so hydration drops deleted or hidden posts immediately, and background jobs clean the IDs out later.
weak: |
  "When someone posts, add it to all followers' feeds." No awareness of celebrity amplification, storage multiplication, inactive users or delete propagation.
strong: |
  Quantifies push versus pull costs, chooses a hybrid with a threshold, stores capped ID lists and hydrates at read time, skips inactive users, and enforces deletes and privacy at read time.
```

```recall
prompt: Explain the celebrity problem in fan-out on write and how a hybrid feed design solves it.
points:
  - Fan-out on write inserts each new post into every follower's timeline, so cost grows with the author's follower count
  - A celebrity with tens of millions of followers creates a massive burst of writes and long fan-out delays for one post
  - The hybrid skips fan-out for accounts above a follower threshold and fetches their recent posts at read time
  - Readers merge their pushed timeline with the few celebrity accounts they follow, keeping both write and read costs bounded
model: |
  Fan-out on write precomputes timelines by copying each post's ID to every follower, so writing costs O(followers). That's fine for typical accounts, but one post from an account with 40 million followers means 40 million inserts, a huge spike, and minutes before some followers see it. The hybrid treats accounts above a threshold differently: their posts aren't fanned out. When someone opens their feed, the service reads their precomputed timeline (posts from ordinary accounts) and separately fetches the latest posts from the handful of high-follower accounts they follow, merging them. Writes stay proportional to typical audiences, and reads add only a few extra lookups.
```

```questions
- kind: check
  prompt: In fan-out on write, what does the cost of publishing one post scale with?
  choices:
    - text: The author's number of followers
      correct: true
    - text: The number of accounts the author follows
      why: That drives read cost in fan-out on read.
    - text: The post length
      why: That's small compared with the follower multiplier.
    - text: The number of total users
      why: Only followers get the insert.
  explanation: Push copies (IDs of) the post to every follower's timeline, so huge audiences mean huge write bursts.
- kind: check
  type: numeric
  prompt: 4,000 posts per second are published and authors average 250 followers. With pure fan-out on write, how many timeline inserts per second is that?
  answer: 1000000
  unit: inserts/s
  tolerance: 0.01
  explanation: 4,000 × 250 = 1,000,000 inserts/s — before any celebrity spikes.
- kind: check
  type: multi
  prompt: Which are good practices in a fan-out-on-write system? Select all that apply.
  choices:
    - text: Store post IDs in timelines and hydrate at read time
      correct: true
    - text: Cap timelines to a fixed length
      correct: true
    - text: Skip fan-out to long-inactive users
      correct: true
    - text: Skip fan-out for accounts above a follower threshold (pull them at read time)
      correct: true
    - text: Copy full post bodies into every timeline
      why: That multiplies storage and makes edits and deletes expensive.
  explanation: These bound write amplification, storage and propagation costs.
- kind: check
  prompt: Why is fan-out on read expensive for a typical social app?
  choices:
    - text: Every feed load queries all followed accounts and merges, and reads vastly outnumber writes
      correct: true
    - text: Posting becomes slow
      why: Posting is a single write under pull.
    - text: Timelines take too much storage
      why: Pull doesn't store per-user timelines.
    - text: It can't show celebrity posts
      why: It shows them fine. Reads are just costly.
  explanation: Pull moves work to the read path, which is the hot path in social products.
- kind: fire
  prompt: A celebrity deletes a post that was fanned out (as an ID) to millions of timelines. How does an ID-based design make the delete take effect immediately?
  choices:
    - text: Hydration looks up each post, sees it's deleted, and drops it; timeline IDs are cleaned up lazily
      correct: true
    - text: Every timeline is rewritten synchronously before the delete returns
      why: That's slow and unnecessary with ID-only timelines.
    - text: The delete only applies to new readers
      why: Hydration applies it to every reader immediately.
    - text: Deleted posts can't be removed from feeds
      why: They can, through read-time filtering.
  explanation: Indirection through IDs turns a massive fan-out update into a single source-of-truth change.
- kind: fire
  prompt: In a hybrid design, which posts are merged in at read time?
  choices:
    - text: Recent posts from followed accounts above the follower threshold
      correct: true
    - text: All posts from everyone followed
      why: That's pure pull.
    - text: Posts from inactive users
      why: Inactivity concerns readers, not authors.
    - text: Only the reader's own posts
      why: Unrelated.
  explanation: Pushing ordinary accounts and pulling a few huge ones keeps both costs bounded.
- kind: fire
  prompt: Users who haven't opened the app in 60 days still receive timeline inserts. What's the improvement?
  choices:
    - text: Skip fan-out to inactive users and build their timeline on demand when they return
      correct: true
    - text: Delete their accounts
      why: That's not a scaling strategy.
    - text: Push more posts to them so they come back
      why: That's wasted writes.
    - text: Use a larger cache
      why: That just stores more wasted timelines.
  explanation: Don't precompute what nobody will read. Pull is a fine fallback for rare readers.
- kind: fire
  level: advanced
  prompt: An account goes private. Precomputed timelines of non-approved followers still contain its post IDs. How should the feed stay correct?
  choices:
    - text: Enforce visibility at hydration time on every read, and clean up stale IDs asynchronously
      correct: true
    - text: Trust that precomputed timelines are always authorised
      why: Relationships and privacy change after fan-out.
    - text: Rebuild every timeline synchronously before saving the privacy change
      why: That's too slow, and read-time checks are needed anyway.
    - text: Ignore it until the posts age out
      why: That leaks private content.
  explanation: Authorisation must be checked when content is shown, not only when it was fanned out.
- kind: fire
  type: multi
  prompt: Which costs grow when you lower the hybrid's celebrity threshold (pulling more accounts at read time)? Select all that apply.
  choices:
    - text: Queries per feed read
      correct: true
    - text: Read latency
      correct: true
    - text: Write amplification
      why: It falls, because fewer accounts are fanned out.
    - text: Timeline storage
      why: It falls slightly, because fewer posts are pushed.
  explanation: The threshold trades write cost against read cost. Tune it to where the totals are lowest.
```
