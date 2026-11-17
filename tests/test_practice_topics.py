"""Concurrency and SQL problems: their own families on the map, reviewed like any problem,
never picked as new DSA work or counted in DSA analytics."""
import datetime as dt

from server import curriculum, packs, scheduler
from server.neetcode150 import PRACTICE_CATEGORIES, is_practice


def _p(slug, cat, difficulty="Easy"):
    return {"slug": slug, "title": slug, "difficulty": difficulty, "neetcode_category": cat,
            "in_library": True, "url": "u"}


PROBLEMS = [
    _p("two-sum", "Arrays & Hashing"),
    _p("print-in-order", "Concurrency"),
    _p("combine-two-tables", "SQL Joins"),
    _p("rank-scores", "SQL Windows", "Medium"),
]


def test_packs_cover_only_practice_categories_without_duplicates():
    for name in ("concurrency", "sql"):
        pack = packs.get_pack(name)
        assert len(pack["slugs"]) == len(set(pack["slugs"]))
        assert set(pack["category_map"]) == set(pack["slugs"])
        assert set(pack["category_map"].values()) <= set(PRACTICE_CATEGORIES)


def test_classify_keeps_the_pack_category_whatever_the_tags_say():
    assert curriculum.classify("rank-scores", ["Database"])["neetcode_category"] == "SQL Windows"
    assert curriculum.classify("print-in-order", ["Concurrency"])["neetcode_category"] == "Concurrency"
    assert not is_practice(curriculum.classify("two-sum", ["Array"])["neetcode_category"])


def test_new_problem_picks_stay_dsa():
    q = scheduler.build_daily_queue(PROBLEMS, [], [], {"new_limit": 5, "review_limit": 5})
    assert [i["slug"] for i in q["new"]] == ["two-sum"]


def test_a_due_sql_review_still_comes_up():
    reviews = [{"slug": "combine-two-tables", "due_date": "2026-01-01", "interval_days": 5, "leech": 0}]
    attempts = [{"slug": "combine-two-tables", "confidence": 3, "independence": "solo"}]
    q = scheduler.build_daily_queue(PROBLEMS, attempts, reviews, {"new_limit": 0, "review_limit": 5},
                                    today=dt.date(2026, 1, 10))
    assert [r["slug"] for r in q["reviews"]] == ["combine-two-tables"]


def test_topic_stats_are_dsa_only_but_the_map_shows_practice_families():
    assert [s["category"] for s in scheduler.topic_stats(PROBLEMS, [])] == ["Arrays & Hashing"]
    tree = scheduler.topic_tree(PROBLEMS, [])
    assert [(f["family"], f["practice"]) for f in tree] == [
        ("Foundations", False), ("Concurrency", True), ("SQL", True)]
    assert [t["category"] for t in tree[2]["topics"]] == ["SQL Joins", "SQL Windows"]


def test_drill_and_sprint_lanes_skip_practice_problems():
    attempts = [{"slug": s, "solved_at": 1, "confidence": 1, "independence": "solution"}
                for s in ("print-in-order", "combine-two-tables")]
    drills = scheduler.build_drill_lane(PROBLEMS, attempts, [], today=dt.date(2026, 1, 10))
    sprints = scheduler.build_sprint_round(PROBLEMS, attempts, [], today=dt.date(2026, 1, 10))
    lane = [i["slug"] for i in drills + (sprints if isinstance(sprints, list) else sprints.get("items", []))]
    assert not any(is_practice(next(p for p in PROBLEMS if p["slug"] == s)["neetcode_category"]) for s in lane)


def test_overview_solved_and_total_are_dsa_only():
    attempts = [{"slug": s, "solved_at": 1} for s in ("two-sum", "combine-two-tables")]
    o = scheduler.overview(PROBLEMS, attempts, [], today=dt.date(2026, 1, 10))
    assert (o["solved"], o["total_problems"]) == (1, 1)
