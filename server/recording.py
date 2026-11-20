"""The change log of a solve written in the in-app editor. Pure: no I/O.

A recording is an ordered list of events, each `{"t": ms since the solve started,
"k": kind, ...}`. The editor checks its buffer every few seconds and logs a delta
only when the code moved since the last one, so time spent thinking costs nothing:

  c      checkpoint      {code}                  full text: the starter code, or a
                                                 delta that would outweigh the doc
  d      delta           {f, to, s}              replace code[f:to] with s
  run    run             {code, input, result}   also a checkpoint
  sub    submit          {code, submission_id, result}  also a checkpoint
  pause / resume / blur / focus
  hint   hint asked for  {level, text?}          level counts hints taken this run
  giveup gave up         {step?, text?}          a step of the walkthrough to a solution
  end    ended unsolved  {}                      stopped without an Accepted
  edge   edge case       {case, on}              a planned edge case ticked (or not)
  reset                                          back to the starter code (a "c" follows)

Nobody reads this at keystroke level — it's raw material for the LLM review and
for the handful of numbers `summary` derives. State at any moment is rebuilt from
the deltas on demand. Runs and submits carry the full code anyway (it's what was
judged), so they double as checkpoints: rebuilding the chain and comparing at each
one is how a lost or corrupt delta is noticed, and the chain resumes from there.

Events are stored in arrival order, which is the order they happened: the editor
sends any unsent deltas in the same request as the run or submit they precede.
"""
import difflib
import json

VERSION = 1

CODE_KINDS = ("c", "run", "sub")
# What the browser may append; judging events are written by the server alone.
CLIENT_KINDS = ("c", "d", "pause", "resume", "blur", "focus", "edge", "reset", "lang")
# A pause in activity at least this long counts as a stall worth naming.
IDLE_GAP_MS = 60_000
# Keep a recording well inside Firestore's 1 MiB document limit. Past the first
# mark the browser's edits stop being kept; judgings, which carry the code that
# was actually judged, keep going into the reserve above it.
MAX_LOG_CHARS = 800_000
JUDGING_RESERVE_CHARS = 150_000
MAX_TEXT = 20_000


def diff(prev, new):
    """The single replacement turning `prev` into `new`, or None if unchanged.

    Trims the common prefix and suffix. Two edits far apart in one tick become one
    wider replacement — fine at this resolution, and it needs no diff library.
    """
    if prev == new:
        return None
    start = 0
    limit = min(len(prev), len(new))
    while start < limit and prev[start] == new[start]:
        start += 1
    end_prev, end_new = len(prev), len(new)
    while end_prev > start and end_new > start and prev[end_prev - 1] == new[end_new - 1]:
        end_prev -= 1
        end_new -= 1
    return {"f": start, "to": end_prev, "s": new[start:end_new]}


def apply_delta(code, ev):
    f, to = ev["f"], ev["to"]
    if not (0 <= f <= to <= len(code)):
        raise ValueError("delta out of range")
    return code[:f] + ev["s"] + code[to:]


def parse(log):
    """JSONL text -> events. A line that won't parse is dropped, not fatal."""
    out = []
    for line in (log or "").splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if isinstance(ev, dict) and "k" in ev:
            out.append(ev)
    return out


def dump(events):
    return "".join(json.dumps(ev, separators=(",", ":")) + "\n" for ev in events)


def clean_client_event(ev):
    """A browser-sent event, validated and clipped, or None to drop it."""
    if not isinstance(ev, dict) or ev.get("k") not in CLIENT_KINDS:
        return None
    try:
        t = max(0, int(ev.get("t", 0)))
    except (TypeError, ValueError):
        return None
    k = ev["k"]
    if k == "c":
        if not isinstance(ev.get("code"), str) or len(ev["code"]) > MAX_TEXT:
            return None
        return {"t": t, "k": k, "code": ev["code"]}
    if k == "d":
        try:
            f, to = int(ev["f"]), int(ev["to"])
        except (KeyError, TypeError, ValueError):
            return None
        s = ev.get("s")
        if not isinstance(s, str) or len(s) > MAX_TEXT or f < 0 or to < f:
            return None
        return {"t": t, "k": k, "f": f, "to": to, "s": s}
    if k == "edge":
        case = ev.get("case")
        if not isinstance(case, str) or not case.strip():
            return None
        return {"t": t, "k": k, "case": case.strip()[:80], "on": bool(ev.get("on"))}
    if k == "lang":
        lang = ev.get("lang")
        return {"t": t, "k": k, "lang": lang[:20]} if isinstance(lang, str) and lang else None
    return {"t": t, "k": k}


