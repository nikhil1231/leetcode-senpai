"""Past papers: timed, mixed, marked sets drawn from the knowledge ledger's items.

A paper is composed from authored questions and gradeable lesson blocks, weighted toward
shaky, fading and unseen items, then sat exam-style: answers are saved as you go but
nothing is revealed until you finish. Deterministic items are marked immediately; written
(recall) answers are marked by the model against their authored rubric points, and an
examiner's report explains lost marks. Without the model, recall answers are self-marked.
Contracts are copied into the paper, so later content edits never change a sat paper.
"""
import asyncio
from copy import deepcopy
import random
import re
import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, knowledge, llm, system_design_coach as coach, system_design_variants as variants
from .store import get_store
from .system_design_curriculum import CATEGORIES, LESSONS, QUESTIONS
from . import system_design_items as ledger_items

router = APIRouter(prefix='/api/system-design', tags=['system-design-papers'])
LENGTHS = {'short': 15, 'standard': 30, 'long': 50}
SEC_PER_MARK = 60
BLOCK_TYPES = ('predict', 'calc', 'faded', 'sort', 'order', 'bug', 'recall')
QUESTION_FORMAT_MARKS = {'choice': 1, 'numeric': 1, 'multi': 2, 'order': 2}
WEIGHTS = {'shaky': 4, 'fading': 3, 'unseen': 2, 'learning': 1.5, 'solid': 0.6}
RANKED_SCOPES = ledger_items.RANKED_SCOPES
MARKING_STALE = 180
BLANK_TOLERANCE = 0.1  # numeric blanks are back-of-envelope figures
BLANK = re.compile(r'\[\[(.+?)\]\]')
TOPIC_ORDER = {k: i for i, k in enumerate(LESSONS)}


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def _blocks():
    out = {}
    for key, lesson in LESSONS.items():
        for b in lesson.get('blocks', []):
            if b['type'] in BLOCK_TYPES:
                out[ledger_items.block_id(key, b['key'])] = b
    return out


BLOCKS = _blocks()
POOL = [i for i in ledger_items.ITEMS if i['id'] in BLOCKS or (i['id'] in QUESTIONS and i['kind'] in ('check', 'quickfire'))]


# ---------- Contracts ----------
def contract(item_id):
    """Private, immutable marking contract for one item."""
    if item_id in QUESTIONS:
        q = deepcopy(QUESTIONS[item_id])
        return {'type': 'question', 'item': item_id, 'max': QUESTION_FORMAT_MARKS[q.get('format', 'choice')], 'q': q}
    b = deepcopy(BLOCKS[item_id])
    kind = b['type']
    size = {'faded': lambda: len(BLANK.findall(b['text'])), 'sort': lambda: len(b['items']),
            'recall': lambda: len(b['points']), 'calc': lambda: 2, 'order': lambda: 2, 'bug': lambda: 2}
    return {'type': kind, 'item': item_id, 'max': size.get(kind, lambda: 1)(), 'b': b}


def max_marks(item_id):
    if item_id in QUESTIONS:
        return QUESTION_FORMAT_MARKS[QUESTIONS[item_id].get('format', 'choice')]
    b = BLOCKS[item_id]
    return {'faded': len(BLANK.findall(b.get('text', ''))), 'sort': len(b.get('items', [])),
            'recall': len(b.get('points', [])), 'calc': 2, 'order': 2, 'bug': 2}.get(b['type'], 1)


def _shuffled(seed, items):
    out = list(items)
    random.Random(seed).shuffle(out)
    return out


