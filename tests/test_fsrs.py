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
