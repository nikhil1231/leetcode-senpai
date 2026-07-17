"""End-to-end API wiring tests via FastAPI TestClient against the FakeStore.

No Firestore, no network, no LLM key — exercises the request/response plumbing
and the graceful-degradation paths.
"""
import time

import pytest
from fastapi.testclient import TestClient

from server import auth, main
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
    monkeypatch.setattr(main.llm, "enabled", lambda: False)
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


def test_recall_grading_waits_and_schedules(client, monkeypatch):
    async def fake_grade(store, slug, recall_text, recall_time=None, recall_space=None):
        return {"grade": 3, "feedback": "solid", "key_ideas_missed": []}, None

    monkeypatch.setattr(main.llm, "enabled", lambda: True)
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
    assert client.post(f"/api/review/recall/{aid}/ack").status_code == 404


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

    monkeypatch.setattr(main.llm, "enabled", lambda: True)
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

    monkeypatch.setattr(main.llm, "enabled", lambda: True)
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
    })
    cfg = client.get("/api/config").json()
    assert cfg["review_limit"] == 9
    assert cfg["new_limit"] == 2
    assert cfg["drill_limit"] == 4
    assert cfg["drill_min_signal"] == 0.5
    assert cfg["mistake_weight"] == 0.3
