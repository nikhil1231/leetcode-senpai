"""Handover: an outside tutor (ChatGPT over MCP) takes one lesson and hands back what it learned.

Like a substitute teacher, the outside tutor reads everything once at the start, teaches on its
own with no calls back, and reports once at the end. /api/knowledge/handover reads the lesson's
ideas (numbered P1, P2… as in a study prompt) and what the app's own tutor knows: the lesson's
objectives, the last session's summary and where a session left off. It saves which point each
number is as a study session. /api/knowledge/handback grades those numbers and leaves a summary
for the next tutor, through the same plan and trust rules as a pasted debrief (study_debrief.py):
right is soft evidence, a miss opens a misconception or a gap. Grades for an idea are recorded
once per session; a later handback adds only ideas not yet graded. Pure: brief, pick, rows. I/O:
the router.
"""
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from . import study_debrief, study_prompt
from .knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from .store import get_store
from .tutor import api as tutor_api, lessons, session as tses

router = APIRouter(prefix='/api/knowledge', tags=['knowledge'])
SECTIONS = ('system-design', 'fundamentals', 'ai')
LAST_TURNS = 6
TURN_CHARS = 400
SUMMARY_CHARS = 1500

HANDOVER = """How this handover works:
- You are taking over from my usual tutor, which lives in my practice app; everything it knows is above. Teach on your own from here: don't call any tools while we talk.
- Keep your own track of which numbered ideas you test me on, how I answered and my exact words.
- When I say I'm done (stop, that's it, let's wrap up, or similar), sum up briefly, then call learning_handback once with session {session}: one grade for each P-number you actually tested (right, partial or wrong; the depth; my exact words as I said them; and for partial or wrong, what was missing), and a short summary of where we got to for my next tutor. Judge strictly, and don't grade ideas you only explained.
- If that call fails, try it once more with the same session."""


def where_we_left_off(lesson, memory, session):
    """-> lines on the app tutor's state for this lesson: objectives, last summary, last turns."""
    lines = []
    if lesson['objectives']:
        status = (session or {}).get('objectives') or []
        lines.append('What this lesson should leave me able to do:')
        for i, o in enumerate(lesson['objectives']):
            mark = tses.MARK[status[i]['status']] if i < len(status) else tses.MARK[tses.OPEN]
            lines.append(f'- {o} ({mark})')
    if memory.get('summary'):
        lines += ['', f"Last session on this lesson: {memory['summary']}"]
    turns = [t for t in (session or {}).get('turns', []) if t['role'] in ('learner', 'tutor') and not t.get('debrief')]
    if turns:
        lines += ['', 'Where that session stopped (its last few turns):']
        for t in turns[-LAST_TURNS:]:
            text = ' '.join((t.get('text') if t['role'] == 'learner' else t.get('say', '')).split())
            text = text if len(text) <= TURN_CHARS else text[:TURN_CHARS] + '…'
            lines.append(f"- {'Me' if t['role'] == 'learner' else 'Tutor'}: {text}")
    return lines


def brief(views, misconceptions, lesson, memory, session, code):
    """-> (the handover text, {ref: point id}) for one lesson, or None when it has no points."""
    out = study_prompt.knowledge(views, misconceptions, lesson['section'], lesson=lesson['id'])
    if not out:
        return None
    text, refs = out
    left = where_we_left_off(lesson, memory, session)
    if lesson.get('summary'):
        left = [f"The lesson in one line: {lesson['summary']}"] + ([''] if left else []) + left
    parts = [text] + (['Handover from my usual tutor:\n' + '\n'.join(left)] if left else [])
    return '\n\n'.join(parts + [HANDOVER.format(session=code)]), refs


def find_lesson(views, sections, topic):
    """-> (section, lesson id) whose title best matches `topic`, or None. Lesson titles first, then subtopics."""
    needle = ' '.join(topic.casefold().split())
    scoped = [v for v in views if v['section'] in sections]
    for field in ('lesson_title', 'lesson', 'category_title', 'subtopic', 'claim'):
        hit = next((v for v in scoped if needle in ' '.join(str(v.get(field) or '').casefold().split())), None)
        if hit:
            return hit['section'], hit['lesson']
    return None


