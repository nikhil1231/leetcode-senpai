"""Handover: an outside tutor (ChatGPT over MCP) takes one lesson and hands back what it learned.

Like a substitute teacher, the outside tutor reads everything once at the start, teaches on its
own with no calls back, and reports once at the end. /api/knowledge/handover writes a full
tutoring brief: how to teach (diagnose, big picture, teach, check, reinforce), the lesson's ideas
numbered P1, P2… as in a study prompt, and what the app's own tutor knows: the lesson's
objectives, the last session's summary, open mistakes and where a session left off. It saves which point each
number is as a study session. /api/knowledge/handback grades those numbers and leaves a summary
for the next tutor, through the same plan and trust rules as a pasted debrief (study_debrief.py):
right is soft evidence, a miss opens a misconception or a gap. Grades for an idea are recorded
once per session; a later handback adds only ideas not yet graded. Pure: brief, pick, rows. I/O:
the router.
"""
import json
import logging
import re
import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from . import config, handback_filing as hf, llm, study_debrief, study_prompt
from .knowledge_base import api as kb_api, catalog as kcat, model as kmodel
from .store import get_store
from .tutor import api as tutor_api, lessons, session as tses

log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/knowledge', tags=['knowledge'])
SECTIONS = ('system-design', 'fundamentals', 'ai')
LAST_TURNS = 6
TURN_CHARS = 400
SUMMARY_CHARS = 6000

INTRO = """I'm preparing for software engineering interviews. Be my personal tutor in a live voice conversation. Your goal is deep, lasting understanding of the lesson below, making efficient use of what I already know.

You are taking over from my usual tutor, which lives in my practice app. Use the lesson and my learning history below to adapt your teaching."""

STATUS_NOTE = """Each idea has a stable reference (P1, P2…) and my status from the practice app: use them to see what I have shown I know, what needs revision and what has not been assessed yet. "Never practised" does not mean I don't know it, only that I haven't shown it to the app yet."""

TEACHING = """## How to teach

Be an excellent teacher, not a quizmaster: build understanding rather than check what I already know or tick off a list. Work in this cycle:

1. Diagnose. Open each new part of the topic with one or two well-chosen questions that show where I am, preferably open-ended, practical ones that probe several related ideas at once. From my answers, decide what I already understand, what needs a brief refresher and what needs teaching from first principles. Don't assume an idea I have never practised is unfamiliar, and don't assume I know it either.
2. Give the big picture. Before unfamiliar detail, explain what the topic is, why it matters and how its main ideas fit together, so I have a mental model to hang the details on. No advanced edge cases before their prerequisites.
3. Teach what I don't know, explicitly: the intuition, the terminology, a concrete worked example, why it matters in real engineering, and how it connects to what I already know. Don't make me discover unfamiliar technical ideas by guessing.
4. Check understanding. After teaching an idea, ask me to explain it in my own words or apply it to a new scenario, favouring reasoning over memorisation. When I'm wrong, name the exact misconception, explain it, and check it again later. When I've got it, move on rather than over-testing.
5. Reinforce. Come back to ideas I struggled with, ideally in a different context, and use active recall on what we've covered. Tell apart something I never learned, something I misunderstood and something I knew but have forgotten.

## Pacing and conversation

- This is live voice: keep it natural and interactive. Speak naturally, with no lists, code blocks, markdown or symbols read aloud.
- Ask one question at a time and wait for my answer. Not every turn needs to end with a question.
- Keep explanations digestible, but don't cut one short when an idea needs more teaching. Adjust pace and depth to my answers, and use examples and analogies where they help.
- If I'm confused, stop testing and explain the missing foundations. If I already understand something, don't teach it again.
- No excessive praise, repeated acknowledgements or needless recaps.

## How the lesson progresses

- Order the lesson as one coherent sequence, from fundamentals to applications. The numbered ideas are a coverage guide, not a list of isolated questions: connect related ideas into explanations and exercises, and reorder them when that helps understanding.
- Spend the most time on ideas I got wrong, am slipping on or have not shown yet; touch solid ones briefly, to connect them to the rest.
- Favour real understanding over covering every idea, and now and then tie what we've done back to the objectives."""

CONTINUITY = """Keep continuity with that session, but don't just repeat its last question: first check I have the foundations to carry on from there, and if not, set them up briefly."""

