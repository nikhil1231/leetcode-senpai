"""End-to-end API wiring tests via FastAPI TestClient against the FakeStore.

No Firestore, no network, no LLM key — exercises the request/response plumbing
and the graceful-degradation paths.
"""
import copy
import datetime as dt
import json
import time
import asyncio

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from server import auth, main, poller
from tests.fake_store import FakeStore


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _practice_state_snapshot(store):
    return {
        "attempts": _canonical(store.attempts),
        "reviews": _canonical(store.reviews),
        "enrichments": _canonical(store.enrichments),
        "flags": _canonical(store.flags),
        "settings": _canonical(store.settings),
    }


@pytest.fixture
def client(monkeypatch):
    shared = FakeStore("test")
    # seed a small library
    for frontend_id, slug, title, diff, cat in [
        (1, "two-sum", "Two Sum", "Easy", "Arrays & Hashing"),
        (15, "3sum", "3Sum", "Medium", "Two Pointers"),
        (242, "valid-anagram", "Valid Anagram", "Easy", "Arrays & Hashing"),
    ]:
        shared.upsert_problem({"slug": slug, "title": title, "difficulty": diff,
                               "neetcode_category": cat, "in_library": True,
                               "frontend_id": frontend_id,
                               "packs": ["neetcode150"], "url": f"https://lc/{slug}",
                               "similar_slugs": []})
    monkeypatch.setattr(main, "get_store", lambda uid: shared)
    main.app.dependency_overrides[auth.require_user] = lambda: "test"
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: None
    c = TestClient(main.app)
    c.store = shared
    yield c
    main.app.dependency_overrides.clear()


def _enable_sprint_llm(monkeypatch, verdict="correct", note="ok"):
    async def fake_extract_or_error(task_name, payload, settings=None):
        return {"verdict": verdict, "note": note}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)


def test_overview(client):
    r = client.get("/api/overview")
    assert r.status_code == 200
    assert "solved" in r.json()
    assert r.json()["drills_today"] == 0
    assert r.json()["llm_enabled"] is False


def test_light_practice_is_separate_and_submission_is_idempotent(client):
    from server import practice
    before = _practice_state_snapshot(client.store)
    assert len(client.get("/api/practice").json()["exercises"]) == len(practice.catalog()["exercises"])
    q = client.get("/api/practice/question/break-search").json()
    assert "example" not in q
    # Invalid input must not create a result.
    bad = client.post("/api/practice/answer", json={"question_id": q["id"], "answer": "[2, 1]"})
    assert bad.status_code == 400
    assert client.store.light_practice == {}
    answer = str(practice.from_id(q["id"])["example"])
    payload = {"question_id": q["id"], "answer": answer}
    result = client.post("/api/practice/answer", json=payload)
    assert result.status_code == 200
    assert result.json()["correct"] is True
    assert client.post("/api/practice/answer", json=payload).json() == result.json()
    assert client.get("/api/practice").json()["status"] == {"break-search": "learned"}
    assert _practice_state_snapshot(client.store) == before
    assert not client.store.sessions


def test_light_practice_reveal_cannot_be_regraded_as_correct(client):
    q = client.get("/api/practice/question/fill-bfs").json()
    payload = {"question_id": q["id"], "reveal": True}
    revealed = client.post("/api/practice/answer", json=payload).json()
    assert revealed["revealed"] and not revealed["correct"]
    replay = client.post("/api/practice/answer", json={"question_id": q["id"], "answer": "0"}).json()
    assert replay == revealed
    assert client.get("/api/practice/question/missing").status_code == 404
    assert client.post("/api/practice/answer", json={"question_id": "bogus"}).status_code == 400


def test_light_practice_next_filters_and_brings_a_miss_back(client):
    q = client.get("/api/practice/next", params={"mode": "fill", "topic": "Tries"}).json()
    assert q["mode"] == "fill" and q["topic"] == "Tries" and "answer" not in q
    assert client.get("/api/practice/next", params={"mode": "fill", "topic": "Nope"}).status_code == 404
    # A revealed answer is a miss: once others have been served, it returns.
    client.post("/api/practice/answer", json={"question_id": q["id"], "reveal": True})
    assert client.get("/api/practice").json()["status"] == {q["template"]: "missed"}
    others = [e["id"] for e in client.get("/api/practice").json()["exercises"]
              if e["mode"] == "fill" and e["topic"] == "Tries" and e["id"] != q["template"]]
    again = client.get("/api/practice/next", params={"mode": "fill", "topic": "Tries",
                                                      "recent": ",".join([q["template"], *others])}).json()
    assert again["template"] == q["template"]


def test_me_includes_code_updated_at(client):
    body = client.get("/api/me").json()
    assert body["uid"] == "test"
    assert body["code_updated_at"]["iso"]
    assert isinstance(body["code_updated_at"]["epoch"], int)


def test_today_has_new_and_sections(client):
    r = client.get("/api/today")
    body = r.json()
    assert "new" in body and "reviews" in body and "drills" in body
    assert "expansion" in body and "goal" in body
    assert body["drills"] == []
    assert set(body["goal"]) == {"reviews_done", "reviews_goal", "new_done", "new_goal"}


def test_today_goal_excludes_drill_attempts(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "drill", "confidence": 3, "independence": "solo",
    })

    goal = client.get("/api/today").json()["goal"]

    assert goal["reviews_done"] == 0
    assert goal["new_done"] == 0
    assert set(goal) == {"reviews_done", "reviews_goal", "new_done", "new_goal"}


def test_today_drills_exclude_review_new_active_and_pending(client):
    for slug, title, diff, cat in [
        ("valid-parentheses", "Valid Parentheses", "Easy", "Stack"),
        ("binary-search", "Binary Search", "Easy", "Binary Search"),
        ("contains-duplicate", "Contains Duplicate", "Easy", "Arrays & Hashing"),
        ("best-time-to-buy-and-sell-stock",
         "Best Time to Buy and Sell Stock", "Easy", "Sliding Window"),
        ("product-of-array-except-self", "Product of Array Except Self", "Medium", "Arrays & Hashing"),
    ]:
        client.store.upsert_problem({
            "slug": slug, "title": title, "difficulty": diff,
            "neetcode_category": cat, "in_library": True,
            "packs": ["neetcode150"], "url": f"https://lc/{slug}",
            "similar_slugs": [],
        })
    client.store.upsert_review("valid-parentheses", {
        "slug": "valid-parentheses", "due_date": "2000-01-01",
        "interval_days": 5, "fail_count": 3, "leech": 1,
    })
    client.store.add_attempt({
        "slug": "contains-duplicate", "solved_at": 9999999999,
        "source": "auto", "kind": "adhoc", "confidence": None,
    })
    client.post("/api/session/start", json={
        "slug": "binary-search", "kind": "drill",
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999900,
        "source": "manual", "kind": "adhoc", "confidence": 1,
        "independence": "solution",
    })

    body = client.get("/api/today").json()
    blocked = {i["slug"] for i in body["reviews"] + body["new"]}
    blocked.update({"binary-search", "contains-duplicate"})
    assert {i["slug"] for i in body["drills"]}.isdisjoint(blocked)


def test_today_drills_can_use_local_signal_without_llm(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999900,
        "source": "manual", "kind": "adhoc", "confidence": 1,
        "independence": "solution",
    })

    body = client.get("/api/today").json()
    assert body["drills"]
    assert all(item["kind"] == "drill" for item in body["drills"])
    assert all(item["reason_codes"] for item in body["drills"])
    assert all("signals" in item for item in body["drills"])


def test_today_excludes_recently_drilled_problem(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    # a real-solve struggle makes Arrays & Hashing a drill target
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()),
        "source": "manual", "kind": "adhoc", "confidence": 1,
        "independence": "solution",
    })
    before = {d["slug"] for d in client.get("/api/today").json()["drills"]}
    assert "two-sum" in before

    # completing it through the drill flow (no annotation) should cool it down
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()),
        "source": "auto", "kind": "drill", "confidence": None, "independence": None,
    })
    after = {d["slug"] for d in client.get("/api/today").json()["drills"]}
    assert "two-sum" not in after


def test_today_reuses_fresh_pattern_sprint_cache(client):
    cached = {
        "slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
        "category": "Arrays & Hashing", "url": "https://lc/two-sum",
        "kind": "drill", "score": 9, "reason": "cached",
        "reason_codes": ["leech"], "signals": {"leech": True},
    }
    client.store.set_flag(main.DRILL_CACHE_FLAG, {
        "date": main._today_iso(),
        "refreshed_at": int(time.time()),
        "drills": [cached],
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999900,
        "source": "manual", "kind": "adhoc", "confidence": 1,
        "independence": "solution",
    })

    body = client.get("/api/today").json()

    assert body["drills"] == [cached]


def test_annotating_drill_swaps_completed_pattern_sprint_question(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    for slug, title, diff, cat in [
        ("valid-parentheses", "Valid Parentheses", "Easy", "Stack"),
        ("binary-search", "Binary Search", "Easy", "Binary Search"),
        ("contains-duplicate", "Contains Duplicate", "Easy", "Arrays & Hashing"),
    ]:
        client.store.upsert_problem({
            "slug": slug, "title": title, "difficulty": diff,
            "neetcode_category": cat, "in_library": True,
            "packs": ["neetcode150"], "url": f"https://lc/{slug}",
            "similar_slugs": [],
        })
    cached = [
        {
            "slug": "valid-anagram", "title": "Valid Anagram", "difficulty": "Easy",
            "category": "Arrays & Hashing", "url": "https://lc/valid-anagram",
            "kind": "drill", "score": 9, "reason": "cached",
            "reason_codes": ["recent_mistakes"], "signals": {"recent_struggles": 1},
        },
        {
            "slug": "binary-search", "title": "Binary Search", "difficulty": "Easy",
            "category": "Binary Search", "url": "https://lc/binary-search",
            "kind": "drill", "score": 8, "reason": "cached",
            "reason_codes": ["recent_mistakes"], "signals": {"recent_struggles": 1},
        },
    ]
    client.store.set_flag(main.DRILL_CACHE_FLAG, {
        "date": main._today_iso(),
        "refreshed_at": int(time.time()),
        "drills": cached,
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999900,
        "source": "manual", "kind": "adhoc", "confidence": 1,
        "independence": "solution",
    })
    attempt_id = client.store.add_attempt({
        "slug": "valid-anagram", "solved_at": int(time.time()),
        "source": "auto", "kind": "drill", "confidence": None,
        "independence": None,
    })

    r = client.post(f"/api/attempt/{attempt_id}/annotate", json={
        "confidence": 3, "independence": "solo",
    })

    assert r.status_code == 200
    drills = client.store.get_flags()[main.DRILL_CACHE_FLAG]["drills"]
    slugs = [d["slug"] for d in drills]
    assert "valid-anagram" not in slugs
    assert "binary-search" in slugs
    assert len(slugs) >= 2


def _add_problem(store, slug, title, difficulty, category, frontend_id=None):
    store.upsert_problem({
        "slug": slug, "title": title, "difficulty": difficulty,
        "neetcode_category": category, "in_library": True,
        "frontend_id": frontend_id,
        "packs": ["neetcode150"], "url": f"https://lc/{slug}",
        "similar_slugs": [],
    })


def _seed_problem_picker_state(store):
    _add_problem(store, "median-of-two-sorted-arrays",
                 "Median of Two Sorted Arrays", "Hard", "Binary Search", 4)
    _add_problem(store, "merge-intervals", "Merge Intervals", "Medium", "Intervals", 56)
    _add_problem(store, "word-search", "Word Search", "Medium", "Backtracking", 79)
    _add_problem(store, "reverse-linked-list", "Reverse Linked List", "Easy", "Linked List", 206)
    _add_problem(store, "outside-library", "Outside Library", "Easy", "Arrays & Hashing", 999)
    store.upsert_problem({"slug": "outside-library", "in_library": False})

    store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "leech": 0,
    })
    store.upsert_review("3sum", {
        "slug": "3sum", "due_date": "2999-01-01", "leech": 1,
    })
    store.upsert_review("merge-intervals", {
        "slug": "merge-intervals", "due_date": "2030-01-01", "leech": 0,
    })
    store.upsert_review("word-search", {
        "slug": "word-search", "due_date": "2000-02-01", "leech": 0,
    })

    store.add_attempt({"slug": "two-sum", "solved_at": 100, "kind": "adhoc", "source": "manual"})
    store.add_attempt({"slug": "two-sum", "solved_at": 999, "kind": "sprint", "source": "sprint"})
    store.add_attempt({"slug": "valid-anagram", "solved_at": 500, "kind": "sprint", "source": "sprint"})
    store.add_attempt({"slug": "3sum", "solved_at": 300, "kind": "adhoc", "source": "manual"})
    store.add_attempt({"slug": "3sum", "solved_at": 400, "kind": "review", "source": "auto"})
    store.add_attempt({"slug": "merge-intervals", "solved_at": 200, "kind": "adhoc", "source": "manual"})


