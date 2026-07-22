"""Insights + mock + gamify pure-logic tests."""
import copy
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


def test_failure_mode_attempts_newest_first_with_context():
    problems = [
        {**_problems()[0], "url": "https://lc/two-sum"},
        {**_problems()[1], "url": "https://lc/3sum"},
    ]
    attempts = [
        {"id": "old", "slug": "two-sum", "solved_at": 10, "kind": "adhoc",
         "source": "manual", "time_taken_sec": 900, "confidence": 2,
         "independence": "hints", "mistake_note": "missed empty input"},
        {"id": "new", "slug": "3sum", "solved_at": 20, "kind": "drill",
         "source": "auto", "time_taken_sec": 1200, "confidence": 1,
         "independence": "solution", "mistake_note": "index boundary"},
    ]
    enrichments = [
        {"attempt_id": "old", "mistake_tags": ["off_by_one"]},
        {"attempt_id": "new", "mistake_tags": ["off_by_one"]},
    ]

    rows = insights.failure_mode_attempts("off_by_one", problems, attempts, enrichments)

    assert [r["id"] for r in rows] == ["new", "old"]
    assert rows[0] == {
        "id": "new",
        "slug": "3sum",
        "solved_at": 20,
        "kind": "drill",
        "source": "auto",
        "time_taken_sec": 1200,
        "confidence": 1,
        "independence": "solution",
        "mistake_note": "index boundary",
        "mistake_tags": ["off_by_one"],
        "title": "3Sum",
        "difficulty": "Medium",
        "category": "Two Pointers",
        "url": "https://lc/3sum",
    }


def test_failure_mode_attempts_overrides_win_over_model_tags():
    attempts = [{"id": "1", "slug": "two-sum", "solved_at": 1}]
    enrichments = [
        {"attempt_id": "1", "mistake_tags": ["off_by_one"],
         "user_overrides": {"tags": ["edge_case"]}},
    ]

    rows = insights.failure_mode_attempts("off_by_one", _problems(), attempts, enrichments)

    assert rows == []
    assert insights.failure_mode_attempts("edge_case", _problems(), attempts, enrichments)[0]["id"] == "1"


def test_failure_mode_attempts_excludes_non_library_and_missing_problem_attempts():
    problems = [
        {**_problems()[0], "in_library": True},
        {"slug": "candidate", "title": "Candidate", "difficulty": "Easy",
         "neetcode_category": "Stack", "in_library": False},
    ]
    attempts = [
        {"id": "keep", "slug": "two-sum", "solved_at": 3},
        {"id": "drop-non-library", "slug": "candidate", "solved_at": 2},
        {"id": "drop-missing", "slug": "missing", "solved_at": 1},
    ]
    enrichments = [
        {"attempt_id": "keep", "mistake_tags": ["off_by_one"]},
        {"attempt_id": "drop-non-library", "mistake_tags": ["off_by_one"]},
        {"attempt_id": "drop-missing", "mistake_tags": ["off_by_one"]},
        {"attempt_id": "no-attempt", "mistake_tags": ["off_by_one"]},
    ]

    rows = insights.failure_mode_attempts("off_by_one", problems, attempts, enrichments)

    assert [r["id"] for r in rows] == ["keep"]


def test_failure_mode_attempts_unknown_tag_empty():
    attempts = [{"id": "1", "slug": "two-sum", "solved_at": 1}]
    enrichments = [{"attempt_id": "1", "mistake_tags": ["off_by_one"]}]

    rows = insights.failure_mode_attempts("unknown", _problems(), attempts, enrichments)

    assert rows == []


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


def test_confidence_calibration_detects_overconfident_category_and_top():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 1}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 2,
         "independence": "hints", "solution_grade": {"score": 4}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    assert cal["status"] == "ok"
    assert cal["graded_attempts"] == 3
    assert cal["min_graded_attempts"] == 3
    assert cal["most_overrated_topic"]["category"] == "Arrays & Hashing"
    assert cal["categories"][0] == {
        "category": "Arrays & Hashing",
        "self_quality": 5.0,
        "objective_quality": 1.5,
        "gap": 3.5,
        "graded_attempts": 2,
        "review_failures": 0,
        "leech_count": 0,
        "overconfident": True,
        "examples": [
            {
                "slug": "two-sum",
                "title": "Two Sum",
                "self_quality": 5,
                "objective_quality": 1,
                "gap": 4,
                "source": "solution_grade",
            },
            {
                "slug": "valid-anagram",
                "title": "Valid Anagram",
                "self_quality": 5,
                "objective_quality": 2,
                "gap": 3,
                "source": "solution_grade",
            },
        ],
    }
    assert cal["categories"][1]["category"] == "Two Pointers"
    assert cal["categories"][1]["overconfident"] is False


