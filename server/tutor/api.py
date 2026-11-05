"""HTTP API for the tutor: /api/tutor/... The learner's turn is stored before the model is called.

Each turn makes two calls at once (session.py): the tutor talks (TUTOR_MODEL, plain chat) and the
note-taker records what the learner's latest words show (TUTOR_NOTES_MODEL, structured). A turn
whose reply failed can be retried with the same key: the stored turn is reused and only the reply
is generated again; a failed note is simply skipped. Ending a session writes its debrief; a
debrief that failed is written again by ending the session again. Validated evidence and
misconceptions go to the knowledge base (source "tutor", soft evidence); block answers are
recorded by the lesson's own activity endpoint, so they stay hard evidence. Senpai's career brief
(goal, market, CV) goes into the prompt; without Job Scout context it is simply left out.
"""
import asyncio
import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import auth, config, handback_filing as hf, llm
from ..knowledge_base import api as kb_api, catalog as kcat, model as kmodel, progress
from ..store import get_store
from ..senpai import career as senpai_career
from . import learner as lm, lessons, session as ses, story

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/tutor', tags=['tutor'])
KEY = r'^[A-Za-z0-9_-]{6,64}$'
STORY_KEY = 'story'
CV_KEY = 'cv'
LEARNER_KEY = 'learner'
PARK_DAYS = 7
UNAVAILABLE = 'The tutor needs the model, which is not connected. The lesson itself still works.'
FAILED = 'The tutor could not answer just now. Your message is saved; try again.'
DEBRIEF_FAILED = 'The debrief could not be written just now. Your session is saved; try again.'
SOURCE = 'tutor'
PICKUP_DAYS = 14   # a new session picks up from an outside tutor's handback this recent


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def _memory_key(section, lesson):
    return f'lesson:{section}:{lesson}'


def _lesson(section, key):
    l = lessons.get(section, key)
    if not l:
        raise HTTPException(404, 'Unknown lesson')
    return l


def _live(store, s):
    """An active session, unless it is only an opener he never answered, written by an older prompt:
    that one is closed (kept, not deleted) so he starts fresh instead of resuming a stale question."""
    if not s or s['status'] != 'active':
        return None
    if s.get('prompt_version', 0) < ses.PROMPT_VERSION and not any(t['role'] in ('learner', 'block') for t in s['turns']):
        ses.end(s, time.time())
        s['ended_by'] = 'superseded'
        store.put_knowledge('tutor_sessions', s['id'], s)
        mk = _memory_key(s['section'], s['lesson'])
        mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
        changed = mem.get('active') == s['id']
        if changed:
            mem['active'] = None
        if (mem.get('outside') or {}).get('picked_up_by') == s['id']:   # the handback was never really picked up
            mem['outside'] = {k: v for k, v in mem['outside'].items() if k != 'picked_up_by'}
            changed = True
        if changed:
            store.put_knowledge('tutor_memory', mk, mem)
        return None
    return s


def _session(store, sid):
    s = store.get_knowledge('tutor_sessions', sid)
    if not s:
        raise HTTPException(404, 'Unknown tutor session')
    return s


def _job(store):
    try:
        return store.get_senpai('senpai', 'job_context') or {}
    except Exception:  # career context is optional
        return {}


def _has_cv(store):
    return bool(((_job(store).get('context') or {}).get('experience')))


def _modes(store=None):
    cv = store is not None and _has_cv(store)
    return [{'id': k, 'label': v[0], 'blurb': v[1]} for k, v in ses.MODES.items() if cv or k not in ses.NEEDS_CV]


def _career(store, lesson):
    job = _job(store)
    try:
        plan = store.get_senpai('senpai', 'plan') or {}
    except Exception:
        plan = {}
    return senpai_career.tutor_brief(senpai_career.goal(store.get_settings(), job), job, plan,
                                     lesson['section'], lesson['category'], lesson['id'])


def _knowledge(store, now):
    c, _, states, seen, mis = kb_api.evidence(store, now)
    return c, states, seen, mis, kmodel.summary(c, states, seen, mis, now)


def public(s):
    return ses.public(s)


