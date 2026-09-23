"""Scheduler behavior tests — the invariants that must hold across SM-2 and FSRS."""
import datetime as dt

from server import insights, scheduler


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


def test_solution_quality_blends_self_and_llm():
    # quality(3,"solo") == 5; blended 50/50 with the mapped LLM score
    assert scheduler.solution_quality(3, "solo", 5) == 5       # (5 + 5) / 2
    assert scheduler.solution_quality(3, "solo", 0) == 3       # (5 + 1) / 2
    assert scheduler.solution_quality(1, "solo", 0) == 2       # (3 + 1) / 2
    # no LLM score -> pure self-assessment
    assert scheduler.solution_quality(3, "solo", None) == scheduler.quality(3, "solo")


def test_advance_review_uses_blended_solution_quality():
    graded = scheduler.advance_review(_card(), 3, "solo", solution_score=0)
    assert graded["quality"] == 3  # blended below the self-only 5
    plain = scheduler.advance_review(_card(), 3, "solo")
    assert plain["quality"] == scheduler.quality(3, "solo")


def test_low_llm_grade_can_force_a_reset():
    # a strong self-report but a poor LLM grade drags quality below passing,
    # shortening the interval instead of extending it
    self_only = scheduler.advance_review(_card(interval_days=30), 1, "hints")
    blended = scheduler.advance_review(
        _card(interval_days=30), 1, "hints", solution_score=0)
    assert blended["interval_days"] < self_only["interval_days"]
    assert blended["fail_count"] == 1


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


def _sprint_problems():
    return [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "group-anagrams", "title": "Group Anagrams", "difficulty": "Medium",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "longest-substring", "title": "Longest Substring", "difficulty": "Medium",
         "neetcode_category": "Sliding Window", "in_library": True, "url": "u"},
        {"slug": "invert-tree", "title": "Invert Tree", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
        {"slug": "diameter-tree", "title": "Diameter Tree", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
        {"slug": "external-cache", "title": "External Cache", "difficulty": "Easy",
         "neetcode_category": "Stack", "in_library": False, "url": "u"},
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
        {"slug": "sprint-rep", "solved_at": _ts(today), "kind": "sprint",
         "source": "sprint"},
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


def test_overview_counts_drills_today_separately():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"slug": "two-sum", "solved_at": _ts(today), "kind": "drill",
         "source": "auto"},
        {"slug": "3sum", "solved_at": _ts(today - dt.timedelta(days=1)),
         "kind": "drill", "source": "auto"},
        {"slug": "valid-anagram", "solved_at": _ts(today), "kind": "adhoc",
         "source": "manual"},
        {"slug": "sprint-rep", "solved_at": _ts(today), "kind": "sprint",
         "source": "sprint"},
    ]

    ov = scheduler.overview(_problems(), attempts, [], today=today)

    assert ov["drills_today"] == 1
    assert ov["solved"] == 3
    assert ov["due_reviews"] == 0
    assert ov["leeches"] == 0
    assert ov["xp_today"] == 40


def test_topic_solved_counts_only_library_problems():
    today = dt.date(2026, 1, 10)
    problems = _problems() + [
        {"slug": "browsed", "title": "Browsed", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": False, "url": "u"},
    ]
    attempts = [
        {"slug": "two-sum", "solved_at": _ts(today), "kind": "adhoc"},
        {"slug": "browsed", "solved_at": _ts(today), "kind": "adhoc"},
    ]

    arrays = next(s for s in scheduler.topic_stats(problems, attempts)
                  if s["category"] == "Arrays & Hashing")

    assert (arrays["solved"], arrays["total"]) == (1, 2)


def test_sprint_attempts_do_not_inflate_topic_solved_or_mastery():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"id": "s1", "slug": "two-sum", "solved_at": _ts(today),
         "kind": "sprint", "source": "sprint", "confidence": 3,
         "independence": "solo", "runtime_percentile": 99},
    ]
    enrichments = [{"attempt_id": "s1", "prediction_verdict": "correct"}]

    arrays = next(
        s for s in scheduler.topic_stats(_problems(), attempts, enrichments)
        if s["category"] == "Arrays & Hashing"
    )

    assert arrays["solved"] == 0
    assert arrays["coverage"] == 0.0
    assert arrays["avg_confidence"] is None
    assert arrays["independence_rate"] is None
    assert arrays["avg_runtime_percentile"] is None
    assert arrays["mastery"] == 0.0
    assert arrays["sprint_reps"] == 1
    assert arrays["sprint_correct"] == 1
    assert arrays["sprint_partial"] == 0
    assert arrays["sprint_wrong"] == 0
    assert arrays["sprint_accuracy"] == 1.0


