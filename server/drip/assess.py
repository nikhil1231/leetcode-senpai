"""Ask a knowledge point as the tutor, grade an answer, and record what it showed.

`compose` writes the card: the plain question, optional review context,
and usually four options to tap; without the model the card falls back to the template. Grading is
shared by the Telegram drip and the walk page; `chat` lets the tutor carry on explaining
until the next card. The cheap model
compares the answer with the point's claim (soft evidence). Right closes an open gap; partly opens a gap on the missing piece
with a follow-up question; wrong with a stated belief records a misconception. Without the
model, `grade` returns None and the caller falls back to self-grading.
"""
import json
import logging
import random
import re

from .. import config, llm, model_areas, voice
from ..knowledge_base import api as kb_api
from . import cards

log = logging.getLogger(__name__)


COMPOSE_SYSTEM = (
    'You write one Telegram flashcard for Nikhil, a software engineer preparing for interviews, about IDEA. '
    + voice.TUTOR + ' No roleplay, fictional scenes or character voices. '
    'Reply with JSON only: {"question": ..., "lead": ..., "options": [...], "answer": ..., "why": ...}. '
    'question: the plain question, standalone and readable at a glance on a phone, under 25 words, no scene '
    'and no character. Keep what QUESTION asks, so his answer can be judged against IDEA, but never give the '
    'answer away. If FOCUS is given, ask only about FOCUS (the part he missed before). '
    'lead: optional, under 20 words, a gentle reminder of why this idea is being revisited, based only on '
    'REASON or CONTEXT. Use an empty string if it adds nothing. The question must make sense without it. '
    'Never repeat the question, give away the answer, invent an incident or introduce yourself. '
    'RECENT are lines already sent: avoid repeating their openings. '
    'When CHOICE is true: options are four answers to the question, each under 15 words, similar in length '
    'and style, exactly one right by IDEA; the other three are wrong in ways a smart engineer might believe '
    '(use MISCONCEPTIONS when given), never silly, never "all/none of the above", never a trick of wording. '
    'answer: the index (0 to 3) of the right one. why: in the tutor\'s feedback voice, '
    + voice.FEEDBACK + ' One or two plain sentences on why the right one is '
    'right and what the most tempting wrong one misses, under 45 words. When CHOICE is false: options [], '
    'answer null, why "". British English, no em dashes, plain text inside the strings, no markdown.')


def compose(store, point, reason, ask=None, context=None, recent=(), choice=True, focus=None, beliefs=(), rng=None):
    """The card as {question, lead, options?, answer?, why?}, the options shuffled; None without the model
    (or when it gives nothing usable twice), and the card falls back to the template."""
    if not llm.enabled(store.get_settings()):
        return None
    payload = {'QUESTION': ask or point['prompt'], 'IDEA': point['claim'],
               'REASON': reason, 'CHOICE': choice, **({'FOCUS': focus} if focus else {}),
               **({'CONTEXT': context} if context else {}), **({'MISCONCEPTIONS': list(beliefs)[:3]} if beliefs else {}),
               'RECENT': [r for r in recent if r][:5]}
    rng, best = rng or random.Random(), None
    messages = [{'role': 'system', 'content': voice.live(COMPOSE_SYSTEM)}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
    for _ in range(2):   # the model now and then returns nothing usable; one more try, then the template
        try:
            raw = llm._raw_chat(model_areas.model_for('drip'), messages, options={'max_tokens': 700, 'timeout': 40, 'think': False})
        except Exception as exc:
            log.warning('Composing a card failed: %s', exc)
            continue
        out = cards.parse_composed(raw.get('content'), choice)
        if out and (out.get('options') or not choice):
            if out.get('options'):
                out['options'], out['answer'] = cards.shuffled(out['options'], out['answer'], rng)
            out['lead'] = re.sub(r'^(hi,? )?(it\'s )?Tutor( here)?\s*[.,:!—–-]*\s*', '', out['lead'], flags=re.I).strip()
            out['lead'] = out['lead'][:1].upper() + out['lead'][1:]
            return out
        if out:
            best = out   # a plain question is still better than the template
    return best


def grade(store, point, text, ask=None, focus=None):
    """-> {verdict, feedback, misconception, missing, follow_up}, or None without the model."""
    if not llm.enabled(store.get_settings()):
        return None
    try:
        system = voice.live(cards.GRADE_SYSTEM)
        raw = llm._raw_generate('openrouter', model_areas.model_for('grading'), system,
                                json.dumps(cards.grade_payload(point, text, ask, focus), ensure_ascii=False), cards.Grade,
                                options={'effort': 'low', 'max_tokens': 6000, 'timeout': 60, 'metadata': True})   # room to think: verdicts need it
        return cards.Grade.model_validate_json(raw['content']).model_dump()
    except Exception:
        log.warning('Grading failed', exc_info=True)
        return None



def chat(store, card, point, turns):
    """The tutor's reply after a card was answered, or None without the model."""
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