def _replay(events, code=None):
    """Yield (event, code after it, ok) for each code-bearing event, from `code`.
    Code is None where a delta couldn't apply; ok is False wherever the chain
    disagreed with a checkpoint or broke."""
    for ev in events:
        k = ev.get("k")
        if k in CODE_KINDS:
            ok = code is None or k == "c" or code == ev.get("code")
            code = ev.get("code") or ""
            yield ev, code, ok
        elif k == "d":
            if code is None:
                yield ev, None, False
                continue
            try:
                code = apply_delta(code, ev)
            except (KeyError, TypeError, ValueError):
                yield ev, None, False
                continue
            yield ev, code, True


def reconstruct(events):
    """Replay the chain. Returns (states, mismatches): states is [(t, code)] after
    every code-bearing event; mismatches counts checkpoints the chain disagreed
    with (or deltas that couldn't apply) — each one resyncs from the checkpoint."""
    states, mismatches = [], 0
    for ev, code, ok in _replay(events):
        mismatches += not ok
        if code is not None:
            states.append((ev.get("t", 0), code))
    return states, mismatches


def advance(code, events):
    """Carry the chain's end state over newly appended events: (code, mismatches).
    What lets an append check only what it adds instead of replaying the log."""
    mismatches = 0
    for _, after, ok in _replay(events, code):
        mismatches += not ok
        if after is not None:
            code = after
    return code, mismatches


def code_at(events, t):
    """The code as it stood at `t` ms, or None before the first checkpoint."""
    best = None
    for when, code in reconstruct(events)[0]:
        if when > t:
            break
        best = code
    return best


def _spans(events, start_kind, end_kind, end_t):
    total, opened = 0, None
    for ev in events:
        if ev.get("k") == start_kind and opened is None:
            opened = ev["t"]
        elif ev.get("k") == end_kind and opened is not None:
            total += max(0, ev["t"] - opened)
            opened = None
    if opened is not None:
        total += max(0, end_t - opened)
    return total


def idle_gaps(events, min_gap=IDLE_GAP_MS):
    """[(start_ms, length_ms)] between consecutive bits of work, ignoring pauses."""
    gaps = []
    last = None
    paused = False
    for ev in events:
        k = ev.get("k")
        if k == "pause":
            paused = True
            last = None
        elif k == "resume":
            paused = False
            last = ev["t"]
        elif k in ("d", "run", "sub") and not paused:
            if last is not None and ev["t"] - last >= min_gap:
                gaps.append((last, ev["t"] - last))
            last = ev["t"]
    return gaps


def edges_checked(events, checked=()):
    """The planned edge cases ticked as of the end of `events`, from `checked`."""
    out = list(checked)
    for ev in events:
        if ev.get("k") != "edge":
            continue
        case = ev.get("case")
        if ev.get("on") and case not in out:
            out.append(case)
        elif not ev.get("on") and case in out:
            out.remove(case)
    return out


def _never_run(events):
    """The submit events (by id) whose exact code was never Run before them."""
    ran, out = set(), set()
    for ev in events:
        if ev.get("k") == "run":
            ran.add(ev.get("code") or "")
        elif ev.get("k") == "sub" and (ev.get("code") or "") not in ran:
            out.add(id(ev))
    return out


def _first(events, kind):
    return next((ev["t"] for ev in events if ev.get("k") == kind), None)


