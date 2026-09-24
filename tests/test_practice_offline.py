"""Quickfire keeps working without Firestore, and nothing answered offline is lost."""
import json
import threading

import pytest

from server import config, connectivity, practice_offline
from server.practice_offline import OfflinePractice, merge_remote, settle, view
from tests.fake_store import FakeStore


def result(qid, at, correct=True, **extra):
    return {"question_id": qid, "template": qid.split(":")[1] if ":" in qid else qid, "correct": correct,
            "answered_at": at, **extra}


class Flaky:
    """A FakeStore whose every call fails while `down` is set."""

    def __init__(self):
        self.inner, self.down = FakeStore(), False

    def __getattr__(self, name):
        fn = getattr(self.inner, name)

        def call(*args):
            if self.down:
                raise ConnectionError("no route to host")
            return fn(*args)
        return call


@pytest.fixture
def net(monkeypatch):
    state = {"online": True}
    monkeypatch.setattr(connectivity, "online", lambda: state["online"])
    monkeypatch.setattr(OfflinePractice, "flush_in_background", OfflinePractice.flush)
    return state


@pytest.fixture
def remote():
    return Flaky()


def go_offline(net, remote):
    net["online"], remote.down = False, True


def go_online(net, remote):
    net["online"], remote.down = True, False


# ---- pure rules -----------------------------------------------------------------
def test_merge_takes_server_copies_but_keeps_pending_writes():
    user = {"results": {"v1:a:1": result("v1:a:1", 5), "v1:b:1": result("v1:b:1", 9, correct=False)},
            "pending": {"v1:b:1": "create"}}
    merged = merge_remote(user, [result("v1:a:1", 5, guessed=True), result("v1:c:1", 7)])
    assert merged["results"]["v1:a:1"]["guessed"] is True
    assert merged["pending"] == {"v1:b:1": "create"}
    assert [r["question_id"] for r in view(merged)] == ["v1:b:1", "v1:c:1", "v1:a:1"]


def test_merge_settles_a_pending_create_to_the_first_saved_copy():
    user = {"results": {"v1:a:1": result("v1:a:1", 9, correct=False)}, "pending": {"v1:a:1": "create"}}
    merged = merge_remote(user, [result("v1:a:1", 5)])
    assert merged == {"results": {"v1:a:1": result("v1:a:1", 5)}, "pending": {}}


def test_a_local_guess_outlives_a_server_copy_without_it():
    assert settle(result("q", 1, guessed=True), result("q", 1)) == (result("q", 1, guessed=True), "guess")
    assert settle(result("q", 1, guessed=True), result("q", 1, guessed=True)) == (result("q", 1, guessed=True), None)
    assert settle(None, result("q", 1)) == (result("q", 1), None)


# ---- store ----------------------------------------------------------------------
def test_online_writes_go_straight_to_firestore_and_are_mirrored(net, remote):
    store = OfflinePractice(remote, "u")
    store.save_light_practice("v1:a:1", result("v1:a:1", 1))
    assert remote.inner.light_practice == {"v1:a:1": result("v1:a:1", 1)}
    assert store.sync_status() == {"offline": False, "unsynced": 0}
    go_offline(net, remote)
    assert store.list_light_practice() == [result("v1:a:1", 1)]
    assert store.get_light_practice("v1:a:1") == result("v1:a:1", 1)


def test_offline_answers_are_kept_and_sync_once_back_online(net, remote):
    store = OfflinePractice(remote, "u")
    remote.inner.save_light_practice("v1:old:1", result("v1:old:1", 1, correct=False))
    store.list_light_practice()  # mirror warmed while online
    go_offline(net, remote)
    assert store.save_light_practice("v1:a:1", result("v1:a:1", 2)) == result("v1:a:1", 2)
    # A retry of the same question returns the first answer, as online.
    assert store.save_light_practice("v1:a:1", result("v1:a:1", 3, correct=False)) == result("v1:a:1", 2)
    assert [r["question_id"] for r in store.list_light_practice()] == ["v1:a:1", "v1:old:1"]
    assert store.get_light_practice("v1:a:1") == result("v1:a:1", 2)
    assert store.sync_status() == {"offline": True, "unsynced": 1}
    assert "v1:a:1" not in remote.inner.light_practice

    go_online(net, remote)
    store.list_light_practice()
    assert remote.inner.light_practice["v1:a:1"] == result("v1:a:1", 2)
    assert store.sync_status() == {"offline": False, "unsynced": 0}


