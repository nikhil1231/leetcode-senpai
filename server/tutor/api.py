"""HTTP API for the tutor: /api/tutor/... The learner's turn is stored before the model is called.

A turn whose reply failed can be retried with the same key: the stored turn is reused and only
the reply is generated again. Ending a session writes its debrief (also when the last objective
is shown); a debrief that failed is written again by ending the session again. Validated evidence and misconceptions go to the knowledge base
(source "tutor", soft evidence); block answers are recorded by the lesson's own activity
endpoint, so they stay hard evidence.
"""
import asyncio
import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import auth, config, llm
from ..knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from ..store import get_store
from . import lessons, session as ses, story

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/tutor', tags=['tutor'])
KEY = r'^[A-Za-z0-9_-]{6,64}$'
STORY_KEY = 'story'
UNAVAILABLE = 'The tutor needs the model, which is not connected. The lesson itself still works.'
FAILED = 'The tutor could not answer just now. Your message is saved; try again.'
DEBRIEF_FAILED = 'The debrief could not be written just now. Your session is saved; try again.'
SOURCE = 'tutor'


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def _memory_key(section, lesson):
    return f'lesson:{section}:{lesson}'


def _lesson(section, key):
    l = lessons.get(section, key)
    if not l:
        raise HTTPException(404, 'Unknown lesson')
    return l


def _session(store, sid):
    s = store.get_knowledge('tutor_sessions', sid)
    if not s:
        raise HTTPException(404, 'Unknown tutor session')
    return s


def _modes():
    return [{'id': k, 'label': v[0], 'blurb': v[1]} for k, v in ses.MODES.items()]


def _knowledge(store, now):
    c, _, states, seen, mis = kb_api.evidence(store, now)
    return c, states, seen, mis, kmodel.summary(c, states, seen, mis, now)


def public(s):
    return ses.public(s)


@router.get('')
def overview(store=Depends(store_for)):
    """Whether the tutor is available, its modes, and the company's story so far."""
    _, _, _, _, summary = _knowledge(store, time.time())
    return {'enabled': llm.enabled(store.get_settings()), 'model': config.TUTOR_MODEL, 'modes': _modes(),
            'story': story.public(summary, store.get_knowledge('tutor_memory', STORY_KEY))}


@router.get('/lessons/{section}/{lesson}')
def lesson_state(section: str, lesson: str, store=Depends(store_for)):
    l = _lesson(section, lesson)
    mem = store.get_knowledge('tutor_memory', _memory_key(section, lesson)) or {}
    active = store.get_knowledge('tutor_sessions', mem['active']) if mem.get('active') else None
    return {'enabled': llm.enabled(store.get_settings()), 'modes': _modes(), 'objectives': l['objectives'],
            'previously': mem.get('summary', ''), 'sessions': mem.get('sessions', 0),
            'scene': story.chapter(section, l['category']),
            'active': public(active) if active and active['status'] == 'active' else None}


class Start(BaseModel):
    section: Literal['system-design', 'fundamentals', 'ai']
    lesson: str = Field(max_length=80)
    mode: Literal['teach', 'explain', 'critique', 'war-room', 'interview'] = 'teach'
    key: str = Field(pattern=KEY, description='Client-made session id: a retried start opens the same session.')


@router.post('/sessions')
async def start(body: Start, store=Depends(store_for)):
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    l, now = _lesson(body.section, body.lesson), time.time()
    s = store.get_knowledge('tutor_sessions', body.key)
    if s and any(t['role'] == 'tutor' for t in s['turns']):
        return public(s)
    if not s:
        s = ses.new(body.key, l, body.mode, now)
        store.create_knowledge('tutor_sessions', body.key, s)
        mk = _memory_key(body.section, body.lesson)
        mem = store.get_knowledge('tutor_memory', mk) or {}
        store.put_knowledge('tutor_memory', mk, {**{k: v for k, v in mem.items() if k != '_key'},
                                                 'active': body.key, 'sessions': mem.get('sessions', 0) + 1, 'last_at': now})
    return await _reply(store, s, l)


class BlockResult(BaseModel):
    key: str = Field(pattern=r'^b\d{1,3}$')
    correct: bool


class Turn(BaseModel):
    key: str = Field(pattern=KEY)
    text: str = Field(default='', max_length=4000)
    block: BlockResult | None = None


@router.get('/sessions/{sid}')
def get_session(sid: str, store=Depends(store_for)):
    return public(_session(store, sid))


@router.post('/sessions/{sid}/turns')
async def turn(sid: str, body: Turn, store=Depends(store_for)):
    s = _session(store, sid)
    l = _lesson(s['section'], s['lesson'])
    if s['status'] != 'active':
        raise HTTPException(409, 'This session has ended. Start a new one to keep going.')
    mine = [i for i, t in enumerate(s['turns']) if t.get('key') == body.key]
    if mine:
        if any(t['role'] == 'tutor' for t in s['turns'][mine[-1] + 1:]):
            return public(s)  # already answered: a duplicate post
    else:
        if len(s['turns']) >= ses.MAX_TURNS:
            raise HTTPException(409, 'This session is long enough. End it and start a fresh one.')
        if not body.text.strip() and not body.block:
            raise HTTPException(422, 'Say something or answer a block.')
        if body.block and body.block.key not in {t['key'] for t in lessons.tools(l)}:
            raise HTTPException(422, 'That block is not in this lesson.')
        now = time.time()
        if body.block:
            s['turns'].append({'role': 'block', 'block': body.block.key, 'correct': body.block.correct, 'key': body.key, 'at': now})
        if body.text.strip():
            s['turns'].append({'role': 'learner', 'text': body.text.strip(), 'key': body.key, 'at': now})
        s['updated_at'] = now
        store.put_knowledge('tutor_sessions', sid, s)
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    return await _reply(store, s, l)


