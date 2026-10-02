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


def test_the_run_and_the_solve_carry_interview_pace_for_their_difficulty(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "surface": "editor"}).json()
    assert r["active"]["par_sec"] == main.config.SOLVE_PAR_SEC["Easy"]


def test_a_run_opens_with_the_last_lesson_and_keeps_it(client):
    aid = client.store.add_attempt({"slug": "two-sum", "solved_at": 100, "confidence": 2})
    client.store.upsert_enrichment(aid, {"attempt_id": aid, "process_review": {
        "takeaway": "Run the empty case before submitting."}})
    r = client.post("/api/session/start", json={"slug": "two-sum", "surface": "editor"}).json()
    t = r["active"]["takeaway"]
    assert (t["text"], t["scope"], t["title"]) == (
        "Run the empty case before submitting.", "problem", "Two Sum")
    assert client.get("/api/session/active").json()["active"]["takeaway"] == t


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


def test_the_plan_prefetches_what_a_new_run_opens_with(client):
    r = client.get("/api/problem/two-sum/recall-context?editor=1").json()
    assert r["content_html"] == "<p>Two Sum</p>"
    assert r["editor"] == {"available": True, "can_judge": True, "starter_code": STARTER,
                           "example_testcases": ["[2,7,11,15]\n9", "[3,2,4]\n6"],
                           "interview_runs": main.config.INTERVIEW_RUN_LIMIT,
                           "par_sec": main.config.SOLVE_PAR_SEC["Easy"]}
    # Without asking for it, the recall modal pays for none of it.
    assert client.get("/api/problem/two-sum/recall-context").json()["editor"] is None


def test_start_opens_the_recording_and_answers_with_the_editor_state(client):
    client.get("/api/problem/two-sum/recall-context?editor=1")  # hydrated while planning
    old = _start(client)
    r = client.post("/api/session/start", json={
        "slug": "two-sum", "surface": "editor", "interview": True,
        "planned_edge_cases": ["empty", "Empty", "dupes"]}).json()
    sid = r["session_id"]
    assert client.store.sessions[old]["status"] == "cancelled"
    assert _events(client, sid) == [{"t": 0, "k": "c", "code": STARTER}]
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert {**r["editor"], "now_ms": 0} == {**state, "now_ms": 0}
    assert r["editor"]["planned_edge_cases"] == ["empty", "dupes"]
    assert r["editor"]["runs_left"] == main.config.INTERVIEW_RUN_LIMIT
    # Opening it didn't restart the recording.
    assert len(_events(client, sid)) == 1


def test_start_leaves_the_recording_to_the_editor_when_the_problem_isnt_hydrated(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "surface": "editor"}).json()
    assert r["editor"] is None and client.store.get_recording(r["session_id"]) is None
    lc = client.post("/api/session/start", json={"slug": "two-sum", "surface": "leetcode"}).json()
    assert lc["editor"] is None


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


def test_a_recording_from_before_the_end_state_was_kept_still_appends(client):
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    doc = client.store.get_recording(sid)
    del doc["code"]
    client.store.save_recording(sid, doc)
    client.post("/api/editor/log", json={"session_id": sid, "seq": 1,
                                         "events": [{"t": 9, "k": "d", **recording.diff(STARTER, WRONG)}]})
    doc = client.store.get_recording(sid)
    assert doc["code"] == WRONG and doc["chain_ok"] is True
    assert client.get(f"/api/editor/state?session_id={sid}").json()["code"] == WRONG


def test_a_full_log_drops_edits_but_keeps_judgings_and_says_so(client, monkeypatch):
    async def run_code(slug, qid, code, data_input, auth):
        return {"status": "Accepted", "passed": True, "correct": 1, "total": 1,
                "cases": [], "error": None}
    monkeypatch.setattr(main.leetcode, "run_code", run_code)
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    monkeypatch.setattr(recording, "MAX_LOG_CHARS", len(client.store.get_recording(sid)["events"]) + 10)
    r = client.post("/api/editor/log", json={"session_id": sid, "seq": 1, "events": [
        {"t": 9, "k": "d", **recording.diff(STARTER, WRONG)}]}).json()
    assert r["truncated"] is True and r["seq"] == 1
    r = client.post("/api/editor/run", json={"session_id": sid, "code": WRONG, "t": 20}).json()
    assert r["ok"] and r["truncated"]
    assert [e["k"] for e in _events(client, sid)] == ["c", "run"]
    assert client.get(f"/api/editor/state?session_id={sid}").json()["truncated"] is True


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