@router.get('')
def overview(store=Depends(store_for)):
    """Whether the tutor is available, its modes, and the company's story so far."""
    _, _, _, _, summary = _knowledge(store, time.time())
    return {'enabled': llm.enabled(store.get_settings()), 'model': config.TUTOR_MODEL, 'modes': _modes(store),
            'story': story.public(summary, store.get_knowledge('tutor_memory', STORY_KEY))}


@router.get('/next')
def next_step(section: Literal['system-design', 'fundamentals', 'ai'], store=Depends(store_for)):
    """The one thing to do next in a section, chosen from what you know, with two alternatives.

    Works without the model: the choice is deterministic; with it, lessons go through the tutor.
    """
    now = time.time()
    c, events, states, seen, mis = kb_api.evidence(store, now)
    mis = [m for m in mis if not kb_api.parked(m, now)]
    week_ago, _ = kmodel.replay(events, now - progress.WEEK)
    rep = progress.report(c, states, week_ago, seen, mis, now, section)
    tutor = llm.enabled(store.get_settings())
    prefix = f'lesson:{section}:'
    mine = sorted((m for m in store.list_knowledge('tutor_memory') if m.get('_key', '').startswith(prefix)),
                  key=lambda m: -(m.get('last_at') or 0))
    titles = {l['id']: l['title'] for a in rep['areas'] for l in a['lessons']}
    active = None
    for m in mine:
        s = _live(store, store.get_knowledge('tutor_sessions', m['active'])) if m.get('active') else None
        if s:
            active = {'lesson': s['lesson'], 'lesson_title': titles.get(s['lesson'], s['lesson'])}
            break
    last = next((m for m in mine if m.get('summary')), None)
    lesson = last['_key'][len(prefix):] if last else None
    previously = {'lesson': lesson, 'lesson_title': titles.get(lesson, lesson), 'summary': last['summary'],
                  'at': last.get('last_at')} if last else None
    summary = kmodel.summary(c, states, seen, mis, now)
    sc = story.scale(summary)
    step = progress.next_step(rep, tutor, active, mine[0]['_key'][len(prefix):] if mine else None)
    nxt = lm.fresh_next(store.get_knowledge('tutor_memory', LEARNER_KEY), now) if tutor else None
    if nxt and nxt['section'] == section and nxt['lesson'] in titles and step['primary'].get('kind') != 'resume':
        step = {'primary': {'kind': 'learn', 'lesson': nxt['lesson'], 'title': f"Your tutor suggests {titles[nxt['lesson']]}",
                            'why': nxt['why'] or 'Where your tutor said to go next.', 'label': 'Go with the tutor', 'tutor': True},
                'alternatives': ([step['primary']] + step['alternatives'])[:2]}
    return {**step,
            'tutor': tutor, 'previously': previously,
            'standing': {k: rep[k] for k in ('total', 'tested', 'coverage', 'score', 'level', 'slipping', 'held')}
                        | {'misconceptions': len(rep['misconceptions']), 'week': {k: rep['week'][k] for k in ('gained', 'slipped')}},
            'company': {'name': story.BIBLE['company'], 'label': sc['label'], 'users': sc['users']}}


@router.get('/home')
def home(store=Depends(store_for)):
    """What the tutor would do with you right now: resume a conversation, its own suggestion for next,
    the lesson you just studied with your other tutor, or the course's next step. Plus what it remembers."""
    now, titles = time.time(), lessons.titles()
    learner = store.get_knowledge('tutor_memory', LEARNER_KEY) or {}
    mems = sorted((m for m in store.list_knowledge('tutor_memory') if str(m.get('_key', '')).startswith('lesson:')),
                  key=lambda m: -(m.get('last_at') or 0))
    pick = None
    for m in mems:
        s = _live(store, store.get_knowledge('tutor_sessions', m['active'])) if m.get('active') else None
        if s and any(t['role'] == 'learner' for t in s['turns']) and now - s['updated_at'] < 3 * 86400:
            pick = {'kind': 'resume', 'section': s['section'], 'lesson': s['lesson'],
                    'why': 'You left this conversation part-way through; it remembers where you got to.'}
            break
    nxt = lm.fresh_next(learner, now)
    if not pick and nxt and (nxt['section'], nxt['lesson']) in titles:
        pick = {'kind': 'next', 'section': nxt['section'], 'lesson': nxt['lesson'],
                'why': nxt['why'] or 'Where your tutor suggested going next.'}
    if not pick:
        for m in mems:
            o = m.get('outside') or {}
            if o and not o.get('picked_up_by') and now - o.get('at', 0) < PICKUP_DAYS * 86400:
                _, section, lesson = m['_key'].split(':', 2)
                pick = {'kind': 'pickup', 'section': section, 'lesson': lesson,
                        'why': 'You studied this with your other tutor; carry on here, from where it left off.'}
                break
    if not pick:
        step = next_step('system-design', store)['primary']
        if step.get('lesson'):
            pick = {'kind': 'resume' if step.get('kind') == 'resume' else 'course', 'section': 'system-design',
                    'lesson': step['lesson'], 'why': step.get('why', '')}
    if pick:
        pick['title'] = titles.get((pick['section'], pick['lesson']), pick['lesson'])
    return {'enabled': llm.enabled(store.get_settings()), 'pick': pick,
            'notes': [{'text': n['text'], 'at': n['at']} for n in learner.get('notes', [])],
            'style': lm.style_notes(store.list_knowledge('study_sessions'), learner)}


