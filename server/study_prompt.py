"""Study prompts: a topic and what you hold of it, as text to paste into a voice chatbot. /api/study-prompt

The copy button on a page (or on a category or lesson in a list) fetches one. A course prompt
numbers the ideas it lists and asks the bot for a debrief block at the end; pasting that back
records what you studied (study_debrief.py). The chatbot already
knows the material; the prompt names the topic, says what you hold of it right now and how to run
a spoken teach-and-test session. No model writes it. Pure: knowledge, leetcode. I/O: the router.

Scopes: a knowledge-base section (System design, Fundamentals, AI), one of its categories, or one
lesson; the LeetCode map, one family of topics, or one topic. A scope with nothing in it is None
(the page shows no button), so this never invents a topic.
"""
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, scheduler, study_debrief
from .knowledge_base import api as kb_api, catalog as kb_cat, model as kmodel
from .store import get_store

router = APIRouter(prefix='/api/study-prompt', tags=['study-prompt'])

STATUS_TEXT = {'shaky': 'got it wrong last time', 'fading': 'knew it, now slipping',
               'unconfirmed': 'right only on a soft check', 'unseen': 'never practised',
               'learning': 'recently learned', 'solid': 'solid'}
WEAK = ('shaky', 'fading')
MAX_WEAK = {'section': 10, 'category': 14}
MAX_NEW = {'section': 4, 'category': 6}
MAX_GAPS = 8
TAG_TEXT = {'misread': 'misreading the problem', 'wrong_pattern': 'picking the wrong pattern', 'off_by_one': 'off-by-one errors',
            'edge_case': 'missed edge cases', 'wrong_ds': 'choosing the wrong data structure',
            'tle': 'too slow (time limit exceeded)', 'impl_bug': 'implementation bugs', 'syntax': 'syntax slips'}

HOW = """How to run the session (this is a live voice conversation):
- Start with one or two quick questions to check where I am, then adjust.
- Spend most of the time on what I got wrong or am slipping on, then on what I have never practised. Only touch solid ideas to connect them to the rest.
- Keep each turn short: explain one idea in a few sentences, then ask me one question and wait for my answer.
- Ask me to explain ideas in my own words and to apply them to a concrete scenario or interview-style question, not only to recall definitions.
- When I am wrong or vague, say exactly what was missing, then come back to it a few minutes later to check it stuck.
- Speak naturally: no lists, code blocks, markdown or symbols read aloud.
- When I say stop, sum up what I got right, what I missed, and what I should practise next."""


def _intro(topic, where):
    return (f"I'm preparing for software engineering interviews. Be my tutor in a live voice chat: "
            f"teach me and test me on the topic below, starting from what I already know.\n\n"
            f"Topic: {topic}" + (f" ({where})" if where else ''))


def _pct(x):
    return f'{round(100 * x)}%'


def _counts(vs):
    n = {s: 0 for s in kmodel.STATUSES}
    for v in vs:
        n[v['status']] += 1
    parts = [f"{n[s]} {STATUS_TEXT[s]}" for s in ('solid', 'learning', 'fading', 'shaky', 'unseen') if n[s]]
    held = sum(v['r'] for v in vs) / len(vs) if vs else 0
    return f"{len(vs)} key ideas, about {_pct(held)} held right now: " + ', '.join(parts), held


def _status(v):
    return 'unconfirmed' if v['status'] in ('learning', 'solid') and v.get('unconfirmed') else v['status']


def _gaps(mis, ids, title_of):
    rows = [m for m in mis if m.get('status') == 'open' and m['point'] in ids]
    rows.sort(key=lambda m: -(m.get('updated_at') or m.get('created_at') or 0))
    out = []
    for m in rows[:MAX_GAPS]:
        lead = 'I keep missing part of this' if m.get('kind') == 'gap' else 'I wrongly believed'
        out.append(f"- {title_of(m['point'])}: {lead}: {m['text']}")
    return out


def _weakest(vs, n):
    weak = [v for v in vs if v['status'] in WEAK or v.get('misconceptions')]
    weak.sort(key=lambda v: (-v.get('misconceptions', 0), v['status'] != 'shaky', v['r']))
    return weak[:n]


