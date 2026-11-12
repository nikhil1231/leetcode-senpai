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
import contextvars
import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import auth, chat_stream, config, handback_filing as hf, llm
from ..knowledge_base import api as kb_api, catalog as kcat, model as kmodel, progress
from ..store import get_store
from ..senpai import career as senpai_career
from . import learner as lm, lessons, resources as res, rig, session as ses, story

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
# Starting a session, a turn and ending a session answer with server-sent events when the request accepts
# them: the reply as it arrives (chat_stream.Visible), then {type: done, session} with the stored record.
_SINK = contextvars.ContextVar('tutor_sink', default=None)
_RUNNING = set()   # streamed turns finish and are stored even when the browser goes away


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
    if s.get('prompt_version', 0) < ses.PROMPT_VERSION and not any(t['role'] in ('learner', 'block', 'run') for t in s['turns']):
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
    return [{'id': k, 'label': v[0], 'blurb': v[1]} for k, v in ses.MODES.items()
            if (cv or k not in ses.NEEDS_CV) and k not in ses.OVERVIEW_ONLY]


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
    done = {r['lesson_id'] for r in store.list_design_records() if r.get('kind') == 'course_lesson' and r.get('tested_out_at')} \
        if section == 'system-design' else set()
    worked = _worked(store, mine) if section == 'system-design' else set()
    step = progress.next_step(rep, tutor, active, mine[0]['_key'][len(prefix):] if mine else None, done,
                              sessions=worked, designs=_designs() if section == 'system-design' else (),
                              play=_next_level(store) if section == 'system-design' else None)
    # The tutor's own suggestion is offered beside the course order, not over it: following it
    # every time hopped between areas and left lessons behind.
    nxt = lm.fresh_next(store.get_knowledge('tutor_memory', LEARNER_KEY), now) if tutor else None
    if nxt and nxt['section'] == section and nxt['lesson'] in titles and nxt['lesson'] not in done \
            and nxt['lesson'] != step['primary'].get('lesson'):
        step = {**step, 'alternatives': [{'kind': 'learn', 'lesson': nxt['lesson'], 'title': f"Your tutor suggests {titles[nxt['lesson']]}",
                                          'why': nxt['why'] or 'Where your tutor said to go next.', 'label': 'Go with the tutor', 'tutor': True},
                                         *step['alternatives']][:2]}
    return {**step,
            'tutor': tutor, 'previously': previously,
            'standing': {k: rep[k] for k in ('total', 'tested', 'coverage', 'score', 'level', 'slipping', 'held')}
                        | {'misconceptions': len(rep['misconceptions']), 'week': {k: rep['week'][k] for k in ('gained', 'slipped')}},
            'company': {'name': story.BIBLE['company'], 'label': sc['label'], 'users': sc['users']}}


MAP_TURNS = 3   # learner messages for a map or design session to count as done


def _worked(store, mine):
    """Areas mapped and designs worked through with the tutor at map depth (pass one)."""
    out = set()
    for m in mine:
        key = m['_key'].split(':', 2)[2]
        if m.get('mapped_at'):
            out.add(key[len(lessons.MAP_PREFIX):] if key.startswith(lessons.MAP_PREFIX) else key)
    return out


def _designs():
    """Whole-design lessons in course order with the areas their ideas lean on."""
    c, out = kcat.CATALOG, []
    pts = [p for p in kcat.active(c) if p['section'] == 'system-design']
    for k, title in lessons.titles().items():
        if k[0] != 'system-design' or k[1].startswith(lessons.MAP_PREFIX):
            continue
        mine = [p for p in pts if p['lesson'] == k[1]]
        if not mine or mine[0]['category'] not in lessons.DESIGN_AREAS:
            continue
        needs = {c['points'][r]['category'] for p in mine for r in p['requires']} - set(lessons.DESIGN_AREAS)
        out.append({'lesson': k[1], 'title': title, 'needs': needs})
    return out


def _ripple(store):
    """Ripple Ops progress ({levels, unlocked}), or None if it can't be read."""
    try:
        from .. import ripple_ops
        return ripple_ops.progress(list(ripple_ops.LEVELS.values()), ripple_ops._runs(store))
    except Exception:  # the game is optional context
        return None


