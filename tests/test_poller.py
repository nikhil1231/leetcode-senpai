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


# ---- folding a better submission into the solve it improves on -----------------
@pytest.fixture
def details(monkeypatch):
    """Make submission detail lookups succeed; keyed by submission id."""
    table = {}

    async def fake_details(submission_id, auth):
        if submission_id not in table:
            raise RuntimeError("no such submission")
        return table[submission_id]

    monkeypatch.setattr(leetcode, "submission_details", fake_details)
    return table


def _solve(store, slug="two-sum", **over):
    """A session-timed solve sitting unrated in the annotate queue."""
    doc = {"slug": slug, "solved_at": int(time.time()) - 600, "time_taken_sec": 540,
           "submission_id": 1, "code": "brute force", "lang": "python3",
           "runtime_percentile": 5.0, "memory_percentile": 50.0, "wrong_before_ac": 2,
           "confidence": None, "independence": None, "source": "auto", "kind": "adhoc"}
    doc.update(over)
    return store.add_attempt(doc)


async def test_a_better_submission_folds_into_the_unrated_solve(library, recents, details):
    """AC something suboptimal, keep going, land a clean version: one sitting,
    one attempt, one review advance — not two."""
    aid = _solve(library)
    prior = library.get_attempt(aid)
    better_at = prior["solved_at"] + 420
    details[2] = {"code": "hash map", "lang": "python3",
                  "runtime_percentile": 95.0, "memory_percentile": 80.0}
    recents.append(_ac(2, "two-sum", better_at))

    touched = await poller.sweep_untracked_solves(library, "kunde")

    assert touched == [aid]
    assert len(library.list_attempts()) == 1
    a = library.get_attempt(aid)
    assert a["submission_id"] == 2
    assert a["solved_at"] == better_at
    assert a["code"] == "hash map"
    assert a["runtime_percentile"] == 95.0
    # The clock covers the whole sitting; what the first AC cost is kept beside it.
    assert a["time_taken_sec"] == 540 + 420
    assert a["first_ac_time_taken_sec"] == 540
    assert a["first_ac_at"] == prior["solved_at"]
    assert a["resubmissions"] == 1


async def test_folding_clears_the_grade_of_the_code_it_replaced(library, recents, details):
    aid = _solve(library, solution_grade={"score": 2, "optimal": False},
                 solution_grading_status="viewed")
    details[2] = {"code": "hash map", "lang": "python3"}
    recents.append(_ac(2, "two-sum", library.get_attempt(aid)["solved_at"] + 60))
    await poller.sweep_untracked_solves(library, "kunde")
    a = library.get_attempt(aid)
    assert a["solution_grade"] is None
    assert a["solution_grading_status"] is None


async def test_folding_twice_keeps_the_original_first_ac(library, recents, details):
    aid = _solve(library)
    start = library.get_attempt(aid)["solved_at"]
    details[2] = {"code": "better", "lang": "python3"}
    recents.append(_ac(2, "two-sum", start + 120))
    await poller.sweep_untracked_solves(library, "kunde")
    details[3] = {"code": "best", "lang": "python3"}
    recents.append(_ac(3, "two-sum", start + 300))
    await poller.sweep_untracked_solves(library, "kunde")

    a = library.get_attempt(aid)
    assert len(library.list_attempts()) == 1
    assert a["submission_id"] == 3
    assert a["resubmissions"] == 2
    assert a["first_ac_at"] == start
    assert a["first_ac_time_taken_sec"] == 540
    assert a["time_taken_sec"] == 540 + 300


async def test_rating_the_solve_ends_the_sitting(library, recents, details):
    """Once you've rated it you're done with it, so a later AC is a re-solve."""
    aid = _solve(library, confidence=2, independence="solo")
    details[2] = {"code": "better", "lang": "python3"}
    recents.append(_ac(2, "two-sum", library.get_attempt(aid)["solved_at"] + 120))
    ids = await poller.sweep_untracked_solves(library, "kunde")
    assert ids != [aid]
    assert len(library.list_attempts()) == 2
    assert library.get_attempt(aid)["submission_id"] == 1  # left alone


async def test_dismissing_the_prompt_ends_the_sitting(library, recents, details):
    aid = _solve(library, annotation_dismissed_at=int(time.time()))
    details[2] = {"code": "better", "lang": "python3"}
    recents.append(_ac(2, "two-sum", library.get_attempt(aid)["solved_at"] + 120))
    await poller.sweep_untracked_solves(library, "kunde")
    assert len(library.list_attempts()) == 2


async def test_a_solve_hours_later_is_its_own_attempt(library, recents, details):
    aid = _solve(library, solved_at=int(time.time()) - poller.SAME_SITTING_SEC - 3600)
    details[2] = {"code": "better", "lang": "python3"}
    recents.append(_ac(2, "two-sum", int(time.time()) - 60))
    await poller.sweep_untracked_solves(library, "kunde")
    assert len(library.list_attempts()) == 2
    assert library.get_attempt(aid)["submission_id"] == 1


async def test_an_earlier_ac_from_the_same_sitting_is_not_logged_again(library, recents):
    """The session pass records the newest AC when the app opens late. The
    earlier ones from that sitting are already spoken for."""
    aid = _solve(library, submission_id=9)
    solved_at = library.get_attempt(aid)["solved_at"]
    recents.append(_ac(7, "two-sum", solved_at - 300))
    ids = await poller.sweep_untracked_solves(library, "kunde")
    assert ids == []
    assert len(library.list_attempts()) == 1
    assert library.get_attempt(aid)["submission_id"] == 9


async def test_folding_survives_a_details_lookup_failure(library, recents):
    """No cookie means no code for the new submission. Better to carry none than
    to leave the old code sitting under the new submission id."""
    aid = _solve(library)
    recents.append(_ac(2, "two-sum", library.get_attempt(aid)["solved_at"] + 60))
    await poller.sweep_untracked_solves(library, "kunde")
    a = library.get_attempt(aid)
    assert a["submission_id"] == 2
    assert a["code"] is None
    assert a["lang"] == "python3"  # nothing new to say, so the old value stands


async def test_a_recall_is_not_a_sitting_to_fold_into(library, recents, details):
    library.add_attempt({"slug": "two-sum", "solved_at": int(time.time()) - 120,
                         "kind": "recall", "confidence": None})
    details[2] = {"code": "x", "lang": "python3"}
    recents.append(_ac(2, "two-sum", int(time.time()) - 60))
    ids = await poller.sweep_untracked_solves(library, "kunde")
    assert len(ids) == 1
    assert library.get_attempt(ids[0])["source"] == "detected"
