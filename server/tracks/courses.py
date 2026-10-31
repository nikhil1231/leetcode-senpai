"""Course tracks: authored lessons (system-design format) and Quickfire, on the knowledge ledger.

Lessons live in `content/<track>/<id>.md` and are parsed by `system_design_lessons.parse`, so
every block type and the question contract are shared. A lesson's `skill` is its category.
Question IDs (`<lesson>-check-<n>-v2`, `<lesson>-fire-<n>-v2`) are immutable once published.
Everything here is pure: records in, views out.
"""
import os

from .. import knowledge
from ..system_design_lessons import LessonError, parse
from ..system_design_items import gradeable

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'content')

COURSES = {
    'fundamentals': {
        'categories': [
            ('languages', 'Languages and runtimes', 'Concurrency and memory in Java; how Python really runs.'),
            ('systems', 'Linux and networking', 'Processes, memory, files, and what happens on the wire.'),
            ('data', 'Databases in depth', 'How Postgres keeps transactions apart and where it hurts.'),
            ('infrastructure', 'Cloud and delivery', 'Containers, Kubernetes, AWS building blocks, CI/CD and IaC.'),
        ],
        'order': {
            'languages': ['java-concurrency', 'python-runtime'],
            'systems': ['linux-processes', 'networking-stack'],
            'data': ['postgres-internals'],
            'infrastructure': ['kubernetes', 'aws-core', 'cicd-iac', 'home-lab'],
        },
    },
    'ai': {
        'categories': [
            ('assisted', 'AI-assisted coding', 'The round where you fix, extend and scale code with an AI pair, and are marked on how you drive it.'),
            ('models', 'How LLMs behave', 'Tokens, context, sampling, prompting and structured output.'),
            ('retrieval', 'Retrieval and RAG', 'Embeddings, vector search and grounded answers.'),
            ('evaluation', 'Evals', 'Measuring quality so changes are decisions, not vibes.'),
            ('agents', 'Agents and tools', 'Tool calling, loops, and keeping agents on a leash.'),
            ('production', 'Production AI', 'Latency, cost, serving, safety and an AI system design case.'),
        ],
        'order': {
            'assisted': ['ai-coding-round', 'ai-debugging', 'ai-workflow'],
            'models': ['llm-basics', 'prompting'],
            'retrieval': ['embeddings', 'rag'],
            'evaluation': ['evals'],
            'agents': ['agents'],
            'production': ['serving', 'guardrails', 'design-support-assistant', 'design-review-assistant'],
        },
        # The rounds of a typical AI engineering loop, and what in the app prepares you for each.
        'rounds': [
            ('assisted', 'AI-assisted coding', 'Fix, extend and scale unfamiliar code with an AI pair. Scored on approach, control, verification and communication.',
             ['ai-coding-round', 'ai-debugging'], ['ai-pair-rooms', 'ai-pair-chunker']),
            ('practical', 'LLM practical coding', 'Small production pieces around a model: retries with backoff, rate limits, chunking, retrieval.',
             ['prompting', 'embeddings'], ['retry-backoff', 'rate-limiter', 'ai-pair-chunker']),
            ('depth', 'LLM and RAG depth', 'Tokens and sampling, RAG vs fine-tuning, embeddings, evals and agents, explained and defended.',
             ['llm-basics', 'prompting', 'embeddings', 'rag', 'evals', 'agents'], []),
            ('design', 'AI system design', 'An open prompt (support bot, review assistant, agent) covering retrieval, evals, failure modes, cost and safety.',
             ['rag', 'evals', 'serving', 'guardrails', 'design-support-assistant', 'design-review-assistant'], []),
            ('workflow', 'How you use AI', '"How do you use AI in your work?" and project deep dives on what you shipped.',
             ['ai-workflow'], []),
        ],
    },
}