def _next_level(store):
    """The next main Ripple Ops level he hasn't survived, with the areas its lessons belong to."""
    from ..system_design_curriculum import LESSONS as SD
    prog = _ripple(store)
    if not prog:
        return None
    for r in res.ALL:
        if r['kind'] == 'game' and r['id'] in prog['unlocked'] and not (prog['levels'].get(r['id']) or {}).get('best'):
            return {'id': r['id'], 'title': r['title'], 'href': r['href'],
                    'areas': sorted({SD[x]['category'] for x in r['lessons'] if x in SD} - set(lessons.DESIGN_AREAS))}
    return None


Section = Literal['system-design', 'fundamentals', 'ai']


@router.get('/map/{area}')
def area_map(area: str, section: Section = 'system-design', store=Depends(store_for)):
    """An area map for its page: the lesson the tutor teaches, its lessons with what you hold in each
    layer, and the game levels, worked designs and simulators that practise the area."""
    l = lessons.area_map(area, section)
    if not l:
        raise HTTPException(404, 'Unknown area')
    now = time.time()
    c, _, states, seen, mis = kb_api.evidence(store, now)
    views = kmodel.views(c, states, seen, mis, now, [p for p in kcat.active(c) if p['section'] == section and p['lesson'] in l['map']['lessons']])
    titles = lessons.titles()
    prog = _ripple(store) if section == 'system-design' else None
    mem = store.get_knowledge('tutor_memory', _memory_key(section, l['id'])) or {}
    review = store.get_knowledge('tutor_sessions', mem['review']) if mem.get('review') else None
    return {'review': public(review) if review else None, 'lesson': {k: l[k] for k in ('id', 'title', 'category', 'summary', 'objectives', 'blocks', 'map') + (('overview',) if l.get('overview') else ())},
            'step': mem.get('overview_step', 0), 'answers': mem.get('overview_answers') or {},
            'section': section,
            'lessons': [{'id': k, 'title': titles[(section, k)], 'layers': progress.layer_tally([v for v in views if v['lesson'] == k])}
                        for k in l['map']['lessons']],
            'layers': progress.layer_tally(views), 'mapped': bool(mem.get('mapped_at')),
            'resources': [{**{k: r[k] for k in ('key', 'kind', 'id', 'title', 'about', 'href', 'layer', 'lessons')},
                           'locked': r['kind'] == 'game' and prog is not None and r['id'] not in prog['unlocked']}
                          for r in (res.for_lessons(l['map']['lessons']) if section == 'system-design' else [])],
            'enabled': llm.enabled(store.get_settings())}


class OverviewStep(BaseModel):
    step: int = Field(ge=0, le=40, description='The step now open (0: the start).')
    finished: int = Field(default=-1, ge=-1, le=40, description='A step just finished, whose ideas count as seen; -1 for none.')
    done: bool = Field(default=False, description='The whole overview is finished.')
    answers: dict[str, bool] = Field(default_factory=dict, max_length=40, description='Activity keys answered on the page: right or not.')


@router.post('/map/{area}/step')
def overview_step(area: str, body: OverviewStep, section: Section = 'system-design', store=Depends(store_for)):
    """Where he is in an area overview. A finished step marks its lesson's map ideas as seen (exposures,
    once each; only system design is layered, so other courses mark none); finishing the overview counts
    the area as done for pass one, like a map session."""
    l = lessons.area_map(area, section)
    if not l or not l.get('overview'):
        raise HTTPException(404, 'No overview for this area')
    now, steps = time.time(), l['overview']['steps']
    mk = _memory_key(section, l['id'])
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    mem['overview_step'] = min(body.step, len(steps) + 2)   # the steps, then the check, then the wrap-up
    keys = {b['key'] for b in l['blocks']}
    mem['overview_answers'] = {**(mem.get('overview_answers') or {}), **{k: v for k, v in body.answers.items() if k in keys}}
    if 0 <= body.finished < len(steps):
        lesson = steps[body.finished]['lesson']
        pts = [p['id'] for p in kcat.active(kcat.CATALOG) if p['section'] == section and p['lesson'] == lesson and p['layer'] == kcat.MAP]
        kb_api.write_events(store, SOURCE, [{'kind': 'exposure', 'points': [pid], 'key': f'overview.{area}.{pid}' if section == 'system-design' else f'overview.{section}.{area}.{pid}', 'ref': l['id'],
                                             'note': 'Read in the area overview'} for pid in pts], now)
    if body.done and not mem.get('mapped_at'):
        mem['mapped_at'] = now
    store.put_knowledge('tutor_memory', mk, mem)
    return {'step': mem['overview_step'], 'mapped': bool(mem.get('mapped_at'))}


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
    mode: Literal['teach', 'explain', 'critique', 'war-room', 'interview', 'cv', 'review'] = 'teach'
    key: str = Field(pattern=KEY, description='Client-made session id: a retried start opens the same session.')
    focus: str = Field(default='', max_length=300, description='One gap this session is opened to close.')
    carry: str | None = Field(default=None, pattern=KEY, description='A session the tutor moved from; it ends and its thread carries on here.')
    layer: int = Field(default=0, ge=0, le=3, description='The layer the session aims at (1: map depth, pass one); 0 for the default.')