def summary(events):
    """The handful of numbers an attempt keeps about how its solve went."""
    runs = [ev for ev in events if ev.get("k") == "run"]
    subs = [ev for ev in events if ev.get("k") == "sub"]
    end = events[-1]["t"] if events else 0
    gaps = idle_gaps(events)
    _, mismatches = reconstruct(events)
    return {
        "v": VERSION,
        "first_edit_ms": _first(events, "d"),
        "first_run_ms": _first(events, "run"),
        "first_submit_ms": _first(events, "sub"),
        "runs": len(runs),
        "runs_failed": sum(1 for ev in runs if not (ev.get("result") or {}).get("passed")),
        "submits": len(subs),
        "failed_submits": sum(1 for ev in subs
                              if (ev.get("result") or {}).get("status") != "Accepted"),
        "submits_unrun": len(_never_run(events)),
        "edits": sum(1 for ev in events if ev.get("k") == "d"),
        "idle_ms": sum(length for _, length in gaps),
        "longest_idle_ms": max((length for _, length in gaps), default=0),
        "away_ms": _spans(events, "blur", "focus", end),
        "paused_ms": _spans(events, "pause", "resume", end),
        "duration_ms": end,
        "chain_ok": mismatches == 0,
    }


def failed_tests(events, limit=2):
    """Failing inputs of the wrong submits, newest first — the same shape the
    poller builds from LeetCode's submission list, without asking LeetCode."""
    out = []
    for ev in reversed(events):
        r = ev.get("result") or {}
        if ev.get("k") != "sub" or r.get("status") in (None, "Accepted"):
            continue
        out.append({"status": r.get("status"), "input": _clip(r.get("input"), 300),
                    "expected": _clip(r.get("expected"), 120),
                    "output": _clip(r.get("output") or r.get("error"), 120)})
        if len(out) >= limit:
            break
    return out


def _clip(value, limit):
    text = str(value or "").strip()
    return text if len(text) <= limit else text[:limit] + "…"


def compact_run(result):
    """What a run keeps in the log: the verdict and the first case it got wrong."""
    cases = result.get("cases") or []
    wrong = next((c for c in cases if c.get("output") != c.get("expected")), None)
    return {
        "status": result.get("status"), "passed": bool(result.get("passed")),
        "correct": result.get("correct"), "total": result.get("total"),
        "error": _clip(result.get("error"), 600) or None,
        "printed": any((c.get("stdout") or "").strip() for c in cases),
        "wrong": {k: _clip(wrong.get(k), 300) for k in ("input", "output", "expected")}
                 if wrong else None,
    }


def compact_submit(result):
    return {
        "status": result.get("status"),
        "correct": result.get("correct"), "total": result.get("total"),
        "input": _clip(result.get("input"), 600) or None,
        "expected": _clip(result.get("expected"), 300) or None,
        "output": _clip(result.get("output"), 300) or None,
        "error": _clip(result.get("error"), 600) or None,
        "runtime_percentile": result.get("runtime_percentile"),
    }


# ---- the timeline the post-solve modal draws ------------------------------------
# One bar for the whole solve: planning (before the recording starts), then each
# stretch of the recording as work (edits and runs), quiet (a minute or more with
# neither, the tab still showing), other tab (the page hidden or unfocused) or
# paused. Quiet is not called idle: it may be thinking, notes on paper or a break,
# and the log can't tell which. Marks are the moments that changed the course:
# runs, submits, hints, the approach explained, a reset.

PHASE_KINDS = ("plan", "work", "quiet", "talk", "away", "paused", "optimize")
_RANK = {"work": 0, "quiet": 1, "talk": 2, "away": 3, "paused": 4}
MIN_SEGMENT_MS = 1_000


# ---- speech ----------------------------------------------------------------------
# What was said aloud while solving (background voice capture): transcript text only,
# never audio, in a list beside the events rather than in them. A clip's transcript
# arrives after later edits, so mixing it into the ordered, delta-chained log would
# break its order. `t` is on the recording's clock and is negative for planning, which
# happens before the clock starts.

