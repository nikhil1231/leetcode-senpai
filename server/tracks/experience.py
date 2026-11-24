"""Experience: your stories from Notion, timed behavioural answers with model answers, and technical deep dives.

Stories and the question bank live in Notion (Behavioural → Stories and Questions); Job Scout reads them, writes the
model answers and sends everything here with the applications in flight (experience_notion.py). Senpai keeps only
practice: timed answers, deep-dive attempts and probe ratings. With applications in flight, the next prompt comes
from prep_focus, which weights questions by how soon each application's next round is and how many share them.
Stories written here before the move (kind 'story') still show, marked as only in Senpai. Pure functions first,
routes at the bottom.
"""
import secrets
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import knowledge, system_design_coach
from ..senpai import prep_focus
from . import coach
from . import experience_notion as notion
from .experience_content import (COMPETENCIES, COMPETENCY_IDS, DIVE_QUESTIONS, MAX_CLEAN_SECONDS, PACKS, PROBES,
                                 PROMPT_IDS, PROMPTS, REQUIRED_CHECKS, STAR_CHECKS, TARGET_SECONDS, TRACKER_TOPICS)
from .http import put, store_for

TRACK = 'experience'
MIN_CHECKS = 5     # ticks in total (the required ones included) for a clean answer
BY_PROMPT = {p['id']: p for p in PROMPTS}
COMP_TITLE = {c[0]: c[1] for c in COMPETENCIES}


def items(prompt_rows=PROMPTS):
    out = [{'section': TRACK, 'category': p['competencies'][0], 'topic': 'prompts', 'id': 'prompt:' + p['id'],
            'kind': 'prompt', 'label': p['text']} for p in prompt_rows]
    for pack in PACKS:
        out += [{'section': TRACK, 'category': 'dive:' + pack['id'], 'topic': pack['id'], 'id': 'dive:' + q['id'],
                 'kind': 'dive', 'label': q['prompt'][:110]} for q in pack['questions']]
    return out


ITEMS = items()


def drill_clean(checks, seconds):
    ticked = {k for k, v in (checks or {}).items() if v}
    return len(ticked) >= MIN_CHECKS and REQUIRED_CHECKS <= ticked and 0 < seconds <= MAX_CLEAN_SECONDS


def events(records, prompt_ids=PROMPT_IDS):
    out = []
    for r in records:
        if r.get('kind') == 'drill' and r.get('prompt_id') in prompt_ids:
            out.append({'item': 'prompt:' + r['prompt_id'], 'at': r['at'], 'marks': 1 if r['clean'] else 0, 'max': 1,
                        'clean': bool(r['clean']), 'source': 'drill'})
        elif r.get('kind') == 'dive' and r.get('question_id') in DIVE_QUESTIONS and r.get('clean') is not None:
            out.append({'item': 'dive:' + r['question_id'], 'at': r['at'], 'marks': 1 if r['clean'] else 0, 'max': 1,
                        'clean': bool(r['clean']), 'source': 'dive'})
    return out


def stories(records):
    """Stories written in Senpai before Notion held them."""
    return sorted((r for r in records if r.get('kind') == 'story' and not r.get('archived')),
                  key=lambda r: -r.get('updated_at', 0))


def all_stories(records, material=None):
    return notion.stories(material) + [{**s, 'source': 'local', 'status': 'Ready'} for s in stories(records)]


def coverage(story_rows, states, now, prompt_rows=PROMPTS):
    """Per competency: stories that show it, prompts that ask for it and how many you hold."""
    out = []
    for cid, title, blurb in COMPETENCIES:
        prompts = [p for p in prompt_rows if cid in p['competencies']]
        held = sum(1 for p in prompts if knowledge.status(states.get('prompt:' + p['id']), now) in ('solid', 'learning'))
        out.append({'id': cid, 'title': title, 'blurb': blurb,
                    'stories': [s['id'] for s in story_rows if cid in (s.get('competencies') or [])
                                and s.get('status', 'Ready') != 'Draft'],
                    'prompts': len(prompts), 'held': held})
    return out


def need(states, prompt_rows, now):
    """prompt id -> 0 (held) .. 1 (never answered cleanly)."""
    return {p['id']: 1 - knowledge.held(states.get('prompt:' + p['id']), now) for p in prompt_rows}


