"""Re-anchor overdue review cards onto the coming days.

A long break leaves every card stacked in the past, which makes the review board
read as one solid block of "overdue" and destroys its signal. This rewrites only
`due_date`, spreading the backlog forward at `--per-day` cards a day, highest
priority first (leeches, then the oldest due date).

Everything else on a card — reps, ease, interval_days, stability, fail_count,
leech, last_reviewed — is left exactly as it is, so the SM-2/FSRS state and the
attempt history behind it are untouched.

Dry run by default; `--apply` writes. Every apply first dumps the current cards
to a timestamped JSON backup, and `--restore <file>` puts them back.

    uv run python scripts/reschedule_reviews.py                  # show the plan
    uv run python scripts/reschedule_reviews.py --apply
    uv run python scripts/reschedule_reviews.py --restore backups/reviews-....json
"""
import argparse
import collections
import datetime as dt
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import run  # noqa: F401,E402  — loads .env.local before server.config reads it
from server import config, scheduler  # noqa: E402
from server.store import get_store  # noqa: E402

BACKUP_DIR = os.path.join(ROOT, "backups")


def _priority(card):
    """Leeches first, then the oldest due date — the order build_daily_queue uses."""
    return (not card.get("leech"), card.get("due_date") or "")


def plan(reviews, today, per_day, window=None):
    """Return [(card, old_due, new_due)] for the genuinely overdue cards.

    Only cards past the due window move. A card one or two days late is still
    inside "Due now" on the board and is not a problem — pushing it forward with
    the rest would schedule it *later* than it is now.

    Days are filled to `per_day`, counting cards that are already scheduled on
    that day and are not being moved, so nothing gets stacked on top of an
    already-full day.
    """
    window = scheduler.REVIEW_DUE_WINDOW_DAYS if window is None else window
    today_iso = today.isoformat()

    backlog, kept = [], []
    for r in reviews:
        due = r.get("due_date")
        if not due:
            continue
        try:
            days_late = (today - dt.date.fromisoformat(due)).days
        except ValueError:
            continue
        (backlog if days_late > window else kept).append(r)

    load = collections.Counter(
        r["due_date"] for r in kept if r["due_date"] >= today_iso)

    backlog.sort(key=_priority)
    out, day = [], today
    for card in backlog:
        while load[day.isoformat()] >= per_day:
            day += dt.timedelta(days=1)
        load[day.isoformat()] += 1
        out.append((card, card["due_date"], day.isoformat()))
    return out


def backup(reviews):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(BACKUP_DIR, f"reviews-{stamp}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(reviews, fh, indent=2, sort_keys=True)
    return path


def restore(store, path):
    with open(path, encoding="utf-8") as fh:
        cards = json.load(fh)
    for card in cards:
        store.upsert_review(card["slug"], card)
    return len(cards)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write the changes")
    ap.add_argument("--per-day", type=int, default=None,
                    help="cards per day (default: the review_limit setting)")
    ap.add_argument("--restore", metavar="FILE", help="restore cards from a backup")
    args = ap.parse_args()

    store = get_store(config.DEV_UID)

    if args.restore:
        n = restore(store, args.restore)
        print(f"Restored {n} review cards from {args.restore}")
        return

    reviews = store.list_reviews()
    today = dt.date.today()
    per_day = args.per_day or store.get_settings().get("review_limit", 5)
    if per_day < 1:
        ap.error("--per-day must be at least 1")

    changes = plan(reviews, today, per_day)
    print(f"uid={config.DEV_UID}  today={today}  cards={len(reviews)}  "
          f"per_day={per_day}  to_move={len(changes)}")
    if not changes:
        print("Nothing is in the past. No changes.")
        return

    by_day = {}
    for card, old, new in changes:
        by_day.setdefault(new, []).append((card["slug"], old))
    for day in sorted(by_day):
        print(f"\n  {day}  ({len(by_day[day])})")
        for slug, old in by_day[day]:
            print(f"    {slug:46s} was {old}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to write.")
        return

    path = backup(reviews)
    print(f"\nBacked up {len(reviews)} cards to {path}")
    for card, _old, new in changes:
        store.upsert_review(card["slug"], {**card, "due_date": new})
    print(f"Updated {len(changes)} review cards.")


if __name__ == "__main__":
    main()
