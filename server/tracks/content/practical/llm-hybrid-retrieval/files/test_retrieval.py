import math

from corpus import DOCS, QUERIES
from embed import embed
from retrieval import bm25, mrr, recall_at_k, rrf, search, vector

TINY = [{"id": "a", "acl": [], "text": "cat cat dog"}, {"id": "b", "acl": [], "text": "dog"},
        {"id": "c", "acl": [], "text": "fish"}]


def test_bm25_matches_a_hand_worked_case():
    s = bm25("cat", TINY)
    idf = math.log((3 - 1 + 0.5) / (1 + 0.5) + 1)
    avg = 5 / 3
    tf_part = 2 * 2.5 / (2 + 1.5 * (1 - 0.75 + 0.75 * 3 / avg))
    assert abs(s["a"] - idf * tf_part) < 1e-9
    assert s["b"] == 0 and s["c"] == 0


def test_bm25_finds_exact_error_codes():
    s = bm25("ERR-4021", DOCS)
    assert max(s, key=s.get) == "d02"


def test_vector_scores_are_cosines():
    v = vector("refund my money", DOCS, embed)
    assert max(v, key=v.get) in {"d03", "d09"} and all(-1 <= x <= 1.0000001 for x in v.values())


def test_rrf_scores_by_rank():
    assert rrf([["a", "b", "c"], ["b", "c"]]) == ["b", "c", "a"]
    assert rrf([["x"], ["y"]]) == ["x", "y"]  # tie broken by id


def test_customers_never_see_staff_docs():
    for q in ["login latency incident runbook", "manual refund approval", "restart auth service"]:
        assert not {"d05", "d09"} & set(search(q, DOCS, embed, groups=["customer"]))


def test_staff_can_see_the_runbook():
    assert "d05" in search("login latency incident runbook", DOCS, embed, groups=["staff"])


def test_metrics():
    results = {"q1": ["a", "b", "c"], "q2": ["x", "y", "z"]}
    relevant = {"q1": {"b"}, "q2": {"nope"}}
    assert recall_at_k(results, relevant, 2) == 0.5
    assert mrr(results, relevant) == 0.25


def check_corpus():
    """Not a test: run it to compare hybrid with vector-only on the labelled queries."""
    hybrid = {q: search(q, DOCS, embed, ["customer"], top_k=3) for q in QUERIES}
    v_only = {}
    for q in QUERIES:
        vs = vector(q, [d for d in DOCS if not d["acl"]], embed)
        v_only[q] = sorted(vs, key=lambda i: (-vs[i], i))[:3]
    return {"hybrid": {"recall@1": recall_at_k(hybrid, QUERIES, 1), "mrr": mrr(hybrid, QUERIES)},
            "vector": {"recall@1": recall_at_k(v_only, QUERIES, 1), "mrr": mrr(v_only, QUERIES)}}


def test_hybrid_beats_vector_only_on_the_labelled_queries():
    r = check_corpus()
    assert r["hybrid"]["recall@1"] > r["vector"]["recall@1"] and r["hybrid"]["mrr"] > r["vector"]["mrr"], r
