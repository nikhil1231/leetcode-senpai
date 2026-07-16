"""Scheduler behavior tests — the invariants that must hold across SM-2 and FSRS."""
import datetime as dt

from server import scheduler


def _card(**kw):
    base = {"slug": "two-sum", "reps": 2, "ease": 2.5, "interval_days": 6,
            "due_date": "2026-01-01", "last_reviewed": "2026-01-01",
            "fail_count": 0, "leech": 0}
    base.update(kw)
    return base


def test_quality_solution_resets():
    assert scheduler.quality(3, "solution") == 1


def test_quality_hints_caps():
    assert scheduler.quality(3, "hints") <= 3


def test_failed_recall_shortens_interval():
    nxt = scheduler.advance_review(_card(interval_days=30), 1, "solution")
    assert nxt["interval_days"] <= 3
    assert nxt["fail_count"] == 1


def test_good_recall_lengthens_interval():
    card = _card(interval_days=6, reps=2)
    nxt = scheduler.advance_review(card, 3, "solo")
    assert nxt["interval_days"] > 6


def test_first_solve_from_none():
    nxt = scheduler.advance_review(None, 3, "solo")
    assert nxt["interval_days"] >= 1
    assert nxt["due_date"] is not None


def test_leech_after_repeated_failures():
    card = _card(fail_count=2)
    nxt = scheduler.advance_review(card, 1, "solution")
    assert nxt["leech"] == 1


def test_seed_review_is_due_soon():
    s = scheduler.seed_review("two-sum", today=dt.date(2026, 1, 1))
    assert s["due_date"] > "2026-01-01"


def test_recall_grade_mapping():
    # grade 0 -> failing quality, grade 3 -> strong quality
    assert scheduler.recall_quality(0) < 3
    assert scheduler.recall_quality(3) >= 4


def _problems():
    return [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_neetcode150": True,
         "url": "u", "packs": ["neetcode150"]},
        {"slug": "3sum", "title": "3Sum", "difficulty": "Medium",
         "neetcode_category": "Two Pointers", "in_neetcode150": True,
         "url": "u", "packs": ["neetcode150"]},
        {"slug": "valid-anagram", "title": "Valid Anagram", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_neetcode150": True,
         "url": "u", "packs": ["neetcode150"]},
    ]


def _drill_problems():
    return [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "valid-anagram", "title": "Valid Anagram", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "group-anagrams", "title": "Group Anagrams", "difficulty": "Medium",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "longest-substring", "title": "Longest Substring", "difficulty": "Medium",
         "neetcode_category": "Sliding Window", "in_library": True, "url": "u"},
        {"slug": "minimum-window", "title": "Minimum Window", "difficulty": "Hard",
         "neetcode_category": "Sliding Window", "in_library": True, "url": "u"},
        {"slug": "invert-tree", "title": "Invert Tree", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
        {"slug": "diameter-tree", "title": "Diameter Tree", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
    ]


def test_daily_queue_returns_new_when_nothing_solved():
    q = scheduler.build_daily_queue(_problems(), [], [], {"new_limit": 2, "review_limit": 5})
    assert len(q["new"]) >= 1
    assert q["reviews"] == []


def test_recall_mode_for_short_interval_cards():
    problems = _problems()
    today = dt.date(2026, 1, 10)
    reviews = [{"slug": "two-sum", "due_date": "2026-01-01", "interval_days": 5,
                "leech": 0}]
    attempts = [{"slug": "two-sum", "confidence": 3, "independence": "solo"}]
    q = scheduler.build_daily_queue(problems, attempts, reviews,
                                    {"review_limit": 5, "new_limit": 0}, today=today)
    assert q["reviews"]
    assert q["reviews"][0]["mode"] == "recall"


def test_full_solve_mode_for_long_interval_cards():
    problems = _problems()
    today = dt.date(2026, 1, 10)
    reviews = [{"slug": "two-sum", "due_date": "2026-01-01", "interval_days": 40,
                "leech": 0}]
    attempts = [{"slug": "two-sum", "confidence": 3, "independence": "solo"}]
    q = scheduler.build_daily_queue(problems, attempts, reviews,
                                    {"review_limit": 5, "new_limit": 0}, today=today)
    assert q["reviews"][0]["mode"] == "full"


def _ts(day):
    return int(dt.datetime.combine(day, dt.time(hour=12)).timestamp())


def test_goal_progress_excludes_drill_attempts_from_weekly_goals():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"slug": "two-sum", "solved_at": _ts(today), "kind": "review"},
        {"slug": "3sum", "solved_at": _ts(today), "kind": "recall",
         "grading_status": "viewed"},
        {"slug": "valid-anagram", "solved_at": _ts(today), "kind": "adhoc",
         "source": "manual"},
        {"slug": "contains-duplicate", "solved_at": _ts(today), "kind": "drill",
         "source": "auto"},
        {"slug": "old-drill", "solved_at": _ts(today - dt.timedelta(days=8)),
         "kind": "drill", "source": "auto"},
    ]

    goal = scheduler._goal_progress(attempts, {
        "goal_reviews_per_week": 4,
        "goal_new_per_week": 3,
    }, today)

    assert goal == {
        "reviews_done": 2,
        "reviews_goal": 4,
        "new_done": 1,
        "new_goal": 3,
    }