def _problem_slugs(client, query=""):
    return [p["slug"] for p in client.get(f"/api/problems{query}").json()]


def test_problems_response_fields_support_start_button(client):
    _seed_problem_picker_state(client.store)

    row = next(p for p in client.get("/api/problems?search=two-sum").json()
               if p["slug"] == "two-sum")

    assert row["slug"] == "two-sum"
    assert row["title"] == "Two Sum"
    assert row["url"] == "https://lc/two-sum"
    assert row["neetcode_category"] == "Arrays & Hashing"
    assert row["attempt_count"] == 1
    assert row["last_attempt_at"] == 100
    assert row["due_date"] == "2000-01-01"
    assert row["leech"] == 0
    assert row["mastery_state"] == "review_due"


def test_problems_combines_filters_and_excludes_non_library(client):
    _seed_problem_picker_state(client.store)

    rows = client.get(
        "/api/problems?search=sum&category=Arrays%20%26%20Hashing"
        "&difficulty=Easy&due_status=due&leech=exclude&attempted=attempted"
    ).json()

    assert [p["slug"] for p in rows] == ["two-sum"]
    assert "outside-library" not in _problem_slugs(client)


def test_problem_facets_count_only_library_problems_in_stable_order(client):
    _seed_problem_picker_state(client.store)
    _add_problem(client.store, "custom-hard", "Custom Hard", "Hard", "Zeta Custom", 1001)
    _add_problem(client.store, "custom-weird", "Custom Weird", "Very Hard", "Alpha Custom", 1002)
    client.store.upsert_problem({
        "slug": "external-medium", "title": "External Medium",
        "difficulty": "Medium", "neetcode_category": "Arrays & Hashing",
        "in_library": False,
    })
    client.store.upsert_problem({
        "slug": "empty-facets", "title": "Empty Facets",
        "difficulty": "", "neetcode_category": "", "in_library": True,
    })

    body = client.get("/api/problems/facets").json()

    assert body["total"] == 10
    assert body["categories"] == [
        {"value": "Arrays & Hashing", "count": 2},
        {"value": "Two Pointers", "count": 1},
        {"value": "Binary Search", "count": 1},
        {"value": "Linked List", "count": 1},
        {"value": "Backtracking", "count": 1},
        {"value": "Intervals", "count": 1},
        {"value": "Alpha Custom", "count": 1},
        {"value": "Zeta Custom", "count": 1},
    ]
    assert body["difficulties"] == [
        {"value": "Easy", "count": 3},
        {"value": "Medium", "count": 3},
        {"value": "Hard", "count": 2},
        {"value": "Very Hard", "count": 1},
    ]


@pytest.mark.parametrize("query,expected", [
    ("?search=3su", ["3sum"]),
    ("?search=Valid", ["valid-anagram"]),
    ("?search=242", ["valid-anagram"]),
])
def test_problems_search_matches_slug_title_or_frontend_id(client, query, expected):
    _seed_problem_picker_state(client.store)

    assert _problem_slugs(client, query) == expected


def test_problems_attempted_filters_ignore_sprint_reps(client):
    _seed_problem_picker_state(client.store)

    attempted = set(_problem_slugs(client, "?attempted=attempted"))
    unattempted = set(_problem_slugs(client, "?attempted=unattempted"))

    assert {"two-sum", "3sum", "merge-intervals"} <= attempted
    assert "valid-anagram" not in attempted
    assert {"valid-anagram", "word-search", "reverse-linked-list",
            "median-of-two-sorted-arrays"} <= unattempted


@pytest.mark.parametrize("query,expected", [
    ("?due_status=due", ["two-sum", "word-search"]),
    ("?due_status=upcoming", ["3sum", "merge-intervals"]),
    ("?due_status=unscheduled", [
        "median-of-two-sorted-arrays", "reverse-linked-list", "valid-anagram",
    ]),
])
def test_problems_due_status_filters(client, query, expected):
    _seed_problem_picker_state(client.store)

    assert _problem_slugs(client, query) == expected


def test_problems_leech_filters_and_mastery_state(client):
    _seed_problem_picker_state(client.store)

    only = client.get("/api/problems?leech=only").json()
    excluded = _problem_slugs(client, "?leech=exclude")

    assert [p["slug"] for p in only] == ["3sum"]
    assert only[0]["mastery_state"] == "leech"
    assert "3sum" not in excluded


@pytest.mark.parametrize("sort,expected", [
    ("number", [
        "two-sum", "median-of-two-sorted-arrays", "3sum", "merge-intervals",
        "word-search", "reverse-linked-list", "valid-anagram",
    ]),
    ("title", [
        "3sum", "median-of-two-sorted-arrays", "merge-intervals",
        "reverse-linked-list", "two-sum", "valid-anagram", "word-search",
    ]),
    ("difficulty", [
        "two-sum", "reverse-linked-list", "valid-anagram", "3sum",
        "merge-intervals", "word-search", "median-of-two-sorted-arrays",
    ]),
    ("due_date", [
        "two-sum", "word-search", "merge-intervals", "3sum",
        "median-of-two-sorted-arrays", "reverse-linked-list", "valid-anagram",
    ]),
    ("last_attempt", [
        "3sum", "merge-intervals", "two-sum", "median-of-two-sorted-arrays",
        "word-search", "reverse-linked-list", "valid-anagram",
    ]),
    ("attempts", [
        "3sum", "two-sum", "merge-intervals", "median-of-two-sorted-arrays",
        "word-search", "reverse-linked-list", "valid-anagram",
    ]),
])
def test_problems_sort_modes(client, sort, expected):
    _seed_problem_picker_state(client.store)

    assert _problem_slugs(client, f"?sort={sort}") == expected


def test_today_drill_lifecycle_cross_flow(client, monkeypatch):
    for slug, title, diff, cat in [
        ("valid-parentheses", "Valid Parentheses", "Easy", "Stack"),
        ("binary-search", "Binary Search", "Easy", "Binary Search"),
        ("contains-duplicate", "Contains Duplicate", "Easy", "Arrays & Hashing"),
        ("best-time-to-buy-and-sell-stock",
         "Best Time to Buy and Sell Stock", "Easy", "Sliding Window"),
        ("invert-tree", "Invert Tree", "Easy", "Trees"),
    ]:
        _add_problem(client.store, slug, title, diff, cat)

    client.store.upsert_review("valid-parentheses", {
        "slug": "valid-parentheses", "due_date": "2000-01-01",
        "interval_days": 40, "fail_count": 4, "leech": 1,
    })
    for slug in ("binary-search", "contains-duplicate", "two-sum"):
        client.store.upsert_review(slug, {
            "slug": slug, "due_date": "2999-01-01",
            "interval_days": 10, "fail_count": 4, "leech": 1,
        })

    for slug in ("valid-parentheses", "binary-search", "contains-duplicate", "two-sum"):
        aid = client.store.add_attempt({
            "slug": slug, "solved_at": 1, "source": "auto", "kind": "adhoc",
            "confidence": 1, "independence": "solution",
        })
        if slug == "two-sum":
            client.store.upsert_enrichment(aid, {
                "slug": slug, "prediction_verdict": "wrong",
                "mistake_tags": ["pattern"],
            })

    client.post("/api/session/start", json={
        "slug": "binary-search", "kind": "drill",
    })
    pending_id = client.store.add_attempt({
        "slug": "contains-duplicate", "solved_at": int(time.time()),
        "source": "auto", "kind": "adhoc", "confidence": None,
        "independence": None,
    })

    initial = client.get("/api/today").json()
    assert initial["reviews"] and initial["new"] and initial["drills"]
    review_slugs = {i["slug"] for i in initial["reviews"]}
    new_slugs = {i["slug"] for i in initial["new"]}
    drill_slugs = {i["slug"] for i in initial["drills"]}
    assert drill_slugs.isdisjoint(review_slugs)
    assert drill_slugs.isdisjoint(new_slugs)
    assert "binary-search" not in drill_slugs
    assert "contains-duplicate" not in drill_slugs
    assert client.store.get_attempt(pending_id)["confidence"] is None

    drill = next(i for i in initial["drills"] if i["slug"] == "3sum")
    goal_before = initial["goal"]
    started = client.post("/api/session/start", json={
        "slug": drill["slug"], "kind": "drill",
        "predicted_category": drill["category"],
    }).json()
    assert started["slug"] == drill["slug"]

    active = client.get("/api/session/active").json()["active"]
    assert active["slug"] == drill["slug"]
    assert active["kind"] == "drill"
    assert active["title"] == "3Sum"
    assert active["url"] == "https://lc/3sum"
    assert active["hint_level"] == 0
    assert active["elapsed_sec"] >= 0

    async def fake_recent_ac(username, limit, auth=None):
        return [{
            "id": "drill-submission-1",
            "titleSlug": drill["slug"],
            "timestamp": active["started_at"] + 5,
        }]

    async def fake_submission_details(submission_id, auth=None):
        return {
            "runtime_percentile": 80.0, "memory_percentile": 70.0,
            "lang": "python3", "code": "class Solution: pass",
        }

    async def fake_wrong_attempts_between(slug, started_at, ended_at, auth=None):
        return 1

    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_submission_details)
    monkeypatch.setattr(
        main.poller.leetcode, "wrong_attempts_between", fake_wrong_attempts_between)

    polled = client.post("/api/poll").json()
    assert len(polled["new_attempts"]) == 1
    attempt_id = polled["new_attempts"][0]
    assert any(item["id"] == attempt_id and item["kind"] == "drill"
               for item in polled["pending"])

    annotated = client.post(f"/api/attempt/{attempt_id}/annotate", json={
        "confidence": 3, "independence": "solo",
        "complexity_time": "O(n)", "complexity_space": "O(1)",
    })
    assert annotated.status_code == 200

    refreshed = client.get("/api/today").json()
    assert drill["slug"] not in {i["slug"] for i in refreshed["drills"]}
    assert refreshed["goal"]["new_done"] == goal_before["new_done"]
    assert refreshed["goal"]["reviews_done"] == goal_before["reviews_done"]

    history_row = next(h for h in client.get("/api/history").json()
                       if h["id"] == attempt_id)
    assert history_row["kind"] == "drill"
    assert history_row["source"] == "auto"
    assert history_row["slug"] == drill["slug"]
    assert history_row["predicted_category"] == drill["category"]

    detail = client.get(f"/api/attempt/{attempt_id}").json()
    assert detail["kind"] == "drill"
    assert detail["title"] == "3Sum"
    assert detail["time_taken_sec"] == 5
    assert detail["lang"] == "python3"
    assert detail["code"] == "class Solution: pass"
    assert detail["complexity_time"] == "O(n)"
    assert detail["enrichment"] is None
    assert detail["plan_reconciliation"]["edge_case_status"] == "unknown"


def test_attempt_detail_includes_plan_reconciliation(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1234, "source": "auto", "kind": "adhoc",
        "complexity_target_time": "O(n)",
        "complexity_target_space": "O(1)",
        "planned_edge_cases": ["empty input"],
        "mistake_note": "missed edge case",
    })
    client.store.upsert_enrichment(aid, {
        "inferred_time": "O(n log n)",
        "inferred_space": "O(1)",
        "mistake_tags": ["edge_case"],
        "mistake_summary": "empty input failed",
    })

    body = client.get(f"/api/attempt/{aid}").json()

    assert body["plan_reconciliation"]["complexity_time_hit"] is False
    assert body["plan_reconciliation"]["complexity_space_hit"] is True
    assert body["plan_reconciliation"]["planned_edge_cases"] == ["empty input"]
    assert body["plan_reconciliation"]["edge_case_status"] == "missed"


def test_manual_attempt_creates_review_and_history(client):
    r = client.post("/api/attempt/manual", json={
        "slug": "two-sum", "confidence": 3, "independence": "solo",
        "complexity_time": "O(n)", "complexity_space": "O(n)"})
    assert r.status_code == 200
    aid = r.json()["attempt_id"]
    assert client.store.get_review("two-sum") is not None
    hist = client.get("/api/history").json()
    assert any(h["id"] == aid for h in hist)
    detail = client.get(f"/api/attempt/{aid}").json()
    assert detail["complexity_time"] == "O(n)"


def test_annotate_low_conf_returns_similar(client):
    client.store.upsert_problem({"slug": "two-sum", "similar_slugs": ["3sum-variant"]})
    aid = client.store.add_attempt({"slug": "two-sum", "solved_at": 1, "source": "auto",
                                    "kind": "adhoc", "confidence": None})
    r = client.post(f"/api/attempt/{aid}/annotate", json={
        "confidence": 1, "independence": "solution"})
    assert r.status_code == 200
    # 3sum-variant isn't in library -> suggested
    assert r.json()["similar"]["slug"] == "3sum-variant"


