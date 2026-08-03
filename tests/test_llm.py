"""LLM core tests — schema validation + graceful degradation, no network."""
import json

import pytest

from server import coach, llm
from tests.fake_store import FakeStore


@pytest.fixture
def enable_llm(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(llm.config, "GEMINI_API_KEY", None)


def test_disabled_without_key(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENAI_API_KEY", None)
    monkeypatch.setattr(llm.config, "GEMINI_API_KEY", None)
    assert llm.enabled() is False


@pytest.mark.asyncio
async def test_extract_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENAI_API_KEY", None)
    monkeypatch.setattr(llm.config, "GEMINI_API_KEY", None)
    out = await llm.extract("classify_mistake", {"note": "x"})
    assert out is None


def test_gemini_settings_can_enable_gemini_key(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENAI_API_KEY", None)
    monkeypatch.setattr(llm.config, "GEMINI_API_KEY", "test-key")
    settings = {"llm_provider": "gemini", "llm_model": "gemini-2.5-flash"}
    assert llm.enabled(settings) is True
    assert llm.current_model(settings)["provider"] == "gemini"


def test_openai_schema_is_strict_and_default_free():
    schema = llm._openai_schema(llm.PredictionResult)

    assert schema["strict"] is True
    body = schema["schema"]
    assert body["required"] == ["verdict", "note"]
    assert body["additionalProperties"] is False
    assert "default" not in json.dumps(body)


@pytest.mark.asyncio
async def test_extract_validates_good_json(enable_llm, monkeypatch):
    payload_json = json.dumps({
        "tags": ["off_by_one", "edge_case"], "phase": "implementation",
        "severity": 2, "summary": "shrank window too early",
    })
    monkeypatch.setattr(llm, "_raw_generate", lambda *a, **k: payload_json)
    out = await llm.extract("classify_mistake", {
        "title": "T", "note": "off by one on the window", "independence": "solo",
    })
    assert out["tags"] == ["off_by_one", "edge_case"]
    assert out["phase"] == "implementation"


@pytest.mark.asyncio
async def test_extract_returns_none_on_bad_json(enable_llm, monkeypatch):
    monkeypatch.setattr(llm, "_raw_generate", lambda *a, **k: "not json{{{")
    out = await llm.extract("classify_mistake", {"note": "x"})
    assert out is None


@pytest.mark.asyncio
async def test_extract_returns_none_on_transport_error(enable_llm, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network")
    monkeypatch.setattr(llm, "_raw_generate", boom)
    out = await llm.extract("grade_recall", {"recall_text": "x"})
    assert out is None


@pytest.mark.asyncio
async def test_unknown_task_returns_none(enable_llm):
    assert await llm.extract("does_not_exist", {}) is None


@pytest.mark.asyncio
async def test_recall_schema_clamps(enable_llm, monkeypatch):
    # grade out of range should fail validation -> None (never a bad card update)
    monkeypatch.setattr(llm, "_raw_generate",
                        lambda *a, **k: json.dumps({"grade": 9}))
    out = await llm.extract("grade_recall", {"recall_text": "x"})
    assert out is None


@pytest.mark.asyncio
async def test_recall_grades_noncanonical_optimal_by_complexity(enable_llm, monkeypatch):
    seen = {}

    def fake_generate(provider, model, system, prompt, schema):
        seen["system"] = system
        seen["prompt"] = prompt
        return json.dumps({
            "grade": 3,
            "optimal": True,
            "analysis": "optimal alternative",
            "positives": ["optimal time and space"],
            "negatives": [],
        })

    monkeypatch.setattr(llm, "_raw_generate", fake_generate)

    out = await llm.extract("grade_recall", {
        "title": "T",
        "canonical": "two pointer sweep",
        "canon_time": "O(n)",
        "canon_space": "O(1)",
        "recall_text": "use prefix extrema",
        "recall_time": "O(n)",
        "recall_space": "O(1)",
    })

    assert out["grade"] == 3
    assert "not by whether it uses the canonical technique" in seen["system"]
    assert (
        "non-canonical method with optimal time and space can earn 3/3"
        in seen["system"]
    )
    assert "Canonical optimal complexity: time=O(n), space=O(1)." in seen["prompt"]


@pytest.mark.asyncio
async def test_coach_passes_canonical_complexity_to_recall_grading(monkeypatch):
    store = FakeStore()
    store.settings = {"llm_provider": "openai"}
    store.upsert_problem({
        "slug": "two-sum",
        "title": "Two Sum",
        "neetcode_category": "Arrays & Hashing",
        "canonical_summary": {
            "key_ideas": ["hash complements"],
            "time": "O(n)",
            "space": "O(n)",
        },
    })
    captured = {}

    async def fake_extract_or_error(task_name, payload, settings=None):
        captured["task_name"] = task_name
        captured["payload"] = payload
        return {"grade": 3}, None

    monkeypatch.setattr(llm, "enabled", lambda settings=None: True)
    monkeypatch.setattr(llm, "extract_or_error", fake_extract_or_error)

    await coach.grade_recall(store, "two-sum", "hashmap", "O(n)", "O(n)")

    assert captured["task_name"] == "grade_recall"
    assert captured["payload"]["canon_time"] == "O(n)"
    assert captured["payload"]["canon_space"] == "O(n)"


@pytest.mark.asyncio
async def test_grade_solution_validates_good_json(enable_llm, monkeypatch):
    payload_json = json.dumps({
        "score": 4, "optimal": False, "analysis": "one-pass hashmap",
        "positives": ["right data structure"],
        "negatives": ["drop the second scan"],
        "inferred_time": "O(n)", "inferred_space": "O(n)",
    })
    monkeypatch.setattr(llm, "_raw_generate", lambda *a, **k: payload_json)
    out = await llm.extract("grade_solution", {"code": "class Solution: pass"})
    assert out["score"] == 4
    assert out["positives"] == ["right data structure"]
    assert out["negatives"] == ["drop the second scan"]
    assert out["inferred_time"] == "O(n)"


@pytest.mark.asyncio
async def test_grade_solution_schema_clamps(enable_llm, monkeypatch):
    # score out of range should fail validation -> None (never a bad card update)
    monkeypatch.setattr(llm, "_raw_generate",
                        lambda *a, **k: json.dumps({"score": 9}))
    assert await llm.extract("grade_solution", {"code": "x"}) is None