def test_drill_lane_no_local_signal_returns_empty():
    assert scheduler.build_drill_lane(_drill_problems(), [], [], today=dt.date(2026, 1, 10)) == []


def test_drill_lane_uses_non_due_leech_review():
    reviews = [{"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 3, "leech": 1}]
    attempts = [{"slug": "two-sum", "confidence": 3, "independence": "solo", "solved_at": 1}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, reviews, today=dt.date(2026, 1, 10))
    assert drills[0]["slug"] == "two-sum"
    assert drills[0]["kind"] == "drill"
    assert drills[0]["reason"] == "Leech drill"


def test_drill_lane_prediction_misses_affect_scoring():
    attempts = [
        {"id": "a1", "slug": "invert-tree", "confidence": 3, "independence": "solo",
         "solved_at": 1768000000},
        {"id": "a2", "slug": "longest-substring", "confidence": 3, "independence": "solo",
         "solved_at": 1768000000},
    ]
    enrichments = [{"attempt_id": "a1", "prediction_verdict": "wrong"}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], enrichments=enrichments,
        today=dt.date(2026, 1, 10))
    tree = next(d for d in drills if d["category"] == "Trees")
    assert tree["reason"] == "Prediction misses in Trees"
    assert tree["score"] > next(d for d in drills if d["category"] == "Sliding Window")["score"]


def test_drill_lane_enrichments_absent_still_uses_attempt_signal():
    attempts = [{"slug": "minimum-window", "confidence": 1, "independence": "solution",
                 "solved_at": 1768000000}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], enrichments=None,
        today=dt.date(2026, 1, 10))
    assert drills
    assert drills[0]["category"] == "Sliding Window"
    assert drills[0]["reason"] == "Recent struggle in Sliding Window"


def test_drill_lane_exclude_slugs_prevents_duplicates():
    reviews = [{"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 3, "leech": 1}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), [], reviews, exclude_slugs={"two-sum"},
        today=dt.date(2026, 1, 10))
    assert all(d["slug"] != "two-sum" for d in drills)


def test_drill_lane_ordering_is_deterministic():
    attempts = [
        {"slug": "two-sum", "confidence": 3, "independence": "solo", "solved_at": 1},
        {"slug": "valid-anagram", "confidence": 3, "independence": "solo", "solved_at": 1},
        {"slug": "group-anagrams", "confidence": 1, "independence": "hints",
         "solved_at": 1768000000},
    ]
    reviews = [
        {"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 0, "leech": 1},
        {"slug": "valid-anagram", "due_date": "2026-02-01", "fail_count": 5, "leech": 0},
    ]
    settings = {"drill_leech_weight": 0, "drill_fail_weight": 0,
                "drill_weakness_weight": 0, "drill_breadth_weight": 0}
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, reviews, settings=settings,
        exclude_slugs={"group-anagrams"}, today=dt.date(2026, 1, 10))
    assert [d["slug"] for d in drills[:2]] == ["two-sum", "valid-anagram"]