def _streams(request):
    return 'text/event-stream' in request.headers.get('accept', '')


async def _answer(request, work):
    """Run `work()` (-> the response body) plainly, or as an event stream when the browser asked for one."""
    if not _streams(request):
        return await work()
    queue = asyncio.Queue()

    async def run():
        _SINK.set(queue.put_nowait)
        return await work()

    async def events():
        task = asyncio.create_task(run())
        _RUNNING.add(task)
        task.add_done_callback(_RUNNING.discard)
        while True:
            get = asyncio.ensure_future(queue.get())
            done, _ = await asyncio.wait({get, task}, return_when=asyncio.FIRST_COMPLETED)
            if get in done:
                yield chat_stream.sse(get.result())
                continue
            get.cancel()
            while not queue.empty():
                yield chat_stream.sse(queue.get_nowait())
            break
        try:
            yield chat_stream.sse({'type': 'done', 'session': task.result()})
        except HTTPException as exc:
            yield chat_stream.sse({'type': 'error', 'status': exc.status_code, 'message': exc.detail})
        except Exception:
            log.exception('Streamed tutor turn failed')
            yield chat_stream.sse({'type': 'error', 'status': 500, 'message': FAILED})
    return StreamingResponse(events(), media_type='text/event-stream', headers=chat_stream.HEADERS)


@router.post('/sessions')
async def start(body: Start, request: Request, store=Depends(store_for)):
    return await _answer(request, lambda: _start(body, store))


async def _start(body, store):
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    l, now = _lesson(body.section, body.lesson), time.time()
    s = store.get_knowledge('tutor_sessions', body.key)
    if s and any(t['role'] == 'tutor' for t in s['turns']):
        return public(s)
    if body.mode == 'review' and not l.get('overview'):
        raise HTTPException(422, 'The check is for an area overview.')
    if l.get('map') and body.mode not in ('teach', 'review'):
        raise HTTPException(422, 'An area map is a teaching session.')
    if body.mode in ses.NEEDS_CV and not _has_cv(store):
        raise HTTPException(422, 'Defend your CV needs your CV from Job Scout, which has not synced yet.')
    if not s:
        s = ses.new(body.key, l, body.mode, now)
        if body.focus.strip():
            s['focus'] = body.focus.strip()
        if body.layer:
            s['layer'] = body.layer
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
        if body.mode == 'review':   # the check sits on the page beside the tutor's own session, not in place of it
            _replace_review(store, mem.get('review'), body.key, now)
            store.put_knowledge('tutor_memory', mk, {**mem, 'review': body.key, 'last_at': now})
        else:
            store.put_knowledge('tutor_memory', mk, {**mem, 'active': body.key, 'sessions': mem.get('sessions', 0) + 1, 'last_at': now})
    return await _reply(store, s, l)


def _replace_review(store, old, new, now):
    """A fresh overview check ends the previous one quietly (kept, no debrief)."""
    s = store.get_knowledge('tutor_sessions', old) if old and old != new else None
    if s and s['status'] == 'active':
        ses.end(s, now)
        s['ended_by'] = 'replaced ' + new
        store.put_knowledge('tutor_sessions', old, s)


class BlockResult(BaseModel):
    key: str = Field(pattern=r'^b\d{1,3}$')
    correct: bool


class Objective(BaseModel):
    label: str = Field(max_length=120)
    target: str = Field(max_length=40)
    actual: str = Field(max_length=40)
    # 'pass' is a keyword, so it arrives under an alias
    met: bool = Field(alias='pass')


class Outcome(BaseModel):
    label: str = Field(max_length=80)
    at: int = Field(ge=0, le=23)
    outcome: Literal['handled', 'degraded', 'outage']


class Node(BaseModel):
    id: str = Field(max_length=60)
    defId: str = Field(max_length=40)
    cfg: dict | None = None


