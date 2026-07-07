"""Pack import + discover engine tests (LeetCode client mocked)."""
import pytest

from server import importer, leetcode, packs


@pytest.fixture
def fake_lc(monkeypatch):
    async def fake_question(slug, auth=None):
        table = {
            "two-sum": dict(likes=50000, dislikes=1600, ac="Easy", tags=["Array", "Hash Table"]),
            "3sum": dict(likes=30000, dislikes=2800, ac="Medium", tags=["Array", "Two Pointers"]),
            "some-bad-problem": dict(likes=100, dislikes=900, ac="Hard", tags=["Array"]),
            "hidden-gem": dict(likes=9000, dislikes=200, ac="Medium", tags=["Two Pointers"]),
        }
        d = table.get(slug)
        if not d:
            return None
        votes = d["likes"] + d["dislikes"]
        return {
            "frontend_id": 1, "title": slug.replace("-", " ").title(),
            "difficulty": d["ac"], "tags": d["tags"], "paid_only": False,
            "likes": d["likes"], "dislikes": d["dislikes"],
            "like_ratio": round(d["likes"] / votes, 4), "ac_rate": 50.0,
            "similar_slugs": [],
        }
    monkeypatch.setattr(leetcode, "question", fake_question)


def test_pack_registry_has_expected():
    assert "neetcode150" in packs.pack_names()
    assert "blind75" in packs.pack_names()
    assert len(packs.get_pack("neetcode150")["slugs"]) == 150


def test_category_from_tags_fallback():
    assert packs.category_from_tags(["Two Pointers"]) == "Two Pointers"
    assert packs.category_from_tags(["Nonsense"]) == "Arrays & Hashing"


async def test_import_pack_marks_library(store, fake_lc):
    res = await importer.import_pack(store, "blind75", auth=None, fetch_metadata=True)
    assert res["total"] == len(packs.BLIND_75)
    p = store.get_problem("two-sum")
    assert p["in_library"] is True
    assert "blind75" in p["packs"]


async def test_import_pack_unions_packs(store, fake_lc):
    await importer.import_pack(store, "blind75", fetch_metadata=True)
    await importer.import_pack(store, "grind75", fetch_metadata=True)
    p = store.get_problem("two-sum")
    assert "blind75" in p["packs"] and "grind75" in p["packs"]


async def test_import_problem_single(store, fake_lc):
    res = await importer.import_problem(store, "hidden-gem")
    assert res["category"] == "Two Pointers"
    assert store.get_problem("hidden-gem")["in_library"] is True


async def test_discover_filters_by_like_ratio(store, monkeypatch, fake_lc):
    async def fake_page(topic=None, difficulty=None, skip=0, limit=50, auth=None):
        return {"total": 4, "questions": [
            {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "paid_only": False},
            {"slug": "3sum", "title": "3Sum", "difficulty": "Medium", "paid_only": False},
            {"slug": "some-bad-problem", "title": "Bad", "difficulty": "Hard", "paid_only": False},
            {"slug": "hidden-gem", "title": "Gem", "difficulty": "Medium", "paid_only": False},
        ]}
    monkeypatch.setattr(leetcode, "problemset_page", fake_page)
    res = await importer.discover(store, min_like_ratio=0.85, min_votes=500, limit=25)
    slugs = [c["slug"] for c in res["candidates"]]
    assert "some-bad-problem" not in slugs  # ratio 0.1 filtered out
    assert "two-sum" in slugs and "hidden-gem" in slugs
    # sorted best-first
    assert res["candidates"][0]["like_ratio"] >= res["candidates"][-1]["like_ratio"]


async def test_discover_skips_in_library(store, monkeypatch, fake_lc):
    store.upsert_problem({"slug": "two-sum", "in_library": True, "packs": ["neetcode150"],
                          "neetcode_category": "Arrays & Hashing"})

    async def fake_page(topic=None, difficulty=None, skip=0, limit=50, auth=None):
        return {"total": 1, "questions": [
            {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy", "paid_only": False},
            {"slug": "hidden-gem", "title": "Gem", "difficulty": "Medium", "paid_only": False},
        ]}
    monkeypatch.setattr(leetcode, "problemset_page", fake_page)
    res = await importer.discover(store)
    slugs = [c["slug"] for c in res["candidates"]]
    assert "two-sum" not in slugs
