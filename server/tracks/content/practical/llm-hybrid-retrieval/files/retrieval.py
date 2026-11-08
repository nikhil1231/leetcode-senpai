import math

from embed import cosine, tokenize


def bm25(query, docs, k1=1.5, b=0.75):
    raise NotImplementedError


def vector(query, docs, embed):
    raise NotImplementedError


def rrf(rankings, k=60):
    raise NotImplementedError


def search(query, docs, embed, groups, top_k=5):
    # Today: vector search only, then drop what the user can't see.
    q = embed(query)
    ranked = sorted(docs, key=lambda d: -cosine(q, embed(d["text"])))[:top_k]
    return [d["id"] for d in ranked if not d["acl"] or set(d["acl"]) & set(groups)]


def recall_at_k(results, relevant, k):
    raise NotImplementedError


def mrr(results, relevant):
    raise NotImplementedError
