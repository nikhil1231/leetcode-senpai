---
id: design-typeahead
category: casebook
skill: reads
title: Design search autocomplete
minutes: 18
summary: Autocomplete answers one question at enormous rates — "what are the 10 best completions for this prefix?" — within tens of milliseconds, while the user is still typing. You can't compute that at request time. Precompute top-k per prefix from query logs, serve it from memory sharded by prefix, cache short prefixes at the edge, and keep a fast path for removing suggestions that must disappear now.
objectives:
  - Explain why top-k completions must be precomputed, and size the request rate from typing behaviour
  - Build top-k-per-prefix structures (trie or prefix table) from logs with batch and streaming updates
  - Serve with prefix sharding, multi-layer caching and client debouncing within a 50 ms budget
  - Handle blocklisting, personalisation and trends
sources:
  - ['Twitter engineering: Typeahead.js', 'https://blog.x.com/engineering/en_us/a/2013/twitter-typeaheadjs-you-autocomplete-me']
  - ['LinkedIn engineering: Cleo — open-source typeahead', 'https://engineering.linkedin.com/open-source/cleo-open-source-technology-behind-linkedins-typeahead-search']
  - ['Elasticsearch: Completion suggester', 'https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-suggesters']
case: typeahead
---

## 1. Requirements

- Return the top 10 completions for the current prefix, ranked mainly by popularity (with recency boost).
- **200k suggestion requests/s** at peak; **p99 < 50 ms** end to end (the user is typing).
- Trending queries surface within about an hour.
- Offensive, dangerous or legally blocked suggestions removable **within minutes**.
- Light personalisation: the user's own recent searches appear first.

```predict
prompt: Why can't the server answer "top 10 completions for 'how to m'" by querying the search-log table at request time?
choices:
  - SQL can't do prefix matching
  - It would scan and aggregate millions of matching queries per keystroke — far beyond a 50 ms budget at 200k requests/s
  - Logs are encrypted
  - It would return too few results
answer: 1
reveal: |
  Ranking needs counts over all queries starting with the prefix. Computing that live is enormously expensive and repeated on every keystroke by every user. The answer for a prefix changes slowly, so compute it ahead of time and make serving a single lookup.
```

## 2. Estimates

```faded
title: Size it
prompt: Fill in the estimates.
text: |
  5B searches/day. Users type ~8 characters before choosing; with a 100 ms debounce the client sends about 4 requests per search: 20B requests/day ≈ [[#230000]] per second on average.

  Distinct popular queries kept for suggestions: ~100M. Each has ~15 prefixes, but prefixes are heavily shared; suppose 300M distinct prefixes are stored, each with 10 suggestion IDs (8 bytes) → [[24 GB|2.4 TB|240 MB]] plus the query strings — comfortably in memory across a few shards with replicas.

  The 1- and 2-character prefixes ("h", "ho") are requested constantly and are the same for everyone, so they are ideal for [[edge and browser caching|per-user databases|no caching]].
explain: Serving is a memory lookup. The engineering is in building the table, sharding it, caching hot prefixes, and keeping it fresh and clean.
```

## 3. Data structure

A **trie** stores each query along a path of characters; each node keeps the **precomputed top-k** completions beneath it, so a lookup is: walk to the prefix's node, return its list. Storing top-k at every node trades memory for O(prefix length) lookups.

In practice many systems flatten it into a **prefix table**: `prefix → [top 10 query IDs]`, in a key-value store or in-memory service, sharded by prefix.

```order
prompt: Order the offline pipeline that builds the suggestion table.
items:
  - Collect search logs (query, timestamp, region, language) into a log stream and data lake
  - Normalise queries (lowercase, trim, merge near-duplicates) and drop spam and blocklisted terms
  - Aggregate counts with time decay (recent searches weigh more)
  - For every prefix of every popular query, keep the top-k by score
  - Write a new versioned table and atomically switch serving to it
explain: A batch job (daily) builds the baseline. A streaming job (minutes to an hour) produces trending deltas merged in at serve time. Versioned tables let you roll back a bad build instantly.
```