def load(track):
    """-> (lessons by id in course order, questions by id). Malformed content fails loudly."""
    spec = COURSES[track]
    folder = os.path.join(HERE, track)
    skills = {c[0] for c in spec['categories']}
    files = {f[:-3] for f in os.listdir(folder) if f.endswith('.md')}
    lessons, questions = {}, {}
    for category, keys in spec['order'].items():
        for key in keys:
            if key not in files:
                raise LessonError(f'{track}: {key}.md is listed but missing')
            with open(os.path.join(folder, key + '.md'), encoding='utf-8') as fh:
                lesson = parse(fh.read(), f'{track}/{key}', skills=skills)
            if lesson['id'] != key or lesson['category'] != category:
                raise LessonError(f'{track}/{key}: id or category does not match the course order')
            lessons[key] = lesson
            questions.update(lesson['questions'])
    stray = files - set(lessons)
    if stray:
        raise LessonError(f'{track}: unlisted lesson files {sorted(stray)}')
    return lessons, questions


CONTENT = {track: load(track) for track in COURSES}


def lessons(track):
    return CONTENT[track][0]


def questions(track):
    return CONTENT[track][1]


def items(track):
    """Ledger items: every gradeable lesson block and every check/Quickfire question."""
    out = []
    for key, lesson in lessons(track).items():
        base = {'section': track, 'category': lesson['category'], 'topic': key}
        for b in lesson['blocks']:
            if b['type'] != 'md' and gradeable(b):
                out.append({**base, 'id': f'{key}:{b["key"]}', 'kind': b['type'],
                            'label': (b.get('title') or b.get('prompt') or '').split('\n')[0][:110]})
        for qid, q in lesson['questions'].items():
            out.append({**base, 'id': qid, 'kind': 'check' if q['kind'] == 'quiz' else 'quickfire',
                        'label': q['prompt'].split('\n')[0][:110]})
    return out


def events(track, records):
    """Answer events from stored records. Revealed answers are misses; guesses are not clean."""
    known = lessons(track)
    out = []
    for r in records:
        if r.get('kind') == 'answer':
            ok = bool(r.get('correct')) and not r.get('revealed')
            out.append({'item': r['question_id'], 'at': r['at'], 'marks': 1 if ok else 0, 'max': 1,
                        'clean': ok and not r.get('guessed'), 'source': r.get('source', 'quickfire')})
        elif r.get('kind') == 'lesson' and r.get('lesson_id') in known:
            for key, act in (r.get('activities') or {}).items():
                if act.get('first_correct') is None:
                    continue
                ok = bool(act['first_correct'])
                out.append({'item': f'{r["lesson_id"]}:{key}', 'at': act.get('at', r.get('at', 0)),
                            'marks': 1 if ok else 0, 'max': 1, 'clean': ok, 'source': 'lesson'})
    return out


def public_question(q):
    """A question without its answer key."""
    return {k: q[k] for k in ('id', 'lesson_id', 'category', 'kind', 'format', 'prompt', 'choices', 'difficulty')
            if k in q} | ({'unit': q['unit']} if q.get('format') == 'numeric' else {})


def public_lesson(track, key, record=None):
    lesson = lessons(track)[key]
    checks = [public_question(q) for q in lesson['questions'].values() if q['kind'] == 'quiz']
    return {k: v for k, v in lesson.items() if k != 'questions'} | {
        'checks': checks, 'state': {'activities': (record or {}).get('activities', {}),
                                    'opened_at': (record or {}).get('opened_at'),
                                    'checked_at': (record or {}).get('checked_at')}}