def test_offline_guess_marks_replay(net, remote):
    store = OfflinePractice(remote, "u")
    store.save_light_practice("v1:a:1", result("v1:a:1", 1))
    go_offline(net, remote)
    assert store.mark_light_practice_guess("v1:a:1")["guessed"] is True
    store.save_light_practice("v1:b:1", result("v1:b:1", 2))
    store.mark_light_practice_guess("v1:b:1")  # rides along with the pending create
    with pytest.raises(ValueError):
        store.save_light_practice("v1:c:1", result("v1:c:1", 3, correct=False))
        store.mark_light_practice_guess("v1:c:1")
    assert store.sync_status()["unsynced"] == 3

    go_online(net, remote)
    store.flush()
    assert remote.inner.light_practice["v1:a:1"]["guessed"] is True
    assert remote.inner.light_practice["v1:b:1"]["guessed"] is True
    assert store.sync_status()["unsynced"] == 0


def test_the_answer_already_on_the_server_wins_a_replay(net, remote):
    store = OfflinePractice(remote, "u")
    go_offline(net, remote)
    store.save_light_practice("v1:a:1", result("v1:a:1", 2, correct=False))
    remote.inner.save_light_practice("v1:a:1", result("v1:a:1", 1))  # the other machine
    go_online(net, remote)
    store.flush()
    assert store.get_light_practice("v1:a:1") == result("v1:a:1", 1)
    assert store.sync_status()["unsynced"] == 0


def test_a_failed_replay_keeps_everything_pending(net, remote):
    store = OfflinePractice(remote, "u")
    go_offline(net, remote)
    store.save_light_practice("v1:a:1", result("v1:a:1", 1))
    net["online"] = True  # the probe says yes; the call still fails
    store.flush()
    assert store.sync_status()["unsynced"] == 1
    assert json.load(open(config.PRACTICE_OFFLINE_PATH))["users"]["u"]["pending"] == {"v1:a:1": "create"}


def test_a_hanging_firestore_call_falls_back_quickly(net, monkeypatch):
    release = threading.Event()

    class Hanging:
        def list_light_practice(self):
            release.wait(5)
            return []
    monkeypatch.setattr(practice_offline, "REMOTE_TIMEOUT", 0.05)
    tripped = []
    monkeypatch.setattr(connectivity, "mark_offline", lambda: tripped.append(True))
    try:
        assert OfflinePractice(Hanging(), "u").list_light_practice() == []
        assert tripped
    finally:
        release.set()


def test_mirrors_are_per_user(net, remote):
    OfflinePractice(remote, "u").save_light_practice("v1:a:1", result("v1:a:1", 1))
    go_offline(net, remote)
    assert OfflinePractice(remote, "other").list_light_practice() == []


def test_an_unreadable_mirror_is_set_aside_not_overwritten(net, remote, tmp_path):
    with open(config.PRACTICE_OFFLINE_PATH, "w") as fh:
        fh.write("{not json")
    go_offline(net, remote)
    OfflinePractice(remote, "u").save_light_practice("v1:a:1", result("v1:a:1", 1))
    aside = [p for p in tmp_path.iterdir() if ".unreadable-" in p.name]
    assert len(aside) == 1 and aside[0].read_text() == "{not json"


# ---- API ------------------------------------------------------------------------
def test_offline_quickfire_works_end_to_end_and_other_tabs_fail_fast(monkeypatch):
    from fastapi.testclient import TestClient

    from server import auth, main
    remote = Flaky()
    monkeypatch.setattr(main, "get_store", lambda uid: remote)
    monkeypatch.setattr(connectivity, "online", lambda: not remote.down)
    main.app.dependency_overrides[auth.require_user] = lambda: "test"
    try:
        client = TestClient(main.app)
        remote.down = True
        assert client.get("/api/today").status_code == 503
        catalog = client.get("/api/practice").json()
        assert catalog["sync"] == {"offline": True, "unsynced": 0}
        q = client.get("/api/practice/next").json()
        saved = client.post("/api/practice/answer", json={"question_id": q["id"], "reveal": True}).json()
        assert saved["revealed"] is True and saved["sync"] == {"offline": True, "unsynced": 1}
        assert client.get(f"/api/practice/resume/{q['id']}").json()["result"]["answered_at"] == saved["answered_at"]

        remote.down = False
        assert client.get("/api/practice").json()["sync"]["unsynced"] in (0, 1)  # replay runs in background
        _wait_for(lambda: q["id"] in remote.inner.light_practice)
    finally:
        main.app.dependency_overrides.clear()


def _wait_for(check, timeout=2.0):
    import time
    deadline = time.monotonic() + timeout
    while not check():
        assert time.monotonic() < deadline
        time.sleep(0.01)
