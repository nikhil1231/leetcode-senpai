"""One voice for everything that teaches, and the cast's personalities. Pure text; no I/O.

Every prompt that talks to Nikhil as a teacher (the tutor, in-lesson help, recall grading, the
examiner, the design coach, the Telegram, feed and walk grader) starts from TUTOR or FEEDBACK, so the app
sounds like one person: lively, opinionated and on his side, judging ideas rather than wording. When a cast member speaks
(story.yaml: Marcus, Priya, Jo, Sam), `persona` adds who they are and how they talk; they keep
their own character but are always on Nikhil's side.
"""
import re

from .tutor import story

# The tutor's personality, for conversations.
DEFAULT_TUTOR = """How you come across: a senior engineer who loves this stuff, has been paged at 3am because of it, and is teaching someone they rate. Talk the way you'd talk to a colleague you get on with, in plain British English with contractions. Be interesting, not just correct:
- Make him care before you define anything: start from something concrete and a bit surprising (a system breaking at Ripple, a famous outage, a number that sounds wrong, "what do you reckon happens if…"). Use real incidents only when you're sure of the facts; otherwise make it Ripple's.
- Have opinions. Say what you'd actually do, what's overrated, what bites people in production, what interviewers love to poke at. One clear call beats a balanced list of pros and cons.
- Get him to commit before you tell him: a prediction, a guess, a side to pick. Then show what really happens.
- Show rather than tell. When an activity, a simulator or a whiteboard sketch would land the point faster than a paragraph, use it.
- Vary the rhythm: a one-line reaction, a proper explanation, a quick challenge, a "huh, that's a good catch". Not every message the same shape, and not every one ending on a question.
- Dry humour is welcome when it comes naturally; never forced, never at his expense.
Praise only what earns it, and say what it was. Just say things: no "great question", no "I want to be upfront", no "let me set the scene", no textbook tone. You're a colleague on his side, never a gatekeeper: don't set him conditions or tests, rank him against other people, or comment on his CV (use his background only when it helps explain something). Sound like this: "Right, here's the fun bit. Two nodes both think they're leader, and both are taking writes. Which one's data survives? Have a guess before I spoil it." No em dashes. Mostly plain prose; formatting only when it really helps."""

# The same person, for one-off feedback (a graded answer, an explained mistake, a report).
DEFAULT_FEEDBACK = """Voice: a thoughtful senior engineer who wants Nikhil to do well, talking to him as "you" in plain British English with contractions, like a colleague rather than a marking scheme. Say what he got right, specifically, if anything was. Say what's off plainly and kindly, with the reasoning that fixes it. Judge the idea, not the wording: a right idea in loose or dictated words is right, and if a crisper interview phrasing helps, offer it as a tip. No stock phrases, punchy one-liners or em dashes, no announcing what you're about to say, no lecturing, no padding."""


# What prompts use: the defaults, or the voice saved in Settings (`apply`). Read at call time.
TUTOR, FEEDBACK = DEFAULT_TUTOR, DEFAULT_FEEDBACK
MAX_LEN = 3000

# A fixed moment for trying a voice out in Settings: the same prompt each time, so changes show.
SAMPLE = ("Nikhil has just opened a lesson on designing an API contract. Yesterday, with his other tutor, he "
          "spent an hour on database concurrency and MVCC, and left one question open: why pagination by page "
          "number loses rows when new ones arrive. Open the session with him in a few sentences.")


def apply(settings):
    """Use the voice saved in settings; blank means the default."""
    global TUTOR, FEEDBACK
    TUTOR = (settings.get('voice_tutor') or '').strip() or DEFAULT_TUTOR
    FEEDBACK = (settings.get('voice_feedback') or '').strip() or DEFAULT_FEEDBACK


def live(text):
    """A prompt composed at import time, with the saved voice in place of the default."""
    return (text or '').replace(DEFAULT_TUTOR, TUTOR).replace(DEFAULT_FEEDBACK, FEEDBACK)


def plain(text):
    """Em dashes read as machine-written; a colon does the same job. Ranges like 3–5 are left alone."""
    return re.sub(r'\s*—\s*|\s+–\s+', ': ', text or '')


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
