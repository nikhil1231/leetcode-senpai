"""Untracked-solve detection: the sweep that logs problems solved outside a
session. LeetCode client mocked; no network, no Firestore.
"""
import time

import pytest

from server import leetcode, poller


def _ac(sub_id, slug, ts):
    return {"id": sub_id, "title": slug.replace("-", " ").title(),
            "titleSlug": slug, "timestamp": ts}


@pytest.fixture
def recents(monkeypatch):
    """Control what LeetCode's recent-AC feed returns; disable detail lookups."""
    feed = []

    async def fake_recent_ac(username, limit=20, auth=None):
        return feed[:limit]

    async def fake_details(submission_id, auth):
        raise RuntimeError("no cookie")

    async def fake_question(slug, auth=None):
        return {"frontend_id": 999, "title": slug.replace("-", " ").title(),
                "difficulty": "Medium", "tags": ["Two Pointers"], "paid_only": False,
                "likes": 100, "dislikes": 10, "like_ratio": 0.9, "ac_rate": 50.0,
                "similar_slugs": []}

    monkeypatch.setattr(leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(leetcode, "submission_details", fake_details)
    monkeypatch.setattr(leetcode, "question", fake_question)
    return feed


@pytest.fixture
def library(store):
    store.upsert_problem({"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
                          "neetcode_category": "Arrays & Hashing", "in_library": True,
                          "packs": ["neetcode150"], "url": "https://lc/two-sum"})
    return store


async def test_sweep_logs_a_solve_with_no_session(library, recents):
    recents.append(_ac(1, "two-sum", int(time.time()) - 60))
    ids = await poller.sweep_untracked_solves(library, "kunde")
    assert len(ids) == 1
    a = library.get_attempt(ids[0])
    assert a["slug"] == "two-sum"
    assert a["source"] == "detected"
    assert a["confidence"] is None  # needs annotating
    # No session means no start time, so no clock can be honestly reported.
    assert a["time_taken_sec"] is None


async def test_sweep_is_idempotent(library, recents):
    recents.append(_ac(1, "two-sum", int(time.time()) - 60))
    first = await poller.sweep_untracked_solves(library, "kunde")
    second = await poller.sweep_untracked_solves(library, "kunde")
    assert len(first) == 1 and second == []
    assert len(library.list_attempts()) == 1


async def test_sweep_dedupes_against_submission_id_without_watermark(library, recents):
    """The watermark is an optimisation; submission ids are the real guard."""
    recents.append(_ac(1, "two-sum", int(time.time()) - 60))
    await poller.sweep_untracked_solves(library, "kunde")
    library.update_settings({poller.WATERMARK_KEY: None})
    assert await poller.sweep_untracked_solves(library, "kunde") == []
    assert len(library.list_attempts()) == 1


async def test_sweep_ignores_solves_older_than_the_annotate_window(library, recents):
    stale = int(time.time()) - poller.SWEEP_LOOKBACK_SEC - 3600
    recents.append(_ac(1, "two-sum", stale))
    assert await poller.sweep_untracked_solves(library, "kunde") == []
    assert library.list_attempts() == []


async def test_sweep_leaves_an_active_session_to_the_session_pass(library, recents):
    started = int(time.time()) - 600
    library.add_session({"slug": "two-sum", "started_at": started, "status": "active",
                         "kind": "adhoc", "paused_sec": 0})
    recents.append(_ac(1, "two-sum", started + 300))
    assert await poller.sweep_untracked_solves(library, "kunde") == []
    assert library.list_attempts() == []


async def test_sweep_imports_an_unknown_problem_outside_the_library(library, recents):
    recents.append(_ac(2, "hidden-gem", int(time.time()) - 60))
    ids = await poller.sweep_untracked_solves(library, "kunde")
    assert len(ids) == 1
    p = library.get_problem("hidden-gem")
    assert p is not None
    # Logged, but not volunteered for the daily queue.
    assert p["in_library"] is False


async def test_sweep_needs_a_username(library, recents):
    recents.append(_ac(1, "two-sum", int(time.time()) - 60))
    assert await poller.sweep_untracked_solves(library, None) == []


async def test_sweep_survives_a_leetcode_failure(library, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("leetcode down")

    monkeypatch.setattr(leetcode, "recent_ac", boom)
    assert await poller.sweep_untracked_solves(library, "kunde") == []


async def test_sweep_only_writes_the_watermark_when_it_moves(library, recents):
    """It runs every few seconds during a live session — a write per tick would
    invalidate the settings cache and redraw every open tab on a timer."""
    recents.append(_ac(1, "two-sum", int(time.time()) - 60))
    await poller.sweep_untracked_solves(library, "kunde")
    settled = library.get_settings()[poller.WATERMARK_KEY]

    writes = []
    original = library.update_settings
    library.update_settings = lambda fields: (writes.append(fields), original(fields))[1]
    await poller.sweep_untracked_solves(library, "kunde")

    assert writes == []
    assert library.get_settings()[poller.WATERMARK_KEY] == settled