def test_sprint_attempts_do_not_count_as_pace_solves_or_new_candidates():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"id": "s1", "slug": "two-sum", "solved_at": _ts(today),
         "kind": "sprint", "source": "sprint"},
    ]

    pace = insights.pace_projection(_problems(), attempts, today=today)
    queue = scheduler.build_daily_queue(
        _problems(), attempts, [], {"new_limit": 3, "review_limit": 0}, today=today)

    assert pace["solved"] == 0
    assert pace["remaining"] == 3
    assert pace["rate_per_week"] == 0.0
    assert any(item["slug"] == "two-sum" for item in queue["new"])


def test_drill_lane_no_local_signal_returns_empty():
    assert scheduler.build_drill_lane(_drill_problems(), [], [], today=dt.date(2026, 1, 10)) == []


def test_drill_lane_uses_non_due_leech_review():
    reviews = [{"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 3, "leech": 1}]
    attempts = [{"slug": "two-sum", "confidence": 3, "independence": "solo", "solved_at": 1}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, reviews, today=dt.date(2026, 1, 10))
    assert drills[0]["slug"] == "two-sum"
    assert drills[0]["kind"] == "drill"
    assert "leech" in drills[0]["reason_codes"]
    assert drills[0]["signals"]["leech"] is True
    assert drills[0]["signals"]["fail_count"] == 3


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
    assert "prediction_miss" in tree["reason_codes"]
    assert tree["signals"]["prediction_miss"] is True
    assert tree["category"] not in tree["reason"]
    assert tree["signals"]["prediction_misses"] == 1
    assert tree["score"] > next(d for d in drills if d["category"] == "Sliding Window")["score"]


def test_drill_lane_mistake_density_reason_code():
    attempts = [
        {"id": "a1", "slug": "invert-tree", "confidence": 3, "independence": "solo",
         "solved_at": 1768000000},
    ]
    enrichments = [{"attempt_id": "a1", "mistake_tags": ["base-case"], "severity": 2}]

    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], enrichments=enrichments,
        today=dt.date(2026, 1, 10))

    tree = next(d for d in drills if d["category"] == "Trees")
    assert "recent_mistakes" in tree["reason_codes"]
    assert tree["category"] not in tree["reason"]
    assert tree["signals"]["mistake_density"] == 1.0


def test_drill_lane_enrichments_absent_still_uses_attempt_signal():
    attempts = [{"slug": "minimum-window", "confidence": 1, "independence": "solution",
                 "solved_at": 1768000000}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], enrichments=None,
        today=dt.date(2026, 1, 10))
    assert drills
    assert drills[0]["category"] == "Sliding Window"
    assert "recent_mistakes" in drills[0]["reason_codes"]
    assert drills[0]["signals"]["recent_struggles"] == 1