def _debrief(session):
    return f"""When I type "debrief" (after the voice chat), reply with only this block, filled in from our session, so I can log it in my practice app:

SENPAI-DEBRIEF session={session}
P3 right explain "what I said, in a few words"
P5 wrong recall "what I got wrong"
NOTE "anything we covered that has no P-number"

- One line for each numbered idea you actually tested; skip the rest. Use only the P-numbers above.
- Verdict: right (correct and complete without hints), partial (some of it, or only with a hint) or wrong. Judge strictly.
- Depth: recognise (I picked it out), recall (I stated it), explain (I explained why), apply (I used it on a scenario)."""


def knowledge(views, misconceptions, section, category=None, lesson=None, session=None):
    """-> (prompt text, {ref: point id}) for a knowledge-base scope, or None when it holds no points.

    Ideas the prompt lists are numbered P1, P2… so a debrief can report on them exactly."""
    vs = [v for v in views if v['section'] == section and (not category or v['category'] == category)
          and (not lesson or v['lesson'] == lesson)]
    if not vs:
        return None
    first = vs[0]
    by_id = {v['id']: v for v in vs}
    title_of = lambda pid: by_id[pid]['lesson_title'] if lesson is None else by_id[pid]['subtopic']
    section_title = first.get('section_title') or section
    if lesson:
        topic, where = first['lesson_title'], f"{section_title} > {first.get('category_title') or first['category']}"
    elif category:
        topic, where = first.get('category_title') or category, section_title
    else:
        topic, where = section_title, ''
    summary, _ = _counts(vs)
    lines = [_intro(topic, where), '', 'Where I am, from my practice app:', f'- Overall: {summary}.']
    refs = {}

    def ref(v):
        r = f'P{len(refs) + 1}'
        refs[r] = v['id']
        return r

    if lesson:
        subs = {}
        for v in vs:
            subs.setdefault(v['subtopic'], []).append(v)
        lines += ['', 'The ideas in this lesson, by subtopic, with my status on each:']
        for sub, group in subs.items():
            lines.append(f'{sub}:')
            lines += [f"- {ref(v)}: {v['claim']} [{STATUS_TEXT[_status(v)]}]" for v in group]
    else:
        groups = {}
        for v in vs:
            key = v['lesson'] if category else v['category']
            groups.setdefault(key, []).append(v)
        label = 'Lessons' if category else 'Areas'
        lines += ['', f'{label} in this topic, in course order:']
        for group in groups.values():
            g = group[0]
            name = g['lesson_title'] if category else (g.get('category_title') or g['category'])
            text, held = _counts(group)
            untouched = all(v['status'] == 'unseen' for v in group)
            lines.append(f"- {name}: " + ('not started' if untouched else f"{_pct(held)} held") +
                         ('' if untouched else f" ({text.split(': ', 1)[1]})"))
        level = 'category' if category else 'section'
        weak = _weakest(vs, MAX_WEAK[level])
        if weak:
            lines += ['', 'Ideas I am weakest on:']
            lines += [f"- {ref(v)}: {v['claim']} ({v['lesson_title']}; {STATUS_TEXT[_status(v)]})" for v in weak]
        new = [v for v in vs if v['status'] == 'unseen'][:MAX_NEW[level]]
        if new:
            lines += ['', 'Ideas to learn next, in course order:']
            lines += [f"- {ref(v)}: {v['claim']} ({v['lesson_title']})" for v in new]

    gaps = _gaps(misconceptions, set(by_id), title_of)
    if gaps:
        lines += ['', 'Mistakes I have made that are still open:'] + gaps
    lines += ['', HOW]
    if session and refs:
        lines += ['', _debrief(session)]
    return '\n'.join(lines), refs


# ---- LeetCode ---------------------------------------------------------------------------

def _topic_line(t):
    if not t['solved']:
        return f"- {t['category']}: 0 of {t['total']} problems solved, not started"
    bits = [f"{t['solved']} of {t['total']} problems solved", f"mastery {_pct(t['mastery'])}"]
    if t.get('avg_confidence') is not None:
        bits.append(f"average confidence {t['avg_confidence']} out of 3")
    if t.get('independence_rate') is not None:
        bits.append(f"solved without help {_pct(t['independence_rate'])} of the time")
    if t.get('sprint_accuracy') is not None:
        bits.append(f"pattern-spotting drills {_pct(t['sprint_accuracy'])} right")
    return f"- {t['category']}: " + ', '.join(bits)