def public(c, n, seed):
    """What the candidate sees while sitting: no answers, explanations or rubric points."""
    base = {'n': n, 'type': c['type'], 'max': c['max'], 'topic': ledger_items.BY_ID[c['item']]['topic']}
    if c['type'] == 'question':
        q = c['q']
        return {**base, 'format': q.get('format', 'choice'), 'prompt': q['prompt'], 'unit': q.get('unit', ''),
                'choices': q['choices']}
    b = c['b']
    if c['type'] == 'predict':
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''),
                'choices': [{'id': str(i), 'text': t} for i, t in enumerate(b['choices'])]}
    if c['type'] == 'calc':
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''), 'given': b.get('given', ''), 'unit': b['unit']}
    if c['type'] == 'faded':
        blanks, i = [], 0
        def sub(m):
            nonlocal i
            body = m[1]
            blanks.append({'kind': 'num'} if body.startswith('#') else
                          {'kind': 'choice', 'options': _shuffled(f'{seed}:{n}:{i}', [o.strip() for o in body.split('|')])})
            i += 1
            return f'@@BLANK{i - 1}@@'
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''), 'text': BLANK.sub(sub, b['text']), 'blanks': blanks}
    if c['type'] == 'sort':
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''), 'buckets': b['buckets'],
                'items': _shuffled(f'{seed}:{n}', [{'id': str(i), 'text': it['text']} for i, it in enumerate(b['items'])])}
    if c['type'] == 'order':
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''),
                'items': _shuffled(f'{seed}:{n}', [{'id': str(i), 'text': t} for i, t in enumerate(b['items'])])}
    if c['type'] == 'bug':
        return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''), 'code': b['code'].rstrip('\n'),
                'lang': b.get('lang', ''), 'count': len(b['bug'])}
    return {**base, 'prompt': b['prompt'], 'title': b.get('title', ''), 'points': len(b['points'])}


# ---------- Marking (pure) ----------
def number(value):
    text = str(value).strip().replace(',', '').replace('_', '').replace(' ', '').lower()
    scale = {'k': 1e3, 'm': 1e6, 'b': 1e9}.get(text[-1:], 1)
    if scale != 1:
        text = text[:-1]
    try:
        return float(text) * scale
    except ValueError:
        return None


def _ids(value):
    if isinstance(value, str):
        return [v for v in value.split(',') if v]
    return [str(v) for v in value] if isinstance(value, list) else []


def _order_marks(picked, right):
    if picked == right:
        return 2
    return 1 if len(picked) == len(right) and sum(a == b for a, b in zip(picked, right)) * 2 >= len(right) else 0


def answer_text(c, value):
    """The candidate's answer as readable text, for review and the examiner."""
    if value in (None, '', [], {}):
        return '(no answer)'
    if c['type'] == 'question':
        q = c['q']
        by = {ch['id']: ch['text'] for ch in q['choices']}
        if q.get('format') == 'numeric':
            return f"{value} {q.get('unit', '')}".strip()
        return (' → ' if q.get('format') == 'order' else ' · ').join(by.get(k, k) for k in _ids(value))
    b = c['b']
    if c['type'] == 'predict':
        i = int(value) if str(value).isdigit() else -1
        return b['choices'][i] if 0 <= i < len(b['choices']) else '(no answer)'
    if c['type'] == 'calc':
        return f'{value} {b["unit"]}'
    if c['type'] == 'faded':
        return ' · '.join(str(v) or '—' for v in value) if isinstance(value, list) else str(value)
    if c['type'] == 'sort':
        return '; '.join(f'{it["text"]} → {b["buckets"][value[str(i)]] if isinstance(value, dict) and isinstance(value.get(str(i)), int) and 0 <= value[str(i)] < len(b["buckets"]) else "—"}'
                         for i, it in enumerate(b['items']))
    if c['type'] == 'order':
        return ' → '.join(b['items'][int(k)] for k in _ids(value) if k.isdigit() and int(k) < len(b['items']))
    if c['type'] == 'bug':
        lines = b['code'].rstrip('\n').split('\n')
        return '; '.join(f'line {k}: {lines[int(k) - 1].strip()}' for k in _ids(value) if k.isdigit() and 0 < int(k) <= len(lines))
    return str(value)


