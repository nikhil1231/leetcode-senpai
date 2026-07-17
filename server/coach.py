"""Coaching orchestration — the LLM features that aren't per-attempt enrichment.

Problem-level content (hint ladder, canonical summary, follow-ups) is generated
once per problem and cached on the problem doc. Recall grading, the weekly coach
report, and playbook synthesis pull together the user's structured data on
demand. Everything degrades gracefully when the LLM is disabled.
"""
import datetime as dt
import time

from . import llm


# ---- problem-level cached content -----------------------------------------------
async def ensure_hint_ladder(store, slug):
    """Return a cached 3-rung hint ladder, generating + caching it if absent."""
    p = store.get_problem(slug) or {}
    if p.get("hint_ladder"):
        return p["hint_ladder"]
    if not llm.enabled():
        return None
    res = await llm.extract("hint_ladder", {
        "slug": slug, "title": p.get("title", slug),
        "difficulty": p.get("difficulty"), "category": p.get("neetcode_category"),
    })
    hints = (res or {}).get("hints") or []
    if hints:
        store.upsert_problem({"slug": slug, "hint_ladder": hints})
    return hints or None


async def ensure_canonical(store, slug):
    p = store.get_problem(slug) or {}
    if p.get("canonical_summary"):
        return p["canonical_summary"]
    if not llm.enabled():
        return None
    res = await llm.extract("canonical_summary", {
        "slug": slug, "title": p.get("title", slug),
        "difficulty": p.get("difficulty"), "category": p.get("neetcode_category"),
    })
    if res:
        store.upsert_problem({"slug": slug, "canonical_summary": res})
    return res


async def ensure_followups(store, slug):
    p = store.get_problem(slug) or {}
    if p.get("followups"):
        return p["followups"]
    if not llm.enabled():
        return None
    res = await llm.extract("followups", {
        "title": p.get("title", slug), "difficulty": p.get("difficulty"),
        "category": p.get("neetcode_category"),
    })
    qs = (res or {}).get("questions") or []
    if qs:
        store.upsert_problem({"slug": slug, "followups": qs})
    return qs or None


async def grade_followup(store, slug, question, answer):
    p = store.get_problem(slug) or {}
    return await llm.extract("grade_followup", {
        "title": p.get("title", slug), "question": question, "answer": answer,
    })


# ---- recall grading -------------------------------------------------------------
async def grade_recall(store, slug, recall_text, recall_time=None, recall_space=None):
    """Grade an approach-recall against the user's past code + canonical ideas.

    Returns (result, error): result is a dict {grade, key_ideas_hit,
    key_ideas_missed, feedback} or None; error is a human-readable reason when
    the grade could not be produced. When the LLM is disabled both are None
    (caller falls back to manual self-grade).
    """
    if not llm.enabled():
        return None, None
    past = [a for a in store.attempts_for_slug(slug) if a.get("code")]
    past_code = past[-1]["code"] if past else None
    canonical = await ensure_canonical(store, slug)
    canon_ideas = ", ".join((canonical or {}).get("key_ideas", [])) if canonical else None
    p = store.get_problem(slug) or {}
    return await llm.extract_or_error("grade_recall", {
        "title": p.get("title", slug), "category": p.get("neetcode_category"),
        "canonical": canon_ideas, "past_code": past_code,
        "recall_text": recall_text, "recall_time": recall_time, "recall_space": recall_space,
    })


async def clarify_recall(store, attempt, question):
    """Answer a one-off clarification question about a completed recall grade."""
    if not llm.enabled():
        return None
    p = store.get_problem(attempt["slug"]) or {}
    return await llm.extract("clarify_recall", {
        "title": p.get("title", attempt["slug"]),
        "category": p.get("neetcode_category"),
        "recall_text": attempt.get("approach"),
        "recall_time": attempt.get("complexity_time"),
        "recall_space": attempt.get("complexity_space"),
        "recall_grade": attempt.get("recall_grade"),
        "question": question,
    })