def test_the_last_input_run_reopens_on_any_device(client, monkeypatch):
    async def run_code(slug, qid, code, data_input, auth):
        return {"status": "Accepted", "passed": True, "correct": 1, "total": 1,
                "cases": [], "error": None}
    monkeypatch.setattr(main.leetcode, "run_code", run_code)
    sid = _start(client)
    assert client.get(f"/api/editor/state?session_id={sid}").json()["last_input"] is None
    client.post("/api/editor/run", json={"session_id": sid, "code": STARTER, "t": 5,
                                         "data_input": "[3,3]\n6\n\n"})
    assert _events(client, sid)[-1]["input"] == "[3,3]\n6"
    assert client.get(f"/api/editor/state?session_id={sid}").json()["last_input"] == "[3,3]\n6"


def test_planned_edge_cases_and_their_ticks_come_back_with_the_state(client):
    sid = client.post("/api/session/start", json={
        "slug": "two-sum", "surface": "editor", "plan_status": "planned",
        "planned_edge_cases": ["empty", "dupes"]}).json()["session_id"]
    client.get(f"/api/editor/state?session_id={sid}")
    client.post("/api/editor/log", json={"session_id": sid, "seq": 1, "events": [
        {"t": 5, "k": "edge", "case": "empty", "on": True},
        {"t": 6, "k": "edge", "case": "dupes", "on": True},
        {"t": 7, "k": "edge", "case": "empty", "on": False}]})
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["planned_edge_cases"] == ["empty", "dupes"]
    assert state["edges_checked"] == ["dupes"]


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


def _feed(client, monkeypatch, sub_id, ts, code=RIGHT):
    client.store.settings["username"] = "kunde"

    async def recent_ac(username, limit=20, auth=None):
        return [{"id": sub_id, "title": "Two Sum", "titleSlug": "two-sum", "timestamp": ts}]

    async def details(submission_id, auth):
        return {"code": code, "lang": "python3", "runtime_percentile": 50.0}

    async def nothing(*a, **k):
        return 0
    monkeypatch.setattr(main.poller.leetcode, "recent_ac", recent_ac)
    monkeypatch.setattr(main.poller.leetcode, "submission_details", details)
    monkeypatch.setattr(main.poller.leetcode, "wrong_attempts_between", nothing)


def test_an_editor_run_finished_on_leetcode_keeps_its_recording(client, monkeypatch):
    # The judge failed, so the code was pasted into LeetCode's page and the feed
    # found the AC: the recording made so far still belongs to the solve.
    sid = _start(client)
    started = client.store.get_session(sid)["started_at"]
    client.get(f"/api/editor/state?session_id={sid}")
    client.post("/api/editor/log", json={"session_id": sid, "seq": 1, "events": [
        {"t": 40_000, "k": "d", **recording.diff(STARTER, RIGHT)}]})
    _feed(client, monkeypatch, 21, started + 120)
    [aid] = client.post("/api/poll").json()["new_attempts"]
    attempt = client.store.get_attempt(aid)
    assert attempt["recording_id"] == sid and attempt["finished_on"] == "leetcode"
    assert attempt["recording"]["edits"] == 1 and attempt["code"] == RIGHT


def test_a_leetcode_run_has_no_recording_to_link(client, monkeypatch):
    sid = client.post("/api/session/start", json={"slug": "two-sum"}).json()["session_id"]
    _feed(client, monkeypatch, 22, client.store.get_session(sid)["started_at"] + 60)
    [aid] = client.post("/api/poll").json()["new_attempts"]
    assert "recording_id" not in client.store.get_attempt(aid)


def _accepted(client, monkeypatch, sub_id=12, pct=40.0):
    sid = _start(client)
    started = client.store.get_session(sid)["started_at"]
    client.get(f"/api/editor/state?session_id={sid}")
    _submits(monkeypatch, [{"status": "Accepted", "accepted": True, "submission_id": sub_id,
                            "finished_at": started + 60, "runtime_percentile": pct,
                            "memory_percentile": 10.0}])
    done = client.post("/api/editor/submit", json={"session_id": sid, "code": WRONG, "t": 60_000}).json()
    return done["attempt_id"], started


FAST = STARTER + "return sorted(range(2))\n"


