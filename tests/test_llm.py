"""LLM core tests — schema validation + graceful degradation, no network."""
import json

import pytest

from server import llm


@pytest.fixture
def enable_llm(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENROUTER_API_KEY", "test-key")


def test_disabled_without_key(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENROUTER_API_KEY", None)
    assert llm.enabled() is False


@pytest.mark.asyncio
async def test_extract_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENROUTER_API_KEY", None)
    out = await llm.extract("classify_mistake", {"note": "x"})
    assert out is None


@pytest.mark.asyncio
async def test_critique_plan_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(llm.config, "OPENROUTER_API_KEY", None)
    out = await llm.extract("critique_plan", {"slug": "two-sum"})
    assert out is None


@pytest.mark.parametrize(("provider", "model", "expected"), [
    ("openai", "gpt-5.6-luna", "openai/gpt-5.6-luna"),
    ("gemini", "gemini-2.5-flash", "google/gemini-2.5-flash"),
    ("openrouter", "vendor/new-model", "vendor/new-model"),
])
def test_legacy_settings_use_openrouter(enable_llm, provider, model, expected):
    selected = llm.current_model({"llm_provider": provider, "llm_model": model})
    assert selected == {"provider": "openrouter", "model": expected, "enabled": True}


def test_response_schema_is_strict_and_default_free():
    schema = llm._response_format(llm.PredictionResult)
    assert schema["type"] == "json_schema"
    assert schema["json_schema"]["strict"] is True
    body = schema["json_schema"]["schema"]
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
async def test_critique_plan_validates_good_json(enable_llm, monkeypatch):
    payload_json = json.dumps({
        "pattern_verdict": "plausible",
        "complexity_verdict": "realistic",
        "missing_edge_cases": ["empty input", "duplicates"],
        "nudges": ["What happens with repeated values?"],
        "overall_verdict": "revise",
    })
    monkeypatch.setattr(llm, "_raw_generate", lambda *a, **k: payload_json)
    out = await llm.extract("critique_plan", {
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "category": "Arrays & Hashing",
    })
    assert out["pattern_verdict"] == "plausible"
    assert out["complexity_verdict"] == "realistic"
    assert out["missing_edge_cases"] == ["empty input", "duplicates"]
    assert out["overall_verdict"] == "revise"


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


def test_openrouter_transport(enable_llm, monkeypatch):
    import httpx
    def post(url, **kwargs):
        assert url == "https://openrouter.ai/api/v1/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer test-key"
        body = kwargs["json"]
        assert body["model"] == "vendor/model"
        assert body["messages"] == [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "prompt"},
        ]
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["provider"]["require_parameters"] is True
        assert body["stream"] is False
        assert kwargs["timeout"] == 60
        return httpx.Response(200, json={"choices": [
            {"message": {"content": '{"verdict":"correct","note":"ok"}'}}
        ]})
    monkeypatch.setattr(llm.httpx, "post", post)
    result = llm._raw_generate("openrouter", "vendor/model", "system", "prompt", llm.PredictionResult)
    assert json.loads(result)["verdict"] == "correct"


@pytest.mark.parametrize(("status", "body", "expected"), [
    (401, {"error": {"message": "secret prompt"}}, "HTTP 401"),
    (429, {}, "HTTP 429"),
    (503, {}, "HTTP 503"),
    (200, {"error": {"message": "secret prompt"}}, "could not complete"),
    (200, {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}, "output limit"),
    (200, {"choices": [{"message": {"refusal": "secret prompt"}}]}, "declined"),
])
@pytest.mark.asyncio
async def test_openrouter_errors_degrade_safely(enable_llm, monkeypatch, status, body, expected):
    import httpx
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: httpx.Response(status, json=body))
    result, error = await llm.extract_or_error("grade_prediction", {})
    assert result is None
    assert expected in error
    assert "secret prompt" not in error


@pytest.mark.parametrize("body", [
    {}, {"choices": []}, {"choices": [{"message": {"content": None}}]},
    {"choices": [{"message": {"content": "not json"}}]},
])
@pytest.mark.asyncio
async def test_openrouter_invalid_output(enable_llm, monkeypatch, body):
    import httpx
    monkeypatch.setattr(llm.httpx, "post", lambda *a, **k: httpx.Response(200, json=body))
    result, error = await llm.extract_or_error("grade_prediction", {})
    assert result is None
    assert error


def test_catalog_filters_caches_and_keeps_stale_models(monkeypatch):
    import httpx
    monkeypatch.setattr(llm, "_catalog_expires", 0)
    monkeypatch.setattr(llm, "_catalog_models", [])
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        return httpx.Response(200, request=httpx.Request("GET", url), json={"data": [
            {"id": "vendor/structured", "supported_parameters": ["structured_outputs"],
             "architecture": {"output_modalities": ["text"]}},
            {"id": "vendor/text-only", "supported_parameters": ["response_format"],
             "architecture": {"output_modalities": ["text"]}},
        ]})
    monkeypatch.setattr(llm.httpx, "get", get)
    assert llm.available_models() == ["vendor/structured"]
    assert llm.available_models() == ["vendor/structured"]
    assert len(calls) == 1
    monkeypatch.setattr(llm, "_catalog_expires", 0)
    def offline(*a, **k):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(llm.httpx, "get", offline)
    assert llm.available_models() == ["vendor/structured"]
    monkeypatch.setattr(llm, "_catalog_models", [])
    monkeypatch.setattr(llm, "_catalog_expires", 0)
    assert llm.model_options({"llm_model": "vendor/custom"}) == {"openrouter": ["vendor/custom"]}


@pytest.mark.asyncio
async def test_openrouter_timeout_degrades(enable_llm, monkeypatch):
    import httpx
    def timeout(*a, **k):
        raise httpx.ReadTimeout("Timed out")
    monkeypatch.setattr(llm.httpx, "post", timeout)
    result, error = await llm.extract_or_error("grade_prediction", {})
    assert result is None
    assert "ReadTimeout" in error
