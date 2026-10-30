"""Experience: a story bank from your CV, timed behavioural drills, and technical deep dives.

Stories are your own records (never derived), drafted optionally from Job Scout's CV evidence.
Ledger items are the behavioural prompts (one clean timed answer at a time) and the deep-dive
questions; practice on individual CV claims is logged but not counted, since claims come and go
with the CV. Pure functions first, routes at the bottom.
"""
import secrets
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import knowledge, system_design_coach
from . import coach
from .experience_content import (COMPETENCIES, COMPETENCY_IDS, DIVE_QUESTIONS, MAX_CLEAN_SECONDS, PACKS, PROBES,
                                 PROMPT_IDS, PROMPTS, REQUIRED_CHECKS, STAR_CHECKS, TARGET_SECONDS)
from .http import put, store_for

TRACK = 'experience'
BY_PROMPT = {p['id']: p for p in PROMPTS}
COMP_TITLE = {c[0]: c[1] for c in COMPETENCIES}


def items():
    out = [{'section': TRACK, 'category': p['competencies'][0], 'topic': 'prompts', 'id': 'prompt:' + p['id'],
            'kind': 'prompt', 'label': p['text']} for p in PROMPTS]
    for pack in PACKS:
        out += [{'section': TRACK, 'category': 'dive:' + pack['id'], 'topic': pack['id'], 'id': 'dive:' + q['id'],
                 'kind': 'dive', 'label': q['prompt'][:110]} for q in pack['questions']]
    return out


ITEMS = items()


def drill_clean(checks, seconds):
    ticked = {k for k, v in (checks or {}).items() if v}
    return len(ticked) >= 5 and REQUIRED_CHECKS <= ticked and 0 < seconds <= MAX_CLEAN_SECONDS


def events(records):
    out = []
    for r in records:
        if r.get('kind') == 'drill' and r.get('prompt_id') in PROMPT_IDS:
            out.append({'item': 'prompt:' + r['prompt_id'], 'at': r['at'], 'marks': 1 if r['clean'] else 0, 'max': 1,
                        'clean': bool(r['clean']), 'source': 'drill'})
        elif r.get('kind') == 'dive' and r.get('question_id') in DIVE_QUESTIONS and r.get('clean') is not None:
            out.append({'item': 'dive:' + r['question_id'], 'at': r['at'], 'marks': 1 if r['clean'] else 0, 'max': 1,
                        'clean': bool(r['clean']), 'source': 'dive'})
    return out


def stories(records):
    return sorted((r for r in records if r.get('kind') == 'story' and not r.get('archived')),
                  key=lambda r: -r.get('updated_at', 0))


def coverage(story_rows, states, now):
    """Per competency: stories that show it, prompts that ask for it and how many you hold."""
    out = []
    for cid, title, blurb in COMPETENCIES:
        prompts = [p for p in PROMPTS if cid in p['competencies']]
        held = sum(1 for p in prompts if knowledge.status(states.get('prompt:' + p['id']), now) in ('solid', 'learning'))
        out.append({'id': cid, 'title': title, 'blurb': blurb,
                    'stories': [s['id'] for s in story_rows if cid in (s.get('competencies') or [])],
                    'prompts': len(prompts), 'held': held})
    return out


def next_prompt(records, now, exclude=()):
    """Missed last time, then fading, then unpractised prompts you have a story for, then the rest."""
    states = knowledge.replay(events(records), now)
    covered = {c for s in stories(records) for c in (s.get('competencies') or [])}
    order = {p['id']: i for i, p in enumerate(PROMPTS)}

    def tier(p):
        status = knowledge.status(states.get('prompt:' + p['id']), now)
        if status == 'shaky':
            return 0
        if status == 'fading':
            return 1
        if status == 'unseen':
            return 2 if set(p['competencies']) & covered else 3
        return 4 + (1 - knowledge.held(states.get('prompt:' + p['id']), now))
    pool = [p for p in PROMPTS if p['id'] not in exclude] or PROMPTS
    return min(pool, key=lambda p: (tier(p), order[p['id']]))


def suggest_stories(prompt, story_rows):
    """Stories ranked by how many of the prompt's competencies they show, primary first."""
    def score(s):
        comps = s.get('competencies') or []
        return (prompt['competencies'][0] in comps) * 2 + len(set(comps) & set(prompt['competencies']))
    return [s['id'] for s in sorted(story_rows, key=lambda s: -score(s)) if score(s) > 0][:3]


def cv_claims(job_context, story_rows):
    """Job Scout's experience evidence, marked with the story drafted from it (if any)."""
    ctx = (job_context or {}).get('context') or {}
    used = {s.get('source_ref'): s['id'] for s in story_rows if s.get('source_ref')}
    claims = [{'ref': e['ref'], 'excerpt': e['excerpt'], 'cited_by_roles': e.get('cited_by_roles', 0),
               'story_id': used.get(e['ref'])} for e in ctx.get('experience', []) if e.get('ref')]
    topics = [{'topic': t['topic'], 'state': t.get('state'), 'focus': t.get('focus'),
               'pack': next((p['id'] for p in PACKS if any(x.lower() in t['topic'].lower() for x in p['topics'])), None)}
              for t in ctx.get('self_reported_topics', [])]
    return {'claims': claims, 'topics': topics, 'fetched_at': (job_context or {}).get('fetched_at'),
            'available': bool(ctx)}