class Forget(BaseModel):
    text: str = Field(max_length=300)


@router.post('/learner/forget')
def forget(body: Forget, store=Depends(store_for)):
    """Drop one note the tutor kept about you."""
    learner = store.get_knowledge('tutor_memory', LEARNER_KEY) or {}
    learner.pop('_key', None)
    learner['notes'] = [n for n in learner.get('notes', []) if n['text'] != body.text]
    store.put_knowledge('tutor_memory', LEARNER_KEY, learner)
    return {'notes': learner['notes']}


@router.get('/lessons/{section}/{lesson}')
def lesson_state(section: str, lesson: str, store=Depends(store_for)):
    l = _lesson(section, lesson)
    mem = store.get_knowledge('tutor_memory', _memory_key(section, lesson)) or {}
    active = _live(store, store.get_knowledge('tutor_sessions', mem['active'])) if mem.get('active') else None
    outside, elsewhere = hf.lesson_report(store.list_knowledge('study_sessions'), section, lesson)
    if outside:
        mo = mem.get('outside') or {}
        outside['picks_up'] = bool(mo.get('session') in outside['sessions'] and not mo.get('picked_up_by')
                                   and time.time() - mo['at'] < PICKUP_DAYS * 86400)
    elsewhere = [{**e, 'lesson_title': (lessons.get(e['section'], e['lesson']) or {}).get('title', e['lesson'])} for e in elsewhere]
    return {'enabled': llm.enabled(store.get_settings()), 'modes': _modes(store), 'objectives': l['objectives'],
            'previously': mem.get('summary', ''), 'sessions': mem.get('sessions', 0),
            'scene': story.chapter(section, l['category']), 'outside': outside, 'outside_elsewhere': elsewhere,
            'active': public(active) if active and active['status'] == 'active' else None,
            'next': _next_from(store, section, lesson)}


def _last_debrief(store, section, lesson, sid):
    """For sessions ended before memory kept debriefs: the newest debrief on this lesson, from the session itself."""
    done = [x for x in store.list_knowledge('tutor_sessions') if x.get('section') == section and x.get('lesson') == lesson
            and x.get('id') != sid and x.get('turns') and x['turns'][-1].get('debrief')]
    if not done:
        return {}
    x = max(done, key=lambda x: x.get('ended_at') or x.get('updated_at') or 0)
    return {'debrief': {'text': x['turns'][-1]['say'][:3000], 'at': x.get('ended_at') or x['turns'][-1]['at'],
                        'session': x['id'], 'turns': len(x['turns'])}}


def _next_from(store, section, lesson):
    """Where the tutor suggested going after this lesson ([[next]]), if somewhere else and still fresh."""
    n = lm.fresh_next(store.get_knowledge('tutor_memory', LEARNER_KEY) or {}, time.time())
    if not n or (n['section'], n['lesson']) == (section, lesson):
        return None
    title = lessons.titles().get((n['section'], n['lesson']))
    return title and {'section': n['section'], 'lesson': n['lesson'], 'title': title, 'why': n.get('why', '')}


