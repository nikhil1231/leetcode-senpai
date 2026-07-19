"""End-to-end API wiring tests via FastAPI TestClient against the FakeStore.

No Firestore, no network, no LLM key — exercises the request/response plumbing
and the graceful-degradation paths.
"""
import time
import asyncio

import pytest
from fastapi.testclient import TestClient

from server import auth, main, poller
from tests.fake_store import FakeStore


@pytest.fixture
def client(monkeypatch):
    shared = FakeStore("test")
    # seed a small library
    for slug, title, diff, cat in [
        ("two-sum", "Two Sum", "Easy", "Arrays & Hashing"),
        ("3sum", "3Sum", "Medium", "Two Pointers"),
        ("valid-anagram", "Valid Anagram", "Easy", "Arrays & Hashing"),
    ]:
        shared.upsert_problem({"slug": slug, "title": title, "difficulty": diff,
                               "neetcode_category": cat, "in_library": True,
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


def _add_problem(store, slug, title, difficulty, category):
    store.upsert_problem({
        "slug": slug, "title": title, "difficulty": difficulty,
        "neetcode_category": category, "in_library": True,
        "packs": ["neetcode150"], "url": f"https://lc/{slug}",
        "similar_slugs": [],
    })


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


def test_insights_shape(client):
    client.post("/api/attempt/manual", json={
        "slug": "two-sum", "confidence": 3, "independence": "solo",
        "time_taken_sec": 600})
    body = client.get("/api/insights").json()
    for k in ["forecast", "mastery_radar", "time_trend", "pace",
              "failure_modes", "prediction_accuracy", "mock_trend"]:
        assert k in body


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
    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None):
        return {"score": 4, "optimal": False, "analysis": "one-pass hashmap",
                "improvements": ["drop the second scan"],
                "inferred_time": "O(n)", "inferred_space": "O(n)"}, None

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_solution", fake_grade)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": None, "code": "class Solution: pass",
        "lang": "python3", "solution_grading_status": "pending",
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


def test_grade_solution_endpoint_failure(client, monkeypatch):
    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None):
        return None, "AuthError: invalid API key"

    monkeypatch.setattr(main.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(main.coach, "grade_solution", fake_grade)
    aid = client.store.add_attempt({
        "slug": "two-sum", "solved_at": int(time.time()), "source": "auto",
        "kind": "adhoc", "confidence": None, "code": "class Solution: pass",
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
        "kind": "adhoc", "confidence": None, "code": None,
    })
    r = client.post(f"/api/attempt/{aid}/grade-solution")
    assert r.status_code == 200
    assert r.json()["grading_status"] == "skipped"


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


def test_poll_auto_grades_fresh_solve_and_is_idempotent(client, monkeypatch):
    calls = []

    async def fake_grade(store, slug, code, lang=None, claim_time=None, claim_space=None):
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
    # background grade task ran (TestClient runs BackgroundTasks synchronously)
    assert calls == ["two-sum"]
    stored = client.store.get_attempt(aid)
    assert stored["solution_grading_status"] == "viewed"
    assert stored["solution_grade"]["score"] == 5

    # a second poll over the same submission must not re-detect or re-grade
    second = client.post("/api/poll").json()
    assert second["new_attempts"] == []
    assert calls == ["two-sum"]