def test_confidence_calibration_uses_solution_grade_mapping():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 3}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    arrays = next(r for r in cal["categories"] if r["category"] == "Arrays & Hashing")
    assert arrays["objective_quality"] == 4.5
    assert arrays["gap"] == 0.5
    two_pointers = next(r for r in cal["categories"] if r["category"] == "Two Pointers")
    assert two_pointers["objective_quality"] == 1.0


def test_confidence_calibration_uses_recall_grade_mapping():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "recall_grade": {"grade": 0}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "recall_grade": {"grade": 3}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 3,
         "independence": "solo", "recall_grade": {"grade": 2}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    arrays = next(r for r in cal["categories"] if r["category"] == "Arrays & Hashing")
    assert arrays["objective_quality"] == 3.0
    two_pointers = next(r for r in cal["categories"] if r["category"] == "Two Pointers")
    assert two_pointers["objective_quality"] == 4.0


def test_confidence_calibration_averages_multiple_objective_signals_per_attempt():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0},
         "recall_grade": {"grade": 3}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 4}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 4}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    arrays = next(r for r in cal["categories"] if r["category"] == "Arrays & Hashing")
    assert arrays["objective_quality"] == 4.0
    assert arrays["gap"] == 1.0


def test_confidence_calibration_ignores_unusable_attempts():
    attempts = [
        {"id": "ungraded", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo"},
        {"id": "missing-self", "slug": "two-sum", "solved_at": 2,
         "solution_grade": {"score": 0}},
        {"id": "missing-category", "slug": "unknown", "solved_at": 3, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "sprint", "slug": "two-sum", "solved_at": 4, "confidence": 3,
         "independence": "solo", "kind": "sprint", "solution_grade": {"score": 0}},
        {"id": "unsolved", "slug": "two-sum", "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "included", "slug": "3sum", "solved_at": 5, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 4}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    assert cal["graded_attempts"] == 1
    assert cal["categories"] == [{
        "category": "Two Pointers",
        "self_quality": 5.0,
        "objective_quality": 5.0,
        "gap": 0.0,
        "graded_attempts": 1,
        "review_failures": 0,
        "leech_count": 0,
        "overconfident": False,
    }]


def test_confidence_calibration_sparse_data_keeps_rows_without_top():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "2", "slug": "3sum", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
    ]

    cal = insights.confidence_calibration(_problems(), attempts)

    assert cal["status"] == "not_enough_data"
    assert cal["graded_attempts"] == 2
    assert len(cal["categories"]) == 2
    assert all(r["overconfident"] for r in cal["categories"])
    assert cal["most_overrated_topic"] is None


def test_confidence_calibration_review_failures_make_topic_more_overrated():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
    ]
    reviews = [
        {"slug": "two-sum", "fail_count": 2, "leech": 0},
        {"slug": "valid-anagram", "fail_count": 1, "leech": 1},
    ]

    base = insights.confidence_calibration(_problems(), attempts)
    adjusted = insights.confidence_calibration(_problems(), attempts, reviews)

    base_arrays = next(r for r in base["categories"] if r["category"] == "Arrays & Hashing")
    adjusted_arrays = next(r for r in adjusted["categories"]
                           if r["category"] == "Arrays & Hashing")
    assert base_arrays["gap"] == 0.0
    assert adjusted_arrays["review_failures"] == 3
    assert adjusted_arrays["leech_count"] == 1
    assert adjusted_arrays["objective_quality"] == 3.0
    assert adjusted_arrays["gap"] == 2.0


def test_confidence_calibration_examples_ordering_cap_and_sources():
    problems = [
        {"slug": "alpha", "title": "Alpha", "neetcode_category": "Arrays & Hashing"},
        {"slug": "bravo", "title": "Bravo", "neetcode_category": "Arrays & Hashing"},
        {"slug": "charlie", "title": "Charlie", "neetcode_category": "Arrays & Hashing"},
        {"slug": "delta", "title": "Delta", "neetcode_category": "Arrays & Hashing"},
        {"slug": "echo", "title": "Echo", "neetcode_category": "Arrays & Hashing"},
    ]
    attempts = [
        {"id": "1", "slug": "delta", "kind": "adhoc", "solved_at": 100,
         "confidence": 3, "independence": "solo", "solution_grade": {"score": 1}},
        {"id": "2", "slug": "alpha", "kind": "adhoc", "solved_at": 200,
         "confidence": 3, "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "3", "slug": "bravo", "kind": "adhoc", "solved_at": 300,
         "confidence": 3, "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "4", "slug": "charlie", "kind": "recall", "solved_at": 300,
         "confidence": 3, "independence": "solo", "recall_grade": {"grade": 0}},
        {"id": "5", "slug": "echo", "kind": "adhoc", "solved_at": 400,
         "confidence": 3, "independence": "solo", "solution_grade": {"score": 5}},
    ]

    cal = insights.confidence_calibration(problems, attempts)
    examples = cal["categories"][0]["examples"]

    assert len(examples) == 3
    assert [e["slug"] for e in examples] == ["bravo", "charlie", "alpha"]
    assert [e["source"] for e in examples] == [
        "solution_grade", "recall_grade", "solution_grade"
    ]


def test_confidence_calibration_examples_include_review_failure_without_private_fields():
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5},
         "code": "secret code", "notes": "private notes",
         "llm_analysis": "private analysis"},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
    ]
    reviews = [{"slug": "two-sum", "fail_count": 1, "leech": 1}]

    cal = insights.confidence_calibration(_problems(), attempts, reviews)
    arrays = next(r for r in cal["categories"] if r["category"] == "Arrays & Hashing")
    review_example = next(e for e in arrays["examples"] if e["source"] == "review_failure")

    assert review_example == {
        "slug": "two-sum",
        "title": "Two Sum",
        "self_quality": 5,
        "objective_quality": 1,
        "gap": 4,
        "source": "review_failure",
    }
    assert set(review_example) == {
        "slug", "title", "self_quality", "objective_quality", "gap", "source"
    }


