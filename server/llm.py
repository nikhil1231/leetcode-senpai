"""LLM enrichment core — text in, validated JSON out.

Design rules (from the V2 plan):
  * The LLM is NEVER in the critical path. `extract()` returns None on any
    failure (no key, network error, bad JSON, schema mismatch) and never raises
    to callers. Features check `enabled()` and degrade instead of breaking.
  * Raw text stays the source of truth; whatever this returns is derived data,
    stamped elsewhere with PROMPT_VERSION so it can be re-run cheaply.
  * The transport is swappable. OpenAI and Gemini share the single
    `_raw_generate()` choke point, which tests monkeypatch.

Each task registers a pydantic response schema + a prompt builder. `extract`
picks the task by name, builds the prompt, calls the model in structured-output
mode, validates against the schema, and hands back a plain dict.
"""
import asyncio
import json
import logging
from typing import Callable, Literal, Optional

import httpx
from pydantic import BaseModel, Field

from . import config

log = logging.getLogger(__name__)

MISTAKE_TAGS = [
    "misread", "wrong_pattern", "off_by_one", "edge_case",
    "wrong_ds", "tle", "impl_bug", "syntax",
]
COMPLEXITIES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)"]


# ---- response schemas -----------------------------------------------------------
class MistakeResult(BaseModel):
    tags: list[str] = Field(default_factory=list, description=f"subset of {MISTAKE_TAGS}")
    phase: Literal["understanding", "design", "implementation", "none"] = "none"
    severity: int = Field(2, ge=1, le=3)
    summary: str = ""


class PredictionResult(BaseModel):
    verdict: Literal["correct", "partial", "wrong", "unknown"] = "unknown"
    note: str = ""


class CodeAnalysis(BaseModel):
    pattern_used: str = ""
    inferred_time: str = ""
    inferred_space: str = ""
    complexity_verdict: Literal["match", "user_optimistic", "user_pessimistic", "unknown"] = "unknown"
    diff_summary: str = ""


class RecallResult(BaseModel):
    grade: int = Field(0, ge=0, le=3, description="0 blank, 1 vague, 2 mostly, 3 complete")
    key_ideas_hit: list[str] = Field(default_factory=list)
    key_ideas_missed: list[str] = Field(default_factory=list)
    feedback: str = ""


class SolutionGrade(BaseModel):
    score: int = Field(0, ge=0, le=5, description="1 barely works … 5 optimal & clean")
    optimal: bool = False
    analysis: str = ""  # detailed read of the approach + complexity
    improvements: list[str] = Field(default_factory=list)  # empty when already optimal
    inferred_time: str = ""
    inferred_space: str = ""


class RecallClarification(BaseModel):
    reply: str = ""


class HintLadder(BaseModel):
    hints: list[str] = Field(default_factory=list, description="exactly 3, escalating; rung 3 outlines the approach")


class CanonicalSummary(BaseModel):
    key_ideas: list[str] = Field(default_factory=list)
    time: str = ""
    space: str = ""


class Followups(BaseModel):
    questions: list[str] = Field(default_factory=list, description="2-3 interviewer-style follow-ups")


class WeeklyReport(BaseModel):
    insights: list[str] = Field(default_factory=list, description="exactly 3 short diagnostic sentences")
    focus_plan: str = ""


class Playbook(BaseModel):
    content_md: str = ""


class FollowupGrade(BaseModel):
    verdict: Literal["correct", "partial", "wrong", "unknown"] = "unknown"
    feedback: str = ""


# ---- task registry --------------------------------------------------------------
class Task:
    def __init__(self, schema, system: str, build: Callable[[dict], str]):
        self.schema = schema
        self.system = system
        self.build = build


def _p(payload, *keys):
    return {k: payload.get(k) for k in keys}