def next_prompt(records, now, exclude=(), material=None, focus=None):
    """With applications in flight: the highest prep-focus priority. Otherwise missed last time, then fading,
    then unpractised prompts you have a story for, then the rest."""
    prompt_rows = notion.prompts(material)
    pool = [p for p in prompt_rows if p['id'] not in exclude] or prompt_rows
    if focus and focus.get('active'):
        rank = {r['id']: i for i, r in enumerate(focus['ranked'])}
        return min(pool, key=lambda p: rank.get(p['id'], len(rank)))
    states = knowledge.replay(events(records, notion.known_prompt_ids(material)), now)
    covered = {c for s in all_stories(records, material) for c in (s.get('competencies') or [])}
    order = {p['id']: i for i, p in enumerate(prompt_rows)}

    def tier(p):
        status = knowledge.status(states.get('prompt:' + p['id']), now)
        if status == 'shaky':
            return 0
        if status == 'fading':
            return 1
        if status == 'unseen':
            return 2 if set(p['competencies']) & covered else 3
        return 4 + (1 - knowledge.held(states.get('prompt:' + p['id']), now))
    return min(pool, key=lambda p: (tier(p), order[p['id']]))


def suggest_stories(prompt, story_rows, material=None):
    """The role or general pack's story first, then stories ranked by how many of the prompt's competencies they show."""
    picked = (notion.answer_for(material, prompt['id'], prompt.get('job_id')) or {}).get('story_id')

    def score(s):
        comps = s.get('competencies') or []
        return (prompt['competencies'][0] in comps) * 2 + len(set(comps) & set(prompt['competencies']))
    ranked = [s['id'] for s in sorted(story_rows, key=lambda s: -score(s)) if score(s) > 0]
    if picked and any(s['id'] == picked for s in story_rows):
        ranked = [picked] + [x for x in ranked if x != picked]
    return ranked[:3]


def tracker_states(states, now):
    """Tracker topic prefix -> the State your deep-dive results suggest (None when untried)."""
    out = {}
    for topic, qids in TRACKER_TOPICS.items():
        st = [knowledge.status(states.get('dive:' + q), now) for q in qids]
        if all(s == 'unseen' for s in st):
            continue
        held = sum(s in ('solid', 'learning') for s in st)
        out[topic] = ('Solid' if all(s == 'solid' for s in st) else 'Developing' if held * 2 >= len(st)
                      else 'Needs work')
    return out


def tracker_rows(job_context):
    """Notion tracker topics (via Job Scout) that a deep-dive pack tests, with the prefix they match."""
    topics = ((job_context or {}).get('context') or {}).get('self_reported_topics') or []
    out = []
    for t in topics:
        prefix = next((p for p in TRACKER_TOPICS if (t.get('topic') or '').startswith(p)), None)
        if prefix:
            out.append({'topic': t['topic'], 'prefix': prefix, 'state': t.get('state')})
    return out


