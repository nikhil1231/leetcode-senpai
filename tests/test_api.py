"""End-to-end API wiring tests via FastAPI TestClient against the FakeStore.

No Firestore, no network, no LLM key — exercises the request/response plumbing
and the graceful-degradation paths.
"""
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
    assert r.json()["llm_enabled"] is False


def test_today_has_new_and_sections(client):
    r = client.get("/api/today")
    body = r.json()
    assert "new" in body and "reviews" in body and "expansion" in body and "goal" in body


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


def test_async_recall_grading_and_ack(client, monkeypatch):
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
    assert body["grading_status"] == "pending"
    assert body["review"] is None

    aid = body["attempt_id"]
    result = client.get(f"/api/review/recall/{aid}").json()
    assert result["grading_status"] == "ready"
    assert result["recall_grade"]["grade"] == 3

    ack = client.post(f"/api/review/recall/{aid}/ack")
    assert ack.status_code == 200
    assert client.store.get_attempt(aid)["grading_status"] == "viewed"
    assert client.store.get_review("two-sum")["due_date"] != "2000-01-01"


def test_async_recall_grading_failure_surfaces_error(client, monkeypatch):
    async def fake_grade(store, slug, recall_text, recall_time=None, recall_space=None):
        return None, "AuthError: invalid API key"

    monkeypatch.setattr(main.llm, "enabled", lambda: True)
    monkeypatch.setattr(main.coach, "grade_recall", fake_grade)
    r = client.post("/api/review/recall", json={
        "slug": "two-sum", "recall_text": "hashmap of complements",
    })
    assert r.status_code == 200
    aid = r.json()["attempt_id"]

    result = client.get(f"/api/review/recall/{aid}").json()
    assert result["grading_status"] == "failed"
    assert result["grading_error"] == "AuthError: invalid API key"
    assert result["recall_grade"] is None

    # A failed grade must not be ackable (no phantom-0 poisoning the scheduler).
    ack = client.post(f"/api/review/recall/{aid}/ack")
    assert ack.status_code == 400


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
    client.post("/api/config", json={"review_limit": 9, "mistake_weight": 0.3})
    cfg = client.get("/api/config").json()
    assert cfg["review_limit"] == 9
    assert cfg["mistake_weight"] == 0.3
