"""Pure plan logic: no store, no network."""
import pytest

from server import plans


@pytest.mark.parametrize("a,b", [
    ("O(n)", "O(n) average time"),
    ("O(nm)", "O(mA), where m = number of coins and A = amount"),
    ("O(n^2)", "O(n²)"),
    ("O(n^2)", "O(n*n)"),
    ("O(n log n)", "n log n"),
    ("O(log n)", "O(log(n))"),
    ("O(V + E)", "O(n + m)"),
])
def test_same_big_o_ignores_notation(a, b):
    assert plans.same_big_o(a, b) is True


@pytest.mark.parametrize("a,b", [
    ("O(n)", "O(n log n)"),
    ("O(1)", "O(n)"),
    ("O(n log k)", "O(n log n)"),
    ("O(n + m)", "O(nm)"),
])
def test_same_big_o_tells_real_differences_apart(a, b):
    assert plans.same_big_o(a, b) is False


@pytest.mark.parametrize("text", [None, "", "linear", "It depends on the input size"])
def test_non_complexities_do_not_compare(text):
    assert plans.norm_big_o(text) is None
    assert plans.same_big_o("O(n)", text) is None


def test_plan_status_reads_legacy_rows_as_planned():
    assert plans.plan_status({"predicted_approach": "two pointers"}) == "planned"
    assert plans.plan_status({"planned_edge_cases": ["empty"]}) == "planned"
    assert plans.plan_status({"plan_status": "blank"}) == "blank"
    assert plans.plan_status({"plan_status": "skipped"}) == "skipped"
    assert plans.plan_status({"slug": "two-sum"}) is None


def _planned(**extra):
    return {"plan_status": "planned", "predicted_approach": "hash complements",
            "complexity_target_time": "O(n)", **extra}


def test_plan_score_from_held_alone_without_an_llm():
    assert plans.plan_score(plans.plan_components(_planned(plan_held="held"))) == 5
    assert plans.plan_score(plans.plan_components(_planned(plan_held="tweaked"))) == 3
    assert plans.plan_score(plans.plan_components(_planned(plan_held="pivoted"))) == 0
    assert plans.plan_score(plans.plan_components(_planned())) is None


def test_plan_components_from_a_graded_plan():
    attempt = _planned(predicted_category="Arrays & Hashing", plan_held="held",
                       planned_edge_cases=["duplicates"])
    enrichment = {"plan_grade": {
        "approach_verdict": "viable", "pattern_verdict": "correct",
        "optimal_time": "O(n) time",
        "edge_cases": [{"case": "duplicates", "covered": True},
                       {"case": "no pair", "covered": False}],
    }}
    c = plans.plan_components(attempt, enrichment)
    assert c == {"approach": 1.0, "pattern": 1.0, "complexity": 1.0, "edges": 0.5, "held": 1.0}
    # (2 + 1 + 1 + .5 + 1) / 6 * 5 = 4.58, rounded
    assert plans.plan_score(c) == 5


def test_edges_not_scored_when_none_were_planned():
    enrichment = {"plan_grade": {"edge_cases": [{"case": "empty", "covered": False}]}}
    assert plans.plan_components(_planned(), enrichment)["edges"] is None


def test_complexity_target_judged_against_canonical_when_ungraded():
    c = plans.plan_components(_planned(), None, canonical={"time": "O(n log n)"})
    assert c["complexity"] == 0.0


def test_legacy_prediction_verdict_scores_the_pattern():
    attempt = {"predicted_category": "Graphs", "predicted_approach": "bfs"}
    c = plans.plan_components(attempt, {"prediction_verdict": "partial"})
    assert c["pattern"] == 0.5


def test_quality_cap():
    assert plans.quality_cap("blank", None) == 3
    assert plans.quality_cap("planned", "pivoted") == 3
    assert plans.quality_cap("planned", "tweaked") == 4
    assert plans.quality_cap("planned", "held") is None
    assert plans.quality_cap("skipped", None) is None


def test_plan_miss():
    assert plans.plan_miss({"plan_status": "blank"}) is True
    assert plans.plan_miss(_planned(plan_held="pivoted")) is True
    assert plans.plan_miss(_planned(plan_held="held")) is False
    assert plans.plan_miss(_planned(), {"plan_grade": {"approach_verdict": "partial"}}) is True
    assert plans.plan_miss(_planned(), {"plan_grade": {"optimal_time": "O(1)"}}) is True
    assert plans.plan_miss({"plan_status": "skipped"}) is False


def test_plan_review_shape_for_the_scorecard():
    attempt = _planned(complexity_target_space="O(1)", plan_time_sec=95, plan_held="held")
    review = plans.plan_review(attempt, {"plan_grade": {
        "approach_verdict": "viable", "optimal_time": "O(n)", "optimal_space": "O(n)",
        "solution_time": "O(n)", "failure_case": "empty array", "note": "Solid.",
    }})
    assert review["status"] == "planned"
    assert review["graded"] is True
    assert review["time_vs_optimal"] is True
    assert review["space_vs_optimal"] is False
    assert review["time_vs_solution"] is True
    assert review["failure_case"] == "empty array"
    assert review["plan_time_sec"] == 95
    assert review["score"] is not None


def test_previous_plan_picks_latest_earlier_explanation():
    attempts = [
        {"id": "a", "slug": "s", "solved_at": 10, "predicted_approach": "old plan",
         "complexity_target_time": "O(n^2)"},
        {"id": "b", "slug": "s", "solved_at": 20, "kind": "recall", "approach": "recall text"},
        {"id": "c", "slug": "s", "solved_at": 25, "kind": "sprint", "approach": "sprint why"},
        {"id": "d", "slug": "s", "solved_at": 30, "predicted_approach": "current"},
        {"id": "e", "slug": "other", "solved_at": 15, "approach": "elsewhere"},
    ]
    prev = plans.previous_plan(attempts, {}, "s", before_ts=30, exclude_id="d")
    assert prev["approach"] == "recall text"
    assert prev["planned"] is False
    assert plans.previous_plan(attempts, {}, "s", before_ts=5) is None


def test_no_score_from_a_time_target_alone():
    c = plans.plan_components(_planned(), None, canonical={"time": "O(n)"})
    assert c["complexity"] == 1.0
    assert plans.plan_score(c) is None
