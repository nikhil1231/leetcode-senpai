"""Scheduler invariants must hold under BOTH engines."""
import datetime as dt

import pytest

from server import config, scheduler


@pytest.fixture(params=["sm2", "fsrs"])
def engine(request, monkeypatch):
    monkeypatch.setattr(config, "SCHEDULER", request.param)
    return request.param


# Successive reviews land on successive days: a card only moves once a day, so
# stacking them on one date would be testing the collapsing below instead.
def _day(n):
    return dt.date(2026, 1, 1) + dt.timedelta(days=n)


def test_good_recall_lengthens_interval(engine):
    first = scheduler.advance_review(None, 3, "solo", today=_day(0))
    second = scheduler.advance_review(first, 3, "solo", today=_day(1))
    assert second["interval_days"] >= first["interval_days"]
    assert second["due_date"] >= first["due_date"]


def test_failed_recall_resets_and_counts(engine):
    card = scheduler.advance_review(None, 3, "solo", today=_day(0))
    card = scheduler.advance_review(card, 3, "solo", today=_day(1))
    failed = scheduler.advance_review(card, 1, "solution", today=_day(2))
    assert failed["fail_count"] == 1
    assert failed["interval_days"] <= card["interval_days"]


def test_leech_after_three_failures(engine):
    card = scheduler.advance_review(None, 1, "solution", today=_day(0))
    card = scheduler.advance_review(card, 1, "solution", today=_day(1))
    card = scheduler.advance_review(card, 1, "solution", today=_day(2))
    assert card["leech"] == 1


# ---- one card, one move per day ------------------------------------------------
def test_grading_again_today_replaces_todays_advance(engine):
    """Rating a second solve of the same problem today — the usual cause is a
    better submission landing after the first was already logged — must leave
    the card where that second rating alone would put it."""
    yesterday = scheduler.advance_review(None, 3, "solo", today=_day(0))
    first = scheduler.advance_review(yesterday, 2, "hints", today=_day(1))
    again = scheduler.advance_review(first, 3, "solo", today=_day(1))

    straight = scheduler.advance_review(yesterday, 3, "solo", today=_day(1))
    assert again["due_date"] == straight["due_date"]
    assert again["interval_days"] == straight["interval_days"]
    assert again["fail_count"] == straight["fail_count"]


def test_a_second_failure_today_is_still_one_failure(engine):
    card = scheduler.advance_review(None, 3, "solo", today=_day(0))
    once = scheduler.advance_review(card, 1, "solution", today=_day(1))
    twice = scheduler.advance_review(once, 1, "solution", today=_day(1))
    assert once["fail_count"] == 1
    assert twice["fail_count"] == 1
    assert twice["leech"] == once["leech"]


def test_collapsing_does_not_reach_back_past_today(engine):
    """Only today's advance is replaced; the history behind it stands."""
    card = scheduler.advance_review(None, 3, "solo", today=_day(0))
    card = scheduler.advance_review(card, 3, "solo", today=_day(1))
    settled = scheduler.advance_review(card, 3, "solo", today=_day(5))
    redone = scheduler.advance_review(settled, 3, "solo", today=_day(5))
    assert redone["due_date"] == settled["due_date"]
    # Tomorrow starts from the redone card, not from a rewound one.
    tomorrow = scheduler.advance_review(redone, 3, "solo", today=_day(6))
    assert tomorrow["due_date"] > redone["due_date"]


def test_a_card_written_before_the_snapshot_existed_is_left_alone(engine):
    """No snapshot means "unknown", never "there was nothing here" — rewinding a
    legacy card to None would reset real review history to a first solve."""
    legacy = {"slug": "two-sum", "reps": 4, "ease": 2.4, "interval_days": 21,
              "due_date": "2026-01-22", "last_reviewed": _day(0).isoformat(),
              "fail_count": 1, "leech": 0}
    nxt = scheduler.advance_review(legacy, 3, "solo", today=_day(0))
    assert nxt["fail_count"] == 1
    assert nxt[scheduler.PRIOR_CARD_KEY]["interval_days"] == 21


def test_seed_is_due_in_future(engine):
    today = dt.date(2026, 1, 1)
    s = scheduler.seed_review("two-sum", today=today)
    assert s["due_date"] >= today.isoformat()
    assert s["slug"] == "two-sum"


def test_recall_grade_path(engine):
    today = dt.date(2026, 1, 1)
    card = scheduler.advance_review(None, None, None, today=today, grade=3)
    assert card["interval_days"] >= 1


def test_fsrs_migrates_legacy_sm2_card(monkeypatch):
    monkeypatch.setattr(config, "SCHEDULER", "fsrs")
    legacy = {"slug": "two-sum", "reps": 3, "ease": 2.5, "interval_days": 15,
              "due_date": "2026-01-01", "fail_count": 0, "leech": 0}
    nxt = scheduler.advance_review(legacy, 4, "solo", today=dt.date(2026, 1, 1))
    assert "fsrs" in nxt
    assert nxt["interval_days"] >= 1


@pytest.mark.parametrize("independence, expected", [("solution", 1), ("hints", 3)])
def test_correct_code_does_not_erase_help_needed(engine, independence, expected):
    card = scheduler.advance_review(None, 3, independence, solution_score=5,
                                    today=dt.date(2026, 1, 1))
    assert card["quality"] == expected
    assert card["fail_count"] == (1 if independence == "solution" else 0)