class Start(BaseModel):
    section: Literal['system-design', 'fundamentals', 'ai']
    lesson: str = Field(max_length=80)
    mode: Literal['teach', 'explain', 'critique', 'war-room', 'interview', 'cv'] = 'teach'
    key: str = Field(pattern=KEY, description='Client-made session id: a retried start opens the same session.')
    focus: str = Field(default='', max_length=300, description='One gap this session is opened to close.')
    carry: str | None = Field(default=None, pattern=KEY, description='A session the tutor moved from; it ends and its thread carries on here.')


@router.post('/sessions')
async def start(body: Start, store=Depends(store_for)):
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    l, now = _lesson(body.section, body.lesson), time.time()
    s = store.get_knowledge('tutor_sessions', body.key)
    if s and any(t['role'] == 'tutor' for t in s['turns']):
        return public(s)
    if body.mode in ses.NEEDS_CV and not _has_cv(store):
        raise HTTPException(422, 'Defend your CV needs your CV from Job Scout, which has not synced yet.')
    if not s:
        s = ses.new(body.key, l, body.mode, now)
        if body.focus.strip():
            s['focus'] = body.focus.strip()
        if body.carry:
            _carry(store, s, body.carry, now)
        mk = _memory_key(body.section, body.lesson)
        mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
        outside = mem.get('outside')
        if outside and not outside.get('picked_up_by') and now - outside['at'] < PICKUP_DAYS * 86400 and not s.get('carried'):
            study = store.get_knowledge('study_sessions', outside['session']) or {}
            s['pickup'] = {**{k: outside[k] for k in ('session', 'at', 'summary', 'next_steps')},
                           'notes': [n for n in study.get('notes') or [] if isinstance(n, str)][:10]}
            mem['outside'] = {**outside, 'picked_up_by': body.key}
        store.create_knowledge('tutor_sessions', body.key, s)
        if body.mode in ses.NEEDS_CV:   # Senpai's weekly brief stops suggesting it for a while
            store.put_knowledge('tutor_memory', CV_KEY, {'last_at': now, 'lesson': f'{body.section}:{body.lesson}'})
        store.put_knowledge('tutor_memory', mk, {**mem, 'active': body.key, 'sessions': mem.get('sessions', 0) + 1, 'last_at': now})
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


def _remember(store, s, now, event, debrief=''):
    mk = _memory_key(s['section'], s['lesson'])
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    mem.update(summary=s['summary'] or mem.get('summary', ''), last_at=now,
               active=s['id'] if s['status'] == 'active' else None)
    if debrief:   # the whole session in the tutor's words; the rolling summary only covers its last turns
        mem['debrief'] = {'text': debrief[:3000], 'at': now, 'session': s['id'], 'turns': len(s['turns'])}
    if s['summary']:
        mem['summary_from'] = 'tutor'
    store.put_knowledge('tutor_memory', mk, mem)
    st = {k: v for k, v in (store.get_knowledge('tutor_memory', STORY_KEY) or {}).items() if k != '_key'}
    l = lessons.get(s['section'], s['lesson'])
    st.update(events=story.remember(st.get('events'), event, now), last_lesson=l['title'],
              summary=f'{l["title"]}: {s["summary"]}' if s['summary'] else st.get('summary', ''))
    store.put_knowledge('tutor_memory', STORY_KEY, st)


def _profile(store, l, summary, events, own, now):
    """Who he is beyond this lesson (learner.py), the lesson's ideas covered elsewhere, and where the tutor can go."""
    titles = lessons.titles()
    learner = store.get_knowledge('tutor_memory', LEARNER_KEY) or {}
    study = store.list_knowledge('study_sessions')
    profile = {'style': lm.style_notes(study, learner), 'standing': lm.standing(summary),
               'lately': lm.other_lessons(store.list_knowledge('tutor_memory'), titles, _memory_key(l['section'], l['id']), now),
               'outside': lm.outside_reports(study, titles, now)}
    return {'text': lm.text(profile), 'covered': [p['claim'] for p in lm.covered_elsewhere(events, own, now)],
            'lessons': lessons.catalogue(exclude=(l['section'], l['id']))}