def test_keep_optimizing_folds_a_better_accepted_into_the_same_solve(client, monkeypatch):
    aid, started = _accepted(client, monkeypatch)
    r = client.post("/api/editor/optimize", json={"attempt_id": aid}).json()["active"]
    assert (r["kind"], r["optimizes"], r["surface"], r["par_sec"]) == ("optimize", aid, "editor", None)
    sid = r["session_id"]
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["code"] == WRONG and state["starter_code"] == WRONG
    assert state["optimizing"] == {"runtime_percentile": 40.0, "memory_percentile": 10.0}

    _submits(monkeypatch, [
        {"status": "Time Limit Exceeded", "accepted": False, "submission_id": 13,
         "finished_at": started + 200},
        {"status": "Accepted", "accepted": True, "submission_id": 14, "finished_at": started + 300,
         "runtime_percentile": 91.0, "memory_percentile": 55.0}])
    body = {"session_id": sid, "code": FAST, "t": 1000}
    client.post("/api/editor/submit", json=body)
    done = client.post("/api/editor/submit", json=body).json()
    assert done["attempt_id"] == aid
    assert any(p["id"] == aid for p in done["pending"])
    a = client.store.get_attempt(aid)
    assert (a["code"], a["submission_id"], a["runtime_percentile"]) == (FAST, 14, 91.0)
    assert a["before_optimize"] == {"runtime_percentile": 40.0, "memory_percentile": 10.0}
    assert a["optimize_recording_ids"] == [sid] and a["resubmissions"] == 1
    assert a["first_ac_time_taken_sec"] == 60 and a["solution_grade"] is None
    assert len(client.store.attempts) == 1
    assert client.store.get_session(sid)["status"] == "completed"

    # The feed catching up with both ACs adds nothing.
    _feed(client, monkeypatch, 14, started + 300)
    assert client.post("/api/poll").json()["new_attempts"] == []
    assert len(client.store.attempts) == 1


def test_an_optimize_run_finished_on_leetcode_still_improves_the_solve(client, monkeypatch):
    aid, started = _accepted(client, monkeypatch)
    sid = client.post("/api/editor/optimize", json={"attempt_id": aid}).json()["active"]["session_id"]
    _feed(client, monkeypatch, 15, client.store.get_session(sid)["started_at"] + 30, code=FAST)
    assert client.post("/api/poll").json()["new_attempts"] == [aid]
    a = client.store.get_attempt(aid)
    assert (a["submission_id"], a["code"], a["optimize_recording_ids"]) == (15, FAST, [sid])
    assert len(client.store.attempts) == 1
    assert client.store.get_session(sid)["status"] == "completed"


def test_an_optimize_run_carries_the_solves_clock_on(client, monkeypatch):
    aid, _ = _accepted(client, monkeypatch)
    r = client.post("/api/editor/optimize", json={"attempt_id": aid}).json()["active"]
    assert r["elapsed_sec"] >= 60  # the solve took 60s: the clock picks up there
    sid = r["session_id"]
    client.get(f"/api/editor/state?session_id={sid}")
    start = client.store.get_session(sid)["started_at"]
    client.store.update_session(sid, {"paused_sec": 100})  # off the clock
    _submits(monkeypatch, [{"status": "Accepted", "accepted": True, "submission_id": 16,
                            "finished_at": start + 400, "runtime_percentile": 91.0}])
    client.post("/api/editor/submit", json={"session_id": sid, "code": FAST, "t": 1000})
    a = client.store.get_attempt(aid)
    assert (a["time_taken_sec"], a["first_ac_time_taken_sec"]) == (60 + 300, 60)


def test_a_rated_solve_is_not_reopened_for_optimizing(client, monkeypatch):
    aid, _ = _accepted(client, monkeypatch)
    client.store.update_attempt(aid, {"confidence": 3})
    assert client.post("/api/editor/optimize", json={"attempt_id": aid}).status_code == 409
    assert client.post("/api/editor/optimize", json={"attempt_id": "nope"}).status_code == 404


def test_a_re_solve_reads_against_the_solve_before_it(client):
    add = client.store.add_attempt
    add({"slug": "two-sum", "solved_at": 10, "code": "old", "kind": "recall", "source": "recall"})
    first = add({"slug": "two-sum", "solved_at": 100, "code": WRONG, "time_taken_sec": 900,
                 "wrong_before_ac": 2})
    again = add({"slug": "two-sum", "solved_at": 200, "code": RIGHT, "time_taken_sec": 400,
                 "wrong_before_ac": 0, "kind": "review"})
    same = add({"slug": "two-sum", "solved_at": 300, "code": RIGHT, "time_taken_sec": 300})
    assert client.get(f"/api/attempt/{first}").json()["previous_solve"] is None
    p = client.get(f"/api/attempt/{again}").json()["previous_solve"]
    assert (p["solved_at"], p["time_taken_sec"], p["wrong_before_ac"]) == (100, 900, 2)
    assert "-        return [0, 0]" in p["diff"] and "+        return [0, 1]" in p["diff"]
    p = client.get(f"/api/attempt/{same}").json()["previous_solve"]
    assert p["same_code"] is True and p["diff"] is None


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