def overview(records, now, job_context=None, material=None):
    prompt_rows = notion.prompts(material)
    evs = events(records, notion.known_prompt_ids(material))
    s = knowledge.summary(items(prompt_rows), evs, now)
    states = knowledge.replay(evs, now)
    rows = [dict(r) for r in all_stories(records, material)]
    drills = [r for r in records if r.get('kind') == 'drill']
    for st in rows:
        mine = [d for d in drills if d.get('story_id') == st['id']]
        st['drills'] = len(mine)
        st['last_drilled'] = max((d['at'] for d in mine), default=None)
    views = {v['id']: v for v in s['items']}
    packs = [{'id': p['id'], 'title': p['title'], 'blurb': p['blurb'],
              'questions': [{'id': q['id'], 'prompt': q['prompt'], 'status': views['dive:' + q['id']]['status']}
                            for q in p['questions']]} for p in PACKS]
    answered = notion.answers_by_prompt(material)
    prompt_rows_out = [{'id': p['id'], 'text': p['text'], 'competencies': p['competencies'], 'kind': p['kind'],
                        'rounds': p['rounds'], 'source': p['source'], 'company': p.get('company'),
                        'answers': answered.get(p['id'], []), 'status': views['prompt:' + p['id']]['status']}
                       for p in prompt_rows]
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = 'Behavioural prompt' if v['kind'] == 'prompt' else 'Deep dive'
    focus = prep_focus.focus(notion.applications(material), prompt_rows, need(states, prompt_rows, now), now)
    by_prompt = {p['id']: p for p in prompt_rows}
    focus['ranked'] = [dict(r, text=by_prompt[r['id']]['text']) for r in focus['ranked']]
    trackers = tracker_rows(job_context)
    suggested = tracker_states(states, now)
    tracker = [dict(t, suggested=suggested.get(t['prefix'])) for t in trackers]
    recent = sorted(drills, key=lambda d: -d['at'])[:8]
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'], 'due': s['due'],
            'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'],
            'stories': rows, 'coverage': coverage(rows, states, now, prompt_rows), 'prompts': prompt_rows_out,
            'packs': packs, 'competencies': [{'id': c, 'title': t, 'blurb': b} for c, t, b in COMPETENCIES],
            'checks': [{'key': k, 'text': t, 'required': k in REQUIRED_CHECKS} for k, t in STAR_CHECKS],
            'min_checks': MIN_CHECKS, 'target_seconds': list(TARGET_SECONDS),
            'max_clean_seconds': MAX_CLEAN_SECONDS, 'probes': PROBES,
            'recent_drills': [{k: d.get(k) for k in ('id', 'prompt_id', 'story_id', 'seconds', 'clean', 'at')} for d in recent],
            'focus': {**focus, 'ranked': focus['ranked'][:8]}, 'tracker': tracker,
            'notion': {'available': bool(material), 'fetched_at': (material or {}).get('fetched_at'),
                       'general_answers': bool((material or {}).get('general_answers'))},
            'drift': notion.drift(material, job_context, prompt_rows, rows,
                                  [{'topic': t['topic'], 'state': t['state']} for t in trackers],
                                  {t['topic']: suggested.get(t['prefix']) for t in trackers}),
            'next_prompt': next_prompt(records, now, material=material, focus=focus)['id']}


def links(body):
    """Where to change things: Notion for stories and questions, Job Scout for role packs and proposals."""
    from .. import config
    base = config.JOB_SCOUT_PUBLIC_URL
    return {'job_scout': base, 'review': base + '/review', 'new_role': base + '/import#role',
            'job': base + '/jobs/{job_id}', 'notion_stories': config.NOTION_STORIES_URL,
            'notion_questions': config.NOTION_QUESTIONS_URL}


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
    prompt_id: str = Field(max_length=60)
    story_id: str | None = Field(default=None, max_length=60)
    job_id: int | None = None
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


def _material(store):
    from ..senpai import jobscout
    try:
        return jobscout.material(store)
    except Exception:  # an unreadable cache falls back to the built-in prompts
        return None


@router.post('/drill/next')
def drill_next(body: NextBody, store=Depends(store_for)):
    """The next prompt to practise, or a specific one (from the mistakes book, the prompt list or the focus list)."""
    records, material, now = store.list_track_records(TRACK), _material(store), time.time()
    rows = {p['id']: p for p in notion.prompts(material)}
    if body.prompt_id and body.prompt_id not in rows:
        raise HTTPException(404, 'Unknown prompt')
    if body.prompt_id:
        p = rows[body.prompt_id]
    else:
        evs = events(records, notion.known_prompt_ids(material))
        states = knowledge.replay(evs, now)
        prompt_rows = list(rows.values())
        focus = prep_focus.focus(notion.applications(material), prompt_rows, need(states, prompt_rows, now), now)
        p = next_prompt(records, now, set(body.exclude), material, focus)
    reason = _focus_reason(material, records, p, now)
    return {'prompt': {**p, 'reason': reason}, 'stories': suggest_stories(p, all_stories(records, material), material),
            'has_answer': bool(notion.answer_for(material, p['id'], p.get('job_id')))}