def _tags(enrichment):
    e = enrichment or {}
    return list((e.get('user_overrides') or {}).get('tags') or e.get('mistake_tags') or [])


def _mistakes(slugs, attempts, enr_by_attempt, n=6):
    counts = {}
    for a in attempts:
        if a.get('slug') in slugs:
            for t in _tags(enr_by_attempt.get(a.get('id'))):
                counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:n]
    return [f"- {TAG_TEXT.get(t, t.replace('_', ' '))} ({k} time{'s' if k != 1 else ''})" for t, k in top]


def _problem_line(p, runs, enr_by_attempt):
    runs = sorted(runs, key=lambda a: a.get('solved_at') or 0)
    last = runs[-1]
    if last.get('unsolved'):
        outcome = 'last run ended unsolved'
    else:
        help_ = {'solo': 'on my own', 'hints': 'with hints', 'solution': 'after reading the solution'}.get(last.get('independence'))
        outcome = 'last solved' + (f' {help_}' if help_ else '')
        if last.get('confidence') is not None:
            outcome += f", confidence {last['confidence']} out of 3"
    line = f"- {p['title']} ({p.get('difficulty') or 'Unknown'}): {len(runs)} attempt{'s' if len(runs) != 1 else ''}, {outcome}"
    notes = [(enr_by_attempt.get(a.get('id')) or {}) for a in reversed(runs)]
    note = next((n for e in notes for n in ((e.get('mistake_summary') or '').strip(), (e.get('takeaway') or '').strip())
                 if n and not n.lower().startswith('no mistake')), None)
    return line + (f'. Note: {note}' if note else '')


def leetcode(families, problems, attempts, enrichments, family=None, topic=None):
    """-> prompt text for the LeetCode map, one family, or one topic; None when it is empty."""
    fams = [f for f in families if not family or f['family'] == family]
    topics = [t for f in fams for t in f['topics'] if not topic or t['category'] == topic]
    if not topics:
        return None
    cats = {t['category'] for t in topics}
    lib = [p for p in problems if scheduler._in_library(p) and p.get('neetcode_category') in cats]
    slugs = {p['slug'] for p in lib}
    runs = [a for a in attempts if a.get('slug') in slugs and a.get('kind') != 'sprint']
    enr = {e.get('attempt_id'): e for e in enrichments or []}
    name = topic or family or 'Data structures and algorithms (LeetCode-style coding interviews)'
    where = (f"LeetCode patterns > {fams[0]['family']}" if topic else 'LeetCode patterns' if family else '')
    lines = [_intro(name, where), '', 'Where I am, from my practice app:']

    if topic:
        lines.append(_topic_line(topics[0]))
        by_slug = {}
        for a in runs:
            by_slug.setdefault(a['slug'], []).append(a)
        order = {'Easy': 0, 'Medium': 1, 'Hard': 2}
        lib.sort(key=lambda p: (order.get(p.get('difficulty'), 3), p['title']))
        done = [p for p in lib if p['slug'] in by_slug]
        todo = [p for p in lib if p['slug'] not in by_slug]
        if done:
            lines += ['', 'Problems I have attempted:'] + [_problem_line(p, by_slug[p['slug']], enr) for p in done]
        if todo:
            lines += ['', 'Problems I have not tried yet: ' + ', '.join(f"{p['title']} ({p.get('difficulty') or 'Unknown'})" for p in todo[:20])]
    else:
        for f in fams:
            if not family:
                lines.append(f"{f['family']}: {f['solved']} of {f['total']} solved, mastery {_pct(f['mastery'])}")
            lines += [_topic_line(t) for t in f['topics']]
        weak = sorted((t for t in topics if t['solved']), key=lambda t: -t['weakness'])[:3]
        if weak:
            lines += ['', 'My weakest topics so far: ' + ', '.join(t['category'] for t in weak)]

    mistakes = _mistakes(slugs, runs, enr)
    if mistakes:
        lines += ['', 'The kinds of mistakes I make most here:'] + mistakes
    lines += ['', 'Teach the pattern and how to recognise it, then test me with problems like the ones above: '
                  'ask for my approach, its time and space complexity, and the edge cases. '
                  "Don't ask me to dictate full code; talking through the algorithm is enough."]
    return '\n'.join(lines + ['', HOW])