def test_mock_runs_can_use_the_editor_and_older_clients_stay_on_leetcode(client):
    r = client.post("/api/session/start", json={"slug": "two-sum", "kind": "mock",
                                                "surface": "editor"}).json()
    assert r["active"]["surface"] == "editor"
    r = client.post("/api/session/start", json={"slug": "two-sum", "kind": "mock"}).json()
    assert r["active"]["surface"] == "leetcode"


def test_interview_mode_caps_runs_and_rides_along_to_the_solve(client, monkeypatch):
    async def run_code(slug, qid, code, data_input, auth):
        return {"status": "Accepted", "passed": True, "correct": 1, "total": 1,
                "cases": [], "error": None}
    monkeypatch.setattr(main.leetcode, "run_code", run_code)
    monkeypatch.setattr(main.config, "INTERVIEW_RUN_LIMIT", 2)
    r = client.post("/api/session/start", json={"slug": "two-sum", "surface": "editor",
                                                "interview": True}).json()
    sid = r["session_id"]
    assert r["active"]["interview"] is True
    state = client.get(f"/api/editor/state?session_id={sid}").json()
    assert state["interview"] and state["runs_left"] == 2
    body = {"session_id": sid, "code": STARTER, "t": 5}
    assert client.post("/api/editor/run", json=body).json()["runs_left"] == 1
    assert client.post("/api/editor/run", json=body).json()["runs_left"] == 0
    third = client.post("/api/editor/run", json=body).json()
    assert third["ok"] is False and "no Runs left" in third["error"]
    assert [e["k"] for e in _events(client, sid)] == ["c", "run", "run"]

    started = client.store.get_session(sid)["started_at"]
    _submits(monkeypatch, [{"status": "Accepted", "accepted": True, "submission_id": 30,
                            "finished_at": started + 60}])
    done = client.post("/api/editor/submit", json={"session_id": sid, "code": RIGHT, "t": 60_000}).json()
    assert client.store.get_attempt(done["attempt_id"])["interview"] is True


def test_mocks_in_the_editor_are_interview_mode_and_leetcode_runs_never_are(client):
    mock = client.post("/api/session/start", json={"slug": "two-sum", "kind": "mock",
                                                   "surface": "editor"}).json()
    assert mock["active"]["interview"] is True
    plain = client.post("/api/session/start", json={"slug": "two-sum", "interview": True}).json()
    assert plain["active"]["interview"] is False
    sid = _start(client)
    assert client.get(f"/api/editor/state?session_id={sid}").json()["runs_left"] is None


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


# ---- live hints + giving up -----------------------------------------------------
def _coach(monkeypatch, replies):
    """An LLM that answers the tasks in `replies` and records what they were asked;
    anything else (the start's background prep) gets nothing."""
    asked = []

    async def extract(task, payload, settings=None):
        if task not in replies:
            return None
        asked.append((task, payload))
        return replies[task]
    monkeypatch.setattr(main.llm, "enabled", lambda settings=None: True)
    monkeypatch.setattr(main.llm, "extract", extract)
    return asked


def test_a_live_hint_reads_the_code_on_screen_and_points_at_its_lines(client, monkeypatch):
    asked = _coach(monkeypatch, {"live_hint": {
        "hint": "What does index 0 hold?", "marks": ["3: is this always right?", "9: nope"]}})
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    r = client.post("/api/session/hint", json={"code": WRONG}).json()
    assert r["hint"] == "What does index 0 hold?" and r["level"] == 1 and r["available"]
    assert r["marks"] == [{"line": 3, "text": "        return [0, 0]", "note": "is this always right?"}]
    task, payload = asked[0]
    assert task == "live_hint" and "  3 |         return [0, 0]" in payload["code"]
    assert payload["statement"] == "Two Sum" and payload["previous"] == []

    client.post("/api/session/hint", json={"code": WRONG})
    assert asked[1][1]["previous"] == ["What does index 0 hold?"]
    active = client.get("/api/session/active").json()["active"]
    assert active["hint_level"] == 2 and active["hints"] == ["What does index 0 hold?"] * 2
    assert active["hints_available"] is True  # live hints don't run out
    hints = [e for e in _events(client, sid) if e["k"] == "hint"]
    assert [(e["level"], e["text"]) for e in hints] == [(1, "What does index 0 hold?"), (2, "What does index 0 hold?")]


