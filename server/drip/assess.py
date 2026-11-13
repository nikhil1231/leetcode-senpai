"""Ask a knowledge point in character, grade a spoken or typed answer to it, and record what it showed.

`phrase` has the cast member who owns a point write the question as a short chat message from a
colleague, not a quiz line; without the model the card falls back to the template. Grading is
shared by the Telegram drip and the walk page; on Telegram the reply stays in the story the
question set up, and `chat` lets the asker carry on talking until the next card. The cheap model
compares the answer with the point's claim (soft evidence). Right closes an open gap; partly opens a gap on the missing piece
with a follow-up question; wrong with a stated belief records a misconception. Without the
model, `grade` returns None and the caller falls back to self-grading.
"""
import json
import logging
import re

from .. import config, llm, model_areas, voice
from ..knowledge_base import api as kb_api
from . import cards

log = logging.getLogger(__name__)


PHRASE_SYSTEM = (
    'You are SPEAKER, one of Nikhil\'s colleagues at Ripple (he is its lead engineer). Write one short Telegram '
    'message asking him QUESTION, in your own voice and personality: a real message from a colleague, not a quiz '
    'line. Keep exactly what is being asked, so his answer can be judged against IDEA, but never give away or '
    'hint at the answer in IDEA. One to three short sentences, under 60 words. You may set it in a tiny, '
    'specific situation at Ripple that fits you and the topic (an incident, a customer email, a code review, a '
    'whiteboard, a coffee, a board meeting), one clause at most. REASON is about Nikhil, never about you: gap '
    '(he half-got this before: ask only about the missing part, warmly), misconception (he got it wrong '
    'before; don\'t say what he said), shaky (he missed it last time), fading (he knew it a while ago), new '
    '(first time he sees it), held (keeping it fresh), tonight (he answered it wrong earlier today), morning '
    '(he answered it wrong yesterday evening; nothing else happened). You may nod to it lightly, never as a label. CONTEXT, if given, is what he is doing '
    'right now; you may nod to it. RECENT are messages already sent to him: don\'t reuse their openings, '
    'situations or phrasing. Your name is shown above the message, so never introduce yourself, and don\'t open '
    'with his name. Plain text: no sign-off, no markdown, no quotation marks around the message. Write only the message.')


def phrase(store, point, reason, ask=None, context=None, recent=()):
    """The question as the cast member who owns the point would send it, or None without the model."""
    if not llm.enabled(store.get_settings()):
        return None
    who = cards.speaker(point)
    payload = {'SPEAKER': voice.persona(who['id']), 'QUESTION': ask or point['prompt'], 'IDEA': point['claim'],
               'REASON': reason, **({'CONTEXT': context} if context else {}), 'RECENT': [r for r in recent if r][:5]}
    messages = [{'role': 'system', 'content': PHRASE_SYSTEM}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
    for _ in range(2):   # the model now and then returns nothing; one more try, then the template
        try:
            raw = llm._raw_chat(model_areas.model_for('drip'), messages, options={'max_tokens': 400, 'timeout': 30, 'think': False})
        except Exception as exc:
            log.warning('Phrasing a card failed: %s', exc)
            continue
        text = ' '.join((raw.get('content') or '').split()).strip('"“”')
        # The name is shown above the message: drop a self-introduction ("Marcus here.") if one slipped in.
        text = re.sub(rf'^(hi,? )?(it\'s )?{who["name"]}( here)?\s*[.,:!—–-]*\s*', '', text, flags=re.I).strip()
        text = text[:1].upper() + text[1:]
        if 10 <= len(text) <= 600:
            return text
    return None


def grade(store, point, text, ask=None, focus=None, in_story=False):
    """-> {verdict, feedback, misconception, missing, follow_up}, or None without the model.
    `in_story`: the feedback is the asker's next message in the scene (Telegram), not a tutor's note."""
    if not llm.enabled(store.get_settings()):
        return None
    try:
        system = voice.live(cards.STORY_GRADE_SYSTEM if in_story else cards.GRADE_SYSTEM)
        raw = llm._raw_generate('openrouter', model_areas.model_for('grading'), system,
                                json.dumps(cards.grade_payload(point, text, ask, focus, in_story), ensure_ascii=False), cards.Grade,
                                options={'effort': 'low', 'max_tokens': 6000, 'timeout': 60, 'metadata': True})   # room to think: verdicts need it
        return cards.Grade.model_validate_json(raw['content']).model_dump()
    except Exception:
        log.warning('Grading failed', exc_info=True)
        return None



def chat(store, card, point, turns):
    """The asker's reply to a message after their card was answered, or None without the model."""
    if not llm.enabled(store.get_settings()):
        return None
    try:
        raw = llm._raw_chat(model_areas.model_for('drip'), cards.chat_messages(card, point, turns),
                            options={'max_tokens': 500, 'timeout': 45, 'think': False})
    except Exception as exc:
        log.warning('Drip chat failed: %s', exc)
        return None
    return ' '.join((raw.get('content') or '').split()).strip('"“”') or None


def consequences(store, source, key, point, g, text, now, where):
    """Gaps and misconceptions from a grade. -> the missing piece, when one was opened."""
    if g['verdict'] == 'right':
        kb_api.resolve_open(store, point['id'], now, f'Answered in full {where}.', kind='gap')
    elif g['verdict'] == 'partly' and g['missing'].strip() and g['follow_up'].strip():
        kb_api.open_gap(store, source, key, point['id'], g['missing'].strip(), g['follow_up'], text[:400], now)
        return g['missing'].strip()
    elif g['verdict'] == 'wrong' and g['misconception'].strip():
        kb_api.add_misconception(store, source, key, point['id'], g['misconception'], text[:400], now)
    return ''
