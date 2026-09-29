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


def test_advancing_in_pieces_matches_a_full_replay():
    events = [ev(0, "c", code="a"), ev(1, "d", f=1, to=1, s="b"),
              ev(2, "sub", code="ab", result={}), ev(3, "d", f=9, to=9, s="x"),
              ev(4, "d", f=2, to=2, s="c"), ev(5, "run", code="abX", result={}),
              ev(6, "d", f=0, to=1, s="")]
    states, mismatches = rec.reconstruct(events)
    for cut in range(len(events) + 1):
        code, m1 = rec.advance(None, events[:cut])
        code, m2 = rec.advance(code, events[cut:])
        assert (code, m1 + m2) == (states[-1][1], mismatches)


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


# ---- timeline_for_llm ---------------------------------------------------------------
S = "class Solution:\n    def f(self, nums):\n        "
W = S + "return [0, 0]\n"
R = S + "for i in range(len(nums)):\n            pass\n        return [0, 1]\n"


def _solve():
    return [ev(0, "c", code=S), ev(30_000, "d", **rec.diff(S, W)),
            ev(40_000, "blur"), ev(100_000, "focus"),
            ev(200_000, "run", code=W, result={"passed": False, "correct": 1, "total": 2,
                                               "wrong": {"input": "[3,2,4]\n6", "expected": "[1,2]",
                                                         "output": "[0,0]"}, "printed": True}),
            ev(260_000, "sub", code=W, result={"status": "Wrong Answer", "correct": 62, "total": 65,
                                               "input": "[3,3]\n6", "expected": "[0,1]", "output": "[0,0]"}),
            ev(280_000, "hint", level=1),
            ev(300_000, "d", **rec.diff(W, R)),
            ev(330_000, "sub", code=R, result={"status": "Accepted", "correct": 65, "total": 65})]


def test_timeline_reads_in_order_with_the_fix_after_the_failed_submit():
    text = rec.timeline_for_llm(_solve())
    lines = text.splitlines()
    assert lines[0].startswith("Solve lasted 5m30s. First edit 00:30, first run 03:20")
    stamps = [line[1:6] for line in lines if line.startswith("[")]
    assert stamps == sorted(stamps)
    assert "[00:30] no edits or runs for 2m50s" in text
    assert "[00:40] away from the tab 1m00s" in text
    assert "run: 1/2 cases matched — input [3,2,4] 6, expected [1,2], got [0,0] (printed debug output)" in text
    wa = lines.index(next(line for line in lines if "Wrong Answer" in line))
    assert "failing input [3,3] 6" in lines[wa]
    assert lines[wa + 1] == "  what changed before the next judging:"
    assert "    -        return [0, 0]" in lines
    assert "    +        return [0, 1]" in lines
    assert "[04:40] revealed hint 1" in text
    # The fix went straight to Submit without a Run of that exact code.
    assert text.rstrip().endswith(
        "[05:30] submit: Accepted (65/65 tests) (this exact code was never run first)")
    assert rec.summary(_solve())["submits_unrun"] == 1


def test_ticked_edge_cases_are_tracked_and_read_in_the_timeline():
    events = [ev(0, "c", code="x"), ev(1_000, "edge", case="empty", on=True),
              ev(2_000, "edge", case="dupes", on=True), ev(3_000, "edge", case="empty", on=False),
              ev(4_000, "run", code="x", result={"passed": True, "correct": 1, "total": 1}),
              ev(5_000, "sub", code="x", result={"status": "Accepted"})]
    assert rec.edges_checked(events) == ["dupes"]
    assert rec.edges_checked(events[3:], ["empty"]) == []
    text = rec.timeline_for_llm(events)
    assert '[00:02] ticked planned edge case "dupes" as tested' in text
    assert "never run" not in text and rec.summary(events)["submits_unrun"] == 0
    assert rec.clean_client_event({"t": 1, "k": "edge", "case": "  ", "on": True}) is None
    assert rec.clean_client_event({"t": 1, "k": "edge", "case": "a" * 200, "on": 1}) == {
        "t": 1, "k": "edge", "case": "a" * 80, "on": True}


def test_timeline_names_big_rewrites_and_lost_logs():
    long = S + "".join(f"x{i} = {i}\n        " for i in range(8))
    events = [ev(0, "c", code=long), ev(5_000, "d", **rec.diff(long, S + "pass\n")),
              ev(9_000, "sub", code="something else", result={"status": "Accepted"})]
    text = rec.timeline_for_llm(events)
    assert "[00:05] rewrote L3-11 (8 lines replaced)" in text
    assert "Part of the edit log was lost" in text


def test_timeline_drops_oldest_diffs_to_fit():
    events, code = [ev(0, "c", code="")], ""
    for i in range(6):
        new = code + "".join(f"line_{i}_{j} = {j}\n" for j in range(40))
        events.append(ev(i * 60_000 + 1, "sub", code=code,
                         result={"status": "Wrong Answer", "input": "x"}))
        code = new
    events.append(ev(999_000, "sub", code=code, result={"status": "Accepted"}))
    full = rec.timeline_for_llm(events, max_chars=10**6)
    capped = rec.timeline_for_llm(events, max_chars=6_000)
    assert len(capped) <= 6_000 < len(full)
    assert capped.count("(diff omitted for length)") >= 1
    assert "line_5_39" in capped  # the last fix survives


def test_a_reset_reads_as_a_restart():
    events = [ev(0, "c", code="start"), ev(1_000, "d", f=5, to=5, s=" more"),
              ev(2_000, "reset"), ev(2_000, "c", code="start")]
    assert rec.clean_client_event({"t": 2_000, "k": "reset"}) == {"t": 2_000, "k": "reset"}
    assert "[00:02] reset the code to the starter" in rec.timeline_for_llm(events)
    assert rec.summary(events)["chain_ok"] is True
