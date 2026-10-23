---
id: search-index
category: specialised
skill: reads
title: Search indexes and full-text search
minutes: 16
summary: A database index finds rows by exact key or range; search finds documents by the words inside them, ranked by relevance. That needs an inverted index (term → documents), text analysis that turns "Running Shoes" into searchable terms, a scoring function, and an indexing pipeline that keeps a separate search cluster in step with the source of truth — always a little behind it.
objectives:
  - Explain how an inverted index, analyzers and postings lists answer text queries, and why LIKE '%term%' doesn't scale
  - Describe relevance ranking (TF-IDF/BM25) and the tuning levers
  - Design a sharded search cluster and its scatter-gather top-k query path
  - Keep the index in sync with the database via CDC, and handle refresh lag and reindexing
sources:
  - ['Elasticsearch: Near real-time search', 'https://www.elastic.co/docs/manage-data/data-store/near-real-time-search']
  - ['Apache Lucene: Index file formats overview', 'https://lucene.apache.org/core/9_0_0/core/org/apache/lucene/codecs/lucene90/package-summary.html']
  - ['Robertson & Zaragoza, The Probabilistic Relevance Framework: BM25 and Beyond', 'https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf']
---

> [!story] The search box that took down the database
> A marketplace's product search was `SELECT … WHERE title ILIKE '%' || $q || '%' ORDER BY created_at DESC LIMIT 20`. With 50,000 products it took 30 ms. With 12 million products and a Black Friday spike, every search scanned the whole table, the primary's CPU pinned at 100%, and checkout — on the same database — failed. Moving search to a dedicated index fed from the database's change stream took search latency to 15 ms and removed it from the checkout path entirely.

## Why LIKE doesn't scale

A B-tree index is sorted by the column's value from its first character, so it can help with `title LIKE 'running%'` but not with `'%running%'` — the database must examine every row. And even if it could, LIKE has no notion of word boundaries, plurals, synonyms, typos or which match is *better*.

## The inverted index

An inverted index maps each **term** to a **postings list** — the documents (and positions) containing it:

| Term | Postings (doc IDs) |
|---|---|
| `run` | 3, 9, 14, 27 |
| `shoe` | 3, 14, 81 |
| `trail` | 14, 27 |

A query for `trail running shoes` is analysed into `trail`, `run` and `shoe`; the engine intersects or unions their postings lists (stored sorted and compressed, so this is fast), then scores the candidates. Document 14 contains all three.

**Text analysis** happens at both index and query time, and the two must match:

1. **Tokenise:** split into words ("Trail-Running Shoes!" → "Trail", "Running", "Shoes").
2. **Normalise:** lowercase, strip accents ("café" → "cafe").
3. **Filter:** optionally drop stop words ("the", "a").
4. **Stem or lemmatise:** "running", "runs", "ran" → "run".
5. **Synonyms:** "sneaker" ↔ "trainer".

```faded
title: Index two documents
prompt: Fill in what the analyzer and the index produce.
text: |
  Document 1: "Waterproof Trail Running Shoes". Document 2: "Running Socks".

  With lowercase plus stemming, document 1 produces the terms `waterproof`, `trail`, [[run|running|Running]] and `shoe`.

  The postings list for `run` is therefore [[documents 1 and 2|document 1 only|document 2 only]].

  A query for "socks for running" is analysed into `sock` and `run` (with "for" dropped as a stop word). A match on **all** terms returns [[document 2 only|both documents|neither document]]; a match on **any** term returns both, with document 2 scored higher because it matches more query terms.

  If the query-time analyzer forgot to stem, "running" would not match the indexed term `run`, and [[the search would silently miss matching documents|the search would be faster and still correct|the index would be rebuilt automatically]].
explain: Index-time and query-time analysis must agree. Most "search is broken" bugs are analyzer mismatches, not ranking problems.
```

## Relevance: TF-IDF and BM25

Matching documents need ordering. The classic signals:

- **Term frequency (TF):** a term that appears more often in a document suggests relevance — with diminishing returns (BM25 saturates it).
- **Inverse document frequency (IDF):** rare terms are more informative. Matching "gore-tex" says more than matching "shoe".
- **Length normalisation:** a match in a short title counts more than one buried in a 5,000-word description.

**BM25** combines these and is the default in Lucene, Elasticsearch and OpenSearch. Real systems then boost by field (title > description), freshness, popularity, personalisation and business rules, and increasingly re-rank the top results with a learned model.

