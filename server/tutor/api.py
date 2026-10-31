"""HTTP API for the tutor: /api/tutor/... The learner's turn is stored before the model is called.

Each turn makes two calls at once (session.py): the tutor talks (TUTOR_MODEL, plain chat) and the
note-taker records what the learner's latest words show (TUTOR_NOTES_MODEL, structured). A turn
whose reply failed can be retried with the same key: the stored turn is reused and only the reply
is generated again; a failed note is simply skipped. Ending a session writes its debrief; a
debrief that failed is written again by ending the session again. Validated evidence and
misconceptions go to the knowledge base (source "tutor", soft evidence); block answers are
recorded by the lesson's own activity endpoint, so they stay hard evidence.
"""
import asyncio
import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import auth, config, llm
from ..knowledge_base import api as kb_api, catalog as kcat, model as kmodel, progress
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


@router.get('/next')
def next_step(section: Literal['system-design', 'fundamentals', 'ai'], store=Depends(store_for)):
    """The one thing to do next in a section, chosen from what you know, with two alternatives.

    Works without the model: the choice is deterministic; with it, lessons go through the tutor.
    """
    now = time.time()
    c, events, states, seen, mis = kb_api.evidence(store, now)
    week_ago, _ = kmodel.replay(events, now - progress.WEEK)
    rep = progress.report(c, states, week_ago, seen, mis, now, section)
    tutor = llm.enabled(store.get_settings())
    prefix = f'lesson:{section}:'
    mine = sorted((m for m in store.list_knowledge('tutor_memory') if m.get('_key', '').startswith(prefix)),
                  key=lambda m: -(m.get('last_at') or 0))
    titles = {l['id']: l['title'] for a in rep['areas'] for l in a['lessons']}
    active = None
    for m in mine:
        s = store.get_knowledge('tutor_sessions', m['active']) if m.get('active') else None
        if s and s['status'] == 'active':
            active = {'lesson': s['lesson'], 'lesson_title': titles.get(s['lesson'], s['lesson'])}
            break
    last = next((m for m in mine if m.get('summary')), None)
    lesson = last['_key'][len(prefix):] if last else None
    previously = {'lesson': lesson, 'lesson_title': titles.get(lesson, lesson), 'summary': last['summary'],
                  'at': last.get('last_at')} if last else None
    summary = kmodel.summary(c, states, seen, mis, now)
    sc = story.scale(summary)
    return {**progress.next_step(rep, tutor, active, mine[0]['_key'][len(prefix):] if mine else None),
            'tutor': tutor, 'previously': previously,
            'standing': {k: rep[k] for k in ('total', 'tested', 'coverage', 'score', 'level', 'slipping', 'held')}
                        | {'misconceptions': len(rep['misconceptions']), 'week': {k: rep['week'][k] for k in ('gained', 'slipped')}},
            'company': {'name': story.BIBLE['company'], 'label': sc['label'], 'users': sc['users']}}


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


def _context(store, s, l, now):
    """What both calls need: the lesson's point views, open misconceptions, memory and story."""
    c, states, seen, mis, summary = _knowledge(store, now)
    own, prereqs = lessons.points(l['section'], l['id'], c)
    allowed = {p['id'] for p in own + prereqs}
    memory = store.get_knowledge('tutor_memory', _memory_key(l['section'], l['id'])) or {}
    story_mem = store.get_knowledge('tutor_memory', STORY_KEY) or {}
    return {'views': kmodel.views(c, states, seen, mis, now, own), 'prereq_views': kmodel.views(c, states, seen, mis, now, prereqs),
            'allowed': allowed, 'open': [m for m in mis if m.get('status') == 'open' and m['point'] in allowed],
            'memory': {**memory, 'events': story_mem.get('events', [])}, 'story': story.scale(summary)}


def _count(s, usage):
    s['usage'] = {'calls': s['usage']['calls'] + 1, 'input': s['usage']['input'] + int(usage.get('prompt_tokens') or 0),
                  'output': s['usage']['output'] + int(usage.get('completion_tokens') or 0)}


async def _talk(s, l, ctx, debrief=False):
    """The tutor's reply as plain text, or None when the model failed."""
    system = ses.system(s, l, ctx['views'], ctx['open'], ctx['memory'], ctx['story'], debrief=debrief)
    messages = [{'role': 'system', 'content': system}, *ses.messages(s, l, debrief)]
    for _ in range(2):   # a reply with nothing visible (all private notes) gets one more try
        try:
            raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, messages, options={'max_tokens': 2500, 'timeout': 60})
        except Exception as exc:
            log.warning('Tutor reply failed: %s', type(exc).__name__)
            return None
        _count(s, raw.get('usage') or {})
        if ses.parse(raw['content'], s, l)[0]:
            return raw['content']
    log.warning('Tutor reply had nothing to show')
    return None


async def _take_notes(s, l, ctx):
    """The note-taker's record of the learner's latest words, or None (the turn still goes ahead)."""
    payload = ses.notes_payload(s, l, ctx['views'], ctx['prereq_views'], ctx['open'])
    try:
        raw = await asyncio.to_thread(llm._raw_generate, 'openrouter', config.TUTOR_NOTES_MODEL, ses.NOTES_SYSTEM,
                                      json.dumps(payload, ensure_ascii=False), ses.Notes,
                                      options={'effort': 'low', 'max_tokens': 3000, 'timeout': 60, 'metadata': True})
        notes = ses.Notes.model_validate_json(raw['content']).model_dump()
    except Exception as exc:
        log.warning('Tutor notes failed: %s', type(exc).__name__)
        return None
    _count(s, raw.get('usage') or {})
    return notes


async def _debrief(store, s, l):
    now = time.time()
    text = await _talk(s, l, _context(store, s, l, now), debrief=True)
    if text is None:
        s['error'] = DEBRIEF_FAILED
    else:
        s.pop('error', None)
        ses.add_debrief(s, text, now)
    store.put_knowledge('tutor_sessions', s['id'], s)
    _remember(store, s, now, '')


async def _reply(store, s, l):
    """One turn: the tutor talks while the note-taker records the learner's latest words."""
    now = time.time()
    ctx = _context(store, s, l, now)
    said, blocks = ses.latest_learner(s)
    learner_spoke = bool(said or blocks)
    text, notes = await asyncio.gather(_talk(s, l, ctx), _take_notes(s, l, ctx) if learner_spoke else asyncio.sleep(0))
    if text is None:
        s['error'] = FAILED
        store.put_knowledge('tutor_sessions', s['id'], s)
        return public(s)
    s.pop('error', None)
    writes, event = ({'evidence': [], 'misconceptions': [], 'resolved': []}, '')
    if notes:
        writes, event = ses.apply_notes(s, notes, said, blocks, ctx['allowed'], {m['_key'] for m in ctx['open']}, now)
    turn = ses.add_reply(s, text, l, now)
    turn['recorded'] = {k: len(v) for k, v in writes.items()}
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
    return public(s)
