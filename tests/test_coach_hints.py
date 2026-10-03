"""Live hints and giving up: the pure helpers that shape what the model sees and
what comes back. No I/O."""
from server import coach, recording

CODE = "class Solution:\n    def f(self, s):\n\n        seen = set()\n        return 0"


def test_the_starter_code_is_untouched_whatever_the_whitespace():
    starter = "class Solution:\n    def f(self, s):\n        "
    assert coach.untouched("class Solution:\n    def f(self, s):\n", starter)
    assert coach.untouched(None, "")
    assert not coach.untouched(starter + "return 1", starter)


def test_code_is_numbered_from_one_for_the_model_to_point_at():
    assert coach.numbered("a\nb").splitlines() == ["  1 | a", "  2 | b"]


def test_marks_keep_only_real_nonblank_lines_with_their_text():
    marks = coach.parse_marks([
        "4: what if it's already there?",
        "line 5 - check this",
        "3: a blank line",          # blank: nothing to point at
        "99: out of range",
        "4: a second mark on line 4",
        "no line number",
    ], CODE)
    assert marks == [
        {"line": 4, "text": "        seen = set()", "note": "what if it's already there?"},
        {"line": 5, "text": "        return 0", "note": "check this"},
    ]


def test_at_most_two_marks():
    assert len(coach.parse_marks(["1: a", "2: b", "4: c"], CODE)) == 2
    assert coach.parse_marks(None, CODE) == []


def test_a_statement_reads_as_plain_text():
    html = "<p>Given <code>s</code> &amp; <strong>k</strong>.</p><ul><li>1 &lt;= n &lt;= 10<sup>4</sup></li></ul>"
    assert coach.statement_text(html) == "Given s & k.\n1 <= n <= 10^4"
    assert coach.statement_text("<p>" + "x" * 50 + "</p>", limit=10) == "x" * 10 + "…"


def test_giving_up_without_an_llm_explains_from_cached_content():
    assert coach.give_up_fallback({"canonical_summary": {
        "key_ideas": ["Slide a window", "Shrink on a repeat."], "time": "O(n)", "space": "O(k)"}}) \
        == ["Slide a window.", "Shrink on a repeat. That's O(n) time and O(k) space."]
    assert coach.give_up_fallback({"hint_ladder": ["one.", "two."]}) == ["one.", "two."]
    assert coach.give_up_fallback({}) is None


def test_the_last_judging_is_described_for_the_hint():
    assert recording.last_judged([{"t": 0, "k": "c", "code": ""}]) is None
    events = [{"t": 1, "k": "run", "code": "", "result": {"correct": 1, "total": 2}},
              {"t": 2, "k": "hint", "level": 1},
              {"t": 3, "k": "sub", "code": "", "result": {"status": "Accepted", "correct": 3, "total": 3}}]
    assert recording.last_judged(events) == "submit: Accepted (3/3 tests)"


def test_the_review_sees_what_each_hint_said_and_that_you_gave_up():
    events = [{"t": 0, "k": "c", "code": "x"},
              {"t": 60_000, "k": "hint", "level": 1, "text": "Trace it on 'abba'."},
              {"t": 120_000, "k": "hint", "level": 2},
              {"t": 180_000, "k": "giveup"},
              {"t": 240_000, "k": "giveup", "step": 2, "text": "Shrink on a repeat."}]
    text = recording.timeline_for_llm(events)
    assert "asked for a hint: \"Trace it on 'abba'.\"" in text
    assert "revealed hint 2" in text
    assert "gave up and heard the approach explained" in text
    assert "walked to step 2: \"Shrink on a repeat.\"" in text
