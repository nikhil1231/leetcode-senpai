"""Light-practice ordering: pure, no I/O."""
import random

import pytest

from server.practice_queue import DAY, pick, status

NOW = 100 * DAY


def r(template, ago, correct=True, revealed=False):
    return {"template": template, "answered_at": NOW - ago, "correct": correct and not revealed, "revealed": revealed}


def candidates(*names, topic="T"):
    return {n: topic for n in names}


def test_empty_candidates_raise():
    with pytest.raises(ValueError):
        pick({}, [], [], NOW, random.Random(0))


def test_a_single_candidate_repeats_even_if_just_served():
    assert pick(candidates("a"), [], ["a"], NOW, random.Random(0)) == "a"


def test_unseen_exercises_are_served_and_just_served_ones_are_held_back():
    cands = candidates(*"abcdef")
    for seed in range(50):
        assert pick(cands, [], ["a", "b", "c", "d"], NOW, random.Random(seed)) in {"e", "f"}


def test_a_miss_returns_after_a_gap_not_immediately():
    cands = candidates(*"abcdef")
    # Everything else was answered correctly moments ago, so nothing else is due.
    results = [r("a", 60, correct=False)] + [r(t, 60) for t in "bcdef"]
    assert all(pick(cands, results, ["a"], NOW, random.Random(s)) != "a" for s in range(50))
    assert pick(cands, results, ["a", "b", "c", "d", "e"], NOW, random.Random(0)) == "a"


def test_revealing_counts_as_a_miss_and_the_latest_answer_decides():
    results = [r("a", 3 * DAY, correct=False), r("a", 60), r("b", 60, revealed=True)]
    assert status(results) == {"a": "learned", "b": "missed"}


def test_misses_are_preferred_but_interleaved_with_new_material():
    cands = candidates(*"abcdefghij")
    results = [r("a", 3 * DAY, correct=False), r("b", 2 * DAY, correct=False)]
    picks = [pick(cands, results, [], NOW, random.Random(s)) for s in range(400)]
    misses = sum(p in {"a", "b"} for p in picks)
    assert 0.45 < misses / len(picks) < 0.75
    # The oldest miss goes first.
    assert "b" not in picks


def test_correct_answers_return_on_a_widening_interval():
    cands = candidates("a", "b")
    once = [r("a", 1 * DAY + 1), r("b", 1)]
    assert pick(cands, once, [], NOW, random.Random(0)) == "a"  # due after a day
    twice = [r("a", 5 * DAY), r("a", 1 * DAY + 1), r("b", 1)]
    # Two in a row: not due for three days, so the least recently seen comes back.
    assert pick(cands, twice, [], NOW, random.Random(0)) == "a"
    assert pick({"a": "T", "b": "T", "c": "T"}, twice, [], NOW, random.Random(0)) == "c"


def test_everything_recently_learned_serves_the_least_recent():
    cands = candidates("a", "b", "c")
    results = [r("a", 30), r("b", 90), r("c", 60)]
    assert pick(cands, results, [], NOW, random.Random(0)) == "b"


def test_new_questions_lean_toward_topics_with_more_misses():
    cands = {**{f"weak{i}": "Weak" for i in range(6)}, **{f"strong{i}": "Strong" for i in range(6)}}
    # One practiced question per topic, both answered recently: weak was missed
    # before being learned, strong was right every time.
    results = [r("weak0", 5 * DAY, correct=False), r("weak0", 60), r("strong0", 5 * DAY), r("strong0", 60)]
    picks = [pick(cands, results, [], NOW, random.Random(s)) for s in range(2000)]
    weak = sum(p.startswith("weak") for p in picks)
    assert weak / len(picks) > 0.6
