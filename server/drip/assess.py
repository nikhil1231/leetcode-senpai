"""Grade a spoken or typed answer to one knowledge point, and record what it showed.

Shared by the Telegram drip and the walk page. The cheap model compares the answer with the
point's claim (soft evidence). Right closes an open gap; partly opens a gap on the missing piece
with a follow-up question; wrong with a stated belief records a misconception. Without the
model, `grade` returns None and the caller falls back to self-grading.
"""
import json
import logging

from .. import config, llm
from ..knowledge_base import api as kb_api
from . import cards

log = logging.getLogger(__name__)


def grade(store, point, text, ask=None, focus=None):
    """-> {verdict, feedback, misconception, missing, follow_up}, or None without the model."""
    if not llm.enabled(store.get_settings()):
        return None
    try:
        raw = llm._raw_generate('openrouter', config.TUTOR_MODEL, cards.GRADE_SYSTEM,
                                json.dumps(cards.grade_payload(point, text, ask, focus), ensure_ascii=False), cards.Grade,
                                options={'effort': 'low', 'max_tokens': 1000, 'timeout': 30, 'metadata': True})
        return cards.Grade.model_validate_json(raw['content']).model_dump()
    except Exception:
        log.warning('Grading failed', exc_info=True)
        return None


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