def test_drill_lane_weak_topic_reason_code():
    reviews = [{"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 3, "leech": 1}]
    settings = {
        "drill_leech_weight": 0,
        "drill_fail_weight": 0,
        "drill_mistake_weight": 0,
        "drill_prediction_weight": 0,
        "drill_struggle_weight": 0,
        "drill_weakness_weight": 1,
        "drill_breadth_weight": 0,
    }

    drills = scheduler.build_drill_lane(
        _drill_problems(), [], reviews, settings=settings,
        today=dt.date(2026, 1, 10))

    assert drills
    assert all(d["reason_codes"] == ["weak_topic"] for d in drills)
    assert all(d["signals"]["weakness"] == 1.0 for d in drills)


def test_drill_lane_unattempted_coverage_reason_code():
    reviews = [{"slug": "two-sum", "due_date": "2026-02-01", "fail_count": 3, "leech": 1}]
    settings = {
        "drill_leech_weight": 0,
        "drill_fail_weight": 0,
        "drill_mistake_weight": 0,
        "drill_prediction_weight": 0,
        "drill_struggle_weight": 0,
        "drill_weakness_weight": 0,
        "drill_breadth_weight": 1,
    }

    drills = scheduler.build_drill_lane(
        _drill_problems(), [], reviews, settings=settings,
        today=dt.date(2026, 1, 10))

    assert drills
    assert all(d["reason_codes"] == ["unattempted_coverage"] for d in drills)
    assert all(d["signals"]["unattempted_coverage"] == 1.0 for d in drills)


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


def test_drill_lane_tied_scores_ignore_problem_input_order():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"slug": "arrays-b", "confidence": 1, "independence": "hints",
         "solved_at": _ts(today)},
        {"slug": "sliding-a", "confidence": 1, "independence": "hints",
         "solved_at": _ts(today)},
        {"slug": "trees-a", "confidence": 1, "independence": "hints",
         "solved_at": _ts(today)},
    ]
    settings = {
        "drill_leech_weight": 0,
        "drill_fail_weight": 0,
        "drill_mistake_weight": 0,
        "drill_prediction_weight": 0,
        "drill_struggle_weight": 1,
        "drill_weakness_weight": 0,
        "drill_breadth_weight": 0,
    }
    problems = [
        {"slug": "trees-a", "title": "Trees A", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
        {"slug": "arrays-b", "title": "Arrays B", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "arrays-a", "title": "Arrays A", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "sliding-a", "title": "Sliding A", "difficulty": "Easy",
         "neetcode_category": "Sliding Window", "in_library": True, "url": "u"},
    ]

    orders = [
        [d["slug"] for d in scheduler.build_drill_lane(
            variant, attempts, [], settings=settings, today=today)]
        for variant in (problems, list(reversed(problems)), [problems[i] for i in (2, 0, 3, 1)])
    ]

    assert orders == [
        ["arrays-a", "sliding-a", "trees-a"],
        ["arrays-a", "sliding-a", "trees-a"],
        ["arrays-a", "sliding-a", "trees-a"],
    ]


def test_drill_lane_tied_scores_prefer_recent_relevant_signal():
    today = dt.date(2026, 1, 10)
    problems = [
        {"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "neetcode_category": "Arrays & Hashing", "in_library": True, "url": "u"},
        {"slug": "invert-tree", "title": "Invert Tree", "difficulty": "Easy",
         "neetcode_category": "Trees", "in_library": True, "url": "u"},
    ]
    attempts = [
        {"slug": "two-sum", "confidence": 1, "independence": "hints",
         "solved_at": _ts(today - dt.timedelta(days=5))},
        {"slug": "invert-tree", "confidence": 1, "independence": "hints",
         "solved_at": _ts(today - dt.timedelta(days=1))},
    ]
    settings = {
        "drill_leech_weight": 0,
        "drill_fail_weight": 0,
        "drill_mistake_weight": 0,
        "drill_prediction_weight": 0,
        "drill_struggle_weight": 1,
        "drill_weakness_weight": 0,
        "drill_breadth_weight": 0,
    }

    drills = scheduler.build_drill_lane(
        problems, attempts, [], settings=settings, today=today)

    assert [d["slug"] for d in drills[:2]] == ["invert-tree", "two-sum"]


def test_drill_tie_break_does_not_change_daily_review_or_new_ordering():
    today = dt.date(2026, 1, 10)
    problems = _problems()
    attempts = [{"slug": "two-sum", "confidence": 3, "independence": "solo"}]
    reviews = [
        {"slug": "3sum", "due_date": "2026-01-03", "interval_days": 30, "leech": 0},
        {"slug": "two-sum", "due_date": "2026-01-02", "interval_days": 30, "leech": 1},
    ]

    q = scheduler.build_daily_queue(
        problems, attempts, reviews, {"review_limit": 5, "new_limit": 2}, today=today)

    assert [r["slug"] for r in q["reviews"]] == ["two-sum", "3sum"]
    assert [n["slug"] for n in q["new"]] == ["valid-anagram"]


def test_sprint_round_weights_weak_and_mistake_heavy_categories():
    today = dt.date(2026, 1, 10)
    attempts = [
        {"id": "a1", "slug": "invert-tree", "confidence": 1,
         "independence": "solution", "solved_at": _ts(today)},
        {"id": "a2", "slug": "two-sum", "confidence": 3,
         "independence": "solo", "solved_at": _ts(today)},
    ]
    reviews = [{"slug": "invert-tree", "due_date": "2026-02-01",
                "fail_count": 2, "leech": 1}]
    enrichments = [{"attempt_id": "a1", "mistake_tags": ["base-case"],
                    "severity": 2, "prediction_verdict": "wrong"}]

    sprints = scheduler.build_sprint_round(
        _sprint_problems(), attempts, reviews, {"sprint_round_size": 5},
        today=today, enrichments=enrichments)

    assert sprints[0]["category"] == "Trees"
    assert sprints[0]["kind"] == "sprint"
    assert sprints[0]["score"] > next(s for s in sprints if s["slug"] == "two-sum")["score"]
    assert {"slug", "title", "difficulty", "category", "url", "kind", "score",
            "reason", "reason_codes", "signals"} <= set(sprints[0])
    assert "recent_mistakes" in sprints[0]["reason_codes"]
    assert "prediction_miss" in sprints[0]["reason_codes"]
    assert sprints[0]["signals"]["mistake_density"] == 1.0
    assert sprints[0]["signals"]["prediction_misses"] == 1


def test_sprint_round_backfills_unattempted_when_signal_is_sparse():
    today = dt.date(2026, 1, 10)
    attempts = [{"slug": "invert-tree", "confidence": 1, "independence": "hints",
                 "solved_at": _ts(today)}]

    sprints = scheduler.build_sprint_round(
        _sprint_problems(), attempts, [], {"sprint_round_size": 5}, today=today)

    assert len(sprints) == 5
    assert any(s["slug"] == "invert-tree" for s in sprints)
    assert any(s["signals"].get("unattempted") for s in sprints)
    assert all(s["slug"] != "external-cache" for s in sprints)


def test_sprint_round_broad_fallback_tie_order_ignores_input_order():
    today = dt.date(2026, 1, 10)
    problems = _sprint_problems()
    expected = ["two-sum", "group-anagrams", "longest-substring", "diameter-tree"]

    orders = [
        [s["slug"] for s in scheduler.build_sprint_round(
            variant, [], [], {"sprint_round_size": 4}, today=today)]
        for variant in (
            problems,
            list(reversed(problems)),
            [problems[i] for i in (3, 1, 5, 0, 4, 2)],
        )
    ]

    assert orders == [expected, expected, expected]
    assert all(s["reason"] == "Broad coverage" for s in scheduler.build_sprint_round(
        problems, [], [], {"sprint_round_size": 4}, today=today))


def test_sprint_round_respects_exclude_slugs():
    sprints = scheduler.build_sprint_round(
        _sprint_problems(), [], [], {"sprint_round_size": 5},
        exclude_slugs={"two-sum", "diameter-tree"}, today=dt.date(2026, 1, 10))

    assert all(s["slug"] not in {"two-sum", "diameter-tree"} for s in sprints)
    assert len(sprints) == 3


# ---- topic tree -----------------------------------------------------------------
def _tree(attempts=(), enrichments=None):
    return scheduler.topic_tree(_problems(), list(attempts), enrichments)


def test_topic_tree_groups_categories_into_families_in_curriculum_order():
    tree = _tree()

    assert [f["family"] for f in tree] == ["Foundations"]
    assert [t["category"] for t in tree[0]["topics"]] == ["Arrays & Hashing", "Two Pointers"]


def test_topic_tree_omits_families_with_no_library_problems():
    tree = _tree()

    assert "Dynamic Programming" not in {f["family"] for f in tree}


def test_topic_tree_family_totals_sum_their_topics():
    attempts = [
        {"id": "a1", "slug": "two-sum", "solved_at": _ts(dt.date(2026, 1, 10)),
         "confidence": 3, "independence": "solo"},
    ]

    fam = _tree(attempts)[0]

    assert fam["total"] == 3  # two Arrays & Hashing + one Two Pointers
    assert fam["solved"] == 1
    assert fam["coverage"] == round(1 / 3, 3)


def test_topic_tree_family_mastery_is_solved_weighted_not_dragged_by_untouched_topics():
    attempts = [
        {"id": "a1", "slug": "two-sum", "solved_at": _ts(dt.date(2026, 1, 10)),
         "confidence": 3, "independence": "solo"},
    ]

    fam = _tree(attempts)[0]
    arrays = next(t for t in fam["topics"] if t["category"] == "Arrays & Hashing")
    two_ptr = next(t for t in fam["topics"] if t["category"] == "Two Pointers")

    assert arrays["mastery"] == 1.0
    assert two_ptr["mastery"] == 0.0  # untouched
    # Solved-weighted: only the solved topic contributes, so an untouched
    # sibling does not halve the family's mastery.
    assert fam["mastery"] == 1.0
    assert fam["weakness"] == 0.0


def test_topic_tree_family_mastery_is_zero_with_no_solves():
    fam = _tree()[0]

    assert fam["solved"] == 0
    assert fam["mastery"] == 0.0
    assert fam["coverage"] == 0.0


def test_topic_tree_carries_topic_stats_rows_through_unchanged():
    attempts = [
        {"id": "s1", "slug": "two-sum", "solved_at": _ts(dt.date(2026, 1, 10)),
         "kind": "sprint", "source": "sprint"},
    ]
    enrichments = [{"attempt_id": "s1", "prediction_verdict": "correct"}]

    arrays = next(
        t for t in _tree(attempts, enrichments)[0]["topics"]
        if t["category"] == "Arrays & Hashing"
    )

    assert arrays["sprint_reps"] == 1
    assert arrays["sprint_accuracy"] == 1.0
    assert arrays["solved"] == 0  # sprints still don't count as solves


def test_topic_tree_families_partition_every_known_category():
    from server.neetcode150 import CATEGORY_FAMILIES, CATEGORY_ORDER

    grouped = [c for cats in CATEGORY_FAMILIES.values() for c in cats]

    assert grouped == CATEGORY_ORDER  # no gaps, no duplicates, same order


# ---- review board segmentation --------------------------------------------------
def _review(slug, due, **kw):
    base = {"slug": slug, "due_date": due, "interval_days": 6, "leech": 0}
    base.update(kw)
    return base


def _problem(slug, category="Arrays & Hashing"):
    return {"slug": slug, "title": slug.replace("-", " ").title(),
            "difficulty": "Medium", "neetcode_category": category,
            "url": f"https://leetcode.com/problems/{slug}/"}


TODAY = dt.date(2026, 9, 21)


def _due(days_from_today):
    return (TODAY + dt.timedelta(days=days_from_today)).isoformat()


def test_review_bucket_keeps_a_card_due_for_a_whole_week():
    # The point of the window: one slipped day must not turn a card overdue.
    assert scheduler.review_bucket(0) == "due"
    assert scheduler.review_bucket(1) == "due"
    assert scheduler.review_bucket(scheduler.REVIEW_DUE_WINDOW_DAYS) == "due"
    assert scheduler.review_bucket(scheduler.REVIEW_DUE_WINDOW_DAYS + 1) == "overdue"


def test_review_bucket_splits_the_future_into_soon_week_and_later():
    assert scheduler.review_bucket(-1) == "soon"
    assert scheduler.review_bucket(-3) == "soon"
    assert scheduler.review_bucket(-4) == "week"
    assert scheduler.review_bucket(-7) == "week"
    assert scheduler.review_bucket(-8) == "later"


def test_review_schedule_groups_every_card_and_drops_empty_segments():
    reviews = [
        _review("a", _due(-20)),   # overdue
        _review("b", _due(-2)),    # still due
        _review("c", _due(0)),     # due today
        _review("d", _due(2)),     # soon
        _review("e", _due(30)),    # later
    ]
    problems = [_problem(s) for s in "abcde"]

    segments = scheduler.review_schedule(problems, reviews, today=TODAY)

    assert [s["key"] for s in segments] == ["overdue", "due", "soon", "later"]
    assert {s["key"]: s["count"] for s in segments} == {
        "overdue": 1, "due": 2, "soon": 1, "later": 1}
    assert sum(s["count"] for s in segments) == len(reviews)


def test_review_schedule_is_not_capped_by_the_daily_review_limit():
    reviews = [_review(f"p{i}", _due(-1)) for i in range(25)]
    problems = [_problem(f"p{i}") for i in range(25)]

    segments = scheduler.review_schedule(problems, reviews, today=TODAY)

    assert segments[0]["count"] == 25


def test_review_schedule_puts_leeches_first_then_oldest_due():
    reviews = [
        _review("old", _due(-30)),
        _review("leech", _due(-10), leech=1),
        _review("older", _due(-40)),
    ]
    problems = [_problem(s) for s in ("old", "leech", "older")]

    overdue = scheduler.review_schedule(problems, reviews, today=TODAY)[0]

    assert [c["slug"] for c in overdue["items"]] == ["leech", "older", "old"]


def test_review_schedule_carries_days_late_and_recall_mode():
    reviews = [
        _review("short", _due(-3), interval_days=6),
        _review("long", _due(-3), interval_days=scheduler.RECALL_INTERVAL_CAP),
    ]
    problems = [_problem("short"), _problem("long")]

    by_slug = {c["slug"]: c
               for s in scheduler.review_schedule(problems, reviews, today=TODAY)
               for c in s["items"]}

    assert by_slug["short"]["days_late"] == 3
    assert by_slug["short"]["mode"] == "recall"
    assert by_slug["long"]["mode"] == "full"  # long intervals earn a full re-solve


def test_review_schedule_skips_cards_with_no_or_broken_due_date():
    reviews = [
        _review("ok", _due(-1)),
        _review("none", None),
        _review("junk", "not-a-date"),
    ]
    problems = [_problem(s) for s in ("ok", "none", "junk")]

    segments = scheduler.review_schedule(problems, reviews, today=TODAY)

    assert sum(s["count"] for s in segments) == 1


def test_review_schedule_falls_back_when_the_problem_is_missing():
    segments = scheduler.review_schedule([], [_review("ghost", _due(0))], today=TODAY)

    card = segments[0]["items"][0]
    assert card["title"] == "ghost"
    assert card["difficulty"] == "Unknown"


# ---- solves logged outside the library -----------------------------------------
# A solve the sweep detects can be for a problem that was never imported. It
# keeps its rating and its history, but must not start showing up as work.
def _outside(slug):
    return {**_problem(slug), "in_library": False, "packs": []}


def test_review_schedule_omits_cards_for_problems_outside_the_library():
    reviews = [_review("in", _due(-1)), _review("out", _due(-1))]
    problems = [_problem("in"), _outside("out")]

    segments = scheduler.review_schedule(problems, reviews, today=TODAY)

    assert [c["slug"] for s in segments for c in s["items"]] == ["in"]


def test_daily_queue_omits_reviews_for_problems_outside_the_library():
    problems = [_problem("in"), _outside("out")]
    reviews = [_review("in", _due(-1)), _review("out", _due(-1))]

    queue = scheduler.build_daily_queue(problems, reviews=reviews, attempts=[],
                                        settings={}, today=TODAY)

    assert [r["slug"] for r in queue["reviews"]] == ["in"]


# ---- store cache revisions (pure: no Firestore, no I/O) -------------------------
def test_invalidating_a_key_bumps_only_that_revision():
    from server import store

    a, b = ("attempts", "u1"), ("reviews", "u1")
    before_a = store._revisions.get(a, 0)
    before_b = store._revisions.get(b, 0)

    store._invalidate(a)

    assert store._revisions[a] == before_a + 1
    assert store._revisions.get(b, 0) == before_b


def test_invalidating_drops_the_cached_value():
    from server import store

    key = ("problems",)
    calls = []

    def loader():
        calls.append(1)
        return ["x"]

    store._invalidate(key)
    assert store._cached(key, loader) == ["x"]
    assert store._cached(key, loader) == ["x"]
    assert len(calls) == 1          # second read served from cache

    store._invalidate(key)
    assert store._cached(key, loader) == ["x"]
    assert len(calls) == 2          # write forced a refetch

    store._invalidate(key)          # leave no warm entry behind for other tests


# ---- drill / sprint cooldown ----------------------------------------------------
def _cooldown_settings():
    # isolate the cooldown: no breadth/weakness pull from unattempted problems
    return {"drill_breadth_weight": 0, "drill_weakness_weight": 0}


def test_drill_lane_cools_down_recently_drilled_problem():
    today = dt.date(2026, 1, 10)
    reviews = [{"slug": "invert-tree", "due_date": "2026-02-01",
                "fail_count": 3, "leech": 1}]
    attempts = [{"id": "d1", "slug": "invert-tree", "confidence": 3,
                 "independence": "solo", "solved_at": _ts(today), "kind": "drill"}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, reviews, settings=_cooldown_settings(),
        today=today)
    assert drills == []  # the only signal is on a just-drilled problem


def test_drill_lane_old_drill_is_off_cooldown():
    today = dt.date(2026, 1, 10)
    reviews = [{"slug": "invert-tree", "due_date": "2026-02-01",
                "fail_count": 3, "leech": 1}]
    attempts = [{"id": "d1", "slug": "invert-tree", "confidence": 3,
                 "independence": "solo",
                 "solved_at": _ts(today - dt.timedelta(days=9)), "kind": "drill"}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, reviews, settings=_cooldown_settings(),
        today=today)
    assert any(d["slug"] == "invert-tree" for d in drills)


def test_drill_lane_cooldown_ignores_real_solve_struggles():
    # A struggle on a real solve must still surface as a drill — the cooldown only
    # debounces reps served through the drill flow (kind == "drill").
    today = dt.date(2026, 1, 10)
    attempts = [{"id": "s1", "slug": "invert-tree", "confidence": 1,
                 "independence": "solution", "solved_at": _ts(today),
                 "kind": "adhoc"}]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], settings=_cooldown_settings(),
        today=today)
    assert any(d["slug"] == "invert-tree" for d in drills)


