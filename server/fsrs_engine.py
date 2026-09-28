"""FSRS review engine — drop-in for the SM-2 internals in scheduler.py.

Exposes seed_review(slug, today) and advance_review(current, q, today) with the
same card-dict shape the rest of the app expects: it always mirrors `due_date`,
`interval_days`, `leech`, `fail_count`, `last_reviewed`, `reps` at the top level,
and stashes the FSRS-native card under `fsrs` for the next round.

Legacy SM-2 cards (no `fsrs` key) are migrated on first touch by approximating
stability from the old interval and difficulty from the old ease factor.
"""
import datetime as dt

from fsrs import Card, Rating, Scheduler, State

# No (re)learning steps. FSRS's defaults (1m/10m) are flashcard-session steps;
# this app schedules in whole days from midnight, so any card still stepping —
# every first solve rated below Easy, every lapse — landed back as due *today*.
# Without steps every rating graduates straight to a day-scale interval.
def make_scheduler(**kw):
    return Scheduler(learning_steps=(), relearning_steps=(), **kw)


_scheduler = make_scheduler()

# quality (0..5) -> FSRS rating
def _rating(q):
    if q < 3:
        return Rating.Again
    if q == 3:
        return Rating.Hard
    if q == 4:
        return Rating.Good
    return Rating.Easy


def _midnight_utc(d):
    return dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc)


def _iso(d):
    return d.isoformat()


def _card_from(current, today):
    """Rebuild an FSRS Card from a stored card dict, migrating SM-2 if needed."""
    if current and current.get("fsrs"):
        return Card.from_dict(current["fsrs"])
    if not current:
        # A genuinely new card, so the first rating gets FSRS's own initial
        # stability rather than one made up for a migration.
        return Card(due=_midnight_utc(today))
    # migrate a legacy SM-2 card
    interval = (current or {}).get("interval_days") or 0
    ease = (current or {}).get("ease") or 2.5
    stability = max(1.0, float(interval)) if interval else 1.0
    # ease 1.3..2.5+ -> difficulty ~8..3 (harder cards had lower ease)
    difficulty = min(10.0, max(1.0, 11.0 - ease * 3.0))
    last = today - dt.timedelta(days=int(interval)) if interval else today
    return Card(
        state=State.Review if interval else State.Learning,
        stability=stability, difficulty=difficulty,
        due=_midnight_utc(today), last_review=_midnight_utc(last),
    )


def seed_review(slug, today):
    """Neutral card for a backfilled solve (already solved once, so graduate it
    out of learning to a multi-day interval rather than re-showing it today)."""
    card = Card(due=_midnight_utc(today))
    card, _ = _scheduler.review_card(card, Rating.Easy, review_datetime=_midnight_utc(today))
    return _to_dict(slug, card, today, fail_count=0)


def advance_review(current, q, today):
    card = _card_from(current, today)
    rating = _rating(q)
    card, _ = _scheduler.review_card(card, rating, review_datetime=_midnight_utc(today))
    if rating == Rating.Again:
        # A failed solve comes back tomorrow, as under SM-2: not later today
        # (that tests short-term memory), and not the days FSRS's post-lapse
        # stability would allow. Stability is untouched; only `due` moves.
        card.due = _midnight_utc(today + dt.timedelta(days=1))
    fail_count = (current or {}).get("fail_count", 0)
    if q < 3:
        fail_count += 1
    slug = (current or {}).get("slug")
    return _to_dict(slug, card, today, fail_count=fail_count, q=q)


def _to_dict(slug, card, today, fail_count, q=None):
    due_date = card.due.date() if card.due else today
    interval = max(0, (due_date - today).days)
    out = {
        "slug": slug,
        "fsrs": card.to_dict(),
        "interval_days": interval,
        "due_date": _iso(due_date),
        "last_reviewed": _iso(today),
        "fail_count": fail_count,
        "leech": 1 if fail_count >= 3 else 0,
        # compatibility mirrors (approximate, for any code still reading them)
        "reps": None,
        "ease": round(card.difficulty, 4) if card.difficulty else None,
        "stability": round(card.stability, 4) if card.stability else None,
    }
    if q is not None:
        out["quality"] = q
    return out
