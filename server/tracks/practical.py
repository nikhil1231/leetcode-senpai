"""Practical Coding: realistic multi-file exercises (build, extend, debug, review).

Each exercise is a folder in `content/practical/<id>/`: `exercise.yaml`, starter and test files in
`files/`, and a reference answer in `solution/`. Code runs in the browser (Pyodide in a worker), so
the server never executes user code; it stores attempts and the results the browser reports.
Extra edge-case checks are sent only at submission. An exercise counts as held when a submission
passes every test and check, meets most of its rubric, and came before the solution was opened.
"""
import os
import secrets
import time

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import knowledge
from . import coach
from .http import put, store_for

TRACK = 'practical'
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'content', 'practical')
CATEGORIES = [
    ('build', 'Build', 'Implement a small component from a spec, with tests, in about 30 to 45 minutes.'),
    ('extend', 'Extend', 'Add a feature to existing code without breaking it, and leave it cleaner.'),
    ('debug', 'Debug', 'Failing tests and a bug report: find the root causes and fix them.'),
    ('review', 'Review', 'Review a pull request the way a senior engineer would.'),
]
ORDER = ['lru-ttl-cache', 'rate-limiter', 'kv-transactions', 'order-pricing', 'retry-backoff', 'log-stats',
         'review-webhook', 'review-cache']
PASS_RUBRIC = 0.75
MAX_FILE = 60_000


class ExerciseError(ValueError):
    pass


def _read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def load():
    out = {}
    cats = {c[0] for c in CATEGORIES}
    for key in ORDER:
        folder = os.path.join(HERE, key)
        meta = yaml.safe_load(_read(os.path.join(folder, 'exercise.yaml')))
        if meta.get('id') != key or meta.get('category') not in cats:
            raise ExerciseError(f'{key}: bad id or category')
        for field in ('title', 'minutes', 'brief', 'discussion'):
            if not meta.get(field):
                raise ExerciseError(f'{key}: missing {field}')
        names = meta.get('files', []) + meta.get('readonly', []) + meta.get('checks', [])
        files = {n: _read(os.path.join(folder, 'files', n)) for n in names}
        solution = {n: _read(os.path.join(folder, 'solution', n)) for n in meta.get('files', [])}
        if meta['category'] == 'review':
            if not meta.get('issues') or meta.get('files') or meta.get('tests'):
                raise ExerciseError(f'{key}: a review needs issues and no editable files or tests')
        else:
            if not meta.get('files') or not meta.get('tests') or not meta.get('rubric'):
                raise ExerciseError(f'{key}: needs editable files, tests and a rubric')
            for t in meta['tests'] + meta.get('checks', []):
                if t not in files or not t.endswith('.py'):
                    raise ExerciseError(f'{key}: test module {t} missing')
        out[key] = {**meta, 'contents': files, 'solution': solution}
    stray = {d for d in os.listdir(HERE) if os.path.isdir(os.path.join(HERE, d))} - set(ORDER)
    if stray:
        raise ExerciseError(f'Unlisted exercises {sorted(stray)}')
    return out


EXERCISES = load()


def public(ex):
    """Without hidden checks or the solution."""
    shown = ex.get('files', []) + ex.get('readonly', [])
    return {k: ex.get(k) for k in ('id', 'title', 'category', 'minutes', 'level', 'brief', 'files', 'readonly',
                                   'tests', 'rubric', 'hints', 'language')} | {
        'starter': {n: ex['contents'][n] for n in shown}, 'has_checks': bool(ex.get('checks')),
        'issue_count': len(ex.get('issues', []))}


def items():
    return [{'section': TRACK, 'category': ex['category'], 'topic': key, 'id': 'ex:' + key, 'kind': ex['category'],
             'label': ex['title']} for key, ex in EXERCISES.items()]


ITEMS = items()


def clean(ex, attempt):
    if attempt.get('revealed_before_submit'):
        return False
    if ex['category'] == 'review':
        return len(attempt.get('found') or []) >= PASS_RUBRIC * len(ex['issues'])
    tests, checks = attempt.get('tests') or {}, attempt.get('checks') or {}
    rubric = attempt.get('rubric') or []
    return (tests.get('total', 0) > 0 and tests.get('passed') == tests.get('total')
            and checks.get('passed', 0) == checks.get('total', 0)
            and sum(bool(x) for x in rubric) >= PASS_RUBRIC * len(ex['rubric']))


