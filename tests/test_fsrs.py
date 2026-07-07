"""Scheduler invariants must hold under BOTH engines."""
import datetime as dt

import pytest

from server import config, scheduler


@pytest.fixture(params=["sm2", "fsrs"])
def engine(request, monkeypatch):
    monkeypatch.setattr(config, "SCHEDULER", request.param)
    return request.param


def test_good_recall_lengthens_interval(engine):
    today = dt.date(2026, 1, 1)
    first = scheduler.advance_review(None, 3, "solo", today=today)
    second = scheduler.advance_review(first, 3, "solo", today=today)
    assert second["interval_days"] >= first["interval_days"]
    assert second["due_date"] >= first["due_date"]


def test_failed_recall_resets_and_counts(engine):
    today = dt.date(2026, 1, 1)
    card = scheduler.advance_review(None, 3, "solo", today=today)
    card = scheduler.advance_review(card, 3, "solo", today=today)
    failed = scheduler.advance_review(card, 1, "solution", today=today)
    assert failed["fail_count"] == 1
    assert failed["interval_days"] <= card["interval_days"]


def test_leech_after_three_failures(engine):
    today = dt.date(2026, 1, 1)
    card = scheduler.advance_review(None, 1, "solution", today=today)
    card = scheduler.advance_review(card, 1, "solution", today=today)
    card = scheduler.advance_review(card, 1, "solution", today=today)
    assert card["leech"] == 1


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