def overview(records, now, job_context=None):
    evs = events(records)
    s = knowledge.summary(ITEMS, evs, now)
    states = knowledge.replay(evs, now)
    rows = [dict(r) for r in stories(records)]
    drills = [r for r in records if r.get('kind') == 'drill']
    for st in rows:
        mine = [d for d in drills if d.get('story_id') == st['id']]
        st['drills'] = len(mine)
        st['last_drilled'] = max((d['at'] for d in mine), default=None)
    views = {v['id']: v for v in s['items']}
    packs = [{'id': p['id'], 'title': p['title'], 'blurb': p['blurb'],
              'questions': [{'id': q['id'], 'prompt': q['prompt'], 'status': views['dive:' + q['id']]['status']}
                            for q in p['questions']]} for p in PACKS]
    prompt_rows = [{'id': p['id'], 'text': p['text'], 'competencies': p['competencies'],
                    'status': views['prompt:' + p['id']]['status']} for p in PROMPTS]
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = 'Behavioural prompt' if v['kind'] == 'prompt' else 'Deep dive'
    recent = sorted(drills, key=lambda d: -d['at'])[:8]
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'], 'due': s['due'],
            'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'],
            'stories': rows, 'coverage': coverage(rows, states, now), 'prompts': prompt_rows, 'packs': packs,
            'competencies': [{'id': c, 'title': t, 'blurb': b} for c, t, b in COMPETENCIES],
            'checks': [{'key': k, 'text': t} for k, t in STAR_CHECKS], 'target_seconds': list(TARGET_SECONDS),
            'max_clean_seconds': MAX_CLEAN_SECONDS, 'probes': PROBES,
            'recent_drills': [{k: d.get(k) for k in ('id', 'prompt_id', 'story_id', 'seconds', 'clean', 'at')} for d in recent],
            'cv': cv_claims(job_context, rows), 'next_prompt': next_prompt(records, now)['id']}


# ---- routes ------------------------------------------------------------------------------

router = APIRouter(prefix='/experience', tags=['tracks-experience'])


class StoryBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    competencies: list[str] = Field(default_factory=list, max_length=6)
    situation: str = Field(default='', max_length=2000)
    task: str = Field(default='', max_length=1200)
    action: str = Field(default='', max_length=3000)
    result: str = Field(default='', max_length=1500)
    reflection: str = Field(default='', max_length=1200)
    source_ref: str | None = Field(default=None, max_length=120)
    source_excerpt: str | None = Field(default=None, max_length=1200)
    drafted: bool = False
    revision: int | None = None


class DraftBody(BaseModel):
    excerpt: str = Field(min_length=10, max_length=1200)
    competencies: list[str] = Field(default_factory=list, max_length=6)


class DrillBody(BaseModel):
    prompt_id: str
    story_id: str | None = None
    seconds: int = Field(ge=0, le=3600)
    checks: dict[str, bool]
    text: str = Field(default='', max_length=6000)