## 4. Serving

```arch
title: Typeahead serving path
nodes:
  - {id: user, label: Browser, kind: client, x: 0, y: 1, note: 'debounce + local cache'}
  - {id: cdn, label: CDN, kind: cdn, x: 1, y: 1, note: 'caches 1–2 char prefixes'}
  - {id: svc, label: Suggest service, kind: service, x: 2, y: 1}
  - {id: shards, label: Prefix shards, kind: cache, x: 3, y: 0, note: 'top-k per prefix, in memory'}
  - {id: trend, label: Trending deltas, kind: cache, x: 3, y: 1}
  - {id: block, label: Blocklist, kind: cache, x: 3, y: 2, note: 'pushed within minutes'}
  - {id: hist, label: User history, kind: db, x: 2, y: 2}
edges:
  - [user, cdn, 'GET /suggest?q=how%20to%20m']
  - [cdn, svc, 'miss']
  - [svc, shards, 'lookup prefix']
  - [svc, trend, 'merge']
  - [svc, block, 'filter']
  - [svc, hist, 'recent (signed-in)']
paths:
  - label: Keystroke
    steps:
      - [user, cdn, 'The client waits ~100 ms after typing stops, reuses cached results for prefixes it already has, then requests the prefix']
      - [cdn, svc, 'Short prefixes are answered at the edge. Longer ones go to the suggest service.']
      - [svc, shards, 'Route by prefix to the owning shard and read its top 10 (in memory, < 1 ms)']
      - [svc, trend, 'Merge trending candidates for the prefix']
      - [svc, block, 'Remove anything on the blocklist — applied at serve time so removals are immediate']
      - [svc, hist, 'For signed-in users, prepend matching recent personal searches']
```

```sort
prompt: Where should each concern be handled?
buckets: [Client, Edge / CDN, Suggest service, Offline pipeline]
items:
  - {text: 'Waiting 100 ms after the last keystroke before sending', bucket: 0, why: 'Debouncing removes most intermediate requests for fast typists.'}
  - {text: 'Answering "a", "b", "th" for everyone', bucket: 1, why: 'Identical for all users and extremely hot, so they cache well at the edge (with a short TTL).'}
  - {text: 'Removing a defamatory suggestion within minutes', bucket: 2, why: 'A blocklist filter at serve time takes effect as soon as the list propagates, without waiting for a rebuild.'}
  - {text: 'Computing popularity with time decay over 30 days of logs', bucket: 3, why: 'Heavy aggregation belongs offline (batch plus streaming).'}
  - {text: "Merging the user's own recent searches", bucket: 2, why: 'Personal data is merged per request from a small per-user store.'}
```

## 5. Deep dives

### Sharding and hot prefixes

Shard by prefix (for example by the first two or three characters, or a hash of the prefix). Naive sharding by first letter makes "s" and "t" shards much hotter than "x". Hash-based placement balances storage, while the hottest short prefixes are absorbed by edge and client caches anyway.

### Freshness without rebuilding everything

```calc
title: How stale is the baseline?
prompt: The batch table is rebuilt every **24 hours** and takes **3 hours** to compute and load. Ignoring the streaming layer, what's the worst-case age of the data behind a suggestion, in **hours**?
answer: 27
unit: hours
tolerance: 1.02
steps: |
  A build starts with data up to time T, finishes at T + 3 h, and serves until the next build lands at T + 27 h. So suggestions can reflect data up to **27 hours** old — too slow for "trends within an hour". That's why a streaming layer computes recent counts (say, a sliding 1-hour window with decay) and merges trending candidates at serve time.
```

