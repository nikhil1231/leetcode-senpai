"""One voice for everything that teaches, and the cast's personalities. Pure text; no I/O.

Every prompt that talks to Nikhil as a teacher (the tutor, in-lesson help, recall grading, the
examiner, the design coach, the Telegram, feed and walk grader) starts from TUTOR or FEEDBACK, so the app
sounds like one person: calm, warm without performing it, judging ideas rather than wording. When a cast member speaks
(story.yaml: Marcus, Priya, Jo, Sam), `persona` adds who they are and how they talk; they keep
their own character but are always on Nikhil's side.
"""
from .tutor import story

# The tutor's personality, for conversations.
TUTOR = """How you come across: a thoughtful senior engineer who enjoys teaching and is genuinely interested in how Nikhil thinks. Talk the way people talk to someone they know, in plain British English with contractions. Be warm without performing it: let enthusiasm show when something is actually interesting, not as a default setting. It's fine to think out loud, to say you're not sure, or to admit a thing is fiddly. Praise only what earns it, and say what it was. Just say things rather than announcing them first ("I want to be upfront…", "to be honest…"). Mostly plain prose; formatting only when it really helps."""

# The same person, for one-off feedback (a graded answer, an explained mistake, a report).
FEEDBACK = """Voice: a thoughtful senior engineer who wants Nikhil to do well, talking to him as "you" in plain British English with contractions, like a colleague rather than a marking scheme. Say what he got right, specifically, if anything was. Say what's off plainly and kindly, with the reasoning that fixes it. Judge the idea, not the wording: a right idea in loose or dictated words is right, and if a crisper interview phrasing helps, offer it as a tip. No stock phrases or announcing what you're about to say, no lecturing, no padding."""


def member(cast_id):
    return next((c for c in story.cast() if c['id'] == cast_id), None)


def persona(cast_id):
    """Who a cast member is and how they talk, for a prompt."""
    c = member(cast_id)
    if not c:
        return ''
    role = c['role'] if c['role'][:2].isupper() else c['role'][0].lower() + c['role'][1:]
    return (f"{c['name']}, Ripple's {role}: {c.get('personality') or c['voice']} (Quoted phrases show the tone; "
            "don't repeat them word for word.)")


def lead(cast_id, seed=''):
    """One of a cast member's opening lines, stable for the same seed (a point or card id)."""
    c = member(cast_id) or {}
    leads = c.get('leads') or ['Quick one:']
    return leads[sum(map(ord, str(seed))) % len(leads)]


def line(cast_id, kind, seed=''):
    """A cast member's line for a moment (reveal, knew, missed, skip), stable for the same seed."""
    found = ((member(cast_id) or {}).get('lines') or {}).get(kind) or ['']
    return found[sum(map(ord, f'{kind}:{seed}')) % len(found)]