def mark(c, value):
    """{marks, max, right, explanation}; recall returns marks None until it is marked."""
    out = {'max': c['max'], 'answer': value, 'answer_text': answer_text(c, value)}
    if c['type'] == 'question':
        q = c['q']
        fmt, by = q.get('format', 'choice'), {ch['id']: ch['text'] for ch in q['choices']}
        if fmt == 'numeric':
            v = number(value) if value not in (None, '') else None
            marks = int(v is not None and abs(v - q['correct']) <= q['tolerance'] * abs(q['correct']))
            right = f"{q['correct']:,.10g} {q.get('unit', '')}".strip()
        elif fmt == 'multi':
            picked, correct = set(_ids(value)), set(q['correct'])
            marks = 2 if picked == correct else 1 if picked and picked < correct else 0
            right = ' · '.join(by[k] for k in q['correct'])
        elif fmt == 'order':
            marks = _order_marks(_ids(value), q['correct'])
            right = ' → '.join(by[k] for k in q['correct'])
        else:
            marks = int(value == q['correct'])
            right = by[q['correct']]
        whys = q.get('whys', {})
        why = [whys[k] for k in _ids(value) if k in whys and k not in (q['correct'] if isinstance(q['correct'], list) else [q['correct']])]
        return {**out, 'marks': marks, 'right': right, 'explanation': q['explanation'], 'why_wrong': why}
    b = c['b']
    if c['type'] == 'predict':
        marks = int(str(value) == str(b['answer']))
        return {**out, 'marks': marks, 'right': b['choices'][b['answer']], 'explanation': b['reveal']}
    if c['type'] == 'calc':
        v = number(value) if value not in (None, '') else None
        factor = float(b.get('tolerance') or 1.5)
        ratio = v / float(b['answer']) if v and v > 0 else 0
        marks = 0 if not ratio else 2 if 1 / factor <= ratio <= factor else 1 if 1 / factor ** 2 <= ratio <= factor ** 2 else 0
        return {**out, 'marks': marks, 'right': f'{float(b["answer"]):,.10g} {b["unit"]}', 'explanation': b['steps']}
    if c['type'] == 'faded':
        answers = [m.strip() for m in BLANK.findall(b['text'])]
        given = value if isinstance(value, list) else []
        marks, right = 0, []
        for i, body in enumerate(answers):
            mine = str(given[i]).strip() if i < len(given) and given[i] is not None else ''
            if body.startswith('#'):
                target, v = float(body[1:]), number(mine) if mine else None
                marks += int(v is not None and abs(v - target) <= abs(target) * BLANK_TOLERANCE + 1e-9)
                right.append(body[1:])
            else:
                first = body.split('|')[0].strip()
                marks += int(mine == first)
                right.append(first)
        return {**out, 'marks': marks, 'right': ' · '.join(right), 'explanation': b.get('explain', '')}
    if c['type'] == 'sort':
        given = value if isinstance(value, dict) else {}
        marks = sum(given.get(str(i)) == it['bucket'] for i, it in enumerate(b['items']))
        right = '; '.join(f'{it["text"]} → {b["buckets"][it["bucket"]]}' for it in b['items'])
        return {**out, 'marks': marks, 'right': right, 'explanation': b.get('explain', ''),
                'why_wrong': [it['why'] for i, it in enumerate(b['items']) if it.get('why') and given.get(str(i)) != it['bucket']]}
    if c['type'] == 'order':
        marks = _order_marks(_ids(value), [str(i) for i in range(len(b['items']))])
        return {**out, 'marks': marks, 'right': ' → '.join(b['items']), 'explanation': b.get('explain', '')}
    if c['type'] == 'bug':
        picked = {int(k) for k in _ids(value) if k.isdigit()}
        bugs = set(b['bug'])
        marks = 2 if picked == bugs else 1 if picked and (picked < bugs or (bugs <= picked and len(picked - bugs) <= 1)) else 0
        lines = b['code'].rstrip('\n').split('\n')
        right = '; '.join(f'line {k}: {lines[k - 1].strip()}' for k in sorted(bugs))
        return {**out, 'marks': marks, 'right': right, 'explanation': b['explain'] + (f'\n\nA fix:\n```\n{b["fix"]}\n```' if b.get('fix') else '')}
    blank = not str(value or '').strip()
    return {**out, 'marks': 0 if blank else None, 'right': b['model'], 'explanation': '',
            'points': [{'point': p, 'status': 'missing', 'note': ''} for p in b['points']] if blank else None}


def recall_marks(points):
    return sum(1 if p['status'] == 'covered' else 0.5 if p['status'] == 'partial' else 0 for p in points)


def totals(doc):
    results = doc.get('results') or {}
    marks = sum(r['marks'] or 0 for r in results.values())
    full = sum(it['max'] for it in doc['items'])
    pending = sum(r['marks'] is None for r in results.values())
    pct = round(100 * marks / full, 1) if full else 0
    return {'marks': marks, 'max': full, 'pending': pending, 'pct': pct,
            **({'grade': knowledge.grade(pct)} if not pending else {'grade': None})}


