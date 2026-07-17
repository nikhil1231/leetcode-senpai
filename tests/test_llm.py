"""LLM core tests — schema validation + graceful degradation, no network."""
import json

import pytest

from server import llm


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
