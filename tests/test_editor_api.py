"""The in-app editor's routes: state, change log, run and submit proxying, and the
solve an Accepted logs on the spot. LeetCode is faked; no network."""
import pytest
from fastapi.testclient import TestClient

from server import auth, leetcode, main, recording
from tests.fake_store import FakeStore

STARTER = "class Solution:\n    def twoSum(self, nums, target):\n        "
WRONG = STARTER + "return [0, 0]\n"
RIGHT = STARTER + "return [0, 1]\n"


@pytest.fixture
def client(monkeypatch):
    store = FakeStore("test")
    store.upsert_problem({"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
                          "neetcode_category": "Arrays & Hashing", "in_library": True,
                          "url": "https://lc/two-sum", "similar_slugs": [],
                          "content_html": "<p>Two Sum</p>"})
    monkeypatch.setattr(main, "get_store", lambda uid: store)

    async def question(slug, auth=None):
        return {"question_id": "1", "starter_code": STARTER,
                "example_testcases": ["[2,7,11,15]\n9", "[3,2,4]\n6"]}
    monkeypatch.setattr(main.leetcode, "question", question)
    main.app.dependency_overrides[auth.require_user] = lambda: "test"
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: {"session": "s", "csrf": "c"}
    c = TestClient(main.app)
    c.store = store
    yield c
    main.app.dependency_overrides.clear()


def _start(client):
    return client.post("/api/session/start", json={"slug": "two-sum", "surface": "editor"}
                       ).json()["session_id"]


def _events(client, sid):
    return recording.parse(client.store.get_recording(sid)["events"])


def test_state_hydrates_the_problem_once_and_opens_the_recording(client):
    sid = _start(client)
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["available"] and state["can_judge"]
    assert state["code"] == STARTER and state["seq"] == 0
    assert state["example_testcases"] == ["[2,7,11,15]\n9", "[3,2,4]\n6"]
    assert client.store.problems["two-sum"]["question_id"] == "1"
    assert _events(client, sid) == [{"t": 0, "k": "c", "code": STARTER}]
    # Asked again, the recording isn't restarted.
    client.get(f"/api/editor/state?session_id={sid}")
    assert len(_events(client, sid)) == 1


def test_state_resumes_from_the_recorded_code(client):
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    delta = recording.diff(STARTER, WRONG)
    client.post("/api/editor/log", json={"session_id": sid, "seq": 1,
                                         "events": [{"t": 10_000, "k": "d", **delta}]})
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["code"] == WRONG and state["seq"] == 1


def test_a_retried_log_batch_is_not_applied_twice(client):
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    batch = {"session_id": sid, "seq": 1,
             "events": [{"t": 10_000, "k": "d", **recording.diff(STARTER, WRONG)}]}
    client.post("/api/editor/log", json=batch)
    client.post("/api/editor/log", json=batch)
    assert [e["k"] for e in _events(client, sid)] == ["c", "d"]
    assert client.store.get_recording(sid)["chain_ok"] is True


def test_the_log_refuses_server_only_events_and_finished_runs(client):
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    client.post("/api/editor/log", json={"session_id": sid, "seq": 1, "events": [
        {"t": 1, "k": "sub", "code": "x", "result": {"status": "Accepted"}},
        {"t": 2, "k": "blur"}]})
    assert [e["k"] for e in _events(client, sid)] == ["c", "blur"]
    client.post("/api/session/cancel")
    r = client.post("/api/editor/log", json={"session_id": sid, "seq": 2, "events": []})
    assert r.status_code == 409


def test_run_logs_the_pending_deltas_then_the_judging(client, monkeypatch):
    async def run_code(slug, qid, code, data_input, auth):
        assert (slug, qid) == ("two-sum", "1")
        return {"status": "Accepted", "passed": False, "correct": 0, "total": 1,
                "cases": [{"input": data_input, "output": "[0,0]", "expected": "[0,1]",
                           "stdout": ""}], "error": None}
    monkeypatch.setattr(main.leetcode, "run_code", run_code)
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    r = client.post("/api/editor/run", json={
        "session_id": sid, "code": WRONG, "data_input": "[2,7,11,15]\n9", "t": 30_000,
        "seq": 1, "events": [{"t": 29_000, "k": "d", **recording.diff(STARTER, WRONG)}]}).json()
    assert r["ok"] and r["result"]["passed"] is False
    events = _events(client, sid)
    assert [e["k"] for e in events] == ["c", "d", "run"]
    assert events[-1]["result"]["wrong"] == {"input": "[2,7,11,15]\n9", "output": "[0,0]",
                                             "expected": "[0,1]"}
    assert client.store.get_recording(sid)["chain_ok"] is True


def test_a_judge_refusal_is_an_answer_not_an_error(client, monkeypatch):
    async def run_code(*a):
        raise leetcode.JudgeError("LeetCode is rate-limiting — wait a few seconds and try again.")
    monkeypatch.setattr(main.leetcode, "run_code", run_code)
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    r = client.post("/api/editor/run", json={"session_id": sid, "code": STARTER, "t": 5})
    assert r.status_code == 200
    assert r.json() == {"ok": False, "error": "LeetCode is rate-limiting — wait a few seconds and try again."}
    assert [e["k"] for e in _events(client, sid)] == ["c"]