# ---- nothing lands back on the day it was rated ---------------------------------
@pytest.mark.parametrize("confidence, independence", [
    (1, "solution"), (1, "hints"), (2, "solo"), (3, "solo")])
def test_no_first_solve_is_due_the_same_day(engine, confidence, independence):
    card = scheduler.advance_review(None, confidence, independence, today=_day(0))
    assert card["due_date"] > _day(0).isoformat()


def test_a_clean_solve_with_a_tweaked_plan_is_not_due_today(engine):
    """Solo, confident, 5/5 code, plan tweaked (capped at Good): FSRS's minute-
    scale learning steps used to put this straight back in today's reviews."""
    card = scheduler.advance_review(None, 3, "solo", today=_day(0),
                                    solution_score=5, plan_cap=4)
    assert card["due_date"] > _day(0).isoformat()


@pytest.mark.parametrize("grade", [0, 1, 2, 3])
def test_a_recall_on_top_of_a_first_solve_is_not_due_today(engine, grade):
    solved = scheduler.advance_review(None, 3, "solo", today=_day(0),
                                      solution_score=5, plan_cap=4)
    recalled = scheduler.advance_review(solved, None, None, today=_day(0), grade=grade)
    assert recalled["due_date"] > _day(0).isoformat()


def test_a_failure_comes_back_tomorrow(engine):
    card = scheduler.advance_review(None, 3, "solo", today=_day(0))
    card = scheduler.advance_review(card, 3, "solo", today=_day(10))
    failed = scheduler.advance_review(card, 1, "solution", today=_day(40))
    assert failed["due_date"] == _day(41).isoformat()
    first = scheduler.advance_review(None, 1, "solution", today=_day(0))
    assert first["due_date"] == _day(1).isoformat()


# ---- interval caps ---------------------------------------------------------------
def _strong_card():
    """A card rated Easy on widely spaced days, as uncapped FSRS would park a
    year or more out."""
    card, day = None, 0
    for _ in range(6):
        card = scheduler.advance_review(card, 3, "solo", today=_day(day))
        day += max(card["interval_days"], 1)
    return card, day


def test_no_interval_exceeds_the_cap(engine):
    card, day = _strong_card()
    nxt = scheduler.advance_review(card, 3, "solo", today=_day(day), solution_score=5)
    assert nxt["interval_days"] == scheduler.MAX_INTERVAL_DAYS
    assert nxt["due_date"] == _day(day + scheduler.MAX_INTERVAL_DAYS).isoformat()


@pytest.mark.parametrize("graded", [True, False])
def test_a_recall_carries_a_card_only_as_far_as_the_recall_cap(engine, graded):
    """Sliding Window Maximum went 12 -> 432 days on one approach paragraph."""
    card, day = _strong_card()
    if graded:
        nxt = scheduler.advance_review(card, None, None, today=_day(day), grade=3)
    else:
        nxt = scheduler.advance_review(card, 3, "solo", today=_day(day), recall=True)
    assert nxt["interval_days"] == scheduler.RECALL_MAX_INTERVAL
    # …which puts it past the threshold, so the next review is a re-solve.
    assert scheduler.review_mode(nxt) == "full"


def test_a_short_interval_is_left_alone(engine):
    card = scheduler.advance_review(None, 1, "hints", today=_day(0))
    assert card["interval_days"] < scheduler.RECALL_MAX_INTERVAL
    assert card["due_date"] == _day(card["interval_days"]).isoformat()


# ---- leeches clear once re-learned ----------------------------------------------
def _leech(engine_day=0):
    card = None
    for d in range(3):
        card = scheduler.advance_review(card, 1, "solution", today=_day(engine_day + d))
    assert card["leech"] == 1
    return card


def test_two_passes_in_a_row_clear_a_leech(engine):
    card = _leech()
    once = scheduler.advance_review(card, 3, "solo", today=_day(5))
    assert once["leech"] == 1
    twice = scheduler.advance_review(once, 3, "solo", today=_day(10))
    assert twice["leech"] == 0
    assert twice["fail_count"] == 3                       # history is kept


def test_a_shaky_pass_does_not_count_toward_clearing(engine):
    card = _leech()
    card = scheduler.advance_review(card, 3, "solo", today=_day(5))
    card = scheduler.advance_review(card, 1, "hints", today=_day(10))  # Hard
    card = scheduler.advance_review(card, 3, "solo", today=_day(15))
    assert card["leech"] == 1


def test_a_cleared_card_needs_three_new_failures_to_become_a_leech_again(engine):
    card = _leech()
    card = scheduler.advance_review(card, 3, "solo", today=_day(5))
    card = scheduler.advance_review(card, 3, "solo", today=_day(10))
    for d in (20, 21):
        card = scheduler.advance_review(card, 1, "solution", today=_day(d))
        assert card["leech"] == 0
    card = scheduler.advance_review(card, 1, "solution", today=_day(22))
    assert card["leech"] == 1


def test_a_leech_from_before_the_clear_rule_can_still_clear(engine):
    legacy = {"slug": "two-sum", "interval_days": 1, "due_date": "2026-01-01",
              "last_reviewed": "2025-12-31", "fail_count": 4, "leech": 1, "ease": 2.0,
              "reps": 2}
    card = scheduler.advance_review(legacy, 3, "solo", today=_day(0))
    assert card["leech"] == 1
    card = scheduler.advance_review(card, 3, "solo", today=_day(3))
    assert card["leech"] == 0 and card["fail_count"] == 4