def test_recall_without_llm_uses_self_grade(client):
    client.post("/api/attempt/manual", json={
        "slug": "two-sum", "confidence": 3, "independence": "solo"})
    r = client.post("/api/review/recall", json={
        "slug": "two-sum", "recall_text": "hashmap of complements",
        "confidence": 3, "complexity_time": "O(n)"})
    assert r.status_code == 200
    body = r.json()
    assert body["graded"] is None  # LLM disabled
    assert body["review"]["slug"] == "two-sum"


def test_recall_context_returns_prompt_without_requiring_hydration(client):
    client.store.upsert_problem({
        "slug": "two-sum",
        "content_html": "<p>Given an array of integers...</p><pre>Example 1...</pre>",
    })
    r = client.get("/api/problem/two-sum/recall-context")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Two Sum"
    assert body["category"] == "Arrays & Hashing"
    assert "Example 1" in body["content_html"]


def test_sprint_start_returns_reps_and_stored_content(client, monkeypatch):
    _enable_sprint_llm(monkeypatch)
    client.store.upsert_problem({
        "slug": "two-sum",
        "content_html": "<p>Given integers...</p>",
    })

    r = client.post("/api/sprint/start", json={"limit": 2})

    assert r.status_code == 200
    body = r.json()
    assert body["round_id"]
    assert len(body["reps"]) == 2
    assert body["llm_enabled"] is True
    assert all(rep["kind"] == "sprint" for rep in body["reps"])
    two_sum = next(rep for rep in body["reps"] if rep["slug"] == "two-sum")
    assert two_sum["content_html"] == "<p>Given integers...</p>"


def test_sprint_start_accepts_empty_post_body(client, monkeypatch):
    _enable_sprint_llm(monkeypatch)
    r = client.post("/api/sprint/start")

    assert r.status_code == 200
    assert r.json()["round_id"]


def test_sprint_start_requires_responding_llm(client, monkeypatch):
    async def fake_extract_or_error(task_name, payload, settings=None):
        return None, "AuthError: invalid API key"

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)

    r = client.post("/api/sprint/start", json={"limit": 1})

    assert r.status_code == 503
    assert "LLM readiness check failed" in r.json()["detail"]


def test_sprint_round_can_be_fetched_and_abandoned(client, monkeypatch):
    _enable_sprint_llm(monkeypatch)
    started = client.post("/api/sprint/start", json={"limit": 2})
    assert started.status_code == 200
    round_id = started.json()["round_id"]

    active = client.get("/api/sprint/active").json()["active"]
    assert active["id"] == round_id
    assert active["status"] == "active"
    assert active["current_index"] == 0
    assert [i["slug"] for i in active["items"]] == [
        r["slug"] for r in started.json()["reps"]
    ]
    assert set(active["items"][0]) == {"slug", "title", "category", "difficulty", "url"}

    abandoned = client.post(f"/api/sprint/{round_id}/abandon")
    assert abandoned.status_code == 200
    assert abandoned.json()["round"]["status"] == "abandoned"
    assert client.get("/api/sprint/active").json()["active"] is None


def test_sprint_start_abandons_prior_round_without_touching_solve_session_or_reviews(client, monkeypatch):
    _enable_sprint_llm(monkeypatch)
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    before_review = client.store.get_review("two-sum")
    session = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc",
    }).json()

    first = client.post("/api/sprint/start", json={"limit": 1}).json()
    second = client.post("/api/sprint/start", json={"limit": 1}).json()

    old_round = client.store.get_sprint_round(first["round_id"])
    assert old_round["status"] == "abandoned"
    assert client.get("/api/sprint/active").json()["active"]["id"] == second["round_id"]
    assert client.get("/api/session/active").json()["active"]["session_id"] == session["session_id"]
    assert client.store.get_review("two-sum") == before_review
    assert len(client.store.list_active_sessions()) == 1


def test_sprint_submit_saves_answer_then_round_grade_enriches_attempt(client, monkeypatch):
    seen = {}

    async def fake_extract_or_error(task_name, payload, settings=None):
        seen["task_name"] = task_name
        seen["payload"] = payload
        return {"verdict": "correct", "note": "Matches hashmap pattern."}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)
    client.store.upsert_problem({
        "slug": "two-sum",
        "canonical_summary": {
            "key_ideas": ["Hash complements as you scan", "Return when target - n exists"],
        },
    })
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
        "fail_count": 2,
    })
    before_review = client.store.get_review("two-sum")

    r = client.post("/api/sprint/submit", json={
        "round_id": "round-1",
        "slug": "two-sum",
        "predicted_category": "Arrays & Hashing",
        "why": "Use a hashmap of complements.\nNo sorting needed.",
    })

    assert r.status_code == 200
    body = r.json()
    aid = body["attempt_id"]
    assert body["actual_category"] == "Arrays & Hashing"
    assert body["verdict"] is None
    assert body["note"] is None
    assert body["grading_status"] == "pending"
    assert client.store.get_review("two-sum") == before_review

    attempt = client.store.get_attempt(aid)
    assert attempt["kind"] == "sprint"
    assert attempt["source"] == "sprint"
    assert attempt["time_taken_sec"] is None
    assert attempt["code"] is None
    assert attempt["confidence"] is None
    assert attempt["independence"] is None
    assert attempt["predicted_category"] == "Arrays & Hashing"
    assert attempt["approach"] == "Use a hashmap of complements. No sorting needed."
    assert attempt["predicted_approach"] == attempt["approach"]

    enrichment = client.store.get_enrichment(aid)
    assert enrichment["status"] == "pending"

    graded = client.post("/api/sprint/grade", json={"round_id": "round-1"})
    assert graded.status_code == 200
    graded_body = graded.json()["results"][0]
    assert graded_body["attempt_id"] == aid
    assert graded_body["verdict"] == "correct"
    assert graded_body["note"] == "Matches hashmap pattern."
    assert seen["task_name"] == "grade_prediction"
    assert seen["payload"]["category"] == "Arrays & Hashing"
    assert seen["payload"]["canonical"] == (
        "Hash complements as you scan, Return when target - n exists"
    )
    assert seen["payload"]["predicted_approach"] == "Use a hashmap of complements. No sorting needed."

    enrichment = client.store.get_enrichment(aid)
    assert enrichment["prediction_verdict"] == "correct"
    assert enrichment["slug"] == "two-sum"
    assert enrichment["provider"]
    assert enrichment["model"]
    assert enrichment["prompt"] == main.SPRINT_GRADING_PROMPT
    assert enrichment["prompt_version"] == main.SPRINT_GRADING_PROMPT_VERSION

    history_row = next(h for h in client.get("/api/history").json() if h["id"] == aid)
    assert history_row["kind"] == "sprint"
    assert history_row["source"] == "sprint"
    assert history_row["round_id"] == "round-1"
    assert history_row["predicted_category"] == "Arrays & Hashing"
    assert history_row["approach"] == "Use a hashmap of complements. No sorting needed."
    assert history_row["prediction_verdict"] == "correct"
    assert history_row["prediction_note"] == "Matches hashmap pattern."
    assert history_row["actual_category"] == "Arrays & Hashing"
    for solve_only in (
        "time_taken_sec", "runtime_percentile", "lang", "confidence",
        "independence", "mistake_note", "has_code", "mistake_tags", "pattern_used",
    ):
        assert solve_only not in history_row

    accuracy = client.get("/api/insights").json()["prediction_accuracy"]
    assert accuracy["graded"] == 1
    assert accuracy["overall_correct_rate"] == 1.0
    assert accuracy["by_category"]["Arrays & Hashing"]["correct"] == 1
    assert accuracy["by_kind"]["sprint"]["correct"] == 1
    assert accuracy["sprint_graded"] == 1

    topics = client.get("/api/topics").json()
    arrays = next(t for t in topics if t["category"] == "Arrays & Hashing")
    assert arrays["sprint_reps"] == 1
    assert arrays["sprint_correct"] == 1
    assert arrays["sprint_accuracy"] == 1.0


def test_sprint_submit_grades_with_category_only_when_canonical_missing(client, monkeypatch):
    seen = {}

    async def fake_extract_or_error(task_name, payload, settings=None):
        seen["task_name"] = task_name
        seen["payload"] = payload
        return {"verdict": "partial", "note": "Right family, wrong detail."}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)

    submitted = client.post("/api/sprint/submit", json={
        "round_id": "round-category-only",
        "slug": "valid-anagram",
        "predicted_category": "Arrays & Hashing",
        "why": "Counts characters.",
    })

    assert submitted.status_code == 200
    r = client.post("/api/sprint/grade", json={"round_id": "round-category-only"})
    assert r.status_code == 200
    body = r.json()["results"][0]
    assert body["verdict"] == "partial"
    assert seen["task_name"] == "grade_prediction"
    assert seen["payload"]["category"] == "Arrays & Hashing"
    assert seen["payload"]["canonical"] is None


def test_sprint_round_grade_marks_failed_result_when_llm_grading_fails(client, monkeypatch):
    async def fake_extract_or_error(task_name, payload, settings=None):
        if payload.get("title") == "Sprint readiness check":
            return {"verdict": "correct", "note": "ready"}, None
        return None, "OpenAI 400: unsupported temperature"

    async def fake_ready(task_name, payload, settings=None):
        return {"verdict": "correct", "note": "ready"}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_ready)

    submitted = client.post("/api/sprint/submit", json={
        "round_id": "round-llm-error",
        "slug": "two-sum",
        "predicted_category": "Arrays & Hashing",
        "why": "Use complements in a hashmap.",
    })
    assert submitted.status_code == 200

    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)
    saved = client.post("/api/sprint/grade", json={"round_id": "round-llm-error"})

    assert saved.status_code == 200
    body = saved.json()["results"][0]
    assert body["verdict"] == "unknown"
    assert body["grading_status"] == "failed"
    assert body["grading_error"] == "OpenAI 400: unsupported temperature"


def test_sprint_submit_requires_no_llm_until_round_grade(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    client.store.upsert_problem({
        "slug": "3sum",
        "canonical_summary": {
            "key_ideas": ["Sort first", "Fix one value then scan with two pointers"],
        },
    })
    client.store.upsert_review("3sum", {
        "slug": "3sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    before_review = client.store.get_review("3sum")

    r = client.post("/api/sprint/submit", json={
        "round_id": "round-2",
        "slug": "3sum",
        "predicted_category": "Sliding Window",
        "why": "Try to maintain a shrinking window.",
        "self_verdict": "wrong",
    })

    assert r.status_code == 200
    body = r.json()
    assert body["actual_category"] == "Two Pointers"
    assert body["verdict"] is None
    assert body["grading_status"] == "pending"
    assert body["fallback"] is None
    assert client.store.get_review("3sum") == before_review
    enrichment = client.store.get_enrichment(body["attempt_id"])
    assert enrichment["prediction_verdict"] is None
    assert enrichment["status"] == "pending"
    assert enrichment["prompt"] == main.SPRINT_GRADING_PROMPT
    assert enrichment["prompt_version"] == main.SPRINT_GRADING_PROMPT_VERSION


def test_sprint_submit_updates_round_progress_without_active_solve_session(client, monkeypatch):
    _enable_sprint_llm(monkeypatch)
    started = client.post("/api/sprint/start", json={"limit": 1}).json()
    slug = started["reps"][0]["slug"]

    r = client.post("/api/sprint/submit", json={
        "round_id": started["round_id"],
        "slug": slug,
        "predicted_category": "Arrays & Hashing",
        "why": "Look for indexed membership.",
        "self_verdict": "correct",
    })

    assert r.status_code == 200
    round_doc = client.store.get_sprint_round(started["round_id"])
    assert round_doc["status"] == "finished"
    assert round_doc["current_index"] == 1
    assert round_doc["attempt_ids"] == [r.json()["attempt_id"]]
    assert client.get("/api/session/active").json()["active"] is None


def test_sprint_grade_requires_responding_llm(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    before = len(client.store.list_attempts())

    r = client.post("/api/sprint/submit", json={
        "round_id": "round-preview",
        "slug": "3sum",
        "predicted_category": "Sliding Window",
        "why": "Try to maintain a shrinking window.",
    })

    assert r.status_code == 200
    assert len(client.store.list_attempts()) == before + 1
    graded = client.post("/api/sprint/grade", json={"round_id": "round-preview"})
    assert graded.status_code == 503
    assert "LLM disabled" in graded.json()["detail"]


def test_today_includes_unviewed_recall_state(client):
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "source": "recall", "kind": "recall",
        "approach": "hashmap", "grading_status": "pending",
    })
    reviews = client.get("/api/today").json()["reviews"]
    item = next(r for r in reviews if r["slug"] == "two-sum")
    assert item["recall_attempt_id"] == aid
    assert item["grading_status"] == "pending"


def test_today_hides_completed_recall_from_current_sprint(client):
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "recall",
        "kind": "recall", "approach": "hashmap", "grading_status": "viewed",
        "recall_grade": {"grade": 3, "feedback": "solid"},
    })

    reviews = client.get("/api/today").json()["reviews"]

    assert "two-sum" not in {r["slug"] for r in reviews}