```bug
title: The suggest handler
prompt: Which lines break the latency target or the removal requirement?
lang: python
code: |
  def suggest(prefix, user):
      rows = db.query("""SELECT query, count(*) FROM search_log
                         WHERE query LIKE %s GROUP BY query ORDER BY 2 DESC LIMIT 10""", prefix + "%")
      results = [r.query for r in rows]
      return results
bug: [2, 4]
explain: |
  **Line 2** aggregates the raw search log on every keystroke — a scan and GROUP BY over billions of rows that can't meet 50 ms at 200k requests/s. Read a precomputed top-k for the prefix from memory instead. **Line 4** returns results with no blocklist filter (so a removed suggestion can reappear) and no personalisation merge. Apply the serve-time blocklist on every response.
fix: |
  def suggest(prefix, user):
      p = normalise(prefix)
      candidates = prefix_shards.top_k(p) + trending.top_k(p)
      results = [q for q in rank(candidates) if not blocklist.contains(q)][:10]
      if user:
          results = merge_recent(user_history.recent(user, p), results)
      return results
```

```interview
say: |
  "Serving is a lookup: prefix → precomputed top-10, held in memory and sharded by a hash of the prefix. A daily batch job builds it from normalised, decayed query counts into a versioned table that we switch atomically; a streaming job adds hourly trending candidates merged at serve time. At ~230k requests/s, clients debounce by 100 ms and cache locally, the CDN caches 1–2 character prefixes, and the service answers in a millisecond or two. A serve-time blocklist removes bad suggestions within minutes, and signed-in users get their recent searches merged first."
followups:
  - q: Trie or prefix table?
    a: Both precompute top-k per prefix. A trie saves space by sharing paths and supports walking; a flat prefix table in a key-value store is simpler to shard and replicate. At scale many systems use the table.
  - q: How do trends show up quickly?
    a: A streaming aggregation over the last hour with time decay produces deltas that are merged with the batch baseline at serve time, without rebuilding the table.
  - q: How do you remove a suggestion immediately?
    a: Filter against a blocklist at serve time (pushed to all servers within minutes), purge affected edge cache entries, and remove it in the next build.
weak: |
  Queries the log with LIKE and GROUP BY per keystroke, has no caching or debouncing, and can only remove suggestions with a full rebuild.
strong: |
  Precomputes top-k per prefix offline with decay, serves from memory sharded by prefix, layers client, edge and service caching, merges trends and personal history at serve time, and blocklists instantly.
```

```recall
prompt: Describe how an autocomplete system turns search logs into sub-50 ms suggestions, and how it handles a suggestion that must be removed urgently.
points:
  - Offline jobs normalise and aggregate query counts (with time decay) from logs
  - For each prefix, the top-k completions are precomputed into a trie or prefix table, written as a new version and swapped in atomically
  - Serving looks up the prefix's top-k from memory (sharded by prefix), with client debouncing and edge caching of short prefixes, plus a streaming layer for trends
  - Urgent removals are applied by a serve-time blocklist (and edge purges), not by waiting for the next rebuild
model: |
  A batch pipeline reads search logs, normalises queries, drops spam and blocked terms, and computes decayed popularity scores. For every prefix of every popular query it keeps the 10 best completions, writing a versioned prefix → top-10 table that serving switches to atomically. At request time the client debounces keystrokes, the CDN answers very short prefixes, and the suggest service reads the prefix's list from an in-memory shard, merges hourly trending candidates and the user's recent searches, and returns in a few milliseconds. To remove something urgently, it's added to a blocklist that every server checks on every response, and edge caches are purged — the next build drops it permanently.
```

