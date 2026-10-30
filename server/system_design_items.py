"""System design adapter for the knowledge ledger: every gradeable thing is a countable item.

Items are the active lesson-check and Quickfire questions, every gradeable lesson block
(predict, estimate, fill-the-gaps, sort, order, spot-the-bug, recall, incident, missing-box
diagrams, find-the-step timelines) and the skill drills. Events are derived from existing
records, so history recorded before the ledger existed counts without a migration.
"""
import datetime as dt
import re
import time

from fastapi import APIRouter, Depends, Query

from . import auth, knowledge
from .store import get_store
from .system_design_content import EXERCISES, SKILLS
from .system_design_curriculum import CATEGORIES, LESSONS, QUESTIONS
from .system_design_drills import TEMPLATES
from .system_design_learning import active, rows

router = APIRouter(prefix='/api/system-design', tags=['system-design-ledger'])
SECTION = 'system-design'
DRILL_CATEGORY = ('skill-drills', 'Skill drills', 'Short decisions from the original design cases.')
REDESIGN_PASS = 0.75
ESTIMATION_CATEGORY = ('estimation', 'Estimation drills', 'Back-of-envelope arithmetic, one template per square.')


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def plain(text, limit=110):
    text = re.sub(r'[*`_>#\[\]]', '', str(text or '')).split('\n')[0].strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def gradeable(block):
    kind = block['type']
    return (kind in ('predict', 'calc', 'faded', 'sort', 'order', 'bug', 'recall', 'incident')
            or (kind == 'arch' and bool(block.get('missing')))
            or (kind == 'timeline' and bool(block.get('find'))))


def block_id(lesson, key):
    return f'{lesson}:{key}'


def is_walkthrough(lesson):
    """Full design walkthroughs: attempt-first in lessons, and redesigned from memory later."""
    return lesson.get('category') in ('designs', 'casebook') and lesson['id'].startswith('design-')


def _catalogue():
    items = []
    for key, lesson in LESSONS.items():
        base = {'section': SECTION, 'category': lesson['category'], 'topic': key}
        for block in lesson.get('blocks', []):
            if block['type'] != 'md' and gradeable(block):
                items.append({**base, 'id': block_id(key, block['key']), 'kind': block['type'],
                              'label': plain(block.get('title') or block.get('prompt') or block.get('intro'))})
        for qid in lesson['quiz_ids'] + lesson['quickfire_ids']:
            if active(qid):
                q = QUESTIONS[qid]
                items.append({**base, 'id': qid, 'kind': 'check' if q['kind'] == 'quiz' else 'quickfire',
                              'label': plain(q['prompt'])})
        if is_walkthrough(lesson):
            items.append({**base, 'id': 'redesign:' + key, 'kind': 'redesign',
                          'label': 'Redesign from memory: ' + lesson['title']})
    for key, ex in EXERCISES.items():
        items.append({'section': SECTION, 'category': DRILL_CATEGORY[0], 'topic': 'skill:' + ex['skill'],
                      'id': 'exercise:' + key, 'kind': 'exercise', 'label': plain(ex['title'])})
    for key, (title, _) in TEMPLATES.items():
        items.append({'section': SECTION, 'category': ESTIMATION_CATEGORY[0], 'topic': 'drill:estimation',
                      'id': 'drill:' + key, 'kind': 'drill', 'label': title})
    return items


ITEMS = _catalogue()
BY_ID = {i['id']: i for i in ITEMS}


def topics():
    out = {k: {'id': k, 'title': l['title'], 'category': l['category']} for k, l in LESSONS.items()}
    for skill, title in SKILLS.items():
        out['skill:' + skill] = {'id': 'skill:' + skill, 'title': title, 'category': DRILL_CATEGORY[0]}
    out['drill:estimation'] = {'id': 'drill:estimation', 'title': 'Back-of-envelope estimates', 'category': ESTIMATION_CATEGORY[0]}
    return out


def categories():
    return [{'id': c[0], 'title': c[1]} for c in CATEGORIES + [DRILL_CATEGORY, ESTIMATION_CATEGORY]]