def events(records):
    return [{'item': 'ex:' + r['exercise_id'], 'at': r['submitted_at'], 'marks': 1 if r['clean'] else 0, 'max': 1,
             'clean': bool(r['clean']), 'source': 'exercise'}
            for r in records if r.get('kind') == 'attempt' and r.get('status') == 'submitted'
            and r.get('exercise_id') in EXERCISES]


def overview(records, now):
    evs = events(records)
    s = knowledge.summary(ITEMS, evs, now)
    views = {v['topic']: v for v in s['items']}
    attempts = [r for r in records if r.get('kind') == 'attempt' and r.get('exercise_id') in EXERCISES]
    groups = []
    for cid, title, blurb in CATEGORIES:
        rows = []
        for key, ex in EXERCISES.items():
            if ex['category'] != cid:
                continue
            mine = [a for a in attempts if a['exercise_id'] == key]
            done = [a for a in mine if a.get('status') == 'submitted']
            best = max(done, key=lambda a: (a['clean'], a['submitted_at']), default=None)
            rows.append({'id': key, 'title': ex['title'], 'minutes': ex['minutes'], 'level': ex.get('level', 'core'),
                         'summary': ex['brief'].strip().split('\n')[0], 'status': views[key]['status'],
                         'attempts': len(done), 'open': any(a.get('status') == 'open' for a in mine),
                         'best': {'clean': best['clean'], 'elapsed_sec': best.get('elapsed_sec'),
                                  'at': best['submitted_at']} if best else None})
        groups.append({'id': cid, 'title': title, 'blurb': blurb, 'exercises': rows})
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = EXERCISES[v['topic']]['title']
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'], 'due': s['due'],
            'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'], 'groups': groups}


def open_attempt(records, exercise_id):
    return next((r for r in sorted(records, key=lambda r: -r.get('started_at', 0))
                 if r.get('kind') == 'attempt' and r.get('exercise_id') == exercise_id and r.get('status') == 'open'),
                None)


# ---- routes ------------------------------------------------------------------------------

router = APIRouter(prefix='/practical', tags=['tracks-practical'])


class TestResult(BaseModel):
    passed: int = Field(ge=0, le=500)
    total: int = Field(ge=0, le=500)
    results: list[dict] = Field(default_factory=list, max_length=200)


class SaveBody(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)
    revision: int
    run: TestResult | None = None


class SubmitBody(BaseModel):
    files: dict[str, str] = Field(default_factory=dict)
    revision: int
    tests: TestResult | None = None
    checks: TestResult | None = None
    rubric: list[bool] = Field(default_factory=list, max_length=20)
    review: str = Field(default='', max_length=12000)
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


class FoundBody(BaseModel):
    found: list[int] = Field(max_length=20)


def exercise(key):
    if key not in EXERCISES:
        raise HTTPException(404, 'Unknown exercise')
    return EXERCISES[key]


def attempt_of(store, aid):
    doc = store.get_track_record(TRACK, aid)
    if not doc or doc.get('kind') != 'attempt':
        raise HTTPException(404, 'Attempt not found')
    return doc


def _files(ex, files):
    allowed = set(ex.get('files', []))
    if set(files) - allowed or any(len(v) > MAX_FILE for v in files.values()):
        raise HTTPException(422, 'Only the exercise’s editable files can be saved')
    return files


def reveal(ex):
    return {'solution': ex['solution'], 'discussion': ex['discussion'], 'issues': ex.get('issues', [])}


@router.get('/exercises/{key}')
def get_exercise(key: str, store=Depends(store_for)):
    ex = exercise(key)
    records = store.list_track_records(TRACK)
    past = sorted((r for r in records if r.get('kind') == 'attempt' and r.get('exercise_id') == key
                   and r.get('status') == 'submitted'), key=lambda r: -r['submitted_at'])
    return {'exercise': public(ex), 'attempt': open_attempt(records, key),
            'history': [{k: r.get(k) for k in ('id', 'submitted_at', 'clean', 'elapsed_sec', 'tests', 'checks', 'found')}
                        for r in past[:10]]}


