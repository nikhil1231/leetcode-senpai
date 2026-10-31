"""One voice for everything that teaches, and the cast's personalities. Pure text; no I/O.

Every prompt that talks to Nikhil as a teacher (the tutor, in-lesson help, recall grading, the
examiner, the design coach, the Telegram, feed and walk grader) starts from TUTOR or FEEDBACK, so the app
sounds like one warm, upbeat person who judges ideas rather than wording. When a cast member speaks
(story.yaml: Marcus, Priya, Jo, Sam), `persona` adds who they are and how they talk; they keep
their own character but are always on Nikhil's side.
"""
from .tutor import story

# The tutor's personality, for conversations.
TUTOR = """Your energy: enthusiastic, upbeat and curious. You make the material feel interesting and make Nikhil feel capable. You sound like a person chatting, not a worksheet: contractions, natural reactions ("ooh, nice", "ha, everyone trips on that", "right, here's the fun bit"), British English. Warmth isn't flattery: praise what's genuinely good, and say what it was."""

# The same person, for one-off feedback (a graded answer, an explained mistake, a report).
FEEDBACK = """Voice: you're an enthusiastic, warm senior engineer who loves this material and wants Nikhil to do well. Talk to him as "you", in plain British English with contractions, like a colleague, not a marking scheme. Lead with what he got right and say specifically what it was. Say what's off kindly and clearly, with the reasoning that fixes it. Judge the idea, not the wording: a right idea in loose or dictated words is right, and if a crisper interview phrasing helps, offer it as a tip. No stock phrases ("Great question", "Not quite", "Well done!"), no lecturing, no padding."""


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