def events(records):
    """Normalised answer events from stored records. Pure."""
    out = []
    for a in rows(records):
        ok = bool(a.get('correct')) and not a.get('revealed')
        out.append({'item': a['question_id'], 'at': a['answered_at'], 'marks': 1 if ok else 0, 'max': 1,
                    'clean': ok and not a.get('guessed'), 'source': a['source']})
    for r in records:
        if r.get('kind') == 'course_lesson':
            for key, act in (r.get('activities') or {}).items():
                if act.get('first_correct') is None or block_id(r['lesson_id'], key) not in BY_ID:
                    continue
                ok = bool(act['first_correct'])
                out.append({'item': block_id(r['lesson_id'], key), 'at': act.get('at', r.get('at', 0)),
                            'marks': 1 if ok else 0, 'max': 1, 'clean': ok, 'source': 'lesson'})
        elif r.get('kind') == 'paper' and r.get('status') not in (None, 'sitting'):
            # Marked paper answers; blank answers are not evidence either way.
            for it in r['items']:
                res = r.get('results', {}).get(str(it['n']))
                if not res or res['marks'] is None or res.get('answer') in (None, '', [], {}):
                    continue
                out.append({'item': it['item'], 'at': r['finished_at'], 'marks': res['marks'], 'max': it['max'],
                            'clean': res['marks'] >= it['max'], 'source': 'paper'})
        elif r.get('kind') == 'sprint':
            for n, a in (r.get('answers') or {}).items():
                q = r['questions'][int(n)]
                out.append({'item': 'drill:' + q['template'], 'at': a['at'], 'marks': 1 if a['correct'] else 0,
                            'max': 1, 'clean': bool(a['correct']), 'source': 'drill'})
        elif r.get('kind') == 'redesign' and r.get('score') is not None:
            ok = r['score'] >= REDESIGN_PASS
            out.append({'item': 'redesign:' + r['lesson_id'], 'at': r['created_at'], 'marks': 1 if ok else 0,
                        'max': 1, 'clean': ok, 'source': 'redesign'})
        elif r.get('kind') == 'practice' and r.get('answered_at'):
            ok = bool(r.get('correct')) and not r.get('revealed')
            out.append({'item': 'exercise:' + r['exercise_id'], 'at': r['answered_at'], 'marks': 1 if ok else 0,
                        'max': 1, 'clean': ok, 'source': 'exercise'})
    return out


def heatmap(views):
    """Category → topic → item squares, in course order."""
    names = topics()
    by_topic = {}
    for v in views:
        by_topic.setdefault(v['topic'], []).append({k: v[k] for k in ('id', 'kind', 'label', 'status', 'r')})
    out = []
    for c in categories():
        rows_ = [{'id': t, 'title': names[t]['title'], 'items': by_topic[t]}
                 for t in names if names[t]['category'] == c['id'] and t in by_topic]
        if rows_:
            out.append({**c, 'topics': rows_})
    return out


RANKED_SCOPES = ('mixed', 'category', 'topic')


def paper_records(records):
    """Fully marked, ranked papers as personal-best candidates."""
    out = []
    for r in records:
        if r.get('kind') != 'paper' or r.get('status') != 'marked' or r['scope']['kind'] not in RANKED_SCOPES:
            continue
        marks = sum(x['marks'] or 0 for x in r['results'].values())
        full = sum(it['max'] for it in r['items'])
        out.append({'scope_key': r['scope_key'], 'scope_label': r['scope_label'], 'max': full,
                    'pct': round(100 * marks / full, 1) if full else 0,
                    'elapsed_sec': r.get('elapsed_sec', 0), 'finished_at': r['finished_at']})
    return out


def sprint_records(records):
    return [{'kind': r['drill'], 'label': r['label'], 'score': r['score'], 'finished_at': r['finished_at']}
            for r in records if r.get('kind') == 'sprint' and r.get('finished_at')]


def slip(records, since, now=None):
    # Float time: answers saved earlier in the current second must count.
    now = time.time() if now is None else now
    return knowledge.slip(ITEMS, events(records), since, now, paper_records(records), sprint_records(records))


def ledger(records, now=None):
    now = time.time() if now is None else now
    evs = events(records)
    s = knowledge.summary(ITEMS, evs, now)
    names = topics()
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = names.get(v['topic'], {}).get('title', v['topic'])
    today = s['daily'].get(dt.date.fromtimestamp(now).isoformat(), {'marks': 0, 'answers': 0})
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'],
            'due': s['due'], 'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'], 'today': today,
            'heatmap': heatmap(s['items']),
            'redesign_due': [{'lesson_id': v['topic'], 'title': names[v['topic']]['title'], 'status': v['status']}
                             for v in s['items'] if v['kind'] == 'redesign' and v['status'] in ('fading', 'shaky')],
            'records': knowledge.records(evs, paper_records(records), sprint_records(records)),
            'grades': [{'grade': g, 'floor': f, 'meaning': m} for g, f, m in knowledge.GRADES]}


@router.get('/ledger')
def get_ledger(store=Depends(store_for)):
    return ledger(store.list_design_records())


@router.get('/slip')
def get_slip(since: int = Query(ge=0), store=Depends(store_for)):
    return slip(store.list_design_records(), since)