SPEECH_MAX_CHARS = 40_000
SPEECH_MAX_CLIP_MS = 180_000
SPEECH_MIN_T = -6 * 3_600_000
TALK_JOIN_MS = 10_000


def clean_speech(entry):
    """One clip's {t, dur, text, stt}, validated and clipped; None when unusable."""
    if not isinstance(entry, dict):
        return None
    try:
        t, dur = int(entry["t"]), int(entry["dur"])
    except (KeyError, TypeError, ValueError):
        return None
    text = " ".join(str(entry.get("text") or "").split())
    if not text or dur <= 0 or t < SPEECH_MIN_T:
        return None
    out = {"t": t, "dur": min(dur, SPEECH_MAX_CLIP_MS), "text": text[:SPEECH_MAX_CHARS]}
    if entry.get("stt"):
        out["stt"] = str(entry["stt"])[:80]
    return out


def merge_speech(existing, new, max_chars=SPEECH_MAX_CHARS):
    """Sorted by `t`, one entry per `t` (a retried upload replaces itself), total text
    capped. Returns (speech, truncated); the earliest speech is what's kept."""
    by_t = {e["t"]: e for e in (existing or [])}
    for e in new or []:
        if (c := clean_speech(e)):
            by_t[c["t"]] = c
    out, used, truncated = [], 0, False
    for e in sorted(by_t.values(), key=lambda e: e["t"]):
        if used + len(e["text"]) > max_chars:
            truncated = True
            break
        used += len(e["text"])
        out.append(e)
    return out, truncated


def speech_spans(speech, join_ms=TALK_JOIN_MS):
    """[(from, to)] on the recording's clock, clips under `join_ms` apart counted as one."""
    spans = []
    for e in sorted(speech or [], key=lambda e: e["t"]):
        a, b = e["t"], e["t"] + e["dur"]
        if spans and a - spans[-1][1] < join_ms:
            spans[-1][1] = max(spans[-1][1], b)
        else:
            spans.append([a, b])
    return [(a, b) for a, b in spans]


def talk_ms(speech):
    return sum(b - a for a, b in speech_spans(speech))


def _open_spans(events, start_kind, end_kind, end_t):
    out, opened = [], None
    for ev in events:
        if ev.get("k") == start_kind and opened is None:
            opened = ev["t"]
        elif ev.get("k") == end_kind and opened is not None:
            out.append((opened, ev["t"]))
            opened = None
    if opened is not None:
        out.append((opened, end_t))
    return out


def _quiet_spans(events, end_t, min_gap=IDLE_GAP_MS):
    """Stretches of a minute or more with no edit or judging, from the start on. A
    pause or resume closes one: the paused time is its own kind."""
    work = sorted({0, end_t, *(ev["t"] for ev in events
                                if ev.get("k") in ("d", "run", "sub", "reset", "pause", "resume")
                                or (ev.get("k") == "c" and ev.get("t", 0) > 0))})
    return [(a, b) for a, b in zip(work, work[1:]) if b - a >= min_gap]


def _mark(ev):
    k, r = ev.get("k"), ev.get("result") or {}
    if k == "run":
        return {"kind": "run", "ok": bool(r.get("passed")), "error": bool(r.get("error")),
                "correct": r.get("correct"), "total": r.get("total")}
    if k == "sub":
        return {"kind": "submit", "status": r.get("status"), "correct": r.get("correct"),
                "total": r.get("total")}
    if k == "hint":
        return {"kind": "hint", "level": ev.get("level"), "text": _clip(ev.get("text"), 300) or None}
    if k == "giveup":
        return {"kind": "explained", "step": ev.get("step") or 1,
                "text": _clip(ev.get("text"), 400) or None}
    if k in ("reset", "end"):
        return {"kind": k}
    return None


