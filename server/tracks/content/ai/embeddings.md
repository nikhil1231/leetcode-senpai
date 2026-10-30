---
id: embeddings
category: retrieval
skill: retrieval
title: Embeddings and vector search
minutes: 14
summary: An embedding model maps text to a vector so that similar meanings land close together. Search is then "find the nearest vectors", which is approximate at scale (HNSW, IVF). Real systems combine it with keyword search (BM25), metadata filters and re-ranking. Interviewers probe similarity metrics, ANN trade-offs, hybrid search, and what embeddings are bad at.
objectives:
  - Explain embeddings and cosine similarity, and what normalisation does
  - Explain why exact nearest-neighbour search doesn't scale, and how HNSW trades recall for speed
  - Combine vector search with BM25 and filters, and explain re-ranking
  - Name the failure modes of embeddings, such as exact identifiers, negation and domain jargon
sources:
  - ['Pinecone: Hierarchical Navigable Small Worlds (HNSW)', 'https://www.pinecone.io/learn/series/faiss/hnsw/']
  - ['pgvector README', 'https://github.com/pgvector/pgvector']
  - ['Elastic: What is hybrid search?', 'https://www.elastic.co/what-is/hybrid-search']
---

## Embeddings

An **embedding model** turns a piece of text into a fixed-length vector (often 384 to 3,072 dimensions). Training pushes texts with similar meaning toward nearby vectors, so "reset my password" and "I can't log in" end up close despite sharing no words.

**Similarity** is usually **cosine similarity**, the angle between vectors. If vectors are **normalised** to unit length, cosine similarity equals the dot product, which is cheaper. Use the metric the model was trained for.

Practical rules:

- Embed queries and documents with the **same model**. Some models expect a different prefix or instruction for queries and documents.
- Changing the embedding model means **re-embedding everything**. Vectors from different models aren't comparable, so store the model name and version with every vector.
- Embeddings capture the topic of a passage much better than its precise details.

## Searching at scale

Exact search compares the query with every vector: O(N × d). That's fine for 100k vectors, and too slow for 100 million at low latency. **Approximate nearest neighbour (ANN)** indexes trade a little recall for big speed-ups:

- **HNSW**: a layered proximity graph. Search starts in the sparse top layer and greedily descends toward the query. Fast and high-recall, but memory-hungry, and builds and deletes are costly. Tuned with `M` (links per node) and `ef_search` (candidate list size: higher means better recall and slower search).
- **IVF**: cluster the vectors, then search only the nearest few clusters (`nprobe`). Uses less memory, with recall depending on `nprobe`. Often combined with **product quantisation** (PQ) to compress vectors.

Where vectors live: a dedicated vector database, or alongside your data with **pgvector** (Postgres), OpenSearch or Elasticsearch. For moderate scale, keeping vectors next to the rows they describe makes filtering, transactions and deletes far simpler.

```predict
prompt: A support search uses pure vector search. Users report that searching for error code **E-4021** returns articles about other errors. Why?
choices:
  - The HNSW index is corrupt
  - Embeddings capture general meaning, and nearly identical error codes land close together, so exact identifiers aren't matched reliably
  - The query needs a higher temperature
  - Cosine similarity can't handle numbers
answer: 1
reveal: |
  "E-4021" and "E-4012" mean almost the same thing to an embedding model: "some error code". Exact tokens such as IDs, SKUs, error codes and names are what **keyword search (BM25)** is good at. The standard fix is **hybrid search**: run BM25 and vector search, merge the results (for example with reciprocal rank fusion), then optionally re-rank the top candidates with a cross-encoder.
```

## Hybrid search and re-ranking