ENDING = """## Keeping track

Keep your own detailed record of everything we talk about, including any tangents away from this lesson:
- Each numbered idea you test me on: its P-number; whether I was right, partial or wrong; the depth I showed (recognise, recall, explain or apply); my exact words, unedited; and for partial or wrong, what was missing or incorrect. Be strict but fair.
- Each numbered idea you only explained, without testing me: its P-number, marked explained.
- Everything else we discuss that has no P-number, however far from the lesson: what the topic was, what we covered in detail, my exact words, and how I did (right, partial, wrong, or explained if I only listened).

## Ending the session

When I say I'm done (stop, that's it, let's wrap up, or similar):
1. Briefly sum up what I understood well.
2. Name the important misconceptions or gaps.
3. Recommend what I should practise next.
4. Call learning_handback once with session {session} and the full record, in detail:
   - grades: one per P-number you tested or explained.
   - topics: one per other topic we discussed, with what we covered, my exact words and how I did.
   - summary: a detailed account for my next tutor of what we covered and in what order, what I understood, where I struggled and exactly where we ended. Several paragraphs is fine.
   - next_steps: what my next session should start with.
   - lesson_suggestions: anything the lesson itself seems to miss or get wrong, if you noticed something.
   If that call fails, try it once more with the same session.

Don't call any tools while we talk, only learning_handback at the end. Start now, with a diagnostic question."""


def where_we_left_off(memory, session, gaps):
    """-> lines on what the app's tutor knows about this lesson: last summary, open mistakes, last turns."""
    lines = []
    if memory.get('summary'):
        lines.append(f"Last session on this lesson: {memory['summary']}")
    if gaps:
        lines += ([''] if lines else []) + ['Mistakes I have made that are still open:'] + gaps
    turns = [t for t in (session or {}).get('turns', []) if t['role'] in ('learner', 'tutor') and not t.get('debrief')]
    if turns:
        lines += ([''] if lines else []) + ['Where that session stopped (its last few turns):']
        for t in turns[-LAST_TURNS:]:
            text = ' '.join((t.get('text') if t['role'] == 'learner' else t.get('say', '')).split())
            text = text if len(text) <= TURN_CHARS else text[:TURN_CHARS] + '…'
            lines.append(f"- {'Me' if t['role'] == 'learner' else 'Tutor'}: {text}")
        lines += ['', CONTINUITY]
    return lines


def _objectives(lesson, session):
    status = (session or {}).get('objectives') or []
    return [f"- {o} ({tses.MARK[status[i]['status'] if i < len(status) else tses.OPEN]})" for i, o in enumerate(lesson['objectives'])]


def brief(views, misconceptions, lesson, memory, session, code):
    """-> (the handover text, {ref: point id}) for one lesson, or None when it has no points."""
    vs = [v for v in views if v['section'] == lesson['section'] and v['lesson'] == lesson['id']]
    if not vs:
        return None
    refs = {}

    def ref(v):
        r = f'P{len(refs) + 1}'
        refs[r] = v['id']
        return r

    first = vs[0]
    head = ['## The lesson', '', f"Section: {first.get('section_title') or lesson['section']} > {first.get('category_title') or first['category']}",
            f"Topic: {first['lesson_title']}"]
    if lesson.get('summary'):
        head.append(f"In one line: {lesson['summary']}")
    if lesson['objectives']:
        head += ['', 'Learning objectives (and how far I got with my usual tutor):'] + _objectives(lesson, session)
    ideas = study_prompt.lesson_ideas(vs, ref)
    known = ['## What I know', '', f'Progress: {study_prompt._counts(vs)[0]}.', '', 'The ideas, by subtopic, with my status on each:',
             *ideas, '', STATUS_NOTE]
    gaps = study_prompt._gaps(misconceptions, {v['id'] for v in vs}, lambda pid: next(v['subtopic'] for v in vs if v['id'] == pid))
    left = where_we_left_off(memory, session, gaps) or ['My usual tutor has no notes on this lesson yet.']
    parts = [INTRO, '\n'.join(head), '\n'.join(known), TEACHING,
             '## Handover from my usual tutor\n\n' + '\n'.join(left), ENDING.format(session=code)]
    return '\n\n'.join(parts), refs


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


Verdict = Literal['right', 'partial', 'wrong', 'explained']
Depth = Literal['recognise', 'recall', 'explain', 'apply']


class Grade(BaseModel):
    ref: str = Field(pattern=r'^P\d{1,3}$', description='A P-number from the handover.')
    verdict: Verdict = Field(description='explained: taught, not tested.')
    depth: Depth = 'recall'
    said: str = Field(default='', max_length=1000, description="The learner's exact words.")
    missing: str = Field(default='', max_length=300, description='For partial or wrong: what was missing or wrong.')


class Topic(BaseModel):
    topic: str = Field(max_length=160, description='What the topic was, in a few words.')
    detail: str = Field(default='', max_length=1500, description='What was covered, in detail.')
    verdict: Verdict = 'explained'
    depth: Depth = 'recall'
    said: str = Field(default='', max_length=1000, description="The learner's exact words.")
    missing: str = Field(default='', max_length=300)