def phases(events, plan_ms=0, speech=()):
    """The solve as a bar: {duration_ms, segments, marks, totals, speech}, all on one
    clock that starts when planning did (`plan_ms` before the recording). Speech turns
    the part of a quiet stretch it covers into `talk`; it never changes work, away or
    paused. `speech` in the result is the talk lane: [{from, to}] on the same clock."""
    plan_ms = max(0, int(plan_ms or 0))
    end = events[-1]["t"] if events else 0
    quiet = _quiet_spans(events, end)
    talking = speech_spans(speech)
    spans = ([(a, b, "quiet") for a, b in quiet]
             + [(max(a, s), min(b, e), "talk") for a, b in quiet for s, e in talking
                if max(a, s) < min(b, e)]
             + [(a, b, "away") for a, b in _open_spans(events, "blur", "focus", end)]
             + [(a, b, "paused") for a, b in _open_spans(events, "pause", "resume", end)])
    cuts = sorted({0, end, *(t for a, b, _ in spans for t in (a, b) if 0 <= t <= end)})
    segments = [{"kind": "plan", "from": 0, "to": plan_ms}] if plan_ms else []
    for a, b in zip(cuts, cuts[1:]):
        kind = max((k for s, e, k in spans if s <= a and b <= e), key=_RANK.get, default="work")
        if segments and segments[-1]["kind"] != "plan" and (
                segments[-1]["kind"] == kind or b - a < MIN_SEGMENT_MS):
            segments[-1]["to"] = b + plan_ms   # a sliver joins the stretch before it
        else:
            segments.append({"kind": kind, "from": a + plan_ms, "to": b + plan_ms})
    totals = {k: 0 for k in PHASE_KINDS}
    for s in segments:
        totals[s["kind"]] += s["to"] - s["from"]
    marks = [{"t": ev.get("t", 0) + plan_ms, **m} for ev in events if (m := _mark(ev))]
    lane = [{"from": max(0, a + plan_ms), "to": min(end + plan_ms, b + plan_ms)} for a, b in talking
            if min(end + plan_ms, b + plan_ms) > max(0, a + plan_ms)]
    return {"duration_ms": end + plan_ms, "plan_ms": plan_ms, "segments": segments,
            "marks": marks, "totals": totals, "speech": lane}


def with_optimize(base, rounds, round_speech=()):
    """`base` (from `phases`) with each "Keep optimizing" run's events joined on
    after it, on the same clock. Editing in those runs counts as "optimize", so
    the bar shows how long went on improving an already-Accepted solution; their
    quiet, away and paused stretches stay what they are. `optimize_from` is where
    the first run starts, None without one. `round_speech` is each round's `speech`,
    in step with `rounds`; it joins the talk lane on the same shift."""
    out = {**base, "segments": list(base["segments"]), "marks": list(base["marks"]),
           "totals": dict(base["totals"]), "optimize_from": None}
    out["speech"] = list(base.get("speech") or [])
    for i, events in enumerate(rounds):
        if not events:
            continue
        p, at = phases(events, 0, round_speech[i] if i < len(round_speech) else ()), out["duration_ms"]
        if out["optimize_from"] is None:
            out["optimize_from"] = at
        for s in p["segments"]:
            kind = "optimize" if s["kind"] == "work" else s["kind"]
            out["segments"].append({"kind": kind, "from": s["from"] + at, "to": s["to"] + at, "opt": True})
            out["totals"][kind] += s["to"] - s["from"]
        out["marks"] += [{**m, "t": m["t"] + at, "opt": True} for m in p["marks"]]
        out["speech"] += [{"from": s["from"] + at, "to": s["to"] + at} for s in p["speech"]]
        out["duration_ms"] = at + p["duration_ms"]
    return out


# ---- the timeline the LLM reads -------------------------------------------------
# Deltas aren't listed one by one: at 10s granularity they're noise. What's kept
# is where time went (stalls, time away, pauses, big rewrites), every judging with
# its verdict, and — after each failed submit — the diff to the next judged code,
# which is what shows what actually broke and how it was fixed.

TIMELINE_MAX_CHARS = 12_000
AWAY_MIN_MS = 30_000
REWRITE_MIN_LINES = 5


def mmss(ms):
    sec = max(0, int(ms or 0)) // 1000
    return f"{sec // 60:02d}:{sec % 60:02d}"