# ---- weekly coach report --------------------------------------------------------
def iso_week_key(d=None):
    d = d or dt.date.today()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _week_bounds(d):
    monday = d - dt.timedelta(days=d.weekday())
    return monday, monday + dt.timedelta(days=7)


def _gather_week_data(store, d):
    start, end = _week_bounds(d)
    start_ts = int(dt.datetime.combine(start, dt.time()).timestamp())
    end_ts = int(dt.datetime.combine(end, dt.time()).timestamp())
    pm = {p["slug"]: p for p in store.list_problems()}
    enr = {e["attempt_id"]: e for e in store.list_enrichments()}
    rows = []
    for a in store.list_attempts():
        ts = a.get("solved_at") or 0
        if not (start_ts <= ts < end_ts):
            continue
        p = pm.get(a["slug"], {})
        e = enr.get(a["id"], {})
        tags = (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []
        rows.append({
            "title": p.get("title", a["slug"]),
            "category": p.get("neetcode_category"),
            "difficulty": p.get("difficulty"),
            "kind": a.get("kind"), "confidence": a.get("confidence"),
            "independence": a.get("independence"),
            "time_min": round((a.get("time_taken_sec") or 0) / 60, 1) or None,
            "mistake_tags": tags,
            "prediction_verdict": e.get("prediction_verdict"),
            "pattern_used": e.get("pattern_used"),
        })
    return rows


async def weekly_report(store, d=None, force=False):
    """Generate (and cache) this week's coach report. Idempotent per ISO week
    unless force=True. Returns the stored report or None if not enough data."""
    d = d or dt.date.today()
    key = iso_week_key(d)
    if not force:
        existing = store.get_report(key)
        if existing:
            return existing
    rows = _gather_week_data(store, d)
    if not rows or not llm.enabled():
        return None
    res = await llm.extract("weekly_report", {"data": rows})
    if not res:
        return None
    report = {
        "insights": res["insights"], "focus_plan": res["focus_plan"],
        "generated_at": int(time.time()), "attempt_count": len(rows),
    }
    store.upsert_report(key, report)
    return {**report, "iso_week": key}


# ---- playbook synthesis ---------------------------------------------------------
def _gather_category_data(store, category):
    pm = {p["slug"]: p for p in store.list_problems()}
    enr = {e["attempt_id"]: e for e in store.list_enrichments()}
    rows = []
    for a in store.list_attempts():
        p = pm.get(a["slug"], {})
        if p.get("neetcode_category") != category:
            continue
        e = enr.get(a["id"], {})
        tags = (e.get("user_overrides") or {}).get("tags") or e.get("mistake_tags") or []
        rows.append({
            "title": p.get("title", a["slug"]),
            "approach": a.get("approach"), "note": a.get("mistake_note"),
            "pattern_used": e.get("pattern_used"), "mistake_tags": tags,
        })
    return rows


def category_attempt_count(store, category):
    pm = {p["slug"]: p for p in store.list_problems()}
    return sum(1 for a in store.list_attempts()
               if pm.get(a["slug"], {}).get("neetcode_category") == category)


async def synthesize_playbook(store, category, force=False):
    """Generate (and cache) a per-category cheat sheet. Regenerates when >=3 new
    attempts have accrued since the last generation, or force=True."""
    existing = store.get_playbook(category)
    count = category_attempt_count(store, category)
    if existing and not force:
        if count - existing.get("attempt_count_at_generation", 0) < 3:
            return existing
    if not llm.enabled():
        return existing
    rows = _gather_category_data(store, category)
    if not rows:
        return existing
    res = await llm.extract("playbook", {"category": category, "data": rows})
    if not res or not res.get("content_md"):
        return existing
    doc = {
        "content_md": res["content_md"], "updated_at": int(time.time()),
        "attempt_count_at_generation": count,
    }
    store.upsert_playbook(category, doc)
    return {**doc, "category": category}