TASKS: dict[str, Task] = {
    "classify_mistake": Task(
        MistakeResult,
        "You classify what went wrong on a coding-interview problem into a fixed "
        f"taxonomy. tags MUST be a subset of {MISTAKE_TAGS}. If nothing went wrong, "
        "return empty tags and phase 'none'. Keep summary under 15 words.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}).\n"
            f"Solver's note on what tripped them up: {p.get('note') or '(none)'}\n"
            f"Their stated approach: {p.get('approach') or '(none)'}\n"
            f"Independence: {p.get('independence')}."
        ),
    ),
    "grade_prediction": Task(
        PredictionResult,
        "You judge whether a solver's up-front pattern guess matched the pattern "
        "the problem actually needs. Judge by meaning, not exact words (e.g. "
        "'two moving indices growing a window' == sliding window). 'partial' = "
        "right family, wrong variant. Keep note under 15 words.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('category')}).\n"
            f"Canonical key ideas: {p.get('canonical') or '(unknown)'}\n"
            f"Predicted pattern: {p.get('predicted_category')}\n"
            f"Predicted approach: {p.get('predicted_approach') or '(none)'}\n"
            f"Actual pattern used (from their code): {p.get('pattern_used') or p.get('category')}"
        ),
    ),
    "analyze_code": Task(
        CodeAnalysis,
        "You analyze an accepted solution. Identify the algorithmic pattern used, "
        "infer time/space complexity, and compare to the solver's own complexity "
        "claim (complexity_verdict). If previous code is given, one-line what "
        "changed (diff_summary), else leave it empty.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}).\n"
            f"Solver claimed time={p.get('claim_time') or '?'}, space={p.get('claim_space') or '?'}.\n"
            f"--- current code ({p.get('lang')}) ---\n{_trunc(p.get('code'))}\n"
            + (f"--- previous accepted code ---\n{_trunc(p.get('prev_code'))}\n" if p.get('prev_code') else "")
        ),
    ),
    "grade_solution": Task(
        SolutionGrade,
        "You grade an accepted coding-interview solution out of 5 on optimality and "
        "clarity, comparing against the canonical optimal approach. Score 5 only if "
        "the complexity is optimal AND the code is clean/idiomatic; 3-4 for a correct "
        "but suboptimal or messy solution; 1-2 for brute force or hard-to-read code. "
        "Set optimal=true only when time & space match the canonical optimum. When "
        "not optimal, list concrete, specific improvements (fewer passes, better data "
        "structure, drop the extra space, etc.); leave improvements empty when it is "
        "already optimal. analysis: a tight but detailed read of the approach and its "
        "time/space. Also infer the solution's actual time/space complexity.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}).\n"
            f"Canonical key ideas: {p.get('canonical') or '(unknown)'}\n"
            f"Canonical optimal complexity: time={p.get('canon_time') or '?'}, "
            f"space={p.get('canon_space') or '?'}.\n"
            f"Solver claimed time={p.get('claim_time') or '?'}, space={p.get('claim_space') or '?'}.\n"
            f"--- their accepted code ({p.get('lang')}) ---\n{_trunc(p.get('code'))}"
        ),
    ),
    "grade_recall": Task(
        RecallResult,
        "You grade a from-memory recall of how to solve a problem the solver has "
        "seen before. Compare against their own past solution and the canonical "
        "approach. grade: 0 blank/wrong, 1 vague gist, 2 mostly there, 3 complete "
        "incl. the key trick. List concrete ideas hit and missed. Feedback <25 words.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('category')}).\n"
            f"Canonical key ideas: {p.get('canonical') or '(unknown)'}\n"
            f"Their past accepted approach (code):\n{_trunc(p.get('past_code'), 1200)}\n"
            f"--- their recall now ---\n{p.get('recall_text')}\n"
            f"Stated complexity: time={p.get('recall_time') or '?'}, space={p.get('recall_space') or '?'}"
        ),
    ),
    "clarify_recall": Task(
        RecallClarification,
        "You are clarifying a completed from-memory recall grade. Answer only the "
        "solver's question about their answer or the grading. Do not re-grade, "
        "reschedule, or introduce new scoring. Keep the reply under 80 words.",
        lambda p: (
            f"Problem: {p.get('title')} ({p.get('category')}).\n"
            f"Recall answer: {p.get('recall_text') or '(blank)'}\n"
            f"Stated complexity: time={p.get('recall_time') or '?'}, space={p.get('recall_space') or '?'}\n"
            f"Grade JSON: {json.dumps(p.get('recall_grade') or {}, indent=2)}\n"
            f"Question: {p.get('question')}"
        ),
    ),
    "hint_ladder": Task(
        HintLadder,
        "You are a Socratic coding tutor. Produce EXACTLY 3 escalating hints for a "
        "well-known LeetCode problem. Hint 1: a nudge toward the key observation, "
        "no pattern named. Hint 2: name the pattern/data structure. Hint 3: outline "
        "the full approach in 2-3 steps. Never paste code.",
        lambda p: f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}). Slug: {p.get('slug')}.",
    ),
    "canonical_summary": Task(
        CanonicalSummary,
        "Summarize the standard optimal solution to a well-known LeetCode problem: "
        "3-5 terse key_ideas (the crux, not a walkthrough) plus its optimal time "
        "and space complexity.",
        lambda p: f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}). Slug: {p.get('slug')}.",
    ),
    "followups": Task(
        Followups,
        "Generate 2-3 classic interviewer follow-up questions for a well-known "
        "LeetCode problem (e.g. streaming input, O(1) space, handle duplicates, "
        "scale up). One sentence each.",
        lambda p: f"Problem: {p.get('title')} ({p.get('difficulty')}, {p.get('category')}).",
    ),
    "grade_followup": Task(
        FollowupGrade,
        "You judge a one-sentence answer to an interview follow-up question. "
        "'partial' = right instinct, incomplete. Feedback <20 words.",
        lambda p: (
            f"Problem: {p.get('title')}.\nFollow-up: {p.get('question')}\n"
            f"Their answer: {p.get('answer')}"
        ),
    ),
    "weekly_report": Task(
        WeeklyReport,
        "You are a terse, insightful coding-interview coach. From one week of "
        "structured practice data, write EXACTLY 3 diagnostic insight sentences "
        "(specific, cite topics/patterns) and a 1-2 sentence focus_plan for next "
        "week. No fluff, no praise-padding.",
        lambda p: f"This week's data (JSON):\n{json.dumps(p.get('data'), indent=2)[:6000]}",
    ),
    "playbook": Task(
        Playbook,
        "You write a personal pattern cheat-sheet for one topic, in Markdown "
        "(## headers, - bullets, **bold** only). Ground it in the solver's OWN "
        "notes and problems, citing them by name. Sections: When to reach for this "
        "pattern, The template, Your recurring mistakes, Problems you've done. "
        "Under 350 words.",
        lambda p: (
            f"Topic: {p.get('category')}.\n"
            f"Solver's attempts/notes/recalls (JSON):\n{json.dumps(p.get('data'), indent=2)[:6000]}"
        ),
    ),
}