def _dur(ms):
    sec = max(0, int(ms or 0)) // 1000
    return f"{sec // 60}m{sec % 60:02d}s" if sec >= 60 else f"{sec}s"


def _lines(code, f, to):
    start = code.count("\n", 0, f) + 1
    end = code.count("\n", 0, max(f, to - 1)) + 1
    return f"L{start}" if start == end else f"L{start}-{end}"


def _one_line(text, limit):
    return _clip(" ".join(str(text or "").split()), limit)


def _judged(ev):
    r = ev.get("result") or {}
    if ev["k"] == "run":
        if r.get("error"):
            head = f"run: {r.get('status') or 'error'} — {_one_line(r['error'].splitlines()[0], 160)}"
        else:
            head = f"run: {r.get('correct', 0)}/{r.get('total', '?')} cases matched"
            w = r.get("wrong")
            if w:
                head += (f" — input {_one_line(w.get('input'), 120)}, expected "
                         f"{_one_line(w.get('expected'), 60)}, got {_one_line(w.get('output'), 60)}")
        return head + (" (printed debug output)" if r.get("printed") else "")
    head = f"submit: {r.get('status')} ({r.get('correct', '?')}/{r.get('total', '?')} tests)"
    if r.get("status") == "Accepted":
        return head
    if r.get("error"):
        head += f" — {_one_line(r['error'].splitlines()[0], 160)}"
    if r.get("input"):
        head += (f" — failing input {_one_line(r['input'], 160)}, expected "
                 f"{_one_line(r.get('expected'), 80)}, got {_one_line(r.get('output'), 80)}")
    return head


def last_judged(events):
    """The most recent run or submit, described in a line; None before any."""
    for ev in reversed(events):
        if ev.get("k") in ("run", "sub"):
            return _judged(ev)
    return None


def unified_diff(a, b, context=1):
    """A headerless unified diff of two versions of some code."""
    out = [line for line in difflib.unified_diff((a or "").splitlines(), (b or "").splitlines(),
                                                 lineterm="", n=context)
           if not line.startswith(("---", "+++"))]
    return "\n".join(out)


SPEECH_SHARE = 0.4        # of the prompt's character budget, so talk can't crowd out the edits
SAID_JOIN_MS = 3_000


def _overlap(spans, a, b):
    return sum(max(0, min(b, e) - max(a, s)) for s, e in spans)


