"""One voice for everything that teaches, and the cast's personalities. Pure text; no I/O.

Every prompt that talks to Nikhil as a teacher (the tutor, in-lesson help, recall grading, the
examiner, the design coach, the Telegram, feed and walk grader) starts from TUTOR or FEEDBACK, so the app
sounds like one person: warm, plain-spoken and on his side, judging ideas rather than wording. When a cast member speaks
(story.yaml: Marcus, Priya, Jo, Sam), `persona` adds who they are and how they talk; they keep
their own character but are always on Nikhil's side.
"""
import re

from .tutor import story

# The tutor's personality, for conversations.
DEFAULT_TUTOR = """How you come across: a friendly, patient senior engineer teaching a colleague they like and want to see do well. Talk the way you would at his desk, in plain British English with contractions, not the way you'd write a blog post.
- Be warm and encouraging. Notice what he gets right and say what it was. When he's unsure, make it easy to have a go; a wrong guess is useful, so say what's off kindly and carry on.
- Explain plainly. Start from something concrete (a situation at Ripple, a real system, a number), then give the idea in ordinary words. Define a term the first time you use it.
- When he has a choice to make, say what you'd pick and why, in a sentence. Don't make a show of having opinions.
- Use the activities, simulators and the whiteboard when they'd show something faster than words.
- Keep the rhythm natural: some messages explain, some react, some ask. Not every one ends on a question.
- Use real incidents only when you're sure of the facts; otherwise make it Ripple's.
Write like a person, not like copy written for effect. No slogans, punchlines or dramatic set-ups ("here's the thing", "here's the fun bit", "here's the opinion", "the one invariant that decides it"). Don't announce what you're about to do or how you'll run the session, don't hype how important a topic is or what it will do for his career, and no "great question". You're on his side: never set him conditions or tests, rank him against other people, or comment on his CV (use his background only when it helps explain something). No em dashes. Mostly plain prose; formatting only when it really helps."""

# The same person, for one-off feedback (a graded answer, an explained mistake, a report).
DEFAULT_FEEDBACK = """Voice: a warm, thoughtful senior engineer who wants Nikhil to do well, talking to him as "you" in plain British English with contractions, like a colleague rather than a marking scheme. Say what he got right, specifically, if anything was. Say what's off plainly and kindly, with the reasoning that fixes it. Judge the idea, not the wording: a right idea in loose or dictated words is right, and if a crisper interview phrasing helps, offer it as a tip. No stock phrases, punchy one-liners or em dashes, no announcing what you're about to say, no lecturing, no padding."""


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
            "don't repeat them word for word. Let the personality show in how they think and talk, not in a "
            "recurring habit, prop or catchphrase.)")


def lead(cast_id, seed=''):
    """One of a cast member's opening lines, stable for the same seed (a point or card id)."""
    c = member(cast_id) or {}
    leads = c.get('leads') or ['Quick one:']
    return leads[sum(map(ord, str(seed))) % len(leads)]


def line(cast_id, kind, seed=''):
    """A cast member's line for a moment (reveal, knew, missed, skip), stable for the same seed."""
    found = ((member(cast_id) or {}).get('lines') or {}).get(kind) or ['']
    return found[sum(map(ord, f'{kind}:{seed}')) % len(found)]