def test_recall_grading_waits_and_schedules(client, monkeypatch):
    async def fake_grade(store, slug, recall_text, recall_time=None, recall_space=None):
        return {"grade": 3, "feedback": "solid", "key_ideas_missed": []}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_recall", fake_grade)
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    r = client.post("/api/review/recall", json={
        "slug": "two-sum", "recall_text": "hashmap of complements",
        "complexity_time": "O(n)",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["grading_status"] == "viewed"
    assert body["review"]["slug"] == "two-sum"
    assert body["graded"]["grade"] == 3

    aid = body["attempt_id"]
    result = client.get(f"/api/review/recall/{aid}").json()
    assert result["grading_status"] == "viewed"
    assert result["recall_grade"]["grade"] == 3
    assert client.store.get_review("two-sum")["due_date"] != "2000-01-01"
    # Sync grading (issue #23) removed the separate ack step: no such route.
    # The StaticFiles mount fields unknown POST paths as 405, plain-missing as 404.
    assert client.post(f"/api/review/recall/{aid}/ack").status_code in (404, 405)


def test_recall_clarification_requires_llm(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "source": "recall", "kind": "recall",
        "approach": "hashmap", "grading_status": "ready",
        "recall_grade": {"grade": 2, "feedback": "mostly there"},
    })

    r = client.post(f"/api/review/recall/{aid}/clarify", json={"question": "What was missing?"})

    assert r.status_code == 400
    assert r.json()["detail"] == "Recall clarification is unavailable without Gemini."


def test_recall_clarification_does_not_update_attempt_or_review(client, monkeypatch):
    async def fake_clarify(store, attempt, question):
        return {"reply": "Mention the complement lookup invariant."}

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "clarify_recall", fake_clarify)
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "source": "recall", "kind": "recall",
        "approach": "hashmap", "complexity_time": "O(n)", "grading_status": "ready",
        "recall_grade": {"grade": 2, "feedback": "mostly there"},
    })
    before_attempt = client.store.get_attempt(aid)
    before_review = client.store.get_review("two-sum")

    r = client.post(f"/api/review/recall/{aid}/clarify", json={"question": "What was missing?"})

    assert r.status_code == 200
    assert r.json()["reply"] == "Mention the complement lookup invariant."
    assert client.store.get_attempt(aid) == before_attempt
    assert client.store.get_review("two-sum") == before_review


def test_recall_grading_failure_surfaces_error(client, monkeypatch):
    async def fake_grade(store, slug, recall_text, recall_time=None, recall_space=None):
        return None, "AuthError: invalid API key"

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_recall", fake_grade)
    r = client.post("/api/review/recall", json={
        "slug": "two-sum", "recall_text": "hashmap of complements",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["grading_status"] == "failed"
    assert body["grading_error"] == "AuthError: invalid API key"
    aid = body["attempt_id"]

    result = client.get(f"/api/review/recall/{aid}").json()
    assert result["grading_status"] == "failed"
    assert result["grading_error"] == "AuthError: invalid API key"
    assert result["recall_grade"] is None


def test_latest_viewed_recall_hides_older_failed_attempt(client):
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2000-01-01", "interval_days": 5,
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "source": "recall", "kind": "recall",
        "approach": "old failed", "grading_status": "failed",
        "grading_error": "old error",
    })
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 2, "source": "recall", "kind": "recall",
        "approach": "new viewed", "grading_status": "viewed",
        "recall_grade": {"grade": 3, "feedback": "solid"},
    })

    reviews = client.get("/api/today").json()["reviews"]
    item = next(r for r in reviews if r["slug"] == "two-sum")

    assert "recall_attempt_id" not in item
    assert "grading_status" not in item


def test_pending_solved_modal_excludes_recalls(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999999, "source": "recall",
        "kind": "recall", "confidence": None, "approach": "hashmap",
        "grading_status": "pending",
    })
    assert client.get("/api/pending").json()["pending"] == []


def test_pending_solved_modal_excludes_sprints(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999999, "source": "sprint",
        "kind": "sprint", "confidence": None, "approach": "hashmap",
        "round_id": "round-1", "predicted_category": "Arrays & Hashing",
    })
    assert client.get("/api/pending").json()["pending"] == []


def test_dismissed_solved_modal_stops_reprompting(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999999, "source": "auto",
        "kind": "adhoc", "confidence": None,
    })
    assert client.get("/api/pending").json()["pending"][0]["id"] == aid

    r = client.post(f"/api/attempt/{aid}/dismiss-annotation")
    assert r.status_code == 200
    assert client.store.get_attempt(aid)["annotation_dismissed_at"]
    assert client.get("/api/pending").json()["pending"] == []


def test_dismiss_annotation_rejects_recalls(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 9999999999, "source": "recall",
        "kind": "recall", "confidence": None,
    })
    r = client.post(f"/api/attempt/{aid}/dismiss-annotation")
    assert r.status_code == 400


def test_packs_progress(client):
    r = client.get("/api/packs")
    packs = {p["name"]: p for p in r.json()}
    assert packs["neetcode150"]["imported"] >= 3


def test_hint_without_active_session_400(client):
    r = client.post("/api/session/hint")
    assert r.status_code == 400


def test_session_start_and_hint_degrades(client):
    client.post("/api/session/start", json={"slug": "two-sum",
                                             "predicted_category": "Arrays & Hashing"})
    active = client.get("/api/session/active").json()["active"]
    assert active["slug"] == "two-sum"
    r = client.post("/api/session/hint")  # no LLM, no cached ladder
    assert r.status_code == 200
    assert r.json()["hint"] is None


def test_session_start_answers_with_the_live_run_view(client):
    """The client must not need a second round-trip to learn what it started.

    /session/active straight after /session/start is not just an extra request,
    it is a guaranteed-cold one: the write invalidated the sessions cache. So
    start answers with the same payload, and the two must not drift apart.
    """
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "review"}).json()
    active = client.get("/api/session/active").json()["active"]

    assert started["active"]["session_id"] == started["session_id"]
    assert started["active"]["slug"] == "two-sum"
    assert started["active"]["kind"] == "review"
    assert started["active"]["is_paused"] is False
    assert started["active"]["hint_level"] == 0
    # Same shape, same values — elapsed_sec is the only wall-clock-dependent one.
    assert started["active"].keys() == active.keys()
    assert {k: v for k, v in started["active"].items() if k != "elapsed_sec"} \
        == {k: v for k, v in active.items() if k != "elapsed_sec"}


def test_session_start_accepts_and_stores_pre_solve_plan(client):
    r = client.post("/api/session/start", json={
        "slug": "two-sum",
        "kind": "adhoc",
        "predicted_category": "Arrays & Hashing",
        "predicted_approach": "Scan once with complements.",
        "complexity_target_time": "O(n)",
        "complexity_target_space": "O(n)",
        "planned_edge_cases": ["duplicate values", "negative target"],
    })

    assert r.status_code == 200
    session = client.store.get_session(r.json()["session_id"])
    assert session["predicted_category"] == "Arrays & Hashing"
    assert session["predicted_approach"] == "Scan once with complements."
    assert session["complexity_target_time"] == "O(n)"
    assert session["complexity_target_space"] == "O(n)"
    assert session["planned_edge_cases"] == ["duplicate values", "negative target"]


def test_session_start_without_pre_solve_plan_uses_empty_defaults(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "kind": "adhoc"})

    assert r.status_code == 200
    session = client.store.get_session(r.json()["session_id"])
    assert session["predicted_category"] is None
    assert session["predicted_approach"] is None
    assert session["complexity_target_time"] is None
    assert session["complexity_target_space"] is None
    assert session["planned_edge_cases"] == []


_PLAN = {
    "predicted_category": "Arrays & Hashing",
    "predicted_approach": "Scan once and store complements.",
    "complexity_target_time": "O(n)",
    "complexity_target_space": "O(n)",
    "planned_edge_cases": ["duplicates", "negative target", "same index"],
}


def _fake_solve(client, monkeypatch, submission_id="plan-smoke-submission", after=37,
                wrong=0, failed=None):
    client.store.update_settings({"username": "senpai"})

    async def fake_recent_ac(username, limit, auth=None):
        active = client.store.latest_active_session()
        return [{"id": submission_id, "titleSlug": active["slug"],
                 "timestamp": active["started_at"] + after}]

    async def fake_submission_details(submission_id, auth=None):
        return {"runtime_percentile": 92.0, "memory_percentile": 81.0,
                "lang": "python3", "code": "class Solution: pass"}

    async def fake_wrong_attempts_between(slug, started_at, ended_at, auth=None):
        return wrong

    async def fake_failed_tests_between(slug, started_at, ended_at, auth=None):
        return failed or []

    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_submission_details)
    monkeypatch.setattr(
        main.poller.leetcode, "wrong_attempts_between", fake_wrong_attempts_between)
    monkeypatch.setattr(
        main.poller.leetcode, "failed_tests_between", fake_failed_tests_between)


def test_plan_check_needs_an_active_planned_run(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    assert client.post("/api/session/plan-check").status_code == 400
    client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc", "plan_status": "skipped"})
    assert client.post("/api/session/plan-check").status_code == 400


def test_plan_check_without_llm_changes_nothing(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc", "plan_status": "planned", **_PLAN}).json()
    assert started["active"]["plan_check_available"] is False

    r = client.post("/api/session/plan-check")

    assert r.status_code == 200
    assert r.json() == {"ok": True, "llm": False, "critique": None}
    assert "plan_check_revealed" not in client.store.get_session(started["session_id"])


def test_plan_check_is_asked_for_cached_and_carried_to_the_solve(client, monkeypatch):
    calls = []

    async def fake_extract_or_error(task_name, payload, settings=None):
        calls.append((task_name, payload))
        return {"pattern_verdict": "plausible", "complexity_verdict": "realistic",
                "missing_edge_cases": ["empty input"],
                "nudges": ["How do you avoid reusing an element?"],
                "overall_verdict": "revise"}, None

    async def fake_prep_problem_bg(uid, slug):
        return None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)
    monkeypatch.setattr(main, "_prep_problem_bg", fake_prep_problem_bg)
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "review", "plan_status": "planned", **_PLAN}).json()
    # Offered, never shown unasked — and starting never waited on it.
    assert calls == []
    assert started["active"]["plan_check_available"] is True
    assert started["active"]["plan_check"] is None

    first = client.post("/api/session/plan-check").json()
    second = client.post("/api/session/plan-check").json()

    assert first["critique"]["overall_verdict"] == "revise"
    assert second["critique"] == first["critique"]
    assert [c[0] for c in calls] == ["critique_plan"]
    assert calls[0][1]["title"] == "Two Sum"
    assert calls[0][1]["planned_edge_cases"] == _PLAN["planned_edge_cases"]
    active = client.get("/api/session/active").json()["active"]
    assert active["plan_check"]["nudges"] == ["How do you avoid reusing an element?"]

    _fake_solve(client, monkeypatch)
    attempt_id = client.post("/api/poll").json()["new_attempts"][0]
    assert client.store.get_attempt(attempt_id)["plan_check_revealed"] is True


def test_planned_run_carries_its_plan_to_the_solve_and_the_rating(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    _fake_solve(client, monkeypatch, wrong=2, failed=[
        {"status": "Wrong Answer", "input": "[]", "expected": "[]", "output": "null"}])
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc", "plan_status": "planned",
        "plan_time_sec": 95, **_PLAN})
    assert started.status_code == 200
    session = client.store.get_session(started.json()["session_id"])
    assert session["plan_status"] == "planned"
    assert session["plan_time_sec"] == 95

    polled = client.post("/api/poll").json()
    attempt_id = polled["new_attempts"][0]
    pending = polled["pending"][0]
    assert pending["id"] == attempt_id
    assert pending["plan"]["status"] == "planned"
    assert pending["plan"]["approach"] == _PLAN["predicted_approach"]
    assert pending["plan"]["plan_time_sec"] == 95
    assert pending["previous_plan"] is None

    attempt = client.store.get_attempt(attempt_id)
    assert attempt["time_taken_sec"] == 37
    assert attempt["failed_tests"][0]["input"] == "[]"
    for key, value in _PLAN.items():
        assert attempt[key] == value

    # "Solved solo, high confidence" — but the plan had to be thrown away.
    r = client.post(f"/api/attempt/{attempt_id}/annotate", json={
        "confidence": 3, "independence": "solo", "plan_held": "pivoted"})
    assert r.status_code == 200
    assert r.json()["review"]["quality"] == 3
    assert r.json()["plan"]["held"] == "pivoted"
    assert r.json()["plan"]["score"] == 0
    assert client.store.get_attempt(attempt_id)["plan_held"] == "pivoted"

    detail = client.get(f"/api/attempt/{attempt_id}").json()
    assert detail["plan"]["status"] == "planned"
    assert detail["plan_reconciliation"]["planned_edge_cases"] == _PLAN["planned_edge_cases"]