class Edge(BaseModel):
    model_config = {'populate_by_name': True}
    source: str = Field(alias='from', max_length=60)
    to: str = Field(max_length=60)


class Graph(BaseModel):
    nodes: list[Node] = Field(max_length=60)
    edges: list[Edge] = Field(max_length=120)


class RunResult(BaseModel):
    """A simulated day he ran on a design the tutor handed over (the browser's summary of it)."""
    turn: int = Field(ge=0, le=500)
    availability: float = Field(ge=0, le=100)
    cost: float = Field(ge=0, le=1e10)
    objectives: list[Objective] = Field(default_factory=list, max_length=8)
    events: list[Outcome] = Field(default_factory=list, max_length=6)
    findings: list[str] = Field(default_factory=list, max_length=6)
    graph: Graph


class Turn(BaseModel):
    key: str = Field(pattern=KEY)
    text: str = Field(default='', max_length=4000)
    block: BlockResult | None = None
    run: RunResult | None = None


@router.get('/sessions/{sid}')
def get_session(sid: str, store=Depends(store_for)):
    return public(_session(store, sid))


@router.post('/sessions/{sid}/turns')
async def turn(sid: str, body: Turn, request: Request, store=Depends(store_for)):
    return await _answer(request, lambda: _turn(sid, body, store))


async def _turn(sid, body, store):
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
        if not body.text.strip() and not body.block and not body.run:
            raise HTTPException(422, 'Say something or answer a block.')
        design = _design(s, body.run) if body.run else None
        if body.block and body.block.key not in {t['key'] for t in lessons.tools(l)}:
            raise HTTPException(422, 'That block is not in this lesson.')
        now = time.time()
        if body.block:
            s['turns'].append({'role': 'block', 'block': body.block.key, 'correct': body.block.correct, 'key': body.key, 'at': now})
        if design:
            s['turns'].append({'role': 'run', 'design': body.run.turn, 'key': body.key, 'at': now, 'availability': body.run.availability,
                               'text': rig.result_text(_run_summary(body.run, design))})
        if body.text.strip():
            s['turns'].append({'role': 'learner', 'text': body.text.strip(), 'key': body.key, 'at': now})
        s['updated_at'] = now
        store.put_knowledge('tutor_sessions', sid, s)
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, UNAVAILABLE)
    return await _reply(store, s, l)


def _design(s, run):
    """The design a run belongs to: a tutor turn in this session that handed one over."""
    t = s['turns'][run.turn] if run.turn < len(s['turns']) else None
    if not t or t['role'] != 'tutor' or not t.get('designs'):
        raise HTTPException(422, 'That run is not for a design from this session.')
    return t['designs'][0]


def _run_summary(run, design):
    after = {'nodes': [n.model_dump() for n in run.graph.nodes], 'edges': [{'from': e.source, 'to': e.to} for e in run.graph.edges]}
    return {'title': design['title'], 'availability': run.availability, 'cost': run.cost, 'changes': rig.changes(design['graph'], after),
            'objectives': [{'label': o.label, 'target': o.target, 'actual': o.actual, 'pass': o.met} for o in run.objectives],
            'events': [o.model_dump() for o in run.events], 'findings': [f[:300] for f in run.findings]}


@router.post('/sessions/{sid}/end')
async def end(sid: str, request: Request, store=Depends(store_for)):
    """End the session and write its debrief. Ending an ended session retries a debrief that failed."""
    return await _answer(request, lambda: _end(sid, store))


async def _end(sid, store):
    s, now = _session(store, sid), time.time()
    was_active = s['status'] == 'active'
    ses.end(s, now)
    store.put_knowledge('tutor_sessions', sid, s)
    if was_active:
        _mark_worked(store, s, now)
    if ses.needs_debrief(s) and llm.enabled(store.get_settings()):
        await _debrief(store, s, _lesson(s['section'], s['lesson']))
    elif was_active:
        _remember(store, s, now, '')
    return public(s)


def _mark_worked(store, s, now):
    """A map session, or a design session opened from pass one, that he took part in counts for pass one."""
    l = lessons.get(s['section'], s['lesson']) or {}
    design = l.get('category') in lessons.DESIGN_AREAS
    if s['section'] != 'system-design' or not (l.get('map') or design) or s['mode'] != 'teach':
        return
    if sum(t['role'] == 'learner' for t in s['turns']) < MAP_TURNS:
        return
    mk = _memory_key(s['section'], s['lesson'])
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    if not mem.get('mapped_at'):
        store.put_knowledge('tutor_memory', mk, {**mem, 'mapped_at': now})