```predict
prompt: A user searches "the north face jacket". Which term contributes most to a document's BM25 score, assuming each matches once?
choices:
  - '"the" — it appears in almost every document'
  - '"north" or "face" — moderately common words'
  - The rarest matching term in the corpus, likely the brand-specific combination's least common word
  - All terms contribute equally
answer: 2
reveal: |
  IDF weights rare terms more heavily, because they discriminate between documents. "The" appears everywhere, so its IDF is near zero (and it's often removed as a stop word). This is also why phrase matching ("north face" as adjacent words, using positions in the postings) matters for brand names: individually, the words are common.
```

## Scaling a search cluster

Indexes are **document-partitioned** into shards; each shard is a self-contained index over a subset of documents, replicated for availability and read throughput.

```arch
title: A query across shards
nodes:
  - {id: client, label: Search API, kind: service, x: 0, y: 1}
  - {id: coord, label: Coordinating node, kind: service, x: 1, y: 1}
  - {id: s1, label: Shard 1, kind: db, x: 2, y: 0}
  - {id: s2, label: Shard 2, kind: db, x: 2, y: 1}
  - {id: s3, label: Shard 3, kind: db, x: 2, y: 2}
  - {id: db, label: Postgres, kind: db, x: 3, y: 1, note: 'source of truth'}
edges:
  - [client, coord, 'q=trail shoes, top 20']
  - [coord, s1, 'top 20?']
  - [coord, s2, 'top 20?']
  - [coord, s3, 'top 20?']
paths:
  - label: Query
    steps:
      - [client, coord, 'The query arrives at any node, which becomes the coordinator']
      - [coord, s1, 'Each shard runs the query on its own documents and returns its own top 20 (IDs and scores)']
      - [coord, s2, '…in parallel…']
      - [coord, s3, '…in parallel']
      - [client, coord, 'The coordinator merges 3 × 20 candidates, keeps the global top 20, then fetches those documents']
```

- **Scatter-gather top-k:** every query hits every shard (search terms can match documents anywhere), so latency is set by the slowest shard, and deep pagination (page 500) is expensive: each shard must return `offset + size` results. Use `search_after`-style cursors for deep paging.
- **Size shards** to a few tens of GB. Too many tiny shards waste overhead; too few big ones limit parallelism and slow recovery.
- **Replicas** add read throughput and availability.

## Keeping the index in sync

The search cluster is a **derived view**, not the source of truth. Feed it asynchronously:

```sort
prompt: Good or bad way to keep a search index in sync with the database?
buckets: [Good practice, Risky]
items:
  - {text: 'Stream changes from the database via CDC (or an outbox) into an indexing worker', bucket: 0, why: 'Captures every committed change from every writer, in order, with replay after failures.'}
  - {text: 'Update the search index synchronously inside the API request after the DB write', bucket: 1, why: "A dual write: if the index call fails or times out after the DB commit, the two diverge, and search latency now affects writes."}
  - {text: 'Make indexing idempotent and keyed by document ID with a version', bucket: 0, why: 'Replays and out-of-order deliveries cannot regress a document to an older version.'}
  - {text: 'Build a new index version in the background and switch an alias to it for mapping changes', bucket: 0, why: 'Zero-downtime reindexing. Roll back by pointing the alias back.'}
  - {text: 'Treat the search cluster as the only copy of product data', bucket: 1, why: "Search clusters are built for retrieval, not as the durable system of record. Keep the database authoritative so you can rebuild."}
```

**Near-real-time:** engines like Elasticsearch make new documents searchable after a **refresh** (by default every second), so "save, then immediately search" can miss the new item. Options: refresh on demand for that request (expensive at scale), show the saved item from the database in the UI, or accept the lag in the product.

```bug
title: An indexing worker
prompt: This worker consumes product change events and updates the search index. Which lines cause wrong search results?
lang: python
code: |
  def on_product_changed(event):
      product = event.payload                     # snapshot at change time
      es.index(index="products", id=product["id"], document=product)

  def on_product_deleted(event):
      pass                                        # deletions are rare, ignore
bug: [3, 6]
explain: |
  **Line 3** writes whatever arrives, with no version check. If two updates are delivered out of order (a retry or rebalance), the older snapshot can overwrite the newer one, and search shows stale data indefinitely. Use external versioning (`version=product["version"], version_type="external"`) so older versions are rejected, or re-read the current row before indexing. **Line 6** ignores deletions, so deleted or delisted products keep appearing in search — often a legal or trust problem, not just cosmetic. Delete (or mark hidden) by ID.
fix: |
  def on_product_changed(event):
      p = event.payload
      es.index(index="products", id=p["id"], document=p,
               version=p["version"], version_type="external")   # ignore stale updates

  def on_product_deleted(event):
      es.delete(index="products", id=event.payload["id"], ignore=[404])
```