def test_no_idea_start_rates_hard_at_best_and_skip_changes_nothing(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    _fake_solve(client, monkeypatch, submission_id="blank-one")
    client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc", "plan_status": "blank", "plan_time_sec": 240})
    blank_id = client.post("/api/poll").json()["new_attempts"][0]
    blank = client.store.get_attempt(blank_id)
    assert blank["plan_status"] == "blank"
    assert blank["predicted_approach"] is None
    r = client.post(f"/api/attempt/{blank_id}/annotate", json={
        "confidence": 3, "independence": "solo", "plan_held": "held"})
    assert r.json()["review"]["quality"] == 3
    # A blank start has no plan to have held.
    assert "plan_held" not in client.store.get_attempt(blank_id)

    _fake_solve(client, monkeypatch, submission_id="skip-one")
    client.post("/api/session/start", json={
        "slug": "3sum", "kind": "adhoc", "plan_status": "skipped"})
    skip_id = client.post("/api/poll").json()["new_attempts"][0]
    assert client.store.get_attempt(skip_id)["plan_status"] == "skipped"
    r = client.post(f"/api/attempt/{skip_id}/annotate", json={
        "confidence": 3, "independence": "solo"})
    assert r.json()["review"]["quality"] == 5


def test_start_without_plan_fields_still_works_for_older_clients(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "kind": "adhoc"})
    session = client.store.get_session(r.json()["session_id"])
    assert session["plan_status"] is None
    assert r.json()["active"]["plan_check_available"] is False


def test_grade_plan_stores_a_normalized_grade_and_the_pattern_verdict(client, monkeypatch):
    seen = {}

    async def fake_extract_or_error(task_name, payload, settings=None):
        seen[task_name] = payload
        if task_name == "grade_plan":
            return {"pattern_verdict": "correct", "approach_verdict": "viable",
                    "optimal_time": "O(n)", "optimal_space": "O(n)",
                    "solution_time": "O(n)", "solution_space": "O(n)",
                    "edge_cases_covered": ["duplicates", "Duplicates"],
                    "edge_cases_missed": ["no valid pair", "duplicates"],
                    "failure_case": "empty input", "note": "Right idea."}, None
        return None, "unexpected"

    async def fake_extract(task_name, payload, settings=None):
        return {"key_ideas": ["complements"], "time": "O(n)", "space": "O(n)"}

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", fake_extract_or_error)
    monkeypatch.setattr(main.llm, "extract", fake_extract)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 100, "kind": "adhoc", "code": "x",
        "plan_status": "planned", "plan_held": "held", **_PLAN,
        "failed_tests": [{"status": "Wrong Answer", "input": "[]"}],
    })
    client.store.upsert_enrichment(aid, {"slug": "two-sum", "prompt_version": 1,
                                         "mistake_tags": ["edge_case"], "user_overrides": {}})

    r = client.post(f"/api/attempt/{aid}/grade-plan")

    assert r.status_code == 200
    plan = r.json()["plan"]
    assert plan["graded"] is True
    assert plan["approach_verdict"] == "viable"
    assert plan["time_vs_optimal"] is True
    assert plan["edge_checks"] == [{"case": "duplicates", "covered": True},
                                   {"case": "no valid pair", "covered": False}]
    assert plan["failure_case"] == "empty input"
    assert plan["score"] == 5  # (2 + 1 + 1 + .5 + 1) / 6
    assert seen["grade_plan"]["failed_tests"][0]["input"] == "[]"
    assert seen["grade_plan"]["plan_held"] == "held"
    enrichment = client.store.get_enrichment(aid)
    assert enrichment["mistake_tags"] == ["edge_case"]  # merged, not replaced
    assert enrichment["prediction_verdict"] == "correct"
    assert enrichment["plan_prompt_version"] == main.enrich.PLAN_PROMPT_VERSION


def test_grade_plan_failure_is_stamped_not_retried_by_the_sweep(client, monkeypatch):
    async def failing(task_name, payload, settings=None):
        return None, "OpenAI 500"

    async def fake_extract(task_name, payload, settings=None):
        return None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract_or_error", failing)
    monkeypatch.setattr(main.llm, "extract", fake_extract)
    aid = client.store.add_attempt({"slug": "two-sum", "solved_at": 100, "confidence": 2,
                                    "independence": "solo", **_PLAN})
    assert main.enrich.needs_plan_grade(client.store) == [aid]

    r = client.post(f"/api/attempt/{aid}/grade-plan").json()

    assert r["error"] == "OpenAI 500"
    assert r["plan"]["grading_error"] == "OpenAI 500"
    assert main.enrich.needs_plan_grade(client.store) == []


def test_grade_plan_rejects_a_solve_with_no_plan(client):
    aid = client.store.add_attempt({"slug": "two-sum", "solved_at": 100})
    assert client.post(f"/api/attempt/{aid}/grade-plan").status_code == 400


def test_a_second_poll_hands_its_plan_to_the_already_logged_solve(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: False)
    _fake_solve(client, monkeypatch, submission_id="dup-sub")
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc", "plan_status": "planned", **_PLAN}).json()
    aid = client.store.add_attempt({"slug": "two-sum", "submission_id": "dup-sub",
                                    "solved_at": 1, "source": "detected"})

    asyncio.run(poller._record_solve(
        client.store, client.store.get_session(started["session_id"]),
        {"id": "dup-sub", "timestamp": 1}, None))

    attempt = client.store.get_attempt(aid)
    assert attempt["plan_status"] == "planned"
    assert attempt["predicted_approach"] == _PLAN["predicted_approach"]


def test_insights_reports_planning(client):
    client.store.add_attempt({"slug": "two-sum", "solved_at": 100, "plan_status": "blank"})
    planning = client.get("/api/insights").json()["planning"]
    assert planning["overall"]["blanks"] == 1
    assert planning["soft_limit_sec"] == 300


def test_session_pause_resume_adjusts_elapsed(client, monkeypatch):
    clock = {"now": 1000}
    monkeypatch.setattr(main.time, "time", lambda: clock["now"])

    client.post("/api/session/start", json={"slug": "two-sum"})
    clock["now"] = 1060
    active = client.get("/api/session/active").json()["active"]
    assert active["elapsed_sec"] == 60
    assert active["is_paused"] is False

    r = client.post("/api/session/pause", json={"paused": True})
    assert r.status_code == 200
    clock["now"] = 1120
    active = client.get("/api/session/active").json()["active"]
    assert active["elapsed_sec"] == 60
    assert active["is_paused"] is True

    r = client.post("/api/session/pause", json={"paused": False})
    assert r.status_code == 200
    clock["now"] = 1150
    active = client.get("/api/session/active").json()["active"]
    assert active["elapsed_sec"] == 90
    assert active["is_paused"] is False


def test_poller_records_solve_time_excluding_pause(client, monkeypatch):
    async def no_details(*args, **kwargs):
        raise RuntimeError("skip")

    monkeypatch.setattr(poller.leetcode, "submission_details", no_details)
    monkeypatch.setattr(poller.leetcode, "wrong_attempts_between", no_details)
    sid = client.store.add_session({
        "slug": "two-sum", "started_at": 1000, "status": "active",
        "paused_at": None, "paused_sec": 120, "kind": "adhoc",
    })
    session = client.store.get_session(sid)
    match = {"id": "sub1", "titleSlug": "two-sum", "timestamp": 1400}

    aid = asyncio.run(poller._record_solve(client.store, session, match, None))

    assert client.store.get_attempt(aid)["time_taken_sec"] == 280
    assert client.store.get_session(sid)["status"] == "completed"


def test_poller_carries_pre_solve_plan_to_attempt(client, monkeypatch):
    async def no_details(*args, **kwargs):
        raise RuntimeError("skip")

    monkeypatch.setattr(poller.leetcode, "submission_details", no_details)
    monkeypatch.setattr(poller.leetcode, "wrong_attempts_between", no_details)
    sid = client.store.add_session({
        "slug": "two-sum", "started_at": 1000, "status": "active",
        "paused_at": None, "paused_sec": 0, "kind": "adhoc",
        "predicted_category": "Arrays & Hashing",
        "predicted_approach": "Hash complements.",
        "complexity_target_time": "O(n)",
        "complexity_target_space": "O(n)",
        "planned_edge_cases": ["same number twice", "empty result"],
    })
    session = client.store.get_session(sid)
    match = {"id": "sub-plan", "titleSlug": "two-sum", "timestamp": 1010}

    aid = asyncio.run(poller._record_solve(client.store, session, match, None))

    attempt = client.store.get_attempt(aid)
    assert attempt["predicted_category"] == "Arrays & Hashing"
    assert attempt["predicted_approach"] == "Hash complements."
    assert attempt["complexity_target_time"] == "O(n)"
    assert attempt["complexity_target_space"] == "O(n)"
    assert attempt["planned_edge_cases"] == ["same number twice", "empty result"]


def test_insights_shape(client):
    manual = client.post("/api/attempt/manual", json={
        "slug": "two-sum", "confidence": 3, "independence": "solo",
        "time_taken_sec": 600})
    aid = manual.json()["attempt_id"]
    client.store.update_attempt(aid, {
        "complexity_target_time": "O(n)",
        "complexity_target_space": "O(1)",
        "planned_edge_cases": ["duplicates"],
    })
    client.store.upsert_enrichment(aid, {
        "prediction_verdict": "correct",
        "inferred_time": "O(n)",
        "inferred_space": "O(1)",
    })
    body = client.get("/api/insights").json()
    for k in ["forecast", "mastery_radar", "time_trend", "pace",
              "failure_modes", "prediction_accuracy", "confidence_calibration",
              "mock_trend"]:
        assert k in body
    accuracy = body["prediction_accuracy"]
    for k in ["by_category", "overall_correct_rate", "graded", "by_kind",
              "sprint_graded", "plan_quality"]:
        assert k in accuracy
    assert accuracy["plan_quality"]["complexity"]["hits"] == 2
    assert accuracy["plan_quality"]["edge_cases"]["caught"] == 1


def test_failure_mode_endpoint_returns_filtered_joined_attempts_newest_first(client):
    old_id = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 2000, "source": "manual",
        "kind": "adhoc", "time_taken_sec": 600, "confidence": 2,
        "independence": "hints", "mistake_note": "loop ended one step early",
    })
    new_id = client.store.add_attempt({
        "slug": "3sum", "solved_at": 3000, "source": "auto",
        "kind": "review", "time_taken_sec": 900, "confidence": 1,
        "independence": "solution", "mistake_note": "missed duplicate skip",
    })
    replaced_id = client.store.add_attempt({
        "slug": "valid-anagram", "solved_at": 4000, "source": "manual",
        "kind": "adhoc", "mistake_note": "model tag replaced",
    })
    client.store.upsert_problem({
        "slug": "outside-library", "title": "Outside Library", "difficulty": "Easy",
        "neetcode_category": "Stack", "in_library": False, "url": "https://lc/outside-library",
    })
    client.store.upsert_problem({
        "slug": "missing-library-flag", "title": "Missing Library Flag", "difficulty": "Easy",
        "neetcode_category": "Graphs", "url": "https://lc/missing-library-flag",
    })
    non_library_id = client.store.add_attempt({
        "slug": "outside-library", "solved_at": 5000, "source": "manual", "kind": "adhoc",
        "mistake_note": "not imported",
    })
    missing_flag_id = client.store.add_attempt({
        "slug": "missing-library-flag", "solved_at": 6000, "source": "manual", "kind": "adhoc",
        "mistake_note": "not explicitly imported",
    })
    for aid in (old_id, new_id, non_library_id, missing_flag_id):
        client.store.upsert_enrichment(aid, {
            "mistake_tags": ["off_by_one"],
            "pattern_used": "hashmap",
        })
    client.store.upsert_enrichment(replaced_id, {
        "mistake_tags": ["off_by_one"],
        "user_overrides": {"tags": ["edge_case"]},
        "pattern_used": "hashmap",
    })

    r = client.get("/api/failure-mode/off_by_one")

    assert r.status_code == 200
    assert r.json() == {
        "tag": "off_by_one",
        "attempts": [
            {
                "id": new_id,
                "slug": "3sum",
                "solved_at": 3000,
                "kind": "review",
                "source": "auto",
                "time_taken_sec": 900,
                "confidence": 1,
                "independence": "solution",
                "mistake_note": "missed duplicate skip",
                "mistake_tags": ["off_by_one"],
                "title": "3Sum",
                "difficulty": "Medium",
                "category": "Two Pointers",
                "url": "https://lc/3sum",
            },
            {
                "id": old_id,
                "slug": "two-sum",
                "solved_at": 2000,
                "kind": "adhoc",
                "source": "manual",
                "time_taken_sec": 600,
                "confidence": 2,
                "independence": "hints",
                "mistake_note": "loop ended one step early",
                "mistake_tags": ["off_by_one"],
                "title": "Two Sum",
                "difficulty": "Easy",
                "category": "Arrays & Hashing",
                "url": "https://lc/two-sum",
            },
        ],
    }
    assert client.get("/api/failure-mode/edge_case").json()["attempts"][0]["id"] == replaced_id


