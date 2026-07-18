"""Insights + mock + gamify pure-logic tests."""
import datetime as dt
import time

from server import insights, mock, gamify


def _problems():
    return [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True},
        {"slug": "3sum", "title": "3Sum", "difficulty": "Medium",
         "neetcode_category": "Two Pointers", "in_library": True},
        {"slug": "valid-anagram", "title": "Valid Anagram", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True},
    ]


def test_review_forecast_buckets_and_overdue():
    today = dt.date(2026, 1, 10)
    reviews = [
        {"slug": "a", "due_date": "2026-01-05"},   # overdue
        {"slug": "b", "due_date": "2026-01-10"},   # today -> bucket 0
        {"slug": "c", "due_date": "2026-01-12"},   # +2
    ]
    f = insights.review_forecast(reviews, days=30, today=today)
    assert f["overdue"] == 1
    assert f["counts"][0] == 1
    assert f["counts"][2] == 1


def test_time_trend_medians():
    today = dt.date(2026, 1, 10)
    base = int(dt.datetime(2026, 1, 5).timestamp())
    attempts = [
        {"slug": "two-sum", "time_taken_sec": 600, "solved_at": base},
        {"slug": "valid-anagram", "time_taken_sec": 1200, "solved_at": base + 100},
    ]
    trend = insights.time_to_solve_trend(_problems(), attempts, today=today)
    assert "Easy" in trend
    # median of 10 and 20 minutes = 15
    assert trend["Easy"][0]["median_min"] == 15.0


def test_pace_projection_positive_rate():
    today = dt.date(2026, 1, 10)
    now = int(dt.datetime(2026, 1, 9).timestamp())
    attempts = [{"slug": "two-sum", "solved_at": now},
                {"slug": "3sum", "solved_at": now}]
    p = insights.pace_projection(_problems(), attempts, today=today)
    assert p["remaining"] == 1
    assert p["eta"] is not None


def test_failure_modes_prefers_overrides():
    enr = [
        {"attempt_id": "1", "mistake_tags": ["off_by_one"],
         "user_overrides": {"tags": ["edge_case"]}},
        {"attempt_id": "2", "mistake_tags": ["off_by_one"]},
    ]
    fm = insights.failure_modes(enr)
    assert fm.get("edge_case") == 1
    assert fm.get("off_by_one") == 1


def test_prediction_accuracy_overall():
    problems = _problems()
    attempts = [{"id": "1", "slug": "two-sum"}, {"id": "2", "slug": "3sum"}]
    enr = [
        {"attempt_id": "1", "prediction_verdict": "correct"},
        {"attempt_id": "2", "prediction_verdict": "wrong"},
    ]
    acc = insights.prediction_accuracy(problems, attempts, enr)
    assert acc["graded"] == 2
    assert acc["overall_correct_rate"] == 0.5


def test_prediction_accuracy_includes_sprint_verdicts_by_canonical_category():
    problems = _problems()
    attempts = [
        {"id": "s1", "slug": "two-sum", "kind": "sprint",
         "predicted_category": "Two Pointers"},
        {"id": "a1", "slug": "3sum", "kind": "adhoc",
         "predicted_category": "Arrays & Hashing"},
    ]
    enr = [
        {"attempt_id": "s1", "prediction_verdict": "wrong"},
        {"attempt_id": "a1", "prediction_verdict": "correct"},
    ]

    acc = insights.prediction_accuracy(problems, attempts, enr)

    assert acc["graded"] == 2
    assert acc["sprint_graded"] == 1
    assert acc["by_category"]["Arrays & Hashing"]["wrong"] == 1
    assert acc["by_category"]["Two Pointers"]["correct"] == 1
    assert acc["by_kind"]["sprint"]["wrong"] == 1


def test_mock_assemble_three(store):
    for p in _problems():
        store.upsert_problem(p)
    picks = mock.assemble(store)
    assert len(picks) >= 1
    assert all("slug" in p for p in picks)


def test_mock_score(store):
    for p in _problems():
        store.upsert_problem(p)
    m = mock.start(store)
    # solve two of the three solo/hints inside the window
    slugs = [p["slug"] for p in m["problems"]]
    now = m["started_at"] + 100
    store.add_attempt({"slug": slugs[0], "solved_at": now, "independence": "solo", "kind": "mock"})
    if len(slugs) > 1:
        store.add_attempt({"slug": slugs[1], "solved_at": now, "independence": "hints", "kind": "mock"})
    res = mock.finish(store, m["id"])
    assert res["score"] > 0
    assert res["status"] == "finished"


def test_mastery_moment_fires_once(store):
    store.upsert_problem({"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
                          "neetcode_category": "Arrays & Hashing", "in_library": True})
    # one solo high-confidence solve -> full coverage, high mastery
    store.add_attempt({"slug": "two-sum", "confidence": 3, "independence": "solo",
                       "solved_at": int(time.time())})
    first = gamify.check_mastery_moments(store)
    assert any(m["category"] == "Arrays & Hashing" for m in first)
    second = gamify.check_mastery_moments(store)
    assert second == []  # doesn't fire twice