def recent_lesson(memories, sections, has_points):
    """-> (section, lesson id, last_at) of the lesson a tutor touched most recently, or None."""
    found = []
    for m in memories:
        parts = (m.get('_key') or '').split(':', 2)
        if len(parts) == 3 and parts[0] == 'lesson' and parts[1] in sections and has_points(parts[1], parts[2]):
            found.append((m.get('last_at') or 0, parts[1], parts[2]))
    if not found:
        return None
    at, section, lesson = max(found)
    return section, lesson, at


def rows(grades):
    """Handback grades -> the rows a debrief plan reads. A later grade for the same idea wins."""
    out = {}
    for g in grades:
        note = (g['missing'] or '').strip() if g['verdict'] != 'right' else ''
        out[g['ref']] = {'ref': g['ref'], 'verdict': g['verdict'], 'depth': g['depth'],
                         'note': note or (g['said'] or '').strip()[:300], 'quote': (g['said'] or '').strip()}
    return list(out.values())


# ---- HTTP -------------------------------------------------------------------------------

def _choose(store, views, sections, lesson, topic, now):
    if lesson:
        section = next((s for s in sections if lessons.get(s, lesson)), None)
        if not section:
            raise HTTPException(404, f'No lesson {lesson} in {", ".join(sections)}')
        return section, lesson, 'asked for by id'
    if topic:
        hit = find_lesson(views, sections, topic)
        if not hit:
            titles = sorted({v['lesson_title'] for v in views if v['section'] in sections})[:40]
            raise HTTPException(404, f'No lesson matches "{topic}". Some lessons: ' + '; '.join(titles))
        return hit[0], hit[1], f'matches "{topic}"'
    has = {(v['section'], v['lesson']) for v in views}
    recent = recent_lesson(store.list_knowledge('tutor_memory'), sections, lambda s, l: (s, l) in has and lessons.get(s, l))
    if recent:
        return recent[0], recent[1], 'the lesson I was on most recently'
    c, _, states, seen, mis = kb_api.evidence(store, now)
    for s in sections:
        picked = kmodel.pick(c, states, seen, mis, now, n=1, mode='learn', section=s)
        if picked and lessons.get(s, picked[0]['point']['lesson']):
            return s, picked[0]['point']['lesson'], 'what to learn next'
    raise HTTPException(404, 'Nothing to teach in these courses yet')


@router.get('/handover')
def handover(section: list[Literal['system-design', 'fundamentals', 'ai']] = Query(default=[]),
             lesson: str | None = Query(default=None, max_length=80), topic: str | None = Query(default=None, max_length=160),
             who=Depends(kb_api.caller)):
    """Everything an outside tutor needs to take one lesson, once. With no lesson or topic, the
    lesson a tutor was on most recently. `section` limits which courses it may choose from."""
    store, now = get_store(who['uid']), time.time()
    sections = tuple(dict.fromkeys(section)) or SECTIONS
    views, mis = study_prompt.titled_views(store, now)
    sec, key, why = _choose(store, views, sections, lesson, topic, now)
    l = lessons.get(sec, key)
    memory = store.get_knowledge('tutor_memory', tutor_api._memory_key(sec, key)) or {}
    active = store.get_knowledge('tutor_sessions', memory['active']) if memory.get('active') else None
    code = study_prompt._session_code()
    out = brief(views, mis, l, memory, active, code)
    if not out:
        raise HTTPException(404, f'{l["title"]} has no ideas to teach yet')
    text, refs = out
    store.create_knowledge('study_sessions', code, {
        'scope': {'section': sec, 'lesson': key}, 'refs': refs, 'created_at': now, 'origin': 'handover',
        'source': kb_api._source(who, None), 'imported_at': None, 'debrief': None, 'counts': None})
    return {'session': code, 'section': sec, 'lesson': key, 'lesson_title': l['title'], 'chosen': why,
            'ideas': len(refs), 'brief': text}


