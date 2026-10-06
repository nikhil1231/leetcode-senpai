"""The LLM review of how a recorded solve went: runs only when there's a
recording, is versioned like plan grading, and is picked up by the sweep."""
from server import enrich, recording
from tests.fake_store import FakeStore

CODE = "class Solution:\n    pass\n"


def _store(rated=True):
    store = FakeStore()
    store.upsert_problem({"slug": "two-sum", "title": "Two Sum", "difficulty": "Easy",
                          "neetcode_category": "Arrays & Hashing"})
    store.save_recording("sess1", {"events": recording.dump([
        {"t": 0, "k": "c", "code": CODE},
        {"t": 60_000, "k": "sub", "code": CODE, "result": {"status": "Wrong Answer", "input": "[]"}},
        {"t": 90_000, "k": "sub", "code": CODE, "result": {"status": "Accepted"}}])})
    recorded = store.add_attempt({"slug": "two-sum", "solved_at": 100, "code": CODE, "lang": "python3",
                                  "recording_id": "sess1", "planned_edge_cases": ["empty"],
                                  "confidence": 2 if rated else None})
    plain = store.add_attempt({"slug": "two-sum", "solved_at": 50, "code": CODE, "confidence": 3})
    return store, recorded, plain


def _llm(monkeypatch, result=None, err=None):
    seen = []

    async def extract_or_error(task, payload, settings=None):
        seen.append((task, payload))
        return result, err

    async def canonical(store, slug):
        return {"key_ideas": ["hash complements"]}

    async def extract(task, payload, settings=None):  # the rest of enrichment
        return None
    monkeypatch.setattr(enrich.llm, "enabled", lambda *a, **k: True)
    monkeypatch.setattr(enrich.llm, "extract", extract)
    monkeypatch.setattr(enrich.llm, "extract_or_error", extract_or_error)
    monkeypatch.setattr(enrich.coach, "ensure_canonical", canonical)
    return seen


REVIEW = {"stuck_points": ["01:00 — edge case"], "fixes": ["empty input -> guard"],
          "missed_edge_cases": ["empty array"], "testing_habit": "never ran custom cases",
          "takeaway": "Test the empty case before submitting."}


async def test_a_recorded_solve_gets_a_review_built_from_its_timeline(monkeypatch):
    store, recorded, _ = _store()
    seen = _llm(monkeypatch, REVIEW)
    doc, err = await enrich.review_process(store, recorded)
    assert err is None
    assert doc["process_review"]["takeaway"] == "Test the empty case before submitting."
    assert doc["process_prompt_version"] == enrich.PROCESS_PROMPT_VERSION
    task, payload = seen[0]
    assert task == "review_process"
    assert "submit: Wrong Answer" in payload["timeline"]
    assert payload["planned_edge_cases"] == ["empty"]
    assert payload["canonical"] == "hash complements"


async def test_a_solve_finished_on_leetcode_says_where_the_log_stops(monkeypatch):
    store, recorded, _ = _store()
    store.update_attempt(recorded, {"finished_on": "leetcode", "time_taken_sec": 150})
    seen = _llm(monkeypatch, REVIEW)
    await enrich.review_process(store, recorded)
    assert "[02:30] accepted on LeetCode's own site" in seen[0][1]["timeline"]


async def test_the_timeline_opens_with_the_solve_against_interview_pace(monkeypatch):
    store, recorded, _ = _store()
    store.update_attempt(recorded, {"time_taken_sec": 20 * 60})
    seen = _llm(monkeypatch, REVIEW)
    await enrich.review_process(store, recorded)
    assert seen[0][1]["timeline"].startswith(
        "Interview pace for Easy is 15m; this solve took 20:00 of clock time (over pace).")


async def test_the_pace_line_counts_planning_and_says_how_much(monkeypatch):
    store, recorded, _ = _store()
    store.update_attempt(recorded, {"time_taken_sec": 12 * 60, "plan_status": "planned",
                                    "plan_time_sec": 5 * 60})
    seen = _llm(monkeypatch, REVIEW)
    await enrich.review_process(store, recorded)
    assert seen[0][1]["timeline"].startswith(
        "Interview pace for Easy is 15m; this solve took 17:00 of clock time "
        "(05:00 planning, then the coding below) (over pace).")


async def test_an_interview_mode_solve_is_read_as_one(monkeypatch):
    store, recorded, _ = _store()
    store.update_attempt(recorded, {"interview": True})
    seen = _llm(monkeypatch, REVIEW)
    await enrich.review_process(store, recorded)
    assert seen[0][1]["timeline"].startswith("Solved in interview mode")


async def test_nothing_happens_without_a_recording_or_an_llm(monkeypatch):
    store, recorded, plain = _store()
    seen = _llm(monkeypatch, REVIEW)
    assert await enrich.review_process(store, plain) == (None, None)
    assert seen == []
    monkeypatch.setattr(enrich.llm, "enabled", lambda *a, **k: False)
    assert await enrich.review_process(store, recorded) == (None, None)
    assert store.get_enrichment(recorded) is None


async def test_a_failed_review_is_stamped_so_the_sweep_does_not_resend_it(monkeypatch):
    store, recorded, _ = _store()
    _llm(monkeypatch, None, "model timed out")
    doc, err = await enrich.review_process(store, recorded)
    assert err == "model timed out"
    assert doc["process_review_error"] == "model timed out"
    assert enrich.needs_process_review(store) == []


async def test_sweep_reviews_rated_recorded_solves_and_full_enrichment_keeps_it(monkeypatch):
    store, recorded, _ = _store()
    _llm(monkeypatch, REVIEW)
    assert enrich.needs_process_review(store) == [recorded]
    await enrich.sweep(store)
    assert store.get_enrichment(recorded)["process_review"]["fixes"] == ["empty input -> guard"]
    assert enrich.needs_process_review(store) == []
    await enrich.enrich_attempt(store, recorded)
    assert store.get_enrichment(recorded)["process_review"]["takeaway"]


def test_an_unrated_solve_waits_for_its_rating(monkeypatch):
    store, recorded, _ = _store(rated=False)
    assert enrich.needs_process_review(store) == []