# ---------- Composition (pure) ----------
def compose(pool, views, target, seed, per_topic=2):
    """Weighted pick toward weak items, a topic spread, capped long answers; ordered short to long."""
    rng = random.Random(seed)
    def key(item):
        w = WEIGHTS.get(views.get(item['id'], {}).get('status', 'unseen'), 1)
        return rng.random() ** (1 / w)
    ranked = sorted(pool, key=key, reverse=True)
    recall_cap = max(1, target // 15)
    for cap in (per_topic, None):
        picked, marks, per, recalls = [], 0, {}, 0
        for item in ranked:
            m = max_marks(item['id'])
            if marks >= target:
                break
            if marks + m > target + 2 and picked:
                continue
            if cap and per.get(item['topic'], 0) >= cap:
                continue
            if item['kind'] == 'recall' and recalls >= recall_cap:
                continue
            picked.append(item)
            marks += m
            per[item['topic']] = per.get(item['topic'], 0) + 1
            recalls += item['kind'] == 'recall'
        if marks >= target * 0.8:
            break
    return sorted(picked, key=lambda i: (i['kind'] == 'recall', max_marks(i['id']), TOPIC_ORDER.get(i['topic'], 0)))


def scope_pool(scope, value, records, summary):
    views = {v['id']: v for v in summary['items']}
    studied = {r['lesson_id'] for r in records if r.get('kind') == 'course_lesson' and r.get('read_at')}
    studied |= {v['topic'] for v in summary['items'] if v['answers']}
    if scope == 'mixed':
        pool = [i for i in POOL if i['topic'] in studied] or POOL
        label = 'Mixed'
    elif scope == 'category':
        names = dict((c[0], c[1]) for c in CATEGORIES)
        if value not in names:
            raise HTTPException(422, 'Unknown category')
        pool, label = [i for i in POOL if i['category'] == value], names[value]
    elif scope == 'topic':
        if value not in LESSONS:
            raise HTTPException(422, 'Unknown topic')
        pool, label = [i for i in POOL if i['topic'] == value], LESSONS[value]['title']
    elif scope == 'review':
        pool = [i for i in POOL if views.get(i['id'], {}).get('status') in ('fading', 'shaky')]
        label = 'Review'
    else:
        book = summary['mistakes']
        ids = {m['id'] for m in book['fix'] + book['confirm']}
        pool, label = [i for i in POOL if i['id'] in ids], 'Mistakes'
    return pool, label, views


# ---------- API ----------
class Start(BaseModel):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    scope: Literal['mixed', 'category', 'topic', 'review', 'mistakes'] = 'mixed'
    value: str = ''
    length: Literal['short', 'standard', 'long'] = 'short'


Value = str | int | float | list[str | int] | dict[str, int] | None


class AnswerBody(BaseModel):
    n: int = Field(ge=0, le=99)
    value: Value = None


class Finish(BaseModel):
    elapsed_sec: int = Field(default=0, ge=0, le=86400)


class SelfMark(BaseModel):
    n: int = Field(ge=0, le=99)
    covered: list[int] = Field(default_factory=list, max_length=12)
    partial: list[int] = Field(default_factory=list, max_length=12)


def put(store, key, doc, revision=None):
    try:
        return store.put_design_record(key, doc, revision)
    except ValueError as exc:
        raise HTTPException(409, 'This paper changed. Reload to recover it.') from exc


def read(store, key):
    doc = store.get_design_record(key)
    if not doc or doc.get('kind') != 'paper':
        raise HTTPException(404, 'Paper not found')
    return doc


def view(doc):
    """Public paper: contracts stay private until it is finished."""
    out = {k: deepcopy(v) for k, v in doc.items() if k != 'items'}
    out['items'] = [deepcopy(it['public']) for it in doc['items']]
    if doc['status'] != 'sitting':
        out['totals'] = totals(doc)
        for it, pub in zip(doc['items'], out['items']):
            pub['label'] = ledger_items.BY_ID[it['item']]['label']
            if it['contract']['type'] == 'recall':
                pub['scheme'] = it['contract']['b']['points']
    return out


def summaries(records):
    out = []
    for r in records:
        if r.get('kind') == 'paper' and r.get('status') != 'sitting':
            t = totals(r)
            out.append({'id': r['id'], 'scope': r['scope'], 'scope_key': r['scope_key'], 'scope_label': r['scope_label'],
                        'length': r['length'], 'finished_at': r['finished_at'], 'elapsed_sec': r.get('elapsed_sec', 0),
                        'time_limit_sec': r['time_limit_sec'], 'status': r['status'], 'ranked': r['scope']['kind'] in RANKED_SCOPES,
                        'marks': t['marks'], 'max': t['max'], 'pct': None if t['pending'] else t['pct'],
                        'grade': t['grade']['grade'] if t['grade'] else None})
    return sorted(out, key=lambda p: -p['finished_at'])


@router.get('/papers')
def list_papers(store=Depends(store_for)):
    records = store.list_design_records()
    sitting = next((r['id'] for r in sorted(records, key=lambda r: -r.get('created_at', 0))
                    if r.get('kind') == 'paper' and r['status'] == 'sitting'), None)
    return {'papers': summaries(records)[:40], 'sitting': sitting, 'lengths': LENGTHS, 'sec_per_mark': SEC_PER_MARK,
            'grades': [{'grade': g, 'floor': f, 'meaning': m} for g, f, m in knowledge.GRADES],
            'coach_enabled': llm.enabled(store.get_settings())}


@router.post('/papers')
def start_paper(body: Start, store=Depends(store_for)):
    key = 'paper_' + body.request_id
    old = store.get_design_record(key)
    if old:
        return view(old)
    records = store.list_design_records()
    now = int(time.time())
    summary = knowledge.summary(ledger_items.ITEMS, ledger_items.events(records), now, history_days=1)
    pool, label, views = scope_pool(body.scope, body.value, records, summary)
    target = LENGTHS[body.length] if body.scope in RANKED_SCOPES else min(LENGTHS[body.length], sum(max_marks(i['id']) for i in pool))
    picked = compose(pool, views, target, body.request_id, per_topic=None if body.scope == 'topic' else 2)
    if not picked:
        raise HTTPException(422, {'review': 'Nothing is due for review yet.', 'mistakes': 'Your mistakes book is empty.'}
                            .get(body.scope, 'No questions match this paper.'))
    items = []
    for n, item in enumerate(picked):
        c = contract(item['id'])
        if c['type'] == 'question' and views.get(item['id'], {}).get('answers'):
            c['q'] = variants.take(store, records, item['id']) or c['q']
        items.append({'n': n, 'item': item['id'], 'max': c['max'], 'contract': c, 'public': public(c, n, body.request_id)})
    full = sum(it['max'] for it in items)
    scope_key = ':'.join(p for p in (body.scope, body.value, body.length) if p)
    doc = put(store, key, {'kind': 'paper', 'created_at': now, 'scope': {'kind': body.scope, 'value': body.value},
                           'scope_key': scope_key, 'scope_label': f'{label} · {body.length}', 'length': body.length,
                           'time_limit_sec': full * SEC_PER_MARK, 'items': items, 'answers': {}, 'status': 'sitting'})
    return view(doc)


@router.get('/papers/{key}')
def get_paper(key: str, store=Depends(store_for)):
    return view(read(store, key))


@router.post('/papers/{key}/answer')
def save_answer(key: str, body: AnswerBody, store=Depends(store_for)):
    for _ in range(3):
        doc = read(store, key)
        if doc['status'] != 'sitting':
            raise HTTPException(409, 'This paper is already finished')
        if body.n >= len(doc['items']):
            raise HTTPException(422, 'Unknown question')
        if isinstance(body.value, str) and len(body.value) > 3000:
            raise HTTPException(422, 'Answer too long')
        answers = {**doc['answers'], str(body.n): {'value': body.value, 'at': time.time()}}
        try:
            put(store, key, {**doc, 'answers': answers}, doc['revision'])
            return {'saved': body.n}
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
    raise HTTPException(409, 'Reload to recover the saved paper')


def report_item(it, r):
    c = it['contract']
    prompt = c['q']['prompt'] if c['type'] == 'question' else c['b'].get('prompt', '')
    return {'n': it['n'], 'type': c['type'], 'question': prompt, 'your_answer': r['answer_text'],
            'correct_answer': r['right'], 'marks': r['marks'], 'max': it['max'],
            'authored_explanation': r.get('explanation', ''), 'rubric': r.get('points')}


async def mark_written(store, key):
    """Model-mark recall answers and write the examiner's report. Never required."""
    doc = read(store, key)
    settings = store.get_settings()
    todo = [it for it in doc['items'] if doc['results'][str(it['n'])]['marks'] is None]
    grades = await asyncio.gather(*(coach.grade_recall(it['contract']['b'], str(doc['results'][str(it['n'])]['answer']), settings)
                                    for it in todo))
    results = deepcopy(doc['results'])
    failed = False
    for it, (g, _) in zip(todo, grades):
        r = results[str(it['n'])]
        if g:
            r.update(marks=recall_marks(g['points']), points=g['points'], feedback=g['feedback'], marked_by=g['model'])
        else:
            failed = True
    report, _ = await coach.examiner_report([report_item(it, results[str(it['n'])]) for it in doc['items']], settings)
    for _ in range(3):
        latest = read(store, key)
        update = {**latest, 'results': {**latest['results'], **{k: v for k, v in results.items() if latest['results'][k]['marks'] is None}},
                  'report': report or latest.get('report'), 'status': 'self_mark' if failed else 'marked', 'marked_at': int(time.time())}
        if not totals(update)['pending']:
            update['status'] = 'marked'
        try:
            return put(store, key, update, latest['revision'])
        except HTTPException as exc:
            if exc.status_code != 409:
                raise


@router.post('/papers/{key}/finish')
def finish(key: str, body: Finish, background: BackgroundTasks, store=Depends(store_for)):
    doc = read(store, key)
    if doc['status'] != 'sitting':
        return view(doc)
    now = int(time.time())
    results = {str(it['n']): mark(it['contract'], doc['answers'].get(str(it['n']), {}).get('value')) for it in doc['items']}
    coach_on = llm.enabled(store.get_settings())
    written = any(r['marks'] is None for r in results.values())
    status = 'marking' if coach_on else 'self_mark' if written else 'marked'
    doc = put(store, key, {**doc, 'results': results, 'finished_at': now, 'marking_started': now,
                           'elapsed_sec': body.elapsed_sec, 'status': status, 'report': None}, doc['revision'])
    if coach_on:
        background.add_task(mark_written, store, key)
    return view(doc)


@router.post('/papers/{key}/mark')
def retry_marking(key: str, background: BackgroundTasks, store=Depends(store_for)):
    doc = read(store, key)
    if doc['status'] == 'sitting':
        raise HTTPException(409, 'Finish the paper first')
    if doc['status'] == 'marking' and int(time.time()) - doc.get('marking_started', 0) < MARKING_STALE:
        raise HTTPException(409, 'Marking is still running')
    if not llm.enabled(store.get_settings()):
        raise HTTPException(503, 'The model is unavailable. Mark written answers yourself.')
    doc = put(store, key, {**doc, 'status': 'marking', 'marking_started': int(time.time())}, doc['revision'])
    background.add_task(mark_written, store, key)
    return view(doc)


@router.post('/papers/{key}/self-mark')
def self_mark(key: str, body: SelfMark, store=Depends(store_for)):
    doc = read(store, key)
    if doc['status'] not in ('self_mark', 'marking') or body.n >= len(doc['items']):
        raise HTTPException(409, 'Nothing to self-mark here')
    item = doc['items'][body.n]
    r = doc['results'][str(body.n)]
    if item['contract']['type'] != 'recall' or r['marks'] is not None:
        raise HTTPException(409, 'This answer is already marked')
    if doc['status'] == 'marking' and int(time.time()) - doc.get('marking_started', 0) < MARKING_STALE:
        raise HTTPException(409, 'Marking is still running')
    points = item['contract']['b']['points']
    statuses = [{'point': p, 'status': 'covered' if i in body.covered else 'partial' if i in body.partial else 'missing',
                 'note': ''} for i, p in enumerate(points)]
    results = {**doc['results'], str(body.n): {**r, 'marks': recall_marks(statuses), 'points': statuses, 'marked_by': 'self'}}
    update = {**doc, 'results': results}
    update['status'] = 'marked' if not totals(update)['pending'] else 'self_mark'
    return view(put(store, key, update, doc['revision']))