class HandbackIn(BaseModel):
    session: str = Field(pattern=r'^[A-Za-z0-9]{4,12}$')
    grades: list[Grade] = Field(default_factory=list, max_length=80)
    topics: list[Topic] = Field(default_factory=list, max_length=30)
    summary: str = Field(default='', max_length=SUMMARY_CHARS)
    next_steps: str = Field(default='', max_length=800)
    lesson_suggestions: list[str] = Field(default_factory=list, max_length=8)
    notes: list[str] = Field(default_factory=list, max_length=10)


def merge_topics(old, new):
    """A repeated handback adds only topics not already reported (same title and words)."""
    seen = {(t['topic'].casefold(), t.get('said', '')) for t in old}
    return old + [t for t in new if (t['topic'].casefold(), t.get('said', '')) not in seen]


def _exposures(store, source, code, pids, now, tag):
    kb_api.write_events(store, source, [{'kind': 'exposure', 'points': [pid], 'key': f'{code}.{tag}.{pid}', 'ref': f'study:{code}',
                                         'note': 'Explained by an outside tutor'} for pid in pids], now)


@router.post('/handback')
def handback(body: HandbackIn, tasks: BackgroundTasks, who=Depends(kb_api.caller)):
    """Record an outside tutor's grades, topics and summary for a handover session. Safe to repeat.
    Topics beyond the lesson are filed onto the catalog after the response (file_session)."""
    store, now = get_store(who['uid']), time.time()
    s = store.get_knowledge('study_sessions', body.session)
    if not s:
        raise HTTPException(404, f'Session {body.session} is not one this app made. Call learning_handover again.')
    c = kcat.CATALOG
    refs = {r: pid for r, pid in ((r, kcat.canonical(c, p)) for r, p in s['refs'].items()) if pid}
    graded = set(s.get('recorded_refs') or [])
    grades = [g.model_dump() for g in body.grades]
    new_rows = rows([g for g in grades if g['verdict'] != 'explained'])
    p = study_debrief.plan({'rows': new_rows, 'notes': [n.strip()[:300] for n in body.notes if n.strip()], 'skipped': []},
                           refs, c['points'], store.list_knowledge('knowledge_misconceptions'))
    quotes = {r['ref']: r['quote'] for r in new_rows}
    fresh = [{**ch, 'quote': quotes[ch['ref']]} for ch in p['changes'] if ch['ref'] not in graded]
    source = kb_api._source(who, None)
    study_prompt.record_changes(store, body.session, fresh, source, now)
    explained = [g['ref'] for g in grades if g['verdict'] == 'explained' and g['ref'] in refs]
    _exposures(store, source, body.session, [refs[r] for r in explained], now, 'seen')
    counts = {v: (s.get('counts') or {}).get(v, 0) + sum(ch['verdict'] == v for ch in fresh) for v in study_debrief.VERDICTS}
    summary = re.sub(r'[ \t]+', ' ', re.sub(r'\n{3,}', '\n\n', body.summary)).strip()
    topics = merge_topics(s.get('topics') or [], [t.model_dump() for t in body.topics])
    suggestions = list(dict.fromkeys((s.get('lesson_suggestions') or []) + [x.strip()[:300] for x in body.lesson_suggestions if x.strip()]))
    store.put_knowledge('study_sessions', body.session, {
        **{k: v for k, v in s.items() if k != '_key'}, 'imported_at': s.get('imported_at') or now, 'last_handback_at': now,
        'recorded_refs': sorted(graded | {ch['ref'] for ch in fresh}), 'counts': counts,
        'explained_refs': sorted(set(s.get('explained_refs') or []) | set(explained)),
        'notes': (s.get('notes') or []) + p['notes'], 'summary': summary or s.get('summary', ''),
        'next_steps': body.next_steps.strip() or s.get('next_steps', ''), 'topics': topics, 'lesson_suggestions': suggestions, 'reported_by': source})
    if summary:
        _remember(store, s['scope']['section'], s['scope']['lesson'], body.session, summary, body.next_steps.strip(), now)
    if len(topics) > len(s.get('topics') or []):
        tasks.add_task(file_session, who['uid'], body.session, source)
    return {'session': body.session, 'recorded': [ch['ref'] for ch in fresh], 'explained': explained,
            'already_graded': [ch['ref'] for ch in p['changes'] if ch['ref'] in graded],
            'skipped': p['skipped'], 'counts': counts, 'summary_saved': bool(summary),
            'topics': len(topics), 'filing': 'topics are being filed onto the course' if topics else 'no topics to file'}


@router.post('/handback/{code}/file')
def refile(code: str, who=Depends(kb_api.caller)):
    """File a session's reported topics again, e.g. after the model was unavailable."""
    store = get_store(who['uid'])
    s = store.get_knowledge('study_sessions', code)
    if not s:
        raise HTTPException(404, 'Unknown session')
    return file_session(who['uid'], code, s.get('reported_by') or kb_api._source(who, None))