def _said_lines(speech, budget):
    """[(t, text)]: clips under SAID_JOIN_MS apart read as one line, and every line is
    shortened to its share of `budget` rather than dropped, so the timestamps all stay."""
    lines = []
    for e in sorted(speech or [], key=lambda e: e["t"]):
        if lines and e["t"] - lines[-1][2] < SAID_JOIN_MS:
            lines[-1][1] += " " + e["text"]
            lines[-1][2] = e["t"] + e["dur"]
        else:
            lines.append([e["t"], e["text"], e["t"] + e["dur"]])
    if not lines:
        return []
    each = max(60, int(budget) // len(lines) - 24)
    return [(t, _one_line(text, each)) for t, text, _ in lines]


def timeline_for_llm(events, max_chars=TIMELINE_MAX_CHARS, offset_ms=0, speech=()):
    """A compact, human-readable account of a recorded solve, for a prompt. Times
    read `offset_ms` later than the log's, so they can count from when planning began.
    `speech` (see merge_speech) adds `said:` lines, each keeping its timestamp when clipped."""
    s = summary(events)
    at = lambda ms: mmss(ms + offset_ms) if ms is not None else "never"  # noqa: E731
    head = [
        f"Solve lasted {_dur(s['duration_ms'])}. First edit {at(s['first_edit_ms'])}, "
        f"first run {at(s['first_run_ms'])}, first submit {at(s['first_submit_ms'])}.",
        f"{s['runs']} runs ({s['runs_failed']} not matching), {s['submits']} submits "
        f"({s['failed_submits']} failed). Idle {_dur(s['idle_ms'])} in stretches of a minute "
        f"or more; paused {_dur(s['paused_ms'])}; away from the tab {_dur(s['away_ms'])}.",
    ]
    if not s["chain_ok"]:
        head.append("Part of the edit log was lost, so code between judgings is approximate.")

    gap_ends = {start + length: (start, length) for start, length in idle_gaps(events)}
    entries = []  # [t, text, diff]
    code = None
    failed_sub = None  # (entry, code) awaiting the next judged code
    unrun_subs = _never_run(events)
    away_from = None
    for ev in events:
        k, t = ev.get("k"), ev.get("t", 0)
        if k in ("d", "run", "sub") and t in gap_ends:
            start, length = gap_ends.pop(t)
            where = f", then edited {_lines(code, ev['f'], ev['to'])}" if k == "d" and code else ""
            talking = _overlap(speech_spans(speech), start, start + length) * 2 >= length
            entries.append([start, f"no edits or runs for {_dur(length)}{where}"
                                   + (", talking through it" if talking else ""), None])
        if k == "c":
            code = ev.get("code") or ""
        elif k == "d" and code is not None:
            removed = code[ev["f"]:ev["to"]].count("\n")
            if removed >= REWRITE_MIN_LINES:
                entries.append([t, f"rewrote {_lines(code, ev['f'], ev['to'])} "
                                   f"({removed} lines replaced)", None])
            try:
                code = apply_delta(code, ev)
            except (KeyError, TypeError, ValueError):
                pass
        elif k in ("run", "sub"):
            if failed_sub:
                entry, before = failed_sub
                entry[2] = unified_diff(before, ev.get("code") or "") or None
                failed_sub = None
            code = ev.get("code") or ""
            unrun = " (this exact code was never run first)" if id(ev) in unrun_subs else ""
            entry = [t, _judged(ev) + unrun, None]
            entries.append(entry)
            if k == "sub" and (ev.get("result") or {}).get("status") != "Accepted":
                failed_sub = (entry, code)
        elif k == "hint":
            entries.append([t, f"asked for a hint: \"{_one_line(ev['text'], 160)}\""
                               if ev.get("text") else f"revealed hint {ev.get('level')}", None])
        elif k == "giveup":
            if (ev.get("step") or 1) == 1:
                entries.append([t, "gave up and heard the approach explained"
                                   + (f": \"{_one_line(ev['text'], 160)}\"" if ev.get("text") else ""), None])
            else:
                entries.append([t, f"walked to step {ev['step']}: \"{_one_line(ev.get('text') or '', 160)}\"", None])
        elif k == "end":
            entries.append([t, "ended the run without an Accepted", None])
        elif k == "reset":
            entries.append([t, "reset the code to the starter", None])
        elif k == "edge" and ev.get("on"):
            entries.append([t, f"ticked planned edge case \"{ev.get('case')}\" as tested", None])
        elif k in ("pause", "resume"):
            entries.append([t, "paused the clock" if k == "pause" else "resumed", None])
        elif k == "blur":
            away_from = t
        elif k == "focus" and away_from is not None:
            if t - away_from >= AWAY_MIN_MS:
                entries.append([away_from, f"away from the tab {_dur(t - away_from)}", None])
            away_from = None
    said = _said_lines(speech, max_chars * SPEECH_SHARE)
    entries = sorted(entries + [[t, f'said: "{text}"', None] for t, text in said], key=lambda e: e[0])

    def render():
        lines = list(head)
        for t, text, diff in entries:
            lines.append(f"[{mmss(max(0, t + offset_ms))}] {text}")
            if diff:
                lines.append("  what changed before the next judging:")
                lines.extend("    " + line for line in diff.splitlines())
        return "\n".join(lines)

    text = render()
    # Over budget: drop the oldest diffs first, keeping the last one longest.
    with_diff = [e for e in entries if e[2]]
    while len(text) > max_chars and len(with_diff) > 1:
        with_diff.pop(0)[2] = "(diff omitted for length)"
        text = render()
    return _clip(text, max_chars)
