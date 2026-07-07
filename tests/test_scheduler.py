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