def test_failure_mode_endpoint_unknown_or_empty_tag_returns_empty_attempts(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 2000, "source": "manual",
        "kind": "adhoc", "mistake_note": "loop ended one step early",
    })
    client.store.upsert_enrichment(aid, {"mistake_tags": ["off_by_one"]})

    for tag in ("unknown", "edge_case"):
        r = client.get(f"/api/failure-mode/{tag}")
        assert r.status_code == 200
        assert r.json() == {"tag": tag, "attempts": []}


def test_insights_confidence_calibration_sparse_state(client):
    for slug in ("two-sum", "3sum"):
        client.store.add_attempt({
            "slug": slug, "solved_at": 1000, "source": "manual", "kind": "adhoc",
            "confidence": 3, "independence": "solo",
        })

    body = client.get("/api/insights").json()

    for k in ["forecast", "mastery_radar", "time_trend", "pace",
              "failure_modes", "prediction_accuracy", "confidence_calibration",
              "mock_trend"]:
        assert k in body
    calibration = body["confidence_calibration"]
    assert calibration == {
        "status": "not_enough_data",
        "graded_attempts": 0,
        "min_graded_attempts": 3,
        "most_overrated_topic": None,
        "categories": [],
    }


def test_insights_confidence_calibration_populated_contract(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1000, "source": "manual",
        "kind": "adhoc", "confidence": 3, "independence": "solo",
        "solution_grade": {"score": 0, "feedback": "missed edge cases"},
    })
    client.store.add_attempt({
        "slug": "valid-anagram", "solved_at": 2000, "source": "manual",
        "kind": "adhoc", "confidence": 3, "independence": "solo",
        "solution_grade": {"score": 1, "feedback": "partial"},
        "recall_grade": {"grade": 3, "feedback": "remembered approach"},
    })
    client.store.add_attempt({
        "slug": "3sum", "solved_at": 3000, "source": "recall",
        "kind": "recall", "confidence": 2, "independence": "hints",
        "recall_grade": {"grade": 3, "feedback": "complete"},
    })

    calibration = client.get("/api/insights").json()["confidence_calibration"]

    assert calibration["status"] == "ok"
    assert calibration["graded_attempts"] == 3
    assert calibration["min_graded_attempts"] == 3
    assert calibration["most_overrated_topic"] == {
        "category": "Arrays & Hashing",
        "self_quality": 5.0,
        "objective_quality": 2.25,
        "gap": 2.75,
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
    assert calibration["categories"] == [
        {
            "category": "Arrays & Hashing",
            "self_quality": 5.0,
            "objective_quality": 2.25,
            "gap": 2.75,
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
        },
        {
            "category": "Two Pointers",
            "self_quality": 3.0,
            "objective_quality": 5.0,
            "gap": -2.0,
            "graded_attempts": 1,
            "review_failures": 0,
            "leech_count": 0,
            "overconfident": False,
        },
    ]


def test_api_insights_confidence_calibration_is_read_only(client, monkeypatch):
    def unexpected_call(*args, **kwargs):
        raise AssertionError("insights must not invoke coach/LLM/scheduler advancement")

    monkeypatch.setattr(main.llm, "enabled", unexpected_call)
    monkeypatch.setattr(main.llm, "extract_or_error", unexpected_call)
    monkeypatch.setattr(main.coach, "grade_solution", unexpected_call)
    monkeypatch.setattr(main.coach, "grade_recall", unexpected_call)
    monkeypatch.setattr(main.coach, "ensure_hint_ladder", unexpected_call)
    monkeypatch.setattr(main.coach, "ensure_canonical", unexpected_call)
    monkeypatch.setattr(main.scheduler, "advance_review", unexpected_call)
    monkeypatch.setattr(main.scheduler, "seed_review", unexpected_call)

    aid1 = client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1000, "source": "manual",
        "kind": "adhoc", "confidence": 3, "independence": "solo",
        "solution_grade": {"score": 0, "feedback": "missed edge cases"},
        "code": "class Solution: pass",
    })
    aid2 = client.store.add_attempt({
        "slug": "valid-anagram", "solved_at": 2000, "source": "manual",
        "kind": "adhoc", "confidence": 3, "independence": "solo",
        "solution_grade": {"score": 1},
        "recall_grade": {"grade": 0},
    })
    client.store.add_attempt({
        "slug": "3sum", "solved_at": 3000, "source": "recall",
        "kind": "recall", "confidence": 2, "independence": "hints",
        "recall_grade": {"grade": 3},
    })
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": "2026-01-01", "reps": 4,
        "ease": 2.1, "interval_days": 8, "last_reviewed": "2025-12-24",
        "fail_count": 2, "leech": 0,
    })
    client.store.upsert_review("valid-anagram", {
        "slug": "valid-anagram", "due_date": "2026-01-02", "reps": 1,
        "ease": 2.5, "interval_days": 3, "last_reviewed": "2025-12-30",
        "fail_count": 1, "leech": 1,
    })
    client.store.upsert_enrichment(aid1, {
        "slug": "two-sum", "prediction_verdict": "wrong",
        "mistake_tags": ["edge_case"], "provider": "cached",
    })
    client.store.upsert_enrichment(aid2, {
        "slug": "valid-anagram", "prediction_verdict": "partial",
        "user_overrides": {"tags": ["frequency"]},
    })
    client.store.set_flag("drill_cache", {
        "date": "2026-01-01",
        "drills": [{"slug": "two-sum", "score": 9}],
    })
    client.store.update_settings({"review_limit": 9})
    before = copy.deepcopy(_practice_state_snapshot(client.store))

    r = client.get("/api/insights")

    assert r.status_code == 200
    assert r.json()["confidence_calibration"]["status"] == "ok"
    assert _practice_state_snapshot(client.store) == before


def test_delete_problem_requires_confirmation_and_cleans_queue_state(client):
    client.store.upsert_review("valid-anagram", {
        "slug": "valid-anagram", "due_date": "2000-01-01", "interval_days": 5,
    })
    sid = client.store.add_session({
        "slug": "valid-anagram", "started_at": 1000, "status": "active",
        "paused_at": None, "paused_sec": 0, "kind": "adhoc",
    })

    bad = client.request("DELETE", "/api/problem/valid-anagram", json={
        "confirm_slug": "Valid Anagram",
    })
    assert bad.status_code == 400
    assert client.store.get_problem("valid-anagram") is not None

    res = client.request("DELETE", "/api/problem/valid-anagram", json={
        "confirm_slug": "valid-anagram",
    })
    assert res.status_code == 200
    assert res.json()["deleted_review"] is True
    assert client.store.get_problem("valid-anagram") is None
    assert client.store.get_review("valid-anagram") is None
    assert client.store.get_session(sid)["status"] == "cancelled"


def test_delete_problem_refuses_when_attempts_exist(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": 1, "source": "manual", "kind": "adhoc",
    })

    res = client.request("DELETE", "/api/problem/two-sum", json={
        "confirm_slug": "two-sum",
    })
    assert res.status_code == 409
    assert client.store.get_problem("two-sum") is not None


def test_mock_start_and_finish(client):
    start = client.post("/api/mock/start").json()
    assert len(start["problems"]) >= 1
    mid = start["id"]
    fin = client.post(f"/api/mock/{mid}/finish").json()
    assert fin["status"] == "finished"
    assert "score" in fin


def test_enrich_sweep_no_llm(client):
    r = client.post("/api/enrich/sweep", json={"limit": 5})
    assert r.json()["llm"] is False


def test_index_injects_content_derived_asset_version(client):
    r = client.get("/")
    assert r.status_code == 200
    ver = main.asset_version()
    assert "__ASSET_VER__" not in r.text
    assert f"/style.css?v={ver}" in r.text
    assert f"/charts.js?v={ver}" in r.text
    assert f"/app.js?v={ver}" in r.text
    assert f"/views.js?v={ver}" in r.text


def test_asset_version_changes_when_an_asset_changes(tmp_path, monkeypatch):
    for name in ("style.css", "charts.js", "app.js", "views.js"):
        (tmp_path / name).write_text("", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", str(tmp_path))
    before = main.asset_version()
    (tmp_path / "views.js").write_text("console.log('changed')", encoding="utf-8")
    assert main.asset_version() != before


def test_code_updated_at_uses_latest_front_or_backend_mtime(tmp_path, monkeypatch):
    server_dir = tmp_path / "server"
    static_dir = tmp_path / "static"
    server_dir.mkdir()
    static_dir.mkdir()
    old = server_dir / "main.py"
    new = static_dir / "app.js"
    old.write_text("old", encoding="utf-8")
    new.write_text("new", encoding="utf-8")
    old_ts = 1_700_000_000
    new_ts = 1_700_000_123
    import os
    os.utime(old, (old_ts, old_ts))
    os.utime(new, (new_ts, new_ts))
    monkeypatch.setattr(main, "ROOT", str(tmp_path))

    updated = main.code_updated_at()

    assert updated["epoch"] == new_ts
    assert updated["iso"].startswith("2023-11-14T22:15:23")


def test_config_roundtrip(client):
    defaults = client.get("/api/config").json()
    assert defaults["drill_limit"] == 3
    assert defaults["drill_min_signal"] == 0.35

    client.post("/api/config", json={
        "review_limit": 9,
        "new_limit": 2,
        "drill_limit": 4,
        "drill_min_signal": 0.5,
        "mistake_weight": 0.3,
        "llm_provider": "openai",
        "llm_model": "gpt-5.6-luna",
    })
    cfg = client.get("/api/config").json()
    assert cfg["review_limit"] == 9
    assert cfg["new_limit"] == 2
    assert cfg["drill_limit"] == 4
    assert cfg["drill_min_signal"] == 0.5
    assert cfg["mistake_weight"] == 0.3
    assert cfg["llm_provider"] == "openai"
    assert cfg["llm_model"] == "gpt-5.6-luna"
    assert "llm_options" in cfg


# ---- solution grading -----------------------------------------------------------
def test_grade_solution_endpoint_success(client, monkeypatch):
    seen = {}

    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None,
                         self_confidence=None, self_independence=None, self_note=None,
                         self_approach=None):
        seen.update({
            "self_confidence": self_confidence,
            "self_independence": self_independence,
            "self_note": self_note,
            "self_approach": self_approach,
        })
        return {"score": 4, "optimal": False, "analysis": "one-pass hashmap",
                "positives": ["Uses the right lookup structure"],
                "negatives": ["Needs a cleaner early return"],
                "inferred_time": "O(n)", "inferred_space": "O(n)"}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_solution", fake_grade)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": 3, "independence": "solo",
        "mistake_note": "missed edge case", "approach": "hashmap",
        "code": "class Solution: pass", "lang": "python3",
        "solution_grading_status": None,
    })
    r = client.post(f"/api/attempt/{aid}/grade-solution")
    assert r.status_code == 200
    body = r.json()
    assert body["grading_status"] == "viewed"
    assert body["graded"]["score"] == 4
    stored = client.store.get_attempt(aid)
    assert stored["solution_grading_status"] == "viewed"
    assert stored["solution_grade"]["score"] == 4
    assert stored["solution_grade"]["prompt_version"] == main.SOLUTION_PROMPT_VERSION
    assert stored["solution_grade"]["improvements"] == ["Needs a cleaner early return"]
    assert seen == {
        "self_confidence": 3,
        "self_independence": "solo",
        "self_note": "missed edge case",
        "self_approach": "hashmap",
    }


def test_grade_solution_endpoint_failure(client, monkeypatch):
    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None,
                         self_confidence=None, self_independence=None, self_note=None,
                         self_approach=None):
        return None, "AuthError: invalid API key"

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_solution", fake_grade)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": 2, "independence": "hints",
        "code": "class Solution: pass",
    })
    r = client.post(f"/api/attempt/{aid}/grade-solution")
    assert r.status_code == 200
    body = r.json()
    assert body["grading_status"] == "failed"
    assert body["grading_error"] == "AuthError: invalid API key"
    assert client.store.get_attempt(aid)["solution_grading_status"] == "failed"