@router.post('/sessions/{sid}/end')
async def end(sid: str, store=Depends(store_for)):
    """End the session and write its debrief. Ending an ended session retries a debrief that failed."""
    s, now = _session(store, sid), time.time()
    was_active = s['status'] == 'active'
    ses.end(s, now)
    store.put_knowledge('tutor_sessions', sid, s)
    if ses.needs_debrief(s) and llm.enabled(store.get_settings()):
        await _debrief(store, s, _lesson(s['section'], s['lesson']))
    elif was_active:
        _remember(store, s, now, '')
    return public(s)


def _remember(store, s, now, event):
    mk = _memory_key(s['section'], s['lesson'])
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    mem.update(summary=s['summary'] or mem.get('summary', ''), last_at=now,
               active=s['id'] if s['status'] == 'active' else None)
    store.put_knowledge('tutor_memory', mk, mem)
    st = {k: v for k, v in (store.get_knowledge('tutor_memory', STORY_KEY) or {}).items() if k != '_key'}
    l = lessons.get(s['section'], s['lesson'])
    st.update(events=story.remember(st.get('events'), event, now), last_lesson=l['title'],
              summary=f'{l["title"]}: {s["summary"]}' if s['summary'] else st.get('summary', ''))
    store.put_knowledge('tutor_memory', STORY_KEY, st)


async def _ask(store, s, l, now, debrief=False):
    """One model call for this session. -> (validated reply or None, allowed points, open misconceptions)."""
    c, states, seen, mis, summary = _knowledge(store, now)
    own, prereqs = lessons.points(l['section'], l['id'], c)
    views = kmodel.views(c, states, seen, mis, now, own)
    prereq_views = kmodel.views(c, states, seen, mis, now, prereqs)
    allowed = {p['id'] for p in own + prereqs}
    open_mis = [m for m in mis if m.get('status') == 'open' and m['point'] in allowed]
    memory = store.get_knowledge('tutor_memory', _memory_key(l['section'], l['id'])) or {}
    story_mem = store.get_knowledge('tutor_memory', STORY_KEY) or {}
    prompt = ses.payload(s, l, views, prereq_views, open_mis, {**memory, 'events': story_mem.get('events', [])},
                         story.scale(summary), debrief=debrief)
    try:
        raw = await asyncio.to_thread(llm._raw_generate, 'openrouter', config.TUTOR_MODEL, ses.system(s['mode'], debrief),
                                      json.dumps(prompt, ensure_ascii=False), ses.TutorReply,
                                      options={'effort': 'low', 'max_tokens': 4000, 'timeout': 60, 'metadata': True})
        reply = ses.TutorReply.model_validate_json(raw['content']).model_dump()
    except Exception as exc:
        log.warning('Tutor reply failed: %s', type(exc).__name__)
        s['error'] = DEBRIEF_FAILED if debrief else FAILED
        store.put_knowledge('tutor_sessions', s['id'], s)
        return None, allowed, open_mis
    s.pop('error', None)
    usage = raw.get('usage') or {}
    s['usage'] = {'calls': s['usage']['calls'] + 1, 'input': s['usage']['input'] + int(usage.get('prompt_tokens') or 0),
                  'output': s['usage']['output'] + int(usage.get('completion_tokens') or 0)}
    return reply, allowed, open_mis


async def _debrief(store, s, l):
    now = time.time()
    reply, _, _ = await _ask(store, s, l, now, debrief=True)
    if reply:
        ses.apply_debrief(s, reply, now)
        store.put_knowledge('tutor_sessions', s['id'], s)
    _remember(store, s, now, '')


async def _reply(store, s, l):
    now = time.time()
    reply, allowed, open_mis = await _ask(store, s, l, now)
    if not reply:
        return public(s)
    turn, writes, event = ses.apply(s, reply, l, allowed, {m['_key'] for m in open_mis}, now)
    store.put_knowledge('tutor_sessions', s['id'], s)
    n = len(s['turns'])
    kb_api.write_events(store, SOURCE, [
        {'key': f'{s["id"]}-{n}-{i}', 'points': [e['point']], 'clean': e['clean'], 'depth': e['depth'],
         'strength': 'soft', 'note': e['quote'][:500], 'ref': s['id']} for i, e in enumerate(writes['evidence'])], now)
    for i, m in enumerate(writes['misconceptions']):
        kb_api.add_misconception(store, SOURCE, f'{s["id"]}-{n}-{i}', m['point'], m['text'], m['quote'], now)
    for key in writes['resolved']:
        kb_api.set_misconception(store, key, 'resolved', 'Corrected in a tutor session.', now)
    _remember(store, s, now, event)
    if ses.needs_debrief(s):  # the last objective was just shown
        await _debrief(store, s, l)
    return public(s)