@router.get('/handover/{code}')
def handover_session(code: str, who=Depends(kb_api.caller)):
    """Which course and lesson a handover session is for (a caller checks its permissions first)."""
    s = get_store(who['uid']).get_knowledge('study_sessions', code)
    if not s:
        raise HTTPException(404, 'Unknown session')
    return {'session': code, **{k: s['scope'].get(k) for k in ('section', 'lesson')},
            'graded': sorted(s.get('recorded_refs') or []), 'handed_back_at': s.get('imported_at')}


class Grade(BaseModel):
    ref: str = Field(pattern=r'^P\d{1,3}$', description='A P-number from the handover.')
    verdict: Literal['right', 'partial', 'wrong']
    depth: Literal['recognise', 'recall', 'explain', 'apply'] = 'recall'
    said: str = Field(default='', max_length=1000, description="The learner's exact words.")
    missing: str = Field(default='', max_length=300, description='For partial or wrong: what was missing or wrong.')


class HandbackIn(BaseModel):
    session: str = Field(pattern=r'^[A-Za-z0-9]{4,12}$')
    grades: list[Grade] = Field(default_factory=list, max_length=60)
    summary: str = Field(default='', max_length=SUMMARY_CHARS)
    notes: list[str] = Field(default_factory=list, max_length=10)


@router.post('/handback')
def handback(body: HandbackIn, who=Depends(kb_api.caller)):
    """Record an outside tutor's grades and summary for a handover session. Safe to repeat."""
    store, now = get_store(who['uid']), time.time()
    s = store.get_knowledge('study_sessions', body.session)
    if not s:
        raise HTTPException(404, f'Session {body.session} is not one this app made. Call learning_handover again.')
    c = kcat.CATALOG
    refs = {r: pid for r, pid in ((r, kcat.canonical(c, p)) for r, p in s['refs'].items()) if pid}
    graded = set(s.get('recorded_refs') or [])
    new_rows = rows([g.model_dump() for g in body.grades])
    p = study_debrief.plan({'rows': new_rows, 'notes': [n.strip()[:300] for n in body.notes if n.strip()], 'skipped': []},
                           refs, c['points'], store.list_knowledge('knowledge_misconceptions'))
    quotes = {r['ref']: r['quote'] for r in new_rows}
    fresh = [{**ch, 'quote': quotes[ch['ref']]} for ch in p['changes'] if ch['ref'] not in graded]
    source = kb_api._source(who, None)
    study_prompt.record_changes(store, body.session, fresh, source, now)
    counts = {v: (s.get('counts') or {}).get(v, 0) + sum(ch['verdict'] == v for ch in fresh) for v in study_debrief.VERDICTS}
    summary = ' '.join(body.summary.split())
    store.put_knowledge('study_sessions', body.session, {
        **{k: v for k, v in s.items() if k != '_key'}, 'imported_at': s.get('imported_at') or now, 'last_handback_at': now,
        'recorded_refs': sorted(graded | {ch['ref'] for ch in fresh}), 'counts': counts,
        'notes': (s.get('notes') or []) + p['notes'], 'summary': summary or s.get('summary', '')})
    if summary:
        _remember(store, s['scope']['section'], s['scope']['lesson'], summary, now)
    return {'session': body.session, 'recorded': [ch['ref'] for ch in fresh],
            'already_graded': [ch['ref'] for ch in p['changes'] if ch['ref'] in graded],
            'skipped': p['skipped'], 'counts': counts, 'summary_saved': bool(summary)}


def _remember(store, section, lesson, summary, now):
    """The summary becomes "last session on this lesson" for the app's own tutor too."""
    mk = tutor_api._memory_key(section, lesson)
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    store.put_knowledge('tutor_memory', mk, {**mem, 'summary': summary, 'last_at': now, 'summary_from': 'outside tutor'})
    l = lessons.get(section, lesson)
    st = {k: v for k, v in (store.get_knowledge('tutor_memory', tutor_api.STORY_KEY) or {}).items() if k != '_key'}
    store.put_knowledge('tutor_memory', tutor_api.STORY_KEY, {**st, 'last_lesson': l['title'], 'summary': f'{l["title"]}: {summary}'})