def test_confidence_calibration_does_not_mutate_inputs():
    problems = copy.deepcopy(_problems())
    attempts = [
        {"id": "1", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 0}},
        {"id": "2", "slug": "valid-anagram", "solved_at": 2, "confidence": 3,
         "independence": "solo", "recall_grade": {"grade": 0}},
        {"id": "3", "slug": "3sum", "solved_at": 3, "confidence": 2,
         "independence": "hints", "solution_grade": {"score": 4}},
    ]
    reviews = [
        {"slug": "two-sum", "fail_count": 2, "leech": 0},
        {"slug": "valid-anagram", "fail_count": 1, "leech": 1},
    ]
    before = {
        "problems": copy.deepcopy(problems),
        "attempts": copy.deepcopy(attempts),
        "reviews": copy.deepcopy(reviews),
    }

    insights.confidence_calibration(problems, attempts, reviews)

    assert problems == before["problems"]
    assert attempts == before["attempts"]
    assert reviews == before["reviews"]


def test_build_does_not_mutate_store_loaded_practice_data(store):
    for problem in _problems():
        store.upsert_problem(copy.deepcopy(problem))
    aid = store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "confidence": 3,
        "independence": "solo", "solution_grade": {"score": 0},
    })
    store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2026-01-01",
        "fail_count": 1, "leech": 1,
    })
    store.upsert_enrichment(aid, {
        "slug": "two-sum", "mistake_tags": ["edge_case"],
        "user_overrides": {"tags": ["math"]},
    })
    before = {
        "problems": copy.deepcopy(store.problems),
        "attempts": copy.deepcopy(store.attempts),
        "reviews": copy.deepcopy(store.reviews),
        "enrichments": copy.deepcopy(store.enrichments),
    }

    insights.build(store, today=dt.date(2026, 1, 10))

    assert store.problems == before["problems"]
    assert store.attempts == before["attempts"]
    assert store.reviews == before["reviews"]
    assert store.enrichments == before["enrichments"]


def test_confidence_calibration_self_only_category_stays_insufficient():
    attempts = [
        {"id": "self-only", "slug": "two-sum", "solved_at": 1, "confidence": 3,
         "independence": "solo"},
        {"id": "graded", "slug": "3sum", "solved_at": 2, "confidence": 3,
         "independence": "solo", "solution_grade": {"score": 5}},
    ]
    reviews = [{"slug": "valid-anagram", "fail_count": 0, "leech": 0}]

    cal = insights.confidence_calibration(_problems(), attempts, reviews)

    assert cal["status"] == "not_enough_data"
    assert cal["graded_attempts"] == 1
    assert [r["category"] for r in cal["categories"]] == ["Two Pointers"]
    assert cal["categories"][0]["review_failures"] == 0
    assert cal["most_overrated_topic"] is None


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