> [!senior] Vector search, briefly
> Semantic search embeds queries and documents as vectors and finds nearest neighbours by similarity. Exact search is linear in corpus size, so engines use **approximate nearest neighbour** indexes (HNSW graphs, IVF with product quantisation) that trade a little recall for orders-of-magnitude speed and memory savings. Hybrid search — BM25 for exact terms and names, vectors for meaning, merged with reciprocal rank fusion — usually beats either alone.

```calc
title: Deep pagination cost
prompt: A search cluster has **12** shards. A client requests page **50** with **20** results per page using offset pagination. How many candidate results must the coordinator collect and sort in total?
answer: 12000
unit: candidates
tolerance: 1.01
steps: |
  Each shard must return its top offset + size = 49 × 20 + 20 = **1,000** results, because any of them might be in the global window. 12 shards × 1,000 = **12,000** candidates merged to return 20. That's why engines cap `from + size` (Elasticsearch's default `index.max_result_window` is 10,000) and offer cursor-style `search_after` for deep paging.
```

```interview
say: |
  "Products stay in Postgres. A Debezium CDC stream feeds an indexing worker that writes to OpenSearch with external versioning, so out-of-order events can't regress a document, and deletes are propagated. Fields use a stemming English analyzer, with synonyms and a keyword sub-field for exact brand matches. Ranking is BM25 with title boosts plus popularity and stock signals, re-ranked for the top 100. The index has 6 primary shards of about 30 GB each, with one replica, and queries scatter-gather top-k. Mapping changes reindex into a new index and swap an alias. Search is about one second behind writes, so after saving we show the product from the database."
followups:
  - q: Why not use Postgres full-text search?
    a: At modest scale it's a fine choice (tsvector plus a GIN index). Dedicated engines win on relevance tooling, analyzers, faceting, scale-out and isolating search load from the transactional database.
  - q: How do you keep the index consistent?
    a: Treat it as a derived view fed by CDC or an outbox, index idempotently with versions, propagate deletes, monitor indexing lag, and be able to rebuild from the database.
  - q: Why is deep pagination expensive?
    a: Each shard must return offset + size results for the coordinator to merge. Cap the depth and use cursor-based search_after.
weak: |
  "Use LIKE queries, or put Elasticsearch in front and write to both." No analysis, ranking, sync strategy or lag handling.
strong: |
  Explains inverted indexes and analyzers, BM25 and boosts, a sharded scatter-gather top-k path, CDC-fed idempotent indexing with versions and deletes, reindexing via aliases, and the near-real-time gap.
```

```recall
prompt: Explain how an inverted index answers the query "trail running shoes", including the role of text analysis.
points:
  - Documents are analysed at index time into normalised terms (tokenised, lowercased, stemmed — e.g. running → run)
  - The inverted index maps each term to a sorted postings list of the documents containing it
  - The query is analysed with the same analyzer into terms, and the postings lists are intersected or unioned to find candidates
  - Candidates are scored (e.g. BM25 with term frequency, IDF and length normalisation) and the top results returned
model: |
  When documents are indexed, an analyzer splits their text into tokens, lowercases them and stems them, so "Trail Running Shoes" becomes trail, run and shoe. For each term the index stores a sorted, compressed list of document IDs (and positions) — the postings list. The query goes through the same analyzer, producing trail, run and shoe. The engine walks those three postings lists to find documents containing all (or some) of them, scores each candidate with BM25 — favouring rare terms, repeated matches and short fields — and returns the highest-scoring documents.
```