def _trunc(code, limit=2000):
    if not code:
        return "(none)"
    return code if len(code) <= limit else code[:limit] + "\n…(truncated)"


# ---- public API -----------------------------------------------------------------
def _selected(settings: Optional[dict] = None) -> tuple[str, str]:
    settings = settings or {}
    provider = (settings.get("llm_provider") or config.LLM_PROVIDER or "openai").lower()
    model = settings.get("llm_model") or config.LLM_MODEL

    # Compatibility for existing Gemini-only local/dev environments: if no
    # per-user choice has been stored and OpenAI has no key, keep Gemini alive.
    if (
        provider == "openai"
        and not config.OPENAI_API_KEY
        and config.GEMINI_API_KEY
        and not settings.get("llm_provider")
    ):
        return "gemini", "gemini-2.5-flash"
    return provider, model


def enabled(settings: Optional[dict] = None) -> bool:
    provider, _ = _selected(settings)
    if provider == "openai":
        return bool(config.OPENAI_API_KEY)
    if provider == "gemini":
        return bool(config.GEMINI_API_KEY)
    return False


def current_model(settings: Optional[dict] = None) -> dict:
    provider, model = _selected(settings)
    return {"provider": provider, "model": model, "enabled": enabled(settings)}


_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def _strip_defaults(node):
    """Recursively drop `default` keys from a JSON schema in place.

    The Gemini API rejects any response schema that carries default values
    ("Default value is not supported in the response schema"), but our pydantic
    models use defaults so validation stays lenient when the model omits a
    field. Sending a defaults-free copy keeps both sides happy.
    """
    if isinstance(node, dict):
        node.pop("default", None)
        for v in node.values():
            _strip_defaults(v)
    elif isinstance(node, list):
        for v in node:
            _strip_defaults(v)
    return node


