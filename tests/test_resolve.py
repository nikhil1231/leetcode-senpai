"""Paste-to-start resolution: a URL, number or title in, startable candidates
out. Parsing is pure; the lookup path has the LeetCode client mocked.
"""
import pytest

from server import importer, leetcode


# ---- parsing (pure) -------------------------------------------------------------
@pytest.mark.parametrize("text,expected", [
    ("https://leetcode.com/problems/car-fleet/", ("slug", "car-fleet")),
    ("https://leetcode.com/problems/car-fleet/description/?envType=list", ("slug", "car-fleet")),
    ("leetcode.com/problems/two-sum", ("slug", "two-sum")),
    ("https://leetcode.cn/problems/two-sum/", ("slug", "two-sum")),
    ("https://LeetCode.com/problems/Two-Sum/", ("slug", "two-sum")),
    ("853", ("number", 853)),
    ("#853", ("number", 853)),
    ("  853. ", ("number", 853)),
    ("car-fleet", ("slug", "car-fleet")),
    ("car fleet", ("text", "car fleet")),
    ("backtracking", ("text", "backtracking")),
    ("", (None, None)),
    ("   ", (None, None)),
])
def test_parse_problem_query(text, expected):
    assert importer.parse_problem_query(text) == expected


# ---- resolution -----------------------------------------------------------------
@pytest.fixture
def library(store):
    store.upsert_problem({"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
                          "neetcode_category": "Arrays & Hashing", "in_library": True,
                          "frontend_id": 1, "packs": ["neetcode150"]})
    return store


@pytest.fixture
def lc(monkeypatch):
    """Records what the LeetCode client was asked for, so tests can assert that
    a catalog hit never went to the network."""
    calls = []

    async def fake_question(slug, auth=None):
        calls.append(("question", slug))
        if slug != "car-fleet":
            return None
        return {"frontend_id": 853, "title": "Car Fleet", "difficulty": "Medium",
                "tags": ["Stack", "Sorting"], "paid_only": False, "likes": 4000,
                "dislikes": 1500, "like_ratio": 0.73, "ac_rate": 50.0, "similar_slugs": []}

    async def fake_page(topic=None, difficulty=None, skip=0, limit=50, auth=None, search=None):
        calls.append(("search", search))
        table = {
            "853": [{"frontend_id": 853, "slug": "car-fleet", "title": "Car Fleet",
                     "difficulty": "Medium", "tags": ["Stack"], "paid_only": False}],
            # LeetCode ranks the exact number first but still returns the rest.
            "1": [{"frontend_id": 1, "slug": "two-sum", "title": "Two Sum",
                   "difficulty": "Easy", "tags": ["Array"], "paid_only": False},
                  {"frontend_id": 191, "slug": "number-of-1-bits", "title": "Number of 1 Bits",
                   "difficulty": "Easy", "tags": ["Bit Manipulation"], "paid_only": False}],
            "car fleet": [
                {"frontend_id": 853, "slug": "car-fleet", "title": "Car Fleet",
                 "difficulty": "Medium", "tags": ["Stack"], "paid_only": False},
                {"frontend_id": 1776, "slug": "car-fleet-ii", "title": "Car Fleet II",
                 "difficulty": "Hard", "tags": ["Stack"], "paid_only": False}],
        }
        return {"total": 0, "questions": table.get(search, [])}

    monkeypatch.setattr(leetcode, "question", fake_question)
    monkeypatch.setattr(leetcode, "problemset_page", fake_page)
    return calls


async def test_resolves_a_url_from_the_catalog_without_touching_leetcode(library, lc):
    res = await importer.resolve_problem(library, "https://leetcode.com/problems/two-sum/")
    assert res["exact"] is True
    assert res["candidates"][0]["slug"] == "two-sum"
    assert res["candidates"][0]["in_library"] is True
    assert lc == []  # the paste-to-timer path stays off the network


async def test_resolves_a_number_from_the_catalog_without_touching_leetcode(library, lc):
    res = await importer.resolve_problem(library, "1")
    assert [c["slug"] for c in res["candidates"]] == ["two-sum"]
    assert lc == []


async def test_resolves_an_unknown_url_through_leetcode(library, lc):
    res = await importer.resolve_problem(library, "leetcode.com/problems/car-fleet/")
    assert res["exact"] is True
    c = res["candidates"][0]
    assert (c["slug"], c["frontend_id"], c["difficulty"]) == ("car-fleet", 853, "Medium")
    # Resolution is read-only — nothing is imported until a run starts.
    assert c["in_library"] is False
    assert library.get_problem("car-fleet") is None


async def test_an_unknown_number_matches_on_the_number_not_the_ranking(store, lc):
    """Searching "1" also returns "Number of 1 Bits"; only #1 is the answer."""
    res = await importer.resolve_problem(store, "1")
    assert [c["slug"] for c in res["candidates"]] == ["two-sum"]
    assert res["exact"] is True


async def test_a_title_offers_every_candidate_to_choose_from(store, lc):
    res = await importer.resolve_problem(store, "car fleet")
    assert [c["slug"] for c in res["candidates"]] == ["car-fleet", "car-fleet-ii"]
    assert res["exact"] is False  # ambiguous: the user picks


async def test_a_bad_slug_reports_instead_of_guessing(store, lc):
    res = await importer.resolve_problem(store, "leetcode.com/problems/not-a-problem/")
    assert res["candidates"] == []
    assert "not-a-problem" in res["error"]


async def test_a_missing_number_reports_clearly(store, lc):
    res = await importer.resolve_problem(store, "99999")
    assert res["candidates"] == []
    assert "99999" in res["error"]


async def test_empty_input_is_not_a_lookup(store, lc):
    res = await importer.resolve_problem(store, "   ")
    assert res["candidates"] == [] and lc == []


async def test_a_leetcode_outage_surfaces_as_an_error_not_a_crash(store, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("leetcode down")

    monkeypatch.setattr(leetcode, "problemset_page", boom)
    res = await importer.resolve_problem(store, "car fleet")
    assert res["candidates"] == []
    assert "leetcode down" in res["error"]