def _focus_reason(material, records, prompt, now):
    """One line on why this prompt now: which upcoming rounds ask it."""
    apps = notion.applications(material)
    if not apps:
        return None
    states = knowledge.replay(events(records, notion.known_prompt_ids(material)), now)
    f = prep_focus.focus(apps, [prompt], need(states, [prompt], now), now)
    who = f['ranked'][0]['for'] if f['ranked'] else []
    rounds = {a['company']: a for a in f['applications']}
    parts = [f"{c} ({rounds[c]['round_label'].lower()}" + (f" in {_days(rounds[c]['days'])})" if rounds[c]['days'] is not None
                                                          else ', not booked yet)') for c in who if c in rounds]
    return ('Counts for ' + ' and '.join(parts) + '.') if parts else None


def _days(d):
    return 'under a day' if d < 1 else f"{round(d)} day{'s' if round(d) != 1 else ''}"


def _story_notes(store, records, material, story_id):
    if not story_id:
        return None
    s = next((x for x in all_stories(records, material) if x['id'] == story_id), None)
    if not s:
        raise HTTPException(404, 'Story not found')
    if s['source'] == 'notion':
        return {'title': s['title'], 'summary': s['summary'], 'notes': s['body'][:6000]}
    return {k: s.get(k) for k in ('title', 'situation', 'task', 'action', 'result', 'reflection')}


@router.post('/drills')
async def save_drill(body: DrillBody, store=Depends(store_for)):
    records, material = store.list_track_records(TRACK), _material(store)
    rows = {p['id']: p for p in notion.prompts(material)}
    if body.prompt_id not in rows and body.prompt_id not in notion.known_prompt_ids(material):
        raise HTTPException(404, 'Unknown prompt')
    keys = {k for k, _ in STAR_CHECKS}
    if set(body.checks) - keys:
        raise HTTPException(422, 'Unknown checks')
    notes = _story_notes(store, records, material, body.story_id)
    prompt = rows.get(body.prompt_id) or BY_PROMPT.get(body.prompt_id) or {'text': body.prompt_id}
    model = notion.answer_for(material, body.prompt_id, body.job_id if body.job_id is not None else prompt.get('job_id'))
    doc = put(store, TRACK, 'drill_' + secrets.token_hex(10),
              {'kind': 'drill', 'prompt_id': body.prompt_id, 'story_id': body.story_id, 'seconds': body.seconds,
               'checks': body.checks, 'text': body.text, 'clean': drill_clean(body.checks, body.seconds),
               'at': time.time(), 'job_id': body.job_id})
    feedback = message = None
    if body.text.strip():
        feedback, message = await coach.drill_feedback(prompt['text'], notes, body.text, STAR_CHECKS,
                                                       store.get_settings(), (model or {}).get('answer'))
        if feedback:
            doc = put(store, TRACK, doc['id'], {**doc, 'feedback': feedback}, doc['revision'])
    return {'drill': doc, 'feedback': feedback, 'message': message, 'model_answer': model}


@router.get('/answers/{prompt_id}')
def model_answer(prompt_id: str, job_id: int | None = None, store=Depends(store_for)):
    """The model answer for a prompt (the role pack's when job_id is given), shown after you have tried it."""
    out = notion.answer_for(_material(store), prompt_id, job_id)
    if not out:
        raise HTTPException(404, 'No model answer for this prompt yet')
    return out


class NoteBody(BaseModel):
    story_id: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=10, max_length=2000)


class TrackerBody(BaseModel):
    topic: str = Field(min_length=3, max_length=200)
    state: Literal['Unassessed', 'Needs work', 'Developing', 'Solid']
    evidence: str = Field(default='', max_length=1500)


async def _propose(body):
    import asyncio

    from ..senpai import jobscout
    try:
        return await asyncio.to_thread(jobscout.propose, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Job Scout couldn't take the suggestion right now; try again later.") from exc


@router.post('/notion-note')
async def suggest_story_note(body: NoteBody):
    """A detail to add to a Notion story: it waits in Job Scout's review queue until you approve it."""
    return await _propose({'kind': 'story_note', 'story_id': body.story_id, 'text': body.text})


@router.post('/tracker-proposal')
async def suggest_tracker_state(body: TrackerBody):
    """Suggest a Technical-knowledge tracker State from your deep-dive results; Job Scout asks you to approve it."""
    return await _propose({'kind': 'tracker_state', 'topic': body.topic, 'state': body.state, 'evidence': body.evidence,
                           'rationale': 'Your graded deep-dive answers in Senpai.'})


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