def test_with_only_the_starter_or_a_failed_call_it_falls_back_to_the_ladder(client, monkeypatch):
    asked = _coach(monkeypatch, {"live_hint": None})
    client.store.upsert_problem({"slug": "two-sum", "hint_ladder": ["one", "two"]})
    sid = _start(client)
    client.get(f"/api/editor/state?session_id={sid}")
    assert client.post("/api/session/hint", json={"code": STARTER}).json()["hint"] == "one"
    assert asked == []  # nothing written yet: no call
    assert client.post("/api/session/hint", json={"code": WRONG}).json()["hint"] == "two"
    assert [t for t, _ in asked] == ["live_hint"]
    # The ladder is spent, but the next live hint may still land.
    assert client.get("/api/session/active").json()["active"]["hints_available"] is True


def test_on_leetcodes_page_hints_are_the_ladder_and_run_out(client):
    client.store.upsert_problem({"slug": "two-sum", "hint_ladder": ["one"]})
    client.post("/api/session/start", json={"slug": "two-sum"})
    r = client.post("/api/session/hint").json()
    assert (r["hint"], r["marks"], r["available"]) == ("one", [], False)
    assert client.post("/api/session/hint").json()["hint"] is None
    assert client.get("/api/session/active").json()["active"]["hints_available"] is False


def test_a_run_from_before_live_hints_keeps_its_rungs(client):
    client.store.upsert_problem({"slug": "two-sum", "hint_ladder": ["one", "two", "three"]})
    sid = client.post("/api/session/start", json={"slug": "two-sum"}).json()["session_id"]
    client.store.update_session(sid, {"hint_level": 2})  # no hint_log: the old shape
    assert client.get("/api/session/active").json()["active"]["hints"] == ["one", "two"]
    assert client.post("/api/session/hint").json()["hint"] == "three"
    assert client.get("/api/session/active").json()["active"]["hints"] == ["one", "two", "three"]


def test_mocks_and_optimize_runs_get_no_hints_or_giving_up(client):
    client.store.upsert_problem({"slug": "two-sum", "hint_ladder": ["one"]})
    client.post("/api/session/start", json={"slug": "two-sum", "kind": "mock"})
    active = client.get("/api/session/active").json()["active"]
    assert active["hints_available"] is False and active["give_up_available"] is False
    assert client.post("/api/session/hint").status_code == 400
    assert client.post("/api/session/give-up").status_code == 400


def test_giving_up_explains_once_and_marks_the_solve(client, monkeypatch):
    asked = _coach(monkeypatch, {"give_up": {"approach": "Keep a map of what you've seen."}})
    sid = _start(client)
    assert client.get("/api/session/active").json()["active"]["give_up_available"] is True
    client.get(f"/api/editor/state?session_id={sid}")
    assert client.post("/api/session/give-up", json={"code": WRONG}).json() == {
        "text": "Keep a map of what you've seen."}
    assert asked[0][1]["code"] == WRONG
    client.post("/api/session/give-up", json={"code": WRONG})
    assert len(asked) == 1  # asked once per run
    assert client.get("/api/session/active").json()["active"]["give_up"] == "Keep a map of what you've seen."
    assert [e["k"] for e in _events(client, sid)][-1] == "giveup"

    started = client.store.get_session(sid)["started_at"]
    _submits(monkeypatch, [{"status": "Accepted", "accepted": True, "submission_id": 12,
                            "finished_at": started + 300, "correct": 65, "total": 65}])
    done = client.post("/api/editor/submit", json={
        "session_id": sid, "code": RIGHT, "t": 300_000, "seq": 1,
        "events": [{"t": 290_000, "k": "d", **recording.diff(STARTER, RIGHT)}]}).json()
    assert client.store.get_attempt(done["attempt_id"])["gave_up"] is True


def test_giving_up_without_an_llm_uses_the_cached_summary(client):
    client.store.upsert_problem({"slug": "two-sum", "canonical_summary": {
        "key_ideas": ["Hash the complements"], "time": "O(n)", "space": "O(n)"}})
    client.post("/api/session/start", json={"slug": "two-sum"})
    assert client.post("/api/session/give-up").json()["text"] == \
        "Hash the complements. That's O(n) time and O(n) space."