def test_grade_solution_skips_without_code(client):
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "manual",
        "kind": "adhoc", "confidence": 2, "independence": "solo", "code": None,
    })
    r = client.post(f"/api/attempt/{aid}/grade-solution")
    assert r.status_code == 200
    assert r.json()["grading_status"] == "skipped"


def test_grade_solution_requires_self_assessment(client, monkeypatch):
    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": None, "independence": None,
        "code": "class Solution: pass",
    })
    r = client.post(f"/api/attempt/{aid}/grade-solution")
    assert r.status_code == 400
    assert "self-assessment" in r.json()["detail"]


def test_annotate_folds_solution_grade_into_schedule(client):
    # A poor LLM grade stored on the attempt drags the scheduled quality below
    # the self-assessment-only value.
    graded = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": None,
        "solution_grade": {"score": 0, "prompt_version": main.SOLUTION_PROMPT_VERSION},
    })
    r = client.post(f"/api/attempt/{graded}/annotate", json={
        "confidence": 3, "independence": "solo"})
    assert r.status_code == 200
    # solution_quality(3,"solo",0) == 3, vs quality(3,"solo") == 5
    assert r.json()["review"]["quality"] == 3

    ungraded = client.store.add_attempt({
        "slug": "3sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": None,
    })
    r2 = client.post(f"/api/attempt/{ungraded}/annotate", json={
        "confidence": 3, "independence": "solo"})
    assert r2.json()["review"]["quality"] == 5  # self-assessment only


def test_poll_records_fresh_solve_without_grading_before_annotation(client, monkeypatch):
    calls = []

    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None,
                         self_confidence=None, self_independence=None, self_note=None,
                         self_approach=None):
        calls.append(slug)
        return {"score": 5, "optimal": True, "analysis": "optimal",
                "improvements": [], "inferred_time": "O(n)",
                "inferred_space": "O(n)"}, None

    async def fake_recent_ac(username, limit, auth=None):
        active = client.get("/api/session/active").json()["active"]
        return [{"id": "sub-1", "titleSlug": "two-sum",
                 "timestamp": active["started_at"] + 5}]

    async def fake_submission_details(submission_id, auth=None):
        return {"runtime_percentile": 90.0, "memory_percentile": 80.0,
                "lang": "python3", "code": "class Solution: pass"}

    async def fake_wrong(slug, started_at, ended_at, auth=None):
        return 0

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_solution", fake_grade)
    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_submission_details)
    monkeypatch.setattr(main.poller.leetcode, "wrong_attempts_between", fake_wrong)

    client.post("/api/session/start", json={"slug": "two-sum", "kind": "adhoc"})

    first = client.post("/api/poll").json()
    assert len(first["new_attempts"]) == 1
    aid = first["new_attempts"][0]
    assert calls == []
    stored = client.store.get_attempt(aid)
    assert stored["solution_grading_status"] is None
    assert stored.get("solution_grade") is None

    # a second poll over the same submission must not re-detect or re-grade
    second = client.post("/api/poll").json()
    assert second["new_attempts"] == []
    assert calls == []


@pytest.mark.parametrize("invalid", [
    {"confidence": 0}, {"confidence": 4},
    {"independence": "typo"}, {"time_taken_sec": -1},
])
def test_invalid_manual_attempt_does_not_write_history(client, invalid):
    response = client.post("/api/attempt/manual", json={"slug": "two-sum", **invalid})
    assert response.status_code == 422
    assert client.store.list_attempts() == []
    assert client.store.get_review("two-sum") is None


def test_topics_tree_endpoint_returns_families_with_nested_topics(client):
    tree = client.get("/api/topics/tree").json()

    assert [f["family"] for f in tree] == ["Foundations"]
    foundations = tree[0]
    assert [t["category"] for t in foundations["topics"]] == [
        "Arrays & Hashing", "Two Pointers"]
    assert foundations["total"] == 3
    assert foundations["solved"] == 0
    assert foundations["coverage"] == 0.0


def test_topics_tree_tracks_solves_while_flat_topics_endpoint_still_works(client):
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "confidence": 3,
        "independence": "solo", "source": "manual",
    })

    foundations = client.get("/api/topics/tree").json()[0]
    arrays = next(t for t in foundations["topics"] if t["category"] == "Arrays & Hashing")

    assert foundations["solved"] == 1
    assert arrays["solved"] == 1
    assert arrays["mastery"] == 1.0

    flat = client.get("/api/topics").json()
    assert {t["category"] for t in flat} == {"Arrays & Hashing", "Two Pointers"}


# ---- review board ---------------------------------------------------------------
def _iso_from_today(days):
    import datetime as dt
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def test_review_schedule_segments_every_card(client):
    client.store.upsert_review("two-sum", {
        "slug": "two-sum", "due_date": _iso_from_today(-30), "interval_days": 6,
        "reps": 2, "ease": 2.5, "fail_count": 0, "leech": 0})
    client.store.upsert_review("3sum", {
        "slug": "3sum", "due_date": _iso_from_today(-1), "interval_days": 6,
        "reps": 2, "ease": 2.5, "fail_count": 0, "leech": 0})
    client.store.upsert_review("valid-anagram", {
        "slug": "valid-anagram", "due_date": _iso_from_today(20), "interval_days": 30,
        "reps": 3, "ease": 2.5, "fail_count": 0, "leech": 0})

    segments = client.get("/api/reviews/schedule").json()

    assert [s["key"] for s in segments] == ["overdue", "due", "later"]
    assert sum(s["count"] for s in segments) == 3
    assert segments[0]["items"][0]["title"] == "Two Sum"


def test_review_schedule_is_empty_without_cards(client):
    assert client.get("/api/reviews/schedule").json() == []


def test_review_schedule_exceeds_the_daily_review_limit(client):
    # The board must show everything, unlike /api/today's capped queue.
    client.store.update_settings({"review_limit": 1})
    for slug in ("two-sum", "3sum", "valid-anagram"):
        client.store.upsert_review(slug, {
            "slug": slug, "due_date": _iso_from_today(-2), "interval_days": 6,
            "reps": 2, "ease": 2.5, "fail_count": 0, "leech": 0})

    board = client.get("/api/reviews/schedule").json()
    queue = client.get("/api/today").json()

    assert sum(s["count"] for s in board) == 3
    assert len(queue["reviews"]) == 1


# ---- revision / freshness plumbing ----------------------------------------------
def test_rev_is_stable_until_something_actually_changes(client):
    # The first /api/today of the day legitimately writes: it establishes that
    # day's drill lane. Everything after it must be pure reads.
    client.get("/api/today")
    first = client.get("/api/rev").json()
    assert set(first) == {"rev", "date"}

    client.get("/api/today")
    client.get("/api/insights")
    client.get("/api/history")
    client.get("/api/problems")

    # Reads must not move the counters, or the client would refetch forever and
    # the view cache would never hit.
    assert client.get("/api/rev").json() == first


def test_repeat_today_loads_do_not_rewrite_an_unchanged_drill_lane(client):
    client.get("/api/today")
    before = client.get("/api/rev").json()["rev"]["userdoc"]
    client.get("/api/today")
    assert client.get("/api/rev").json()["rev"]["userdoc"] == before


def test_rev_changes_after_a_write(client):
    before = client.get("/api/rev").json()["rev"]
    client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "confidence": 3, "independence": "solo",
    })
    after = client.get("/api/rev").json()["rev"]
    assert after != before
    assert after["attempts"] != before["attempts"]
    # Unrelated collections stay put, so an unaffected tab is not redrawn.
    assert after["reviews"] == before["reviews"]


def test_rev_carries_the_date_so_the_queue_rolls_over_at_midnight(client):
    import datetime as dt
    assert client.get("/api/rev").json()["date"] == dt.date.today().isoformat()


def test_catalog_omits_problem_statements_but_single_reads_keep_them(client):
    client.store.upsert_problem({"slug": "two-sum", "content_html": "<p>Given…</p>"})

    listed = client.get("/api/problems").json()
    two_sum = next(p for p in listed if p["slug"] == "two-sum")
    assert "content_html" not in two_sum

    # The one place it is actually needed still gets it.
    detail = client.get("/api/problem/two-sum/recall-context").json()
    assert detail["content_html"] == "<p>Given…</p>"


# ---- solves logged outside a session --------------------------------------------
def _stub_recent_ac(monkeypatch, feed):
    async def fake_recent_ac(username, limit=20, auth=None):
        return feed[:limit]

    async def fake_details(submission_id, auth):
        raise RuntimeError("no cookie in tests")

    async def fake_question(slug, auth=None):
        return {"frontend_id": 42, "title": slug.replace("-", " ").title(),
                "difficulty": "Medium", "tags": ["Two Pointers"], "paid_only": False,
                "likes": 900, "dislikes": 50, "like_ratio": 0.95, "ac_rate": 50.0,
                "similar_slugs": []}

    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_details)
    monkeypatch.setattr(main.poller.importer.leetcode, "question", fake_question)


def test_poll_detects_a_solve_with_no_session_and_queues_it_for_annotation(
        client, monkeypatch):
    client.store.update_settings({"username": "senpai"})
    _stub_recent_ac(monkeypatch, [
        {"id": 7001, "title": "3Sum", "titleSlug": "3sum",
         "timestamp": int(time.time()) - 120},
    ])

    polled = client.post("/api/poll").json()

    assert len(polled["new_attempts"]) == 1
    attempt_id = polled["new_attempts"][0]
    row = next(p for p in polled["pending"] if p["id"] == attempt_id)
    assert row["source"] == "detected"
    assert row["time_taken_sec"] is None  # nothing knows when it was started
    assert row["in_library"] is True

    # A second poll must not log the same submission twice.
    assert client.post("/api/poll").json()["new_attempts"] == []


def test_a_detected_solve_outside_the_library_stays_off_the_daily_queue(
        client, monkeypatch):
    client.store.update_settings({"username": "senpai"})
    _stub_recent_ac(monkeypatch, [
        {"id": 7002, "title": "Hidden Gem", "titleSlug": "hidden-gem",
         "timestamp": int(time.time()) - 120},
    ])

    attempt_id = client.post("/api/poll").json()["new_attempts"][0]
    row = next(p for p in client.get("/api/pending").json()["pending"]
               if p["id"] == attempt_id)
    assert row["in_library"] is False

    # Rating it schedules a card, but the card is not work until it's imported.
    client.post(f"/api/attempt/{attempt_id}/annotate",
                json={"confidence": 2, "independence": "solo"})
    assert client.store.get_review("hidden-gem") is not None
    assert "hidden-gem" not in {r["slug"] for r in client.get("/api/today").json()["reviews"]}
    assert "hidden-gem" not in {p["slug"] for p in client.get("/api/problems").json()}

    # …and importing it is what promotes it, with the solve history intact.
    client.post("/api/import/problem", json={"slug": "hidden-gem"})
    assert "hidden-gem" in {r["slug"] for r in client.get("/api/today").json()["reviews"]}
    assert client.get(f"/api/attempt/{attempt_id}").json()["confidence"] == 2


def test_annotating_a_detected_solve_accepts_a_typed_time(client, monkeypatch):
    client.store.update_settings({"username": "senpai"})
    _stub_recent_ac(monkeypatch, [
        {"id": 7003, "title": "3Sum", "titleSlug": "3sum",
         "timestamp": int(time.time()) - 120},
    ])
    attempt_id = client.post("/api/poll").json()["new_attempts"][0]

    client.post(f"/api/attempt/{attempt_id}/annotate",
                json={"confidence": 2, "independence": "solo", "time_taken_sec": 1500})

    assert client.get(f"/api/attempt/{attempt_id}").json()["time_taken_sec"] == 1500


def test_a_measured_time_is_never_replaced_by_a_typed_one(client):
    attempt_id = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "time_taken_sec": 300, "confidence": None, "independence": None,
    })

    client.post(f"/api/attempt/{attempt_id}/annotate",
                json={"confidence": 3, "independence": "solo", "time_taken_sec": 60})

    assert client.get(f"/api/attempt/{attempt_id}").json()["time_taken_sec"] == 300


# ---- starting any problem from a pasted URL / number ----------------------------
def _stub_problem_lookup(monkeypatch):
    async def fake_question(slug, auth=None):
        if slug != "car-fleet":
            return None
        return {"frontend_id": 853, "title": "Car Fleet", "difficulty": "Medium",
                "tags": ["Stack", "Monotonic Stack"], "paid_only": False,
                "likes": 4000, "dislikes": 1500, "like_ratio": 0.73, "ac_rate": 50.0,
                "similar_slugs": [], "content_html": "<p>There are n cars…</p>"}

    async def fake_page(topic=None, difficulty=None, skip=0, limit=50, auth=None, search=None):
        if search != "853":
            return {"total": 0, "questions": []}
        return {"total": 1, "questions": [
            {"frontend_id": 853, "slug": "car-fleet", "title": "Car Fleet",
             "difficulty": "Medium", "tags": ["Stack"], "paid_only": False}]}

    monkeypatch.setattr(main.importer.leetcode, "question", fake_question)
    monkeypatch.setattr(main.importer.leetcode, "problemset_page", fake_page)