def file_session(uid, code, source):
    """File a handover session's topics onto ideas in any course: shown ideas become soft evidence
    (a miss opens a misconception or gap), heard ones exposures. -> the session's filing record."""
    store, now = get_store(uid), time.time()
    s = store.get_knowledge('study_sessions', code)
    topics = (s or {}).get('topics') or []
    if not topics:
        return {'status': 'nothing to file'}
    filing = {'version': hf.FILING_VERSION, 'at': now, 'topics': len(topics)}
    if not llm.enabled(store.get_settings()):
        return _save_filing(store, code, s, {**filing, 'status': 'waiting', 'error': 'The model is not connected; the topics are saved.'})
    c = kcat.CATALOG
    points = kcat.active(c)
    graded = {kcat.canonical(c, s['refs'][r]) for r in s.get('recorded_refs') or [] if r in s['refs']}
    idx = hf.index(points)
    lists = [hf.shortlist(hf.topic_text(t), idx, exclude=graded) for t in topics]
    try:
        raw = llm._raw_generate('openrouter', config.TUTOR_NOTES_MODEL, hf.SYSTEM, json.dumps(hf.payload(topics, lists, c['points']), ensure_ascii=False),
                                hf.Filing, options={'effort': 'low', 'max_tokens': 3000, 'timeout': 90})
        matches = hf.Filing.model_validate_json(raw).model_dump()['matches']
    except Exception as exc:
        log.warning('Handback filing failed: %s', type(exc).__name__)
        return _save_filing(store, code, s, {**filing, 'status': 'failed', 'error': 'Filing failed; the topics are saved. Try again.'})
    shown, heard, refs = hf.rows(topics, lists, matches)
    p = study_debrief.plan({'rows': shown, 'notes': [], 'skipped': []}, refs, c['points'], store.list_knowledge('knowledge_misconceptions'))
    quotes = {r['ref']: r['quote'] for r in shown}
    study_prompt.record_changes(store, code, [{**ch, 'quote': quotes[ch['ref']]} for ch in p['changes']], source, now)
    _exposures(store, source, code, heard, now, 'heard')
    pts = c['points']
    filed = [{'point': ch['point'], 'section': pts[ch['point']]['section'], 'lesson': pts[ch['point']]['lesson'],
              'lesson_title': ch['lesson_title'], 'claim': ch['claim'], 'verdict': ch['verdict']} for ch in p['changes']]
    filed += [{'point': pid, 'section': pts[pid]['section'], 'lesson': pts[pid]['lesson'], 'lesson_title': pts[pid]['lesson_title'],
               'claim': pts[pid]['claim'], 'verdict': 'explained'} for pid in heard]
    return _save_filing(store, code, store.get_knowledge('study_sessions', code), {**filing, 'status': 'done', 'filed': filed})


def _save_filing(store, code, s, filing):
    store.put_knowledge('study_sessions', code, {**{k: v for k, v in s.items() if k != '_key'}, 'filing': filing})
    return filing


def _remember(store, section, lesson, code, summary, next_steps, now):
    """The summary becomes "last session on this lesson" for the app's own tutor too. A session the
    app's tutor left open is closed (the outside tutor carried on from it), and the next one picks
    up from this handback."""
    mk = tutor_api._memory_key(section, lesson)
    mem = {k: v for k, v in (store.get_knowledge('tutor_memory', mk) or {}).items() if k != '_key'}
    if mem.get('active'):
        old = store.get_knowledge('tutor_sessions', mem['active'])
        if old and old['status'] == 'active':
            tses.end(old, now)
            old['ended_by'] = f'handover {code}'
            store.put_knowledge('tutor_sessions', old['id'], {k: v for k, v in old.items() if k != '_key'})
    prev = mem.get('outside') or {}
    if prev and not prev.get('picked_up_by') and now - prev['at'] < hf.SITTING and prev['session'] != code:
        summary = prev['summary'] + '\n\n' + summary   # one sitting that handed back twice: the next session gets both
        next_steps = next_steps or prev.get('next_steps', '')
    store.put_knowledge('tutor_memory', mk, {**mem, 'summary': summary, 'last_at': now, 'summary_from': 'outside tutor', 'active': None,
                                             'outside': {'session': code, 'at': now, 'summary': summary, 'next_steps': next_steps}})
    l = lessons.get(section, lesson)
    st = {k: v for k, v in (store.get_knowledge('tutor_memory', tutor_api.STORY_KEY) or {}).items() if k != '_key'}
    store.put_knowledge('tutor_memory', tutor_api.STORY_KEY, {**st, 'last_lesson': l['title'], 'summary': f'{l["title"]}: {summary}'})