```questions
- kind: check
  prompt: Why is top-k per prefix precomputed rather than computed at request time?
  choices:
    - text: Aggregating matching queries per keystroke is far too expensive for a 50 ms budget at hundreds of thousands of requests per second
      correct: true
    - text: Databases can't sort by count
      why: They can — just not cheaply enough at this rate.
    - text: Prefixes change every second
      why: Rankings change slowly, which is why precomputation works.
    - text: Users prefer stale suggestions
      why: Freshness is handled by a streaming layer.
  explanation: Move heavy aggregation offline and make serving a lookup.
- kind: check
  type: numeric
  prompt: 6B searches/day, with clients sending about 3 debounced requests per search. What's the average request rate in thousands per second?
  answer: 208
  unit: k requests/s
  tolerance: 0.03
  explanation: 18B ÷ 86,400 ≈ 208k/s on average — higher at peak.
- kind: check
  type: multi
  prompt: Which reduce load on the suggest service? Select all that apply.
  choices:
    - text: Client-side debouncing
      correct: true
    - text: Client-side caching of results for prefixes already fetched
      correct: true
    - text: Edge caching of very short, universal prefixes
      correct: true
    - text: Disabling the blocklist
      why: That breaks the removal requirement and saves almost nothing.
  explanation: Most keystrokes never need to reach the origin.
- kind: check
  prompt: How should an urgent suggestion removal be implemented?
  choices:
    - text: A serve-time blocklist filter pushed to all servers within minutes, plus edge cache purges
      correct: true
    - text: Wait for the next daily rebuild
      why: That takes up to a day or more.
    - text: Delete the search logs
      why: Logs aren't what's being served.
    - text: Rebuild the whole table immediately
      why: That takes hours, and the blocklist is faster.
  explanation: Separate fast safety controls from slow ranking rebuilds.
- kind: fire
  prompt: The baseline is rebuilt daily, and trends must surface within an hour. What's the usual design?
  choices:
    - text: A streaming aggregation of recent queries that produces trending candidates merged at serve time
      correct: true
    - text: Rebuild the full table every hour
      why: It's expensive, and a multi-hour build can't run hourly.
    - text: Query the logs live for trending prefixes
      why: That's too slow at serving time.
    - text: Ignore trends
      why: That violates the requirement.
  explanation: Lambda-style — a batch baseline plus a streaming delta, merged at read time.
- kind: fire
  prompt: Sharding by first letter makes some shards much hotter than others. What's better?
  choices:
    - text: Shard by a hash of the prefix, and absorb the hottest short prefixes in edge and client caches
      correct: true
    - text: One shard per letter of the alphabet
      why: Letter frequencies are very skewed.
    - text: A single unsharded server
      why: It can't handle the load or survive a failure.
    - text: Shard by user
      why: Suggestions are mostly global, so user sharding duplicates everything.
  explanation: Hashing balances storage and load. Caches handle the extreme hot set.
- kind: fire
  prompt: What does storing top-k at each trie node buy, and what does it cost?
  choices:
    - text: O(prefix length) lookups with no subtree traversal, at the cost of extra memory and rebuild work
      correct: true
    - text: Smaller memory use
      why: It uses more memory.
    - text: Real-time updates for free
      why: Updating top-k lists is work, so it's done in builds or deltas.
    - text: Typo tolerance
      why: That needs separate techniques (edit-distance matching, alternative spellings).
  explanation: Precomputation trades space and update cost for read speed.
- kind: fire
  level: advanced
  prompt: How should a new suggestion table be deployed to avoid serving a half-loaded or broken build?
  choices:
    - text: Write it as a new version, validate it, then atomically switch serving (keeping the old version for rollback)
      correct: true
    - text: Overwrite the live table row by row
      why: Users would see a mixture of old and new during the load.
    - text: Take serving offline during the load
      why: That's unnecessary downtime.
    - text: Load it only into the CDN
      why: The CDN caches responses. It isn't the store.
  explanation: Versioned builds with atomic switches and instant rollback are the safe deployment pattern for derived datasets.
- kind: fire
  type: order
  prompt: Order a keystroke's journey.
  items:
    - The client debounces and checks its local cache
    - The CDN serves short prefixes or forwards
    - The suggest service reads the prefix's top-k from a memory shard
    - Trending candidates and personal history are merged
    - The blocklist filters the results before responding
  explanation: Layers of caching, a constant-time lookup, then serve-time merges and safety filtering.
```