def test_resolve_finds_a_library_problem_by_url_and_by_number(client, monkeypatch):
    _stub_problem_lookup(monkeypatch)

    by_url = client.post("/api/problem/resolve",
                         json={"query": "https://leetcode.com/problems/3sum/"}).json()
    assert by_url["exact"] is True
    assert by_url["candidates"][0]["slug"] == "3sum"
    assert by_url["candidates"][0]["in_library"] is True

    by_number = client.post("/api/problem/resolve", json={"query": "#15"}).json()
    assert by_number["candidates"][0]["slug"] == "3sum"


def test_resolve_is_read_only_then_starting_imports_and_runs(client, monkeypatch):
    _stub_problem_lookup(monkeypatch)

    resolved = client.post("/api/problem/resolve", json={"query": "853"}).json()
    assert resolved["candidates"][0]["slug"] == "car-fleet"
    assert resolved["candidates"][0]["in_library"] is False
    # A lookup must not litter the catalog with problems that were never started.
    assert client.store.get_problem("car-fleet") is None

    # The UI imports the pick, then starts the ordinary session flow.
    client.post("/api/import/problem", json={"slug": "car-fleet"})
    started = client.post("/api/session/start", json={"slug": "car-fleet", "kind": "adhoc"})
    assert started.status_code == 200
    active = client.get("/api/session/active").json()["active"]
    assert active["slug"] == "car-fleet"
    assert active["elapsed_sec"] >= 0  # same live view + timer as any other run

    # Deliberately practising it is what puts it in the rotation.
    assert "car-fleet" in {p["slug"] for p in client.get("/api/problems").json()}


def test_resolve_reports_a_miss_instead_of_starting_something_wrong(client, monkeypatch):
    _stub_problem_lookup(monkeypatch)

    r = client.post("/api/problem/resolve",
                    json={"query": "https://leetcode.com/problems/nope-not-real/"})

    assert r.status_code == 404
    assert "nope-not-real" in r.json()["detail"]


def test_optimising_after_the_first_ac_stays_one_solve(client, monkeypatch):
    """The real loop: start a session, AC something slow, keep going until it's
    clean. Two accepted submissions, one piece of practice — so one attempt in
    history, one prompt to rate, and one step forward on the review card."""
    started = client.post("/api/session/start", json={
        "slug": "two-sum", "kind": "adhoc",
        "predicted_category": "Arrays & Hashing",
    }).json()
    t0 = started["started_at"]

    feed = [{"id": "sub-slow", "titleSlug": "two-sum", "timestamp": t0 + 600}]
    code = {"sub-slow": "brute force O(n^2)", "sub-fast": "hash map O(n)"}
    percentile = {"sub-slow": 5.0, "sub-fast": 95.0}

    async def fake_recent_ac(username, limit, auth=None):
        return list(feed)

    async def fake_submission_details(submission_id, auth=None):
        return {"runtime_percentile": percentile[submission_id],
                "memory_percentile": 50.0, "lang": "python3",
                "code": code[submission_id]}

    async def fake_wrong_attempts_between(slug, start_ts, end_ts, auth=None):
        return 1

    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_submission_details)
    monkeypatch.setattr(
        main.poller.leetcode, "wrong_attempts_between", fake_wrong_attempts_between)

    first = client.post("/api/poll").json()
    attempt_id = first["new_attempts"][0]
    assert [p["id"] for p in first["pending"]] == [attempt_id]

    # Modal is up on the slow solve; meanwhile the clean version lands.
    feed.append({"id": "sub-fast", "titleSlug": "two-sum", "timestamp": t0 + 1500})
    second = client.post("/api/poll").json()

    # Same row, so the modal has something to refresh rather than a second one
    # stacked behind it.
    assert second["new_attempts"] == [attempt_id]
    assert [p["id"] for p in second["pending"]] == [attempt_id]
    assert len(client.get("/api/history").json()) == 1

    detail = client.get(f"/api/attempt/{attempt_id}").json()
    assert detail["submission_id"] == "sub-fast"
    assert detail["code"] == "hash map O(n)"
    assert detail["runtime_percentile"] == 95.0
    assert detail["time_taken_sec"] == 1500      # the whole sitting
    assert detail["first_ac_time_taken_sec"] == 600
    assert detail["resubmissions"] == 1
    assert detail["wrong_before_ac"] == 2        # 1 before each AC
    # The session's prediction survives the hand-off.
    assert detail["predicted_category"] == "Arrays & Hashing"

    client.post(f"/api/attempt/{attempt_id}/annotate",
                json={"confidence": 3, "independence": "solo"})
    assert client.get("/api/pending").json()["pending"] == []
    # The card moved exactly as far as one clean solve moves it — logging the
    # second AC separately used to advance it twice for the same sitting.
    review = client.store.get_review("two-sum")
    once = main.scheduler.advance_review(None, 3, "solo")
    assert review["interval_days"] == once["interval_days"]
    assert review["due_date"] == once["due_date"]

    # Nothing left to detect, so nothing further moves the card.
    client.post("/api/poll")
    assert client.store.get_review("two-sum")["due_date"] == once["due_date"]
    assert len(client.get("/api/history").json()) == 1


def test_rating_two_solves_of_one_problem_today_moves_the_card_once(client):
    """The other half of the same story: you rate the slow solve, *then* land a
    better one. That's a genuine second attempt — but it's still one day's work,
    so the card must not be pushed out twice for it."""
    slow = client.post("/api/attempt/manual", json={
        "slug": "two-sum", "time_taken_sec": 900,
        "confidence": 2, "independence": "hints",
    }).json()
    assert slow["ok"]
    after_slow = copy.deepcopy(client.store.get_review("two-sum"))

    fast = client.post("/api/attempt/manual", json={
        "slug": "two-sum", "time_taken_sec": 300,
        "confidence": 3, "independence": "solo",
    }).json()
    assert fast["ok"]
    settled = client.store.get_review("two-sum")

    # Both attempts are real history; only the scheduling is collapsed.
    rows = [h for h in client.get("/api/history").json() if h["slug"] == "two-sum"]
    assert len(rows) == 2

    # The card sits where the second rating alone would put it, not one advance
    # further on.
    straight = main.scheduler.advance_review(
        after_slow.get(main.scheduler.PRIOR_CARD_KEY), 3, "solo")
    assert settled["due_date"] == straight["due_date"]
    assert settled["fail_count"] == straight["fail_count"]


def test_a_solve_tomorrow_still_advances_the_card(client, monkeypatch):
    """Collapsing is per-day: the next day's practice moves the card as usual."""
    client.post("/api/attempt/manual", json={
        "slug": "two-sum", "confidence": 3, "independence": "solo"})
    today = client.store.get_review("two-sum")

    tomorrow = main.scheduler.advance_review(
        {**today, "slug": "two-sum"}, 3, "solo",
        today=dt.date.fromisoformat(today["last_reviewed"]) + dt.timedelta(days=1))
    assert tomorrow["due_date"] > today["due_date"]


# ---- leetcode cookie health -----------------------------------------------------
def _with_cookie(client, monkeypatch, signed_in_as):
    """Point the status endpoint at a cookie and a canned LeetCode answer."""
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: {"session": "s", "csrf": None}
    monkeypatch.setattr(main.leetcode, "signed_in_as", signed_in_as)


def test_leetcode_status_missing_without_cookie(client):
    assert client.get("/api/leetcode-status").json() == {"state": "missing", "username": None}


def test_leetcode_status_ok_when_leetcode_still_knows_the_session(client, monkeypatch):
    async def signed_in_as(auth_):
        return "kunde"

    _with_cookie(client, monkeypatch, signed_in_as)
    assert client.get("/api/leetcode-status").json() == {"state": "ok", "username": "kunde"}


def test_leetcode_status_expired_when_the_session_is_refused(client, monkeypatch):
    async def signed_in_as(auth_):
        return None  # a well-formed reply saying nobody is signed in

    _with_cookie(client, monkeypatch, signed_in_as)
    assert client.get("/api/leetcode-status").json() == {"state": "expired", "username": None}


def test_a_leetcode_outage_is_unknown_not_expired(client, monkeypatch):
    # Reporting a dropped connection as a dead cookie would train the warning to
    # be ignored, which costs more than the missed detection.
    async def signed_in_as(auth_):
        raise RuntimeError("connection reset")

    _with_cookie(client, monkeypatch, signed_in_as)
    assert client.get("/api/leetcode-status").json() == {"state": "unknown", "username": None}


async def test_overlapping_polls_log_a_session_solve_once(client, monkeypatch):
    # The session timer and a focus-triggered sweep both POST /poll. Each awaits
    # LeetCode between its duplicate check and its write, so run side by side
    # they both logged the same submission, and closing the modal on one solve
    # opened it again for the twin.
    store = client.store
    store.update_settings({"username": "me"})
    started = int(time.time()) - 600
    store.add_session({"slug": "two-sum", "status": "active", "started_at": started,
                       "kind": "adhoc"})

    async def fake_recent_ac(username, limit, auth=None):
        await asyncio.sleep(0.05)
        return [{"id": "sub-1", "titleSlug": "two-sum", "timestamp": started + 300}]

    async def fake_submission_details(submission_id, auth=None):
        await asyncio.sleep(0.05)
        return {"code": "pass", "lang": "python3"}

    async def fake_wrong_attempts_between(*a, **k):
        return 0

    monkeypatch.setattr(main.poller.leetcode, "recent_ac", fake_recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", fake_submission_details)
    monkeypatch.setattr(
        main.poller.leetcode, "wrong_attempts_between", fake_wrong_attempts_between)

    results = await asyncio.gather(
        main.api_poll(BackgroundTasks(), uid="test", lc=None),
        main.api_poll(BackgroundTasks(), uid="test", lc=None),
    )
    assert sum(len(r["new_attempts"]) for r in results) == 1
    assert [a["submission_id"] for a in store.list_attempts()] == ["sub-1"]
    assert len(results[-1]["pending"]) == 1


def test_full_enrichment_keeps_the_plan_grade_and_skips_double_grading(client, monkeypatch):
    tasks = []

    async def fake_extract(task_name, payload, settings=None):
        tasks.append(task_name)
        if task_name == "analyze_code":
            return {"pattern_used": "hash map", "inferred_time": "O(n)", "inferred_space": "O(n)",
                    "complexity_verdict": "match", "diff_summary": ""}
        return None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.llm, "extract", fake_extract)
    aid = client.store.add_attempt({"slug": "two-sum", "solved_at": 100, "code": "x",
                                    "plan_status": "planned", **_PLAN})
    client.store.upsert_enrichment(aid, {
        "slug": "two-sum", "plan_grade": {"approach_verdict": "viable"},
        "plan_prompt_version": 1, "prediction_verdict": "correct"})

    asyncio.run(main.enrich.enrich_attempt(client.store, aid))

    e = client.store.get_enrichment(aid)
    assert "grade_prediction" not in tasks  # graded with the plan instead
    assert e["pattern_used"] == "hash map"
    assert e["plan_grade"] == {"approach_verdict": "viable"}
    assert e["prediction_verdict"] == "correct"


def test_counterexample_check_does_not_reveal_or_finalize(client):
    qid = "v1:break-last:1"
    bad = client.post("/api/practice/check", json={"question_id": qid, "answer": "[1, 2]"})
    assert bad.json() == {"correct": False, "expected": False, "actual": False}
    good = client.post("/api/practice/check", json={"question_id": qid, "answer": "[1, 1]"})
    assert good.json()["correct"] is True
    assert client.store.light_practice == {}
    assert client.post("/api/practice/check", json={"question_id": qid, "answer": "oops"}).status_code == 400


def test_guess_is_idempotent_and_does_not_change_correctness(client):
    qid = "v1:fill-search:1"
    body = {"question_id": qid}
    assert client.post("/api/practice/guess", json=body).status_code == 400
    client.post("/api/practice/answer", json={**body, "answer": "0"})
    first = client.post("/api/practice/guess", json=body).json()
    assert first["correct"] and first["guessed"]
    assert client.post("/api/practice/guess", json=body).json() == first
    assert client.get("/api/practice").json()["status"]["fill-search"] == "uncertain"


def test_practice_difficulty_filter(client):
    for level in ("foundation", "standard", "stretch"):
        q = client.get("/api/practice/next", params={"difficulty": level})
        assert q.status_code == 200
        assert q.json()["difficulty"] == level
    assert client.get("/api/practice/next?difficulty=impossible").status_code == 400