```questions
- kind: check
  prompt: Why can't a B-tree index speed up `WHERE title LIKE '%shoe%'`?
  choices:
    - text: B-trees are ordered from the first character, so a leading wildcard gives no starting point and every row must be checked
      correct: true
    - text: B-trees don't support text columns
      why: They do, for equality, ranges and prefixes.
    - text: LIKE is not valid SQL
      why: It's standard SQL.
    - text: The index would be too large
      why: Size isn't the problem. The sort order is.
  explanation: Substring and word search need a different structure — an inverted index (or trigram index).
- kind: check
  type: order
  prompt: Order the steps a search engine takes for a text query.
  items:
    - Analyse the query into normalised terms with the same analyzer used at index time
    - Look up each term's postings list
    - Intersect or union the postings to find candidate documents
    - Score candidates (e.g. BM25 with field boosts)
    - Return the top-k results
  explanation: Analysis consistency, fast postings operations and a good scoring function are the three pillars of search.
- kind: check
  type: multi
  prompt: Which factors raise a document's BM25 score for a term? Select all that apply.
  choices:
    - text: The term appears in the document (more often helps, with diminishing returns)
      correct: true
    - text: The term is rare across the corpus (high IDF)
      correct: true
    - text: The match is in a short field rather than a very long one
      correct: true
    - text: The document's ID is a smaller number
      why: IDs don't affect relevance.
  explanation: TF, IDF and length normalisation are BM25's core. Field boosts and business signals are layered on top.
- kind: check
  prompt: Why should a search index usually be fed from the database via CDC rather than written synchronously in the API request?
  choices:
    - text: Synchronous dual writes diverge when one fails, and they couple write latency to search; CDC captures every committed change in order and can be replayed
      correct: true
    - text: CDC makes search results perfectly up to date with zero lag
      why: CDC adds a small lag. Its benefit is reliability and decoupling.
    - text: Search engines can't accept writes from APIs
      why: They can. It's the coupling and divergence that's the problem.
    - text: It removes the need for a database
      why: The database stays the source of truth.
  explanation: The index is a derived view. Feed it from the commit log, idempotently, and rebuild it when needed.
- kind: fire
  prompt: A user saves a product and immediately searches for it, but it doesn't appear for about a second. What's the most likely cause?
  choices:
    - text: Near-real-time indexing — new documents become searchable after the next index refresh
      correct: true
    - text: The document failed to index
      why: It appears a moment later, so it indexed fine.
    - text: The database is slow
      why: The save succeeded. The delay is in the search index.
    - text: Search results are cached in the browser for a second
      why: That's possible in theory, but refresh lag is the standard cause.
  explanation: Engines batch new documents into searchable segments on refresh (about 1 s by default). Design the UX around that lag.
- kind: fire
  type: numeric
  prompt: A query requests results 181–200 (page 10, 20 per page) from an index with 8 shards. How many candidates does the coordinator merge?
  answer: 1600
  unit: candidates
  tolerance: 0.01
  explanation: Each shard returns its top 200 (offset 180 + size 20); 8 × 200 = 1,600. The cost grows with depth, so cap it and use search_after.
- kind: fire
  prompt: An indexing worker receives two updates for the same product out of order. What prevents the older one overwriting the newer?
  choices:
    - text: Indexing with an external version, so the engine rejects lower versions
      correct: true
    - text: Indexing faster
      why: Speed doesn't prevent reordering.
    - text: Using more shards
      why: Unrelated.
    - text: Disabling refresh
      why: That doesn't affect write ordering.
  explanation: Version-guarded writes make indexing idempotent and order-safe under retries and redelivery.
- kind: fire
  level: advanced
  prompt: How do you change an index's field mappings (e.g. a new analyzer) with zero downtime?
  choices:
    - text: Build a new index with the new mapping in the background, backfill and catch up from the change stream, then switch an alias to it
      correct: true
    - text: Edit the mapping in place on the live index
      why: Analyzer changes generally can't be applied to existing indexed data in place.
    - text: Delete the index and recreate it
      why: Search is down until the rebuild finishes.
    - text: Restart the cluster
      why: Restarting doesn't reindex anything.
  explanation: Aliases decouple the name clients query from the physical index, which allows blue/green reindexing and instant rollback.
- kind: fire
  type: multi
  prompt: Which are strengths of approximate nearest neighbour (ANN) vector indexes such as HNSW? Select all that apply.
  choices:
    - text: Sub-linear search time over millions of vectors
      correct: true
    - text: Finding semantically similar items without exact keyword matches
      correct: true
    - text: Tunable trade-offs between recall, speed and memory
      correct: true
    - text: Guaranteed exact results in all cases
      why: Approximate means some true neighbours may be missed.
  explanation: ANN trades a little recall for speed. Hybrid with BM25 covers exact terms such as names and SKUs.
```
