"""Graders of the learner's own words read dictation slips ('deck' for deque) charitably."""
import asyncio

from server import config, llm, system_design_coach, system_design_tutor
from server.tracks import coach as tracks_coach

WORDS_TASKS = ("grade_recall", "recall_hint", "clarify_recall", "grade_plan", "grade_prediction",
               "critique_plan", "grade_followup", "live_hint", "optimize_hint")


def test_llm_tasks_that_read_learner_words_carry_the_note():
    for name in WORDS_TASKS:
        assert llm.TASKS[name].system.endswith(llm.SPOKEN_ANSWER), name
    assert "deque" in llm.SPOKEN_ANSWER and "Dijkstra" in llm.SPOKEN_ANSWER


def test_free_text_graders_outside_the_registry_carry_the_note(monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "k")
    systems = []

    def capture(provider, model, system, prompt, schema, options=None):
        systems.append(system)
        return None
    monkeypatch.setattr(llm, "_raw_generate", capture)
    block = {"prompt": "q", "points": ["p"], "model": "m", "ask": "q", "say": "s", "strong": "s", "weak": "w"}
    asyncio.run(system_design_coach.grade_recall(block, "a monotonic deck"))
    asyncio.run(system_design_coach.examiner_report([{"n": 1, "marks": 0, "max": 2}]))
    asyncio.run(system_design_tutor.grade_pitch(block, "a monotonic deck"))
    asyncio.run(tracks_coach.drill_feedback("q", "notes", "answer", [("role", "Role")]))
    assert len(systems) == 4
    assert all(s.endswith(llm.SPOKEN_ANSWER) for s in systems)
