import math
from collections import Counter

from embed import cosine, tokenize


def bm25(query, docs, k1=1.5, b=0.75):
    toks = {d["id"]: tokenize(d["text"]) for d in docs}
    n_docs = len(docs)
    avg = sum(len(t) for t in toks.values()) / n_docs if n_docs else 0
    df = Counter(term for t in toks.values() for term in set(t))
    terms = set(tokenize(query))
    scores = {}
    for doc_id, t in toks.items():
        tf, score = Counter(t), 0.0
        for term in terms:
            if not tf[term]:
                continue
            idf = math.log((n_docs - df[term] + 0.5) / (df[term] + 0.5) + 1)
            score += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(t) / avg))
        scores[doc_id] = score
    return scores


def vector(query, docs, embed):
    q = embed(query)
    return {d["id"]: cosine(q, embed(d["text"])) for d in docs}


def rrf(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, 1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1 / (k + rank)
    return sorted(scores, key=lambda i: (-scores[i], i))


def visible(doc, groups):
    return not doc["acl"] or bool(set(doc["acl"]) & set(groups))


def search(query, docs, embed, groups, top_k=5):
    allowed = [d for d in docs if visible(d, groups)]
    lexical = bm25(query, allowed)
    semantic = vector(query, allowed, embed)
    by_bm25 = sorted((i for i, s in lexical.items() if s > 0), key=lambda i: (-lexical[i], i))
    by_vec = sorted(semantic, key=lambda i: (-semantic[i], i))
    return rrf([by_bm25, by_vec])[:top_k]


def recall_at_k(results, relevant, k):
    per = [len(set(results.get(q, [])[:k]) & rel) / len(rel) for q, rel in relevant.items() if rel]
    return sum(per) / len(per) if per else 0.0


def mrr(results, relevant):
    per = []
    for q, rel in relevant.items():
        rank = next((i for i, d in enumerate(results.get(q, []), 1) if d in rel), None)
        per.append(1 / rank if rank else 0.0)
    return sum(per) / len(per) if per else 0.0