def test_sprint_round_cools_down_recent_reps():
    today = dt.date(2026, 1, 10)
    attempts = [{"id": "sp1", "slug": "two-sum", "kind": "sprint",
                 "solved_at": _ts(today)}]
    sprints = scheduler.build_sprint_round(
        _sprint_problems(), attempts, [], {"sprint_round_size": 5}, today=today)
    assert all(s["slug"] != "two-sum" for s in sprints)


def test_sprint_round_old_rep_is_off_cooldown():
    today = dt.date(2026, 1, 10)
    attempts = [{"id": "sp1", "slug": "two-sum", "kind": "sprint",
                 "solved_at": _ts(today - dt.timedelta(days=9))}]
    sprints = scheduler.build_sprint_round(
        _sprint_problems(), attempts, [], {"sprint_round_size": 5}, today=today)
    assert any(s["slug"] == "two-sum" for s in sprints)


# ---- pre-solve plans --------------------------------------------------------------
def test_plan_cap_limits_a_solve_found_while_coding():
    held = scheduler.advance_review(_card(), 3, "solo")
    pivoted = scheduler.advance_review(_card(), 3, "solo", plan_cap=3)
    tweaked = scheduler.advance_review(_card(), 3, "solo", plan_cap=4)
    assert held["quality"] == 5
    assert pivoted["quality"] == 3
    assert tweaked["quality"] == 4
    # A cap never lifts a rating; and a recall grade isn't a plan.
    assert scheduler.advance_review(_card(), 1, "solo", plan_cap=4)["quality"] == 3
    assert scheduler.advance_review(_card(), 3, "solo", grade=3, plan_cap=3)["quality"] == 5


