from corpus import DOCS
from embed import embed
from retrieval import bm25, mrr, recall_at_k, rrf, search

STAFF = [{"id": f"s{i}", "acl": ["staff"], "text": "refund refund refund approval"} for i in range(6)]
PUBLIC = [{"id": f"p{i}", "acl": [], "text": f"general help article number {i} about refund"} for i in range(6)]


def test_filter_before_top_k():
    got = search("refund approval", STAFF + PUBLIC, embed, groups=["customer"], top_k=5)
    assert len(got) == 5 and all(g.startswith("p") for g in got)


def test_empty_query_and_unknown_terms():
    assert all(v == 0 for v in bm25("zzzz qqqq", DOCS).values())
    assert isinstance(search("", DOCS, embed, ["customer"]), list)


def test_rrf_ignores_duplicate_appearance_order_and_is_deterministic():
    assert rrf([["b", "a"], ["a", "b"]]) == ["a", "b"]
    assert rrf([]) == []


def test_bm25_length_normalisation():
    docs = [{"id": "short", "acl": [], "text": "refund"}, {"id": "long", "acl": [], "text": "refund " + "word " * 30}]
    s = bm25("refund", docs)
    assert s["short"] > s["long"] > 0


def test_mrr_counts_first_relevant_only():
    assert mrr({"q": ["x", "a", "b"]}, {"q": {"a", "b"}}) == 0.5
    assert recall_at_k({"q": ["a"]}, {"q": {"a", "b"}}, 1) == 0.5