# ---- HTTP -------------------------------------------------------------------------------

def _session_code():
    return ''.join(secrets.choice('abcdefghjkmnpqrstuvwxyz23456789') for _ in range(6))


class PromptIn(BaseModel):
    section: str
    category: str | None = None
    lesson: str | None = None
    family: str | None = None
    topic: str | None = None


@router.post('')
def study_prompt(body: PromptIn, uid: str = Depends(auth.require_user)):
    """The prompt for a scope. A course prompt saves a session: which point each P-number is."""
    store = get_store(uid)
    if body.section == 'leetcode':
        problems, attempts, enrichments = store.list_problems(), store.list_attempts(), store.list_enrichments()
        text = leetcode(scheduler.topic_tree(problems, attempts, enrichments), problems, attempts, enrichments,
                        family=body.family, topic=body.topic)
        if not text:
            raise HTTPException(404, 'Nothing to study here yet')
        return {'prompt': text, 'session': None}
    now = time.time()
    c, _, states, seen, mis = kb_api.evidence(store, now)
    vs = kmodel.views(c, states, seen, mis, now)
    titles = {p['id']: (p['section_title'], p['category_title']) for p in c['points'].values()}
    for v in vs:
        v['section_title'], v['category_title'] = titles[v['id']]
    code = _session_code()
    out = knowledge(vs, mis, body.section, body.category, body.lesson, session=code)
    if not out:
        raise HTTPException(404, 'Nothing to study here yet')
    text, refs = out
    if refs:
        store.create_knowledge('study_sessions', code, {
            'scope': body.model_dump(exclude_none=True), 'refs': refs, 'created_at': now,
            'imported_at': None, 'debrief': None, 'counts': None})
    return {'prompt': text, 'session': code if refs else None}


class DebriefIn(BaseModel):
    text: str = Field(max_length=50_000)
    apply: bool = False


def _public(p):
    return {**p, 'changes': [{k: v for k, v in ch.items() if k != 'event'} for ch in p['changes']]}


@router.post('/debrief')
def debrief(body: DebriefIn, uid: str = Depends(auth.require_user)):
    """Preview (apply=false) or record (apply=true) a pasted debrief. A session is recorded once."""
    store, now = get_store(uid), time.time()
    parsed = study_debrief.parse(body.text)
    if not parsed['session']:
        raise HTTPException(400, 'No "SENPAI-DEBRIEF session=…" line found. Ask the chatbot to "debrief" and paste its whole reply.')
    session = store.get_knowledge('study_sessions', parsed['session'])
    if not session:
        raise HTTPException(404, f"Session {parsed['session']} is not one this app made. Copy a fresh study prompt.")
    c = kb_cat.CATALOG
    refs = {r: kb_cat.canonical(c, pid) for r, pid in session['refs'].items()}
    p = study_debrief.plan(parsed, {r: pid for r, pid in refs.items() if pid}, c['points'],
                           store.list_knowledge('knowledge_misconceptions'))
    out = {**_public(p), 'session': parsed['session'], 'scope': session['scope'],
           'imported_at': session.get('imported_at'), 'applied': False}
    if not body.apply or session.get('imported_at') or not p['changes']:
        return out
    code, src = parsed['session'], study_debrief.SOURCE
    kb_api.write_events(store, src, [{**ch['event'], 'key': f"{code}.{ch['ref']}", 'ref': f'study:{code}'}
                                     for ch in p['changes']], now)
    for ch in p['changes']:
        key, o = f"{code}.{ch['ref']}", ch['opens']
        if o and o['kind'] == 'gap':
            kb_api.open_gap(store, src, key, ch['point'], o['text'], o['ask'], ch['note'], now)
        elif o:
            kb_api.add_misconception(store, src, key, ch['point'], o['text'], ch['note'], now, kind='belief', ask=o['ask'])
        elif ch['resolves']:
            kb_api.resolve_open(store, ch['point'], now, f'Right in voice-chat study session {code}')
    store.put_knowledge('study_sessions', code, {**{k: v for k, v in session.items() if k != '_key'},
                        'imported_at': now, 'debrief': body.text, 'counts': p['counts'], 'notes': p['notes']})
    return {**out, 'imported_at': now, 'applied': True}
