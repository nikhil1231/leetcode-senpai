"""Small gamification helpers: mastery-moment detection.

Streak + daily XP live in scheduler.overview. This detects when a category
first crosses the mastery threshold at full coverage, firing a one-time
celebration (tracked via user flags so it doesn't repeat).
"""
from . import scheduler

MASTERY_THRESHOLD = 0.8


def check_mastery_moments(store):
    """Return categories newly mastered since last check, and record them.

    A category is "mastered" at mastery >= 0.8 with full coverage. Returns a
    list of {category, mastery} for categories not previously flagged.
    """
    stats = scheduler.topic_stats(store.list_problems(), store.list_attempts())
    flags = store.get_flags()
    mastered_flags = set(flags.get("mastered_categories", []))
    newly = []
    for s in stats:
        if s["mastery"] >= MASTERY_THRESHOLD and s["coverage"] >= 0.999:
            if s["category"] not in mastered_flags:
                newly.append({"category": s["category"], "mastery": s["mastery"]})
                mastered_flags.add(s["category"])
    if newly:
        store.set_flag("mastered_categories", sorted(mastered_flags))
    return newly
