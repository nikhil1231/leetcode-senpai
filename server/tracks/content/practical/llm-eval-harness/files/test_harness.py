from data import CASES, HUMAN, JUDGE, OUTPUTS_V1, OUTPUTS_V2
from harness import compare, corrected_fail_rate, judge_rates, run, score

REFUND = {"id": "x", "category": "refunds", "expected": "refunds"}


def test_score_normalises_format():
    for out in ["refunds", "Refunds.", "  REFUNDS ", "Queue: Refunds", "queue: refunds"]:
        assert score(REFUND, out), out
    for out in ["billing", "refunds please", ""]:
        assert not score(REFUND, out), out


def test_run_reports_per_category():
    r = run(CASES, OUTPUTS_V1)
    assert r.pass_rate == 33 / 40
    assert r.by_category["refunds"] == 1.0 and r.by_category["billing"] == 0.75
    assert len(r.failing) == 7


def test_v2_is_better_overall_but_regresses_refunds():
    v1, v2 = run(CASES, OUTPUTS_V1), run(CASES, OUTPUTS_V2)
    assert v2.pass_rate > v1.pass_rate
    diff = compare(v1, v2)
    assert diff["regressed"] == ["refunds"]
    assert len(diff["newly_failing"]) == 6 and diff["newly_failing"] == sorted(diff["newly_failing"])


def test_judge_rates_against_the_human():
    rates = judge_rates(HUMAN, JUDGE)
    assert abs(rates["tpr"] - 5 / 7) < 1e-9 and abs(rates["tnr"] - 20 / 23) < 1e-9


def test_corrected_rate():
    assert abs(corrected_fail_rate(0.22, 0.75, 0.90) - 0.12 / 0.65) < 1e-9