def _remember(store, s, now, event, debrief=''):
    mk = _memory_key(s['section'], s['lesson'])
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    if s['mode'] == 'review':   # the overview check keeps its own slot and leaves the lesson's thread alone
        mem.update(review=s['id'], last_at=now)
    else:
        mem.update(summary=s['summary'] or mem.get('summary', ''), last_at=now,
                   active=s['id'] if s['status'] == 'active' else None)
        if s['summary']:   # whose summary it is: this session's own must not come back to it as "last session"
            mem['summary_session'] = s['id']
    if debrief:   # the whole session in the tutor's words; the rolling summary only covers its last turns
        mem['debrief'] = {'text': debrief[:3000], 'at': now, 'session': s['id'], 'turns': len(s['turns'])}
    if s['summary'] and s['mode'] != 'review':
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
    profile = {'style': lm.style_notes(study, learner), 'standing': lm.standing(summary)}
    if not l.get('map'):   # an overview stays on its area: other lessons' threads only pull it elsewhere
        profile.update(lately=lm.other_lessons(store.list_knowledge('tutor_memory'), titles, _memory_key(l['section'], l['id']), now),
                       outside=lm.outside_reports(study, titles, now))
    prog = _ripple(store) if l['section'] == 'system-design' else None
    return {'text': lm.text(profile), 'covered': [p['claim'] for p in lm.covered_elsewhere(events, own, now)],
            'lessons': lessons.catalogue(exclude=(l['section'], l['id'])), 'unlocked': set(prog['unlocked']) if prog else None}


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
                  'output': s['usage']['output'] + int(usage.get('completion_tokens') or 0),
                  'cached': s['usage'].get('cached', 0) + int((usage.get('prompt_tokens_details') or {}).get('cached_tokens') or 0),
                  'cost': round(s['usage'].get('cost', 0) + float(usage.get('cost') or 0), 6)}   # dollars, as OpenRouter reports


async def _talk(s, l, ctx, debrief=False):
    """The tutor's reply as plain text, or None when the model failed."""
    args = (s, l, ctx['views'], ctx['open'], ctx['memory'], ctx['story'])
    if debrief:
        messages = [{'role': 'system', 'content': ses.system(*args, debrief=True, career=ctx.get('career'), profile=ctx.get('profile'))},
                    *ses.messages(s, l, debrief)]
    else:   # the system prompt and the conversation stay the same turn to turn (cached); this turn's state rides on his message
        system, now = ses.prompt(*args, career=ctx.get('career'), profile=ctx.get('profile'))
        messages = [{'role': 'system', 'content': system}, *ses.with_now(ses.messages(s, l), now)]
    sink = _SINK.get()
    for attempt in range(2):   # a reply with nothing visible (all private notes) gets one more try
        try:
            # cache: the system prompt and the conversation so far are the same text each turn (session.prompt).
            options = {'max_tokens': 2500, 'timeout': 60, 'think': False, 'cache': True, 'allow_anthropic': 'tutor',
                       **({'cache_ttl': config.TUTOR_CACHE_TTL} if config.TUTOR_CACHE_TTL else {})}
            if sink:
                if attempt:
                    sink({'type': 'reset'})
                raw = await _stream_talk(messages, options, sink)
            else:
                raw = await asyncio.to_thread(llm._raw_chat, config.TUTOR_MODEL, messages, options=options)
        except Exception as exc:
            log.warning('Tutor reply failed: %s', type(exc).__name__)
            return None
        _count(s, raw.get('usage') or {})
        if ses.parse(raw['content'], s, l)[0] or ses.drawn(raw['content'], s) or ses.handed(raw['content'], s):
            return raw['content']
    log.warning('Tutor reply had nothing to show')
    return None


async def _stream_talk(messages, options, sink):
    """The tutor's reply streamed through the visibility filter -> {content, usage} like `_raw_chat`."""
    visible, parts, usage = chat_stream.Visible(), [], {}
    async for piece in llm._raw_chat_stream(config.TUTOR_MODEL, messages, options=options):
        if 'text' in piece:
            parts.append(piece['text'])
            for event in visible.feed(piece['text']):
                sink(event)
        else:
            usage = piece.get('usage') or {}
    for event in visible.finish():
        sink(event)
    return {'content': ''.join(parts), 'usage': usage}


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
        ses.add_debrief(s, text, now, l)
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
