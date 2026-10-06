"""Coaching orchestration — the LLM features that aren't per-attempt enrichment.

Problem-level content (hint ladder, canonical summary, follow-ups) is generated
once per problem and cached on the problem doc. Recall grading, the weekly coach
report, and playbook synthesis pull together the user's structured data on
demand. Everything degrades gracefully when the LLM is disabled.
"""
import datetime as dt
import html
import re
import time

from . import llm, plans


# ---- problem-level cached content -----------------------------------------------
async def ensure_hint_ladder(store, slug):
    """Return a cached 3-rung hint ladder, generating + caching it if absent."""
    p = store.get_problem(slug) or {}
    if p.get("hint_ladder"):
        return p["hint_ladder"]
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None
    res = await llm.extract("hint_ladder", {
        "slug": slug, "title": p.get("title", slug),
        "difficulty": p.get("difficulty"), "category": p.get("neetcode_category"),
    }, settings=settings)
    hints = (res or {}).get("hints") or []
    if hints:
        store.upsert_problem({"slug": slug, "hint_ladder": hints})
    return hints or None


# ---- live hints + giving up -------------------------------------------------------
# A live hint reads the code on screen and answers like an interviewer would; the
# ladder above is its fallback when there's no code to read or no LLM. Giving up
# hears the approach in words — below reading a solution, above another nudge.
def untouched(code, starter):
    """True when the buffer is still the starter code, give or take whitespace."""
    return "".join((code or "").split()) == "".join((starter or "").split())


def numbered(code):
    return "\n".join(f"{i:>3} | {line}" for i, line in enumerate((code or "").split("\n"), 1))


def statement_text(content_html, limit=2500):
    """A problem statement's HTML as plain text, for a prompt."""
    text = re.sub(r"<sup>(.*?)</sup>", r"^\1", content_html or "")
    text = re.sub(r"<(br|/p|/pre|/li|/ul|/ol|/div)\b[^>]*>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return text if len(text) <= limit else text[:limit] + "…"


def parse_marks(raw, code, limit=2):
    """The model's "line: note" marks, kept only where they point at a real,
    non-blank line of the code it was shown. Each carries that line's text so
    the editor can find it again if the code moved while the hint was coming."""
    lines = (code or "").split("\n")
    out, seen = [], set()
    for item in raw or []:
        m = re.match(r"\s*(?:line\s*)?(\d+)\s*[:\-–—]\s*(.+)", str(item), re.I)
        if not m:
            continue
        n, note = int(m.group(1)), " ".join(m.group(2).split())
        if not (1 <= n <= len(lines)) or not lines[n - 1].strip() or n in seen or not note:
            continue
        seen.add(n)
        out.append({"line": n, "text": lines[n - 1], "note": note[:80]})
        if len(out) >= limit:
            break
    return out


def give_up_fallback(prob):
    """The approach as steps from cached content, for when no LLM can walk it."""
    canon = prob.get("canonical_summary") or {}
    ideas = [i.rstrip(".") + "." for i in canon.get("key_ideas") or [] if i]
    if ideas:
        if canon.get("time") and canon.get("space"):
            ideas[-1] += f" That's {canon['time']} time and {canon['space']} space."
        return ideas
    return [h for h in prob.get("hint_ladder") or [] if h] or None


async def live_hint(prob, s, code, previous, last_judged, minutes, settings=None):
    """A hint about the code on screen: {text, marks}, or None on any failure."""
    plan = " — ".join(x for x in (s.get("predicted_category"), s.get("predicted_approach")) if x)
    res = await llm.extract("live_hint", {
        "title": prob.get("title", s["slug"]), "difficulty": prob.get("difficulty"),
        "category": prob.get("neetcode_category"),
        "statement": statement_text(prob.get("content_html")),
        "plan": plan, "minutes": minutes, "last_judged": last_judged,
        "previous": previous[-6:], "code": numbered(code)[:6000],
    }, settings=settings)
    text = " ".join(((res or {}).get("hint") or "").split())
    if not text:
        return None
    return {"text": text, "marks": parse_marks(res.get("marks"), code)}


async def give_up_step(prob, s, code, steps, track, last_judged, settings=None):
    """The next step of a give-up walkthrough, read off the code on screen:
    {text, marks, track, done}, or None on any failure. One call per step, so
    each reads what was actually written after the last."""
    plan = " — ".join(x for x in (s.get("predicted_category"), s.get("predicted_approach")) if x)
    res = await llm.extract("give_up_step", {
        "title": prob.get("title", s["slug"]), "difficulty": prob.get("difficulty"),
        "category": prob.get("neetcode_category"),
        "statement": statement_text(prob.get("content_html")),
        "plan": plan, "track": track, "last_judged": last_judged,
        "steps": [st["text"] for st in steps],
        "code": numbered(code)[:6000] if code else None,
    }, settings=settings)
    text = " ".join(((res or {}).get("step") or "").split())
    if not text:
        return None
    return {"text": text, "marks": parse_marks(res.get("marks"), code, limit=3),
            "track": " ".join((res.get("track") or "").split()) or track,
            "done": bool(res.get("done"))}


async def ensure_canonical(store, slug):
    p = store.get_problem(slug) or {}
    if p.get("canonical_summary"):
        return p["canonical_summary"]
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None
    res = await llm.extract("canonical_summary", {
        "slug": slug, "title": p.get("title", slug),
        "difficulty": p.get("difficulty"), "category": p.get("neetcode_category"),
    }, settings=settings)
    if res:
        store.upsert_problem({"slug": slug, "canonical_summary": res})
    return res


async def ensure_followups(store, slug):
    p = store.get_problem(slug) or {}
    if p.get("followups"):
        return p["followups"]
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None
    res = await llm.extract("followups", {
        "title": p.get("title", slug), "difficulty": p.get("difficulty"),
        "category": p.get("neetcode_category"),
    }, settings=settings)
    qs = (res or {}).get("questions") or []
    if qs:
        store.upsert_problem({"slug": slug, "followups": qs})
    return qs or None


async def grade_followup(store, slug, question, answer):
    p = store.get_problem(slug) or {}
    return await llm.extract("grade_followup", {
        "title": p.get("title", slug), "question": question, "answer": answer,
    }, settings=store.get_settings())


async def grade_prediction(store, slug, predicted_category, predicted_approach=None,
                           pattern_used=None):
    """Grade a pattern prediction against problem metadata/canonical ideas.

    Returns a PredictionResult-shaped dict or None. The prompt itself lives in
    llm.py so sprint submissions and solve-session enrichment share wording.
    """
    settings = store.get_settings()
    if not llm.enabled(settings):
        return None
    canonical = await ensure_canonical(store, slug)
    canon_ideas = ", ".join((canonical or {}).get("key_ideas", [])) if canonical else None
    p = store.get_problem(slug) or {}
    return await llm.extract("grade_prediction", {
        "title": p.get("title", slug),
        "category": p.get("neetcode_category"),
        "canonical": canon_ideas,
        "predicted_category": predicted_category,
        "predicted_approach": predicted_approach,
        "pattern_used": pattern_used,
    }, settings=settings)


# ---- recall grading -------------------------------------------------------------
async def grade_recall(store, slug, recall_text, recall_time=None, recall_space=None):
    """Grade an approach-recall against the user's past code + canonical ideas.

    Returns (result, error): result is a dict {grade, optimal, analysis,
    positives, negatives} or None; error is a human-readable reason when the
    grade could not be produced. When the LLM is disabled both are None
    (caller falls back to manual self-grade).
    """
    settings = store.get_settings()
    if not llm.enabled(settings):
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
    }, settings=settings)


