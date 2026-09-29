"""The change log of a solve written in the in-app editor. Pure: no I/O.

A recording is an ordered list of events, each `{"t": ms since the solve started,
"k": kind, ...}`. The editor checks its buffer every few seconds and logs a delta
only when the code moved since the last one, so time spent thinking costs nothing:

  c      checkpoint      {code}                  full text: the starter code, or a
                                                 delta that would outweigh the doc
  d      delta           {f, to, s}              replace code[f:to] with s
  run    run             {code, input, result}   also a checkpoint
  sub    submit          {code, submission_id, result}  also a checkpoint
  pause / resume / blur / focus / hint {level}

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
CLIENT_KINDS = ("c", "d", "pause", "resume", "blur", "focus")
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


def _unified(a, b):
    out = [line for line in difflib.unified_diff(a.splitlines(), b.splitlines(),
                                                 lineterm="", n=1)
           if not line.startswith(("---", "+++"))]
    return "\n".join(out)


def timeline_for_llm(events, max_chars=TIMELINE_MAX_CHARS):
    """A compact, human-readable account of a recorded solve, for a prompt."""
    s = summary(events)
    head = [
        f"Solve lasted {_dur(s['duration_ms'])}. First edit {mmss(s['first_edit_ms'])}, "
        f"first run {mmss(s['first_run_ms']) if s['first_run_ms'] is not None else 'never'}, "
        f"first submit {mmss(s['first_submit_ms']) if s['first_submit_ms'] is not None else 'never'}.",
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
    away_from = None
    for ev in events:
        k, t = ev.get("k"), ev.get("t", 0)
        if k in ("d", "run", "sub") and t in gap_ends:
            start, length = gap_ends.pop(t)
            where = f", then edited {_lines(code, ev['f'], ev['to'])}" if k == "d" and code else ""
            entries.append([start, f"no edits or runs for {_dur(length)}{where}", None])
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
                entry[2] = _unified(before, ev.get("code") or "") or None
                failed_sub = None
            code = ev.get("code") or ""
            entry = [t, _judged(ev), None]
            entries.append(entry)
            if k == "sub" and (ev.get("result") or {}).get("status") != "Accepted":
                failed_sub = (entry, code)
        elif k == "hint":
            entries.append([t, f"revealed hint {ev.get('level')}", None])
        elif k in ("pause", "resume"):
            entries.append([t, "paused the clock" if k == "pause" else "resumed", None])
        elif k == "blur":
            away_from = t
        elif k == "focus" and away_from is not None:
            if t - away_from >= AWAY_MIN_MS:
                entries.append([away_from, f"away from the tab {_dur(t - away_from)}", None])
            away_from = None
    entries.sort(key=lambda e: e[0])

    def render():
        lines = list(head)
        for t, text, diff in entries:
            lines.append(f"[{mmss(t)}] {text}")
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