class DiveBody(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class DiveSelf(BaseModel):
    covered: int = Field(ge=0, le=10)


class ClaimBody(BaseModel):
    ref: str = Field(max_length=120)
    probe: str = Field(max_length=400)
    text: str = Field(default='', max_length=4000)
    rating: Literal['solid', 'shaky', 'blank']


class ProbeBody(BaseModel):
    claim: str = Field(min_length=10, max_length=1500)


def _comps(values):
    bad = [c for c in values if c not in COMPETENCY_IDS]
    if bad:
        raise HTTPException(422, f'Unknown competencies {bad}')
    return list(dict.fromkeys(values))


@router.post('/stories')
def create_story(body: StoryBody, store=Depends(store_for)):
    return save_story(body, store)


def save_story(body, store, story_id=None):
    now = int(time.time())
    key = story_id or 'story_' + secrets.token_hex(8)
    old = store.get_track_record(TRACK, key) if story_id else None
    if story_id and not old:
        raise HTTPException(404, 'Story not found')
    doc = {**(old or {}), 'kind': 'story', **body.model_dump(exclude={'revision'}),
           'competencies': _comps(body.competencies), 'created_at': (old or {}).get('created_at', now), 'updated_at': now}
    return put(store, TRACK, key, doc, body.revision if old else None)


@router.put('/stories/{story_id}')
def update_story(story_id: str, body: StoryBody, store=Depends(store_for)):
    return save_story(body, store, story_id)


@router.post('/stories/{story_id}/archive')
def archive_story(story_id: str, store=Depends(store_for)):
    """Archived, never deleted: drills keep pointing at it."""
    old = store.get_track_record(TRACK, story_id)
    if not old or old.get('kind') != 'story':
        raise HTTPException(404, 'Story not found')
    return put(store, TRACK, story_id, {**old, 'archived': True, 'updated_at': int(time.time())}, old['revision'])


@router.post('/draft')
async def draft(body: DraftBody, store=Depends(store_for)):
    out, message = await coach.draft_story(body.excerpt, _comps(body.competencies), store.get_settings())
    if not out:
        out = {'title': '', 'situation': body.excerpt, 'task': '', 'action': '', 'result': '', 'reflection': '', 'gaps': []}
    return {'draft': out, 'message': message}


class NextBody(BaseModel):
    exclude: list[str] = Field(default_factory=list, max_length=100)
    prompt_id: str | None = None


@router.post('/drill/next')
def drill_next(body: NextBody, store=Depends(store_for)):
    """The next prompt to practise, or a specific one (from the mistakes book or prompt list)."""
    records = store.list_track_records(TRACK)
    if body.prompt_id and body.prompt_id not in BY_PROMPT:
        raise HTTPException(404, 'Unknown prompt')
    p = BY_PROMPT[body.prompt_id] if body.prompt_id else next_prompt(records, time.time(), set(body.exclude))
    return {'prompt': p, 'stories': suggest_stories(p, stories(records))}


@router.post('/drills')
async def save_drill(body: DrillBody, store=Depends(store_for)):
    if body.prompt_id not in PROMPT_IDS:
        raise HTTPException(404, 'Unknown prompt')
    keys = {k for k, _ in STAR_CHECKS}
    if set(body.checks) - keys:
        raise HTTPException(422, 'Unknown checks')
    story = store.get_track_record(TRACK, body.story_id) if body.story_id else None
    if body.story_id and (not story or story.get('kind') != 'story'):
        raise HTTPException(404, 'Story not found')
    doc = put(store, TRACK, 'drill_' + secrets.token_hex(10),
              {'kind': 'drill', 'prompt_id': body.prompt_id, 'story_id': body.story_id, 'seconds': body.seconds,
               'checks': body.checks, 'text': body.text, 'clean': drill_clean(body.checks, body.seconds),
               'at': time.time()})
    feedback = message = None
    if body.text.strip():
        notes = {k: story.get(k) for k in ('title', 'situation', 'task', 'action', 'result', 'reflection')} if story else None
        feedback, message = await coach.drill_feedback(BY_PROMPT[body.prompt_id]['text'], notes, body.text,
                                                       STAR_CHECKS, store.get_settings())
        if feedback:
            doc = put(store, TRACK, doc['id'], {**doc, 'feedback': feedback}, doc['revision'])
    return {'drill': doc, 'feedback': feedback, 'message': message}


@router.post('/dives/{question_id}')
async def dive_answer(question_id: str, body: DiveBody, store=Depends(store_for)):
    q = DIVE_QUESTIONS.get(question_id)
    if not q:
        raise HTTPException(404, 'Unknown question')
    doc = put(store, TRACK, 'dive_' + secrets.token_hex(10),
              {'kind': 'dive', 'question_id': question_id, 'text': body.text, 'clean': None, 'at': time.time()})
    grade, message = await system_design_coach.grade_recall(q, body.text, store.get_settings(),
                                                           subject='technical interview deep-dive')
    if grade:
        score = sum(1 for p in grade['points'] if p['status'] == 'covered') + \
            sum(0.5 for p in grade['points'] if p['status'] == 'partial')
        doc = put(store, TRACK, doc['id'], {**doc, 'grade': grade, 'clean': score / len(q['points']) >= 0.75},
                  doc['revision'])
    return {'attempt': doc, 'grade': grade, 'message': message, 'points': q['points'], 'model': q['model']}


@router.post('/dives/attempts/{attempt_id}/self')
def dive_self(attempt_id: str, body: DiveSelf, store=Depends(store_for)):
    doc = store.get_track_record(TRACK, attempt_id)
    if not doc or doc.get('kind') != 'dive':
        raise HTTPException(404, 'Attempt not found')
    if doc.get('clean') is not None:
        return doc
    q = DIVE_QUESTIONS[doc['question_id']]
    return put(store, TRACK, attempt_id, {**doc, 'self_covered': body.covered,
                                          'clean': body.covered / len(q['points']) >= 0.75}, doc['revision'])


@router.post('/probes')
async def get_probes(body: ProbeBody, store=Depends(store_for)):
    generated = await coach.probes(body.claim, store.get_settings())
    return {'probes': generated or PROBES, 'generated': bool(generated)}


@router.post('/claims')
def save_claim(body: ClaimBody, store=Depends(store_for)):
    return put(store, TRACK, 'claim_' + secrets.token_hex(10),
               {'kind': 'claim', **body.model_dump(), 'at': time.time()})
