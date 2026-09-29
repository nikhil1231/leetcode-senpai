from server import recording as rec


def ev(t, k, **kw):
    return {"t": t, "k": k, **kw}


def test_diff_round_trips_and_ignores_no_ops():
    cases = [("", "abc"), ("abc", ""), ("hello world", "hello brave world"),
             ("aaa", "aa"), ("for i in x:\n    pass", "for i in y:\n    pass\n"),
             ("x = 1\ny = 2\n", "x = 10\ny = 20\n")]
    for prev, new in cases:
        assert rec.apply_delta(prev, rec.diff(prev, new)) == new
    assert rec.diff("same", "same") is None


def test_diff_is_minimal_for_a_local_edit():
    assert rec.diff("return None", "return []") == {"f": 7, "to": 11, "s": "[]"}


def test_reconstruct_replays_deltas_between_checkpoints():
    events = [ev(0, "c", code="a"), ev(10_000, "d", f=1, to=1, s="b"),
              ev(20_000, "run", code="ab", result={"passed": True}),
              ev(30_000, "d", f=2, to=2, s="c")]
    states, mismatches = rec.reconstruct(events)
    assert mismatches == 0
    assert [code for _, code in states] == ["a", "ab", "ab", "abc"]
    assert rec.code_at(events, 25_000) == "ab"
    assert rec.code_at(events, 35_000) == "abc"


def test_a_lost_delta_is_caught_at_the_next_checkpoint_and_the_chain_resyncs():
    events = [ev(0, "c", code="a"),
              # the delta that would have made "ab" never arrived
              ev(20_000, "sub", code="ab", result={"status": "Wrong Answer"}),
              ev(30_000, "d", f=2, to=2, s="c")]
    states, mismatches = rec.reconstruct(events)
    assert mismatches == 1
    assert states[-1][1] == "abc"
    assert rec.summary(events)["chain_ok"] is False


def test_a_delta_that_cannot_apply_is_counted_not_fatal():
    events = [ev(0, "c", code="a"), ev(1, "d", f=5, to=9, s="x"), ev(2, "d", f=1, to=1, s="b")]
    states, mismatches = rec.reconstruct(events)
    assert mismatches == 1 and states[-1][1] == "ab"


def test_summary_numbers():
    events = [ev(0, "c", code=""), ev(30_000, "d", f=0, to=0, s="x"),
              ev(40_000, "blur"), ev(100_000, "focus"),
              ev(200_000, "run", code="x", result={"passed": False}),
              ev(210_000, "pause"), ev(900_000, "resume"),
              ev(910_000, "sub", code="x", result={"status": "Wrong Answer"}),
              ev(920_000, "d", f=1, to=1, s="y"),
              ev(930_000, "sub", code="xy", result={"status": "Accepted"})]
    s = rec.summary(events)
    assert s["first_edit_ms"] == 30_000
    assert s["first_run_ms"] == 200_000
    assert s["first_submit_ms"] == 910_000
    assert (s["runs"], s["runs_failed"], s["submits"], s["failed_submits"]) == (1, 1, 2, 1)
    assert s["edits"] == 2
    # 30s -> 200s is the one stall; the paused stretch is not idling.
    assert s["idle_ms"] == 170_000 and s["longest_idle_ms"] == 170_000
    assert s["away_ms"] == 60_000
    assert s["paused_ms"] == 690_000
    assert s["duration_ms"] == 930_000
    assert s["chain_ok"] is True


def test_failed_tests_matches_the_poller_shape_newest_first():
    events = [ev(1, "sub", code="a", result={"status": "Wrong Answer", "input": "[1]",
                                               "expected": "1", "output": "0"}),
              ev(2, "sub", code="b", result={"status": "Runtime Error", "input": "[]",
                                               "error": "IndexError"}),
              ev(3, "sub", code="c", result={"status": "Accepted"})]
    assert rec.failed_tests(events) == [
        {"status": "Runtime Error", "input": "[]", "expected": "", "output": "IndexError"},
        {"status": "Wrong Answer", "input": "[1]", "expected": "1", "output": "0"},
    ]


def test_client_events_are_validated():
    assert rec.clean_client_event({"t": 5, "k": "d", "f": 0, "to": 1, "s": "x"}) == \
        {"t": 5, "k": "d", "f": 0, "to": 1, "s": "x"}
    assert rec.clean_client_event({"t": 5, "k": "run", "code": "x"}) is None  # server-only
    assert rec.clean_client_event({"t": 5, "k": "d", "f": 3, "to": 1, "s": "x"}) is None
    assert rec.clean_client_event({"t": "soon", "k": "blur"}) is None
    assert rec.clean_client_event({"t": -4, "k": "blur"}) == {"t": 0, "k": "blur"}


def test_log_text_round_trips_and_skips_garbage():
    events = [ev(0, "c", code="a\nb"), ev(1, "d", f=0, to=0, s="\"q\"")]
    text = rec.dump(events) + "{not json\n"
    assert rec.parse(text) == events


def test_compact_run_keeps_the_first_wrong_case():
    out = rec.compact_run({"status": "Accepted", "passed": False, "correct": 1, "total": 2,
                           "cases": [{"input": "a", "output": "1", "expected": "1", "stdout": ""},
                                     {"input": "b", "output": "2", "expected": "3", "stdout": "dbg"}]})
    assert out["wrong"] == {"input": "b", "output": "2", "expected": "3"}
    assert out["printed"] is True and out["passed"] is False
