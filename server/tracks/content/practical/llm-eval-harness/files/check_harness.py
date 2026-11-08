from harness import Report, compare, corrected_fail_rate, judge_rates, run, score

CASES = [{"id": "a", "category": "x", "expected": "x"}, {"id": "b", "category": "y", "expected": "y"}]


def test_none_and_missing_outputs_fail():
    assert not score(CASES[0], None)
    r = run(CASES, {"a": "x"})
    assert r.pass_rate == 0.5 and r.failing == ["b"]


def test_category_only_in_one_report():
    base = Report(1.0, {"x": 1.0}, [])
    new = Report(0.5, {"x": 1.0, "y": 0.0}, ["b"])
    assert compare(base, new)["regressed"] == []
    assert compare(new, base)["newly_failing"] == []


def test_small_drop_is_not_a_regression():
    assert compare(Report(1, {"x": 0.80}, []), Report(1, {"x": 0.76}, []))["regressed"] == []


def test_no_human_failures_means_no_tpr():
    rates = judge_rates({"a": "pass", "b": "pass"}, {"a": "pass", "b": "fail"})
    assert rates["tpr"] is None and rates["tnr"] == 0.5


def test_chance_judge_and_clamping():
    assert corrected_fail_rate(0.3, 0.5, 0.5) is None
    assert corrected_fail_rate(0.01, 0.9, 0.9) == 0.0
    assert corrected_fail_rate(0.99, 0.9, 0.9) == 1.0