async def grade_solution(store, slug, code, lang=None, claim_time=None, claim_space=None,
                         self_confidence=None, self_independence=None, self_note=None,
                         self_approach=None):
    """Grade an accepted solution's code against the canonical optimal approach.

    Returns (result, error): result is a dict {score, optimal, analysis,
    positives, negatives, inferred_time, inferred_space} or None; error is a
    human-readable reason when no grade could be produced. When the LLM is
    disabled both are None (the solve is already logged and scheduled).
    """
    if not llm.enabled() or not code:
        return None, None
    canonical = await ensure_canonical(store, slug)
    canon_ideas = ", ".join((canonical or {}).get("key_ideas", [])) if canonical else None
    p = store.get_problem(slug) or {}
    return await llm.extract_or_error("grade_solution", {
        "title": p.get("title", slug), "difficulty": p.get("difficulty"),
        "category": p.get("neetcode_category"),
        "canonical": canon_ideas,
        "canon_time": (canonical or {}).get("time"),
        "canon_space": (canonical or {}).get("space"),
        "code": code, "lang": lang,
        "claim_time": claim_time, "claim_space": claim_space,
        "self_confidence": self_confidence,
        "self_independence": self_independence,
        "self_note": self_note,
        "self_approach": self_approach,
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
            "time_min": round((plans.solve_sec(a) or 0) / 60, 1) or None,
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
    settings = store.get_settings()
    if not rows or not llm.enabled(settings):
        return None
    res = await llm.extract("weekly_report", {"data": rows}, settings=settings)
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
    settings = store.get_settings()
    if not llm.enabled(settings):
        return existing
    rows = _gather_category_data(store, category)
    if not rows:
        return existing
    res = await llm.extract("playbook", {"category": category, "data": rows}, settings=settings)
    if not res or not res.get("content_md"):
        return existing
    doc = {
        "content_md": res["content_md"], "updated_at": int(time.time()),
        "attempt_count_at_generation": count,
    }
    store.upsert_playbook(category, doc)
    return {**doc, "category": category}