def _gemini_schema(schema) -> dict:
    return _strip_defaults(schema.model_json_schema())


def _openai_strict_schema(node):
    """Normalize Pydantic JSON Schema to OpenAI structured-output constraints."""
    if isinstance(node, dict):
        node.pop("default", None)
        if node.get("type") == "object":
            props = node.get("properties") or {}
            node["required"] = list(props.keys())
            node["additionalProperties"] = False
        for v in node.values():
            _openai_strict_schema(v)
    elif isinstance(node, list):
        for v in node:
            _openai_strict_schema(v)
    return node


def _openai_schema(schema) -> dict:
    return {
        "type": "json_schema",
        "name": schema.__name__,
        "strict": True,
        "schema": _openai_strict_schema(schema.model_json_schema()),
    }


def _response_text(resp: dict) -> Optional[str]:
    if resp.get("output_text"):
        return resp["output_text"]
    for item in resp.get("output", []) or []:
        for part in item.get("content", []) or []:
            if isinstance(part, dict) and part.get("text"):
                return part["text"]
    return None


def _raw_generate(provider: str, model: str, system: str, prompt: str, schema) -> Optional[str]:
    """The single transport choke point. Returns a JSON string or None.

    Tests monkeypatch this to avoid network calls.
    """
    if provider == "openai":
        resp = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {config.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "instructions": system,
                "input": prompt,
                "text": {"format": _openai_schema(schema)},
                "store": False,
            },
            timeout=60,
        )
        if resp.is_error:
            raise RuntimeError(
                f"OpenAI {resp.status_code}: {resp.text[:1000] or resp.reason_phrase}"
            )
        return _response_text(resp.json())

    if provider != "gemini":
        raise ValueError(f"unsupported LLM provider {provider}")

    from google.genai import types
    client = _get_client()
    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=_gemini_schema(schema),
            temperature=0.2,
        ),
    )
    return resp.text


async def extract_or_error(
    task_name: str, payload: dict, settings: Optional[dict] = None
) -> tuple[Optional[dict], Optional[str]]:
    """Run a registered task, returning (result, error_message).

    Same work as `extract` but surfaces WHY a task produced no result instead of
    swallowing it. Still never raises to callers; the error is logged (with a
    traceback on real exceptions) and returned as a human-readable string so a
    feature that wants diagnosability (e.g. recall grading) can show it.
    """
    if not enabled(settings):
        selected = current_model(settings)
        return None, f"LLM disabled (no API key for {selected['provider']})"
    task = TASKS.get(task_name)
    if task is None:
        return None, f"unknown task {task_name}"
    try:
        prompt = task.build(payload)
        provider, model = _selected(settings)
        raw = await asyncio.to_thread(
            _raw_generate, provider, model, task.system, prompt, task.schema
        )
        if not raw or not raw.strip():
            log.warning("LLM task %s returned an empty response", task_name)
            return None, "model returned an empty response (possibly truncated by the thinking budget)"
        data = json.loads(raw)
        return task.schema.model_validate(data).model_dump(), None
    except Exception as exc:
        log.warning("LLM task %s failed", task_name, exc_info=True)
        return None, f"{type(exc).__name__}: {exc}"


async def extract(
    task_name: str, payload: dict, settings: Optional[dict] = None
) -> Optional[dict]:
    """Run a registered task. Never raises — returns a validated dict or None."""
    result, _ = await extract_or_error(task_name, payload, settings=settings)
    return result