def _context(store, s, l, now):
    """What both calls need: the lesson's point views, open misconceptions, memory, story and who he is."""
    c, events, states, seen, mis = kb_api.evidence(store, now)
    summary = kmodel.summary(c, states, seen, mis, now)
    own, prereqs = lessons.points(l['section'], l['id'], c)
    allowed = {p['id'] for p in own + prereqs}
    memory = store.get_knowledge('tutor_memory', _memory_key(l['section'], l['id'])) or {}
    if not memory.get('debrief'):
        memory = {**memory, **_last_debrief(store, l['section'], l['id'], s['id'])}
    story_mem = store.get_knowledge('tutor_memory', STORY_KEY) or {}
    return {'views': kmodel.views(c, states, seen, mis, now, own), 'prereq_views': kmodel.views(c, states, seen, mis, now, prereqs),
            'allowed': allowed, 'open': [m for m in mis if m.get('status') == 'open' and m['point'] in allowed
                                         and not kb_api.parked(m, now)],
            'memory': {**memory, 'events': story_mem.get('events', [])}, 'story': story.scale(summary),
            'career': _career(store, l), 'profile': _profile(store, l, summary, events, own, now)}


def _carry(store, s, from_sid, now):
    """Moving lessons mid-conversation: the old session ends quietly and its thread comes along."""
    old = store.get_knowledge('tutor_sessions', from_sid)
    if not old:
        return
    talk = [t for t in old['turns'] if t['role'] in ('tutor', 'learner') and not t.get('debrief')][-8:]
    who = lambda t: 'Him' if t['role'] == 'learner' else 'You'  # noqa: E731
    s['carried'] = {'from': (lessons.get(old['section'], old['lesson']) or {}).get('title', old['lesson']),
                    'session': from_sid, 'turns': [f"{who(t)}: {(t.get('text') or t.get('say') or '')[:500]}" for t in talk]}
    if old['status'] == 'active':
        ses.end(old, now)
        old['ended_by'] = 'moved ' + s['id']
        store.put_knowledge('tutor_sessions', from_sid, old)
        _remember(store, old, now, '')


def _act(store, s, l, turn, acts, now):
    """The tutor's own moves: suggest a lesson to go to, set what's next, call a lesson enough, keep a note."""
    titles = lessons.titles()
    if acts['move'] and acts['move'] in titles and acts['move'] != (l['section'], l['id']):
        turn['move'] = {'section': acts['move'][0], 'lesson': acts['move'][1], 'title': titles[acts['move']]}
    learner = store.get_knowledge('tutor_memory', LEARNER_KEY) or {}
    learner.pop('_key', None)
    before = dict(learner)
    if acts['next'] and acts['next'][:2] in titles:
        learner = lm.set_next(learner, acts['next'][0], acts['next'][1], acts['next'][2], now)
    for n in acts['notes']:
        learner = lm.add_note(learner, n, now)
    if learner != before:
        store.put_knowledge('tutor_memory', LEARNER_KEY, learner)
    if acts['enough'] and not s.get('enough'):
        s['enough'] = now
        _park_lesson_gaps(store, l, now)


def _park_lesson_gaps(store, l, now):
    """A lesson called good enough: its open gaps rest for a week instead of being asked again."""
    own, prereqs = lessons.points(l['section'], l['id'], kcat.CATALOG)
    ids = {p['id'] for p in own}
    for m in store.list_knowledge('knowledge_misconceptions'):
        if m.get('status') == 'open' and m.get('point') in ids:
            kb_api.park(store, m['_key'], now + PARK_DAYS * 86400, 'tutor')


def _count(s, usage):
    s['usage'] = {'calls': s['usage']['calls'] + 1, 'input': s['usage']['input'] + int(usage.get('prompt_tokens') or 0),
                  'output': s['usage']['output'] + int(usage.get('completion_tokens') or 0)}


async def _talk(s, l, ctx, debrief=False):
    """The tutor's reply as plain text, or None when the model failed."""
    system = ses.system(s, l, ctx['views'], ctx['open'], ctx['memory'], ctx['story'], debrief=debrief, career=ctx.get('career'),
                        profile=ctx.get('profile'))
    messages = [{'role': 'system', 'content': system}, *ses.messages(s, l, debrief)]
    for _ in range(2):   # a reply with nothing visible (all private notes) gets one more try
        try:
            raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, messages, options={'max_tokens': 2500, 'timeout': 60, 'think': False})
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
    _remember(store, s, now, '', debrief=s['turns'][-1]['say'] if text is not None else '')


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
    _act(store, s, l, turn, ses.actions(text), now)
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