@router.post('/exercises/{key}/attempts')
def start_attempt(key: str, store=Depends(store_for)):
    ex = exercise(key)
    current = open_attempt(store.list_track_records(TRACK), key)
    if current:
        return current
    now = time.time()
    return put(store, TRACK, 'attempt_' + secrets.token_hex(10),
               {'kind': 'attempt', 'exercise_id': key, 'status': 'open', 'started_at': now, 'updated_at': now,
                'files': {n: ex['contents'][n] for n in ex.get('files', [])}, 'runs': [],
                'revealed_before_submit': False})


@router.put('/attempts/{aid}')
def save_attempt(aid: str, body: SaveBody, store=Depends(store_for)):
    doc = attempt_of(store, aid)
    if doc['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    ex = exercise(doc['exercise_id'])
    runs = list(doc.get('runs') or [])
    if body.run:
        runs = (runs + [{'at': time.time(), 'passed': body.run.passed, 'total': body.run.total}])[-50:]
    return put(store, TRACK, aid, {**doc, 'files': {**doc['files'], **_files(ex, body.files)}, 'runs': runs,
                                   'updated_at': time.time()}, body.revision)


@router.post('/attempts/{aid}/checks')
def get_checks(aid: str, store=Depends(store_for)):
    """The hidden edge-case tests, released when you are ready to submit."""
    doc = attempt_of(store, aid)
    ex = exercise(doc['exercise_id'])
    return {'checks': {n: ex['contents'][n] for n in ex.get('checks', [])}}


@router.post('/attempts/{aid}/reveal')
def reveal_solution(aid: str, store=Depends(store_for)):
    doc = attempt_of(store, aid)
    ex = exercise(doc['exercise_id'])
    if doc['status'] == 'open' and not doc.get('revealed_before_submit'):
        put(store, TRACK, aid, {**doc, 'revealed_before_submit': True}, doc['revision'])
    return reveal(ex)


@router.post('/attempts/{aid}/submit')
async def submit(aid: str, body: SubmitBody, store=Depends(store_for)):
    doc = attempt_of(store, aid)
    if doc['status'] != 'open':
        raise HTTPException(409, 'This attempt is already submitted')
    ex = exercise(doc['exercise_id'])
    if ex['category'] != 'review' and len(body.rubric) != len(ex['rubric']):
        raise HTTPException(422, 'Rate every rubric point')
    now = time.time()
    saved = {**doc, 'files': {**doc['files'], **_files(ex, body.files)}, 'status': 'submitted', 'submitted_at': now,
             'elapsed_sec': body.elapsed_sec or int(now - doc['started_at']),
             'tests': body.tests.model_dump() if body.tests else None,
             'checks': body.checks.model_dump() if body.checks else None,
             'rubric': body.rubric, 'review': body.review, 'found': None, 'grade': None}
    message = None
    if ex['category'] == 'review' and body.review.strip():
        issues = [i['title'] + ': ' + i['detail'] for i in ex['issues']]
        grade, message = await coach.grade_review(ex['brief'], issues, body.review, store.get_settings())
        if grade:
            saved.update(found=grade['found'], grade=grade)
    saved['clean'] = clean(ex, saved) if saved['found'] is not None or ex['category'] != 'review' else False
    saved['needs_self_mark'] = ex['category'] == 'review' and saved['found'] is None
    doc = put(store, TRACK, aid, saved, body.revision)
    return {'attempt': doc, 'message': message, **reveal(ex)}


@router.post('/attempts/{aid}/found')
def mark_found(aid: str, body: FoundBody, store=Depends(store_for)):
    """Self-marking a review when the model is unavailable (or to correct its marking)."""
    doc = attempt_of(store, aid)
    ex = exercise(doc['exercise_id'])
    if ex['category'] != 'review' or doc['status'] != 'submitted':
        raise HTTPException(409, 'Only submitted reviews are marked this way')
    found = sorted({i for i in body.found if 0 <= i < len(ex['issues'])})
    updated = {**doc, 'found': found, 'needs_self_mark': False}
    return put(store, TRACK, aid, {**updated, 'clean': clean(ex, updated)}, doc['revision'])