def test_drill_lane_counts_plan_misses_as_signal():
    attempts = [
        {"id": "a1", "slug": "invert-tree", "confidence": 3, "independence": "solo",
         "solved_at": 1768000000, "plan_status": "planned",
         "predicted_approach": "dfs", "plan_held": "pivoted"},
        {"id": "a2", "slug": "longest-substring", "confidence": 3, "independence": "solo",
         "solved_at": 1768000000, "plan_status": "planned",
         "predicted_approach": "window", "plan_held": "held"},
    ]
    drills = scheduler.build_drill_lane(
        _drill_problems(), attempts, [], today=dt.date(2026, 1, 10))
    tree = next(d for d in drills if d["category"] == "Trees")
    assert "prediction_miss" in tree["reason_codes"]
    assert tree["signals"]["prediction_misses"] == 1
    assert not any(d["category"] == "Sliding Window" and "prediction_miss" in d["reason_codes"]
                   for d in drills)


def test_one_attempt_counts_one_plan_miss():
    attempts = [{"id": "a1", "slug": "invert-tree", "plan_status": "planned",
                 "predicted_approach": "dfs", "plan_held": "pivoted"}]
    enrichments = [{"attempt_id": "a1", "prediction_verdict": "wrong",
                    "plan_grade": {"approach_verdict": "wrong"}}]
    misses = scheduler._prediction_misses_by_category(_drill_problems(), attempts, enrichments)
    assert misses == {"Trees": 1}


def test_no_idea_start_is_a_recent_struggle():
    attempts = [{"id": "a1", "slug": "invert-tree", "confidence": 3, "independence": "solo",
                 "solved_at": 1768000000, "plan_status": "blank"}]
    struggles = scheduler._recent_struggles_by_category(
        _drill_problems(), attempts, dt.date(2026, 1, 10))
    assert struggles == {"Trees": 1}
