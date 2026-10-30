"""Dictation re-transcription endpoint: optional, never in the critical path."""
from server import config, llm
from tests.test_api import client  # noqa: F401  (fixture)


def test_transcribe_returns_model_text(client, monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "k")
    seen = {}

    def fake(audio, fmt, language):
        seen.update(audio=audio, fmt=fmt, language=language)
        return "use a hash map"
    monkeypatch.setattr(llm, "_raw_transcribe", fake)
    r = client.post("/api/transcribe", json={"audio": "AAAA", "format": "webm", "language": "en"})
    assert r.status_code == 200 and r.json() == {"text": "use a hash map"}
    assert seen == {"audio": "AAAA", "fmt": "webm", "language": "en"}


def test_transcribe_unavailable_without_key(client, monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", None)
    r = client.post("/api/transcribe", json={"audio": "AAAA", "format": "webm"})
    assert r.status_code == 503


def test_transcribe_failure_is_a_502_not_a_crash(client, monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "k")

    def boom(*a):
        raise RuntimeError("network down")
    monkeypatch.setattr(llm, "_raw_transcribe", boom)
    r = client.post("/api/transcribe", json={"audio": "AAAA", "format": "webm"})
    assert r.status_code == 502


def test_transcribe_rejects_unknown_formats(client, monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "k")
    r = client.post("/api/transcribe", json={"audio": "AAAA", "format": "exe"})
    assert r.status_code == 422