def _submits(monkeypatch, verdicts):
    async def submit_code(slug, qid, code, auth):
        return verdicts.pop(0)
    monkeypatch.setattr(main.leetcode, "submit_code", submit_code)


def test_wrong_then_accepted_logs_one_solve_with_its_failure(client, monkeypatch):
    sid = _start(client)
    started = client.store.get_session(sid)["started_at"]
    _submits(monkeypatch, [
        {"status": "Wrong Answer", "accepted": False, "submission_id": 11,
         "finished_at": started + 60, "correct": 62, "total": 65, "input": "[3,2,4]\n6",
         "expected": "[1,2]", "output": "[0,0]", "error": None},
        # The AC's judging finished five minutes into the run.
        {"status": "Accepted", "accepted": True, "submission_id": 12,
         "finished_at": started + 300, "correct": 65, "total": 65,
         "runtime_percentile": 88.5, "memory_percentile": 40.0},
    ])
    client.get(f"/api/editor/state?session_id={sid}")
    first = client.post("/api/editor/submit", json={
        "session_id": sid, "code": WRONG, "t": 60_000, "seq": 1,
        "events": [{"t": 50_000, "k": "d", **recording.diff(STARTER, WRONG)}]}).json()
    assert first["ok"] and first["attempt_id"] is None
    done = client.post("/api/editor/submit", json={
        "session_id": sid, "code": RIGHT, "t": 300_000, "seq": 2,
        "events": [{"t": 290_000, "k": "d", **recording.diff(WRONG, RIGHT)}]}).json()

    attempt = client.store.get_attempt(done["attempt_id"])
    assert attempt["via"] == "editor" and attempt["source"] == "auto"
    assert attempt["submission_id"] == 12 and attempt["code"] == RIGHT
    assert attempt["time_taken_sec"] == 300
    assert attempt["wrong_before_ac"] == 1
    assert attempt["failed_tests"] == [{"status": "Wrong Answer", "input": "[3,2,4]\n6",
                                        "expected": "[1,2]", "output": "[0,0]"}]
    assert attempt["runtime_percentile"] == 88.5
    assert attempt["recording"]["submits"] == 2 and attempt["recording"]["chain_ok"]
    assert any(p["id"] == done["attempt_id"] for p in done["pending"])
    assert client.store.get_session(sid)["status"] == "completed"
    assert len(client.store.attempts) == 1


def test_the_feed_seeing_the_same_ac_later_adds_nothing(client, monkeypatch):
    sid = _start(client)
    started = client.store.get_session(sid)["started_at"]
    client.get(f"/api/editor/state?session_id={sid}")
    _submits(monkeypatch, [{"status": "Accepted", "accepted": True, "submission_id": 12,
                            "finished_at": started + 60}])
    client.post("/api/editor/submit", json={"session_id": sid, "code": RIGHT, "t": 60_000})
    client.store.settings["username"] = "kunde"

    async def recent_ac(username, limit=20, auth=None):
        return [{"id": 12, "title": "Two Sum", "titleSlug": "two-sum",
                 "timestamp": started + 60}]
    monkeypatch.setattr(main.poller.leetcode, "recent_ac", recent_ac)
    assert client.post("/api/poll").json()["new_attempts"] == []
    assert len(client.store.attempts) == 1


def test_pauses_and_hints_land_in_an_editor_runs_recording_only(client, monkeypatch):
    async def ladder(store, slug):
        return ["think about complements"]
    monkeypatch.setattr(main.coach, "ensure_hint_ladder", ladder)
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    client.post("/api/session/pause", json={"paused": True})
    client.post("/api/session/pause", json={"paused": False})
    client.post("/api/session/hint")
    assert [e["k"] for e in _events(client, sid)] == ["c", "pause", "resume", "hint"]

    client.post("/api/session/cancel")
    other = client.post("/api/session/start", json={"slug": "two-sum"}).json()["session_id"]
    client.post("/api/session/pause", json={"paused": True})
    assert client.store.get_recording(other) is None


def test_mock_runs_stay_on_leetcode(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "kind": "mock",
                                                "surface": "editor"}).json()
    assert r["active"]["surface"] == "leetcode"


def test_editor_is_unavailable_without_problem_metadata(client, monkeypatch):
    async def question(slug, auth=None):
        raise RuntimeError("offline")
    monkeypatch.setattr(main.leetcode, "question", question)
    sid = _start(client)
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["available"] is False
    assert client.store.get_recording(sid) is None
    r = client.post("/api/editor/run", json={"session_id": sid, "code": "x", "t": 1})
    assert r.status_code == 409


def test_state_reports_a_missing_cookie(client):
    main.app.dependency_overrides[auth.leetcode_auth] = lambda: None
    sid = _start(client)
    assert client.get(f"/api/editor/state?session_id={sid}").json()["can_judge"] is False