def next_question(track, records, now, exclude=(), lesson=None):
    """Quickfire order: wrong last time, then fading, then new questions from opened lessons, then new.

    Within a tier, course order. `exclude` keeps a session from repeating itself.
    """
    pool = [q for q in questions(track).values()
            if q['id'] not in exclude and (lesson is None or q['lesson_id'] == lesson)]
    if not pool:
        return None
    states = knowledge.replay(events(track, records), now)
    opened = {r['lesson_id'] for r in records if r.get('kind') == 'lesson'}
    order = {key: i for i, key in enumerate(lessons(track))}

    def tier(q):
        s = states.get(q['id'])
        status = knowledge.status(s, now)
        if status == 'shaky':
            return 0
        if status == 'fading':
            return 1
        if status == 'unseen':
            return 2 if q['lesson_id'] in opened else 3
        return 4 + (1 - knowledge.held(s, now))  # held items last, weakest first
    return min(pool, key=lambda q: (tier(q), order[q['lesson_id']], q['kind'] != 'quickfire', q['id']))


def heatmap(track, views):
    by_topic = {}
    for v in views:
        by_topic.setdefault(v['topic'], []).append({k: v[k] for k in ('id', 'kind', 'label', 'status', 'r')})
    out = []
    for cid, title, blurb in COURSES[track]['categories']:
        rows = [{'id': key, 'title': lesson['title'], 'items': by_topic.get(key, [])}
                for key, lesson in lessons(track).items() if lesson['category'] == cid]
        out.append({'id': cid, 'title': title, 'blurb': blurb, 'topics': rows})
    return out


def rounds(track, course, exercises=None):
    """Readiness per interview round: lesson items held, plus practical exercises held.

    `course` is overview()'s course rows; `exercises` maps exercise id -> {title, minutes, status}.
    """
    by_id = {l['id']: l for c in course for l in c['lessons']}
    exercises = exercises or {}
    out = []
    for rid, title, blurb, lesson_ids, exercise_ids in COURSES[track].get('rounds', []):
        ls = [by_id[k] for k in lesson_ids]
        exs = [{'id': e, **exercises[e]} for e in exercise_ids if e in exercises]
        items = sum(l['items'] for l in ls) + len(exs)
        held = sum(l['held'] for l in ls) + sum(e['status'] in ('solid', 'learning') for e in exs)
        out.append({'id': rid, 'title': title, 'blurb': blurb, 'items': items, 'held': held,
                    'pct': round(100 * held / items) if items else 0,
                    'lessons': [{k: l[k] for k in ('id', 'title', 'checked', 'held', 'items')} for l in ls],
                    'exercises': exs})
    return out


def overview(track, records, now, exercises=None):
    evs = events(track, records)
    its = items(track)
    s = knowledge.summary(its, evs, now)
    progress = {r['lesson_id']: r for r in records if r.get('kind') == 'lesson'}
    item_status = {}
    for v in s['items']:
        item_status.setdefault(v['topic'], []).append(v['status'])
    course = []
    for cid, title, blurb in COURSES[track]['categories']:
        rows = []
        for key, lesson in lessons(track).items():
            if lesson['category'] != cid:
                continue
            rec = progress.get(key, {})
            statuses = item_status.get(key, [])
            rows.append({'id': key, 'title': lesson['title'], 'minutes': lesson['minutes'], 'summary': lesson['summary'],
                         'interactive': lesson['interactive'], 'opened': bool(rec), 'checked': bool(rec.get('checked_at')),
                         'activities_done': sum(1 for a in (rec.get('activities') or {}).values() if a.get('done')),
                         'items': len(statuses), 'solid': statuses.count('solid'),
                         'held': sum(1 for x in statuses if x in ('solid', 'learning'))})
        course.append({'id': cid, 'title': title, 'blurb': blurb, 'lessons': rows})
    titles = {k: l['title'] for k, l in lessons(track).items()}
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = titles.get(v['topic'], v['topic'])
    nxt = next((l for c in course for l in c['lessons'] if not l['checked']), None)
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'],
            'due': s['due'], 'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'],
            'heatmap': heatmap(track, s['items']), 'course': course, 'next_lesson': nxt,
            'rounds': rounds(track, course, exercises), 'answers': len(evs)}
