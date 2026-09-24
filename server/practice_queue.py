"""Choose the next light-practice exercise. Pure: plain data in, a template out.

Misses come back soon, never back-to-back. Unseen and due exercises fill the
rest, weighted toward topics you miss more often. Exercises answered correctly
return on a widening interval (1, 3, 9… days). Revealing an answer counts as a
miss. No I/O, no LLM.
"""
from .practice_skills import concept

DAY = 86400
GAP = 4          # a missed exercise waits at least this many others in a run
MISS_SHARE = 0.6  # chance to revisit a miss while fresher material is available


def _histories(results):
    """template -> [(answered_at, ok)], oldest first."""
    out = {}
    for r in sorted(results, key=lambda r: r.get("answered_at") or 0):
        ok = bool(r.get("correct")) and not r.get("revealed") and not r.get("guessed") and not r.get("assisted")
        out.setdefault(r.get("template"), []).append((r.get("answered_at") or 0, ok))
    return out


def status(results):
    """template -> "missed" | "learned", from each template's latest answer."""
    latest = {}
    for r in sorted(results, key=lambda r: r.get("answered_at") or 0):
        latest[r.get("template")] = ("uncertain" if r.get("correct") and (r.get("guessed") or r.get("assisted"))
                                     else "learned" if r.get("correct") and not r.get("revealed") else "missed")
    return latest


def pick(candidates, results, recent, now, rng, metadata=None):
    """Return the next template.

    candidates: {template: topic} to choose from (the mode/topic filter).
    results: saved answers, each with template, correct, revealed, answered_at.
    recent: templates already served in this run, oldest first.
    """
    if not candidates:
        raise ValueError("No exercises match")
    metadata = metadata or {}
    skills = {t: metadata.get(t, {}).get("skill", topic) for t, topic in candidates.items()}
    history = _histories(results)
    gap = min(GAP, len(candidates) - 1)
    held = set(recent[-gap:]) if gap else set()
    pool = [t for t in candidates if t not in held] or list(candidates)

    missed, fresh, rest = [], [], []
    for t in pool:
        h = history.get(t)
        if not h:
            fresh.append(t)
            continue
        at, ok = h[-1]
        if not ok:
            missed.append(t)
            continue
        streak = next((i for i, (_, x) in enumerate(reversed(h)) if not x), len(h))
        (fresh if now - at >= DAY * 3 ** (streak - 1) else rest).append(t)

    if missed and (not fresh or rng.random() < MISS_SHARE):
        # Oldest miss first: the one that has waited longest.
        source = min(missed, key=lambda t: history[t][-1][0])
        # A related format checks transfer once before repeating the source.
        related = [t for t in pool if t != source and concept(source)
                   and concept(t) == concept(source) and t.split("-")[0] != source.split("-")[0]
                   and (not history.get(t) or history[t][-1][0] < history[source][-1][0])]
        return rng.choice(related) if related else source
    if fresh:
        # A topic's miss rate raises the odds of practicing it next.
        tally = {}
        for t, h in history.items():
            if t in candidates:
                n, m = tally.get(skills[t], (0, 0))
                tally[skills[t]] = (n + len(h), m + sum(not ok for _, ok in h))
        weights = [1 + 2 * (tally[skills[t]][1] / tally[skills[t]][0] if skills[t] in tally else 0)
                   for t in fresh]
        for i, t in enumerate(fresh):
            n, misses = tally.get(skills[t], (0, 0))
            level = metadata.get(t, {}).get("difficulty")
            ready = n - misses >= 2 and (not n or misses / n < 0.5)
            if level == "foundation":
                weights[i] *= 0.7 if ready else 2
            elif level == "stretch":
                weights[i] *= 1.5 if ready else 0.35
        return rng.choices(fresh, weights)[0]
    # Everything was answered correctly recently: least recently seen.
    return min(rest, key=lambda t: history[t][-1][0])