- **BM25** (keyword) is good at exact terms, rare words and identifiers. Vectors are good at paraphrases and synonyms. Use both, and merge with **reciprocal rank fusion**: each document scores the sum of 1/(k + rank) across result lists, which avoids comparing incompatible scores.
- **Metadata filters** (tenant, language, date, permissions) must run inside the search, or before it. Filtering after an ANN search can leave you with too few results, or leak documents the user can't see. Tenant and ACL filters are a security boundary, not a ranking signal.
- **Re-ranking**: a **cross-encoder** reads the query and each candidate *together* and scores relevance much more accurately than a bi-encoder (embedding) comparison, but it's too slow to run over everything. Retrieve 50 to 100 candidates cheaply, re-rank, and keep the top 5 to 10.

```sort
prompt: Which retrieval method handles each query best on its own?
buckets: [Keyword (BM25), Vector (embeddings)]
items:
  - {text: '"ORA-00942"', bucket: 0, why: 'An exact identifier.'}
  - {text: '"how do I get my money back for a cancelled order"', bucket: 1, why: 'A paraphrase of "refund policy" with no shared keywords.'}
  - {text: 'A customer''s order number', bucket: 0, why: 'Exact match.'}
  - {text: '"app keeps logging me out"', bucket: 1, why: 'Semantic match to session-expiry articles.'}
  - {text: 'A rare product name, "Zephyrine"', bucket: 0, why: 'Rare tokens that the embedding model may never have seen.'}
```

```questions
- kind: check
  prompt: Vectors are normalised to unit length. Which is equivalent to cosine similarity?
  choices:
    - text: The dot product
      correct: true
    - text: The Euclidean distance
      why: Related (it ranks the same), but not equal.
    - text: The Manhattan distance
      why: Not equivalent.
  explanation: For unit vectors, cos θ = a·b.
- kind: check
  prompt: You switch to a better embedding model. What must you do with the existing vectors?
  choices:
    - text: Re-embed every document with the new model
      correct: true
    - text: Nothing; vectors are interchangeable
      why: Different models produce incomparable spaces.
    - text: Normalise the old vectors
      why: Normalisation doesn't map one space onto another.
  explanation: Store the model version with every vector so migrations are explicit.
- kind: check
  prompt: What does raising HNSW's ef_search do?
  choices:
    - text: Improves recall at the cost of slower queries
      correct: true
    - text: Reduces memory use
      why: It affects search effort, not index size.
    - text: Speeds up index builds
      why: That's ef_construction and M.
  explanation: A bigger candidate list explores more of the graph.
- kind: fire
  prompt: Why re-rank with a cross-encoder instead of using it for all retrieval?
  choices:
    - text: It's accurate but too slow to score every document, so it re-scores a small candidate set
      correct: true
    - text: Cross-encoders can't handle long documents
      why: The main constraint is cost per query-document pair.
    - text: It's less accurate than embeddings
      why: It's usually more accurate.
  explanation: Retrieve broadly and cheaply, then re-rank narrowly and accurately.
- kind: fire
  prompt: A multi-tenant RAG system filters results by tenant after the ANN search. What's the risk?
  choices:
    - text: Too few results after filtering, and a bug can leak another tenant's documents
      correct: true
    - text: None; post-filtering is standard
      why: Filters that are security boundaries belong inside the query.
    - text: Slower indexing
      why: Indexing is unaffected.
  explanation: Apply tenant and ACL filters within the search, or partition indexes by tenant.
- kind: fire
  prompt: How does reciprocal rank fusion merge BM25 and vector results?
  choices:
    - text: Each document scores the sum of 1/(k + rank) across the lists
      correct: true
    - text: It averages the raw scores
      why: BM25 and cosine scores are on incomparable scales.
    - text: It keeps only documents that appear in both lists
      why: That throws away good single-list hits.
  explanation: Using ranks avoids calibrating incompatible scores.
- kind: fire
  prompt: About how many 1,536-dimension float32 vectors fit in 6 GB of RAM, ignoring index overhead?
  type: numeric
  answer: 1000000
  unit: vectors
  tolerance: 0.1
  explanation: 1,536 × 4 bytes ≈ 6 KB per vector, so 6 GB holds about a million. HNSW adds graph overhead on top.
```
