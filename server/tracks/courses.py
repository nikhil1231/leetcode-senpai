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
            ('systems', 'Operating systems, Linux and networking', 'Scheduling, memory, locks and file systems, then processes and what happens on the wire.'),
            ('data', 'Databases in depth', 'SQL from joins to window functions, schema design, and how Postgres keeps transactions apart.'),
            ('security', 'Security', 'Who you are, what you may do, and the web attacks interviewers ask about.'),
            ('infrastructure', 'Cloud and delivery', 'Containers, Kubernetes, AWS building blocks, CI/CD and IaC.'),
            ('architecture', 'Design and architecture', 'SOLID, design patterns and class design; architecture styles from CQRS to the strangler fig.'),
            ('quality', 'Testing and reliability', 'The test pyramid, contract and property-based tests, load shapes and chaos.'),
        ],
        'order': {
            'languages': ['java-concurrency', 'python-runtime'],
            'systems': ['os-scheduling', 'os-memory', 'os-concurrency', 'os-filesystems', 'linux-processes', 'networking-stack'],
            'data': ['sql-queries', 'sql-schema', 'sql-windows', 'postgres-internals'],
            'security': ['auth-basics', 'oauth-oidc', 'web-attacks'],
            'infrastructure': ['kubernetes', 'aws-core', 'cicd-iac', 'home-lab'],
            'architecture': ['lld-design', 'architecture-styles'],
            'quality': ['testing-strategy'],
        },
    },
    'ai': {
        'categories': [
            ('models', 'How LLMs behave', 'Tokens, context, sampling, prompting, structured output and choosing a model.'),
            ('retrieval', 'Retrieval and RAG', 'Embeddings, vector search and grounded answers.'),
            ('evaluation', 'Evals', 'Measuring quality so changes are decisions, not vibes.'),
            ('agents', 'Agents and tools', 'Tool calling, loops, MCP servers, multi-agent systems, memory and durable runs, and keeping agents on a leash.'),
            ('production', 'Production AI', 'Latency, cost, safety, and AI features people trust.'),
            ('design', 'AI system design', 'Whole designs, decision by decision: assistants, reviewers, pipelines and agents.'),
            ('assisted', 'AI-assisted coding', 'The round where you fix, extend and scale code with an AI pair, and are marked on how you drive it.'),
            ('inference', 'Under the hood: inference', 'Optional. What a GPU does with your prompt, how serving engines work, and a lab on your own card.'),
            ('platform', 'Under the hood: AI platforms', 'Optional. Running models for a whole company: GPUs on Kubernetes, gateways, LLMOps and fine-tuning.'),
        ],
        'order': {
            'models': ['llm-basics', 'prompting', 'choosing-models'],
            'retrieval': ['embeddings', 'rag'],
            'evaluation': ['evals', 'evals-practice'],
            'agents': ['agents', 'mcp', 'multi-agent', 'durable-agents'],
            'production': ['serving', 'guardrails', 'ai-product'],
            'design': ['design-support-assistant', 'design-review-assistant', 'design-extraction-pipeline', 'design-research-agent'],
            'assisted': ['ai-coding-round', 'ai-debugging', 'ai-workflow'],
            'inference': ['gpu-onramp', 'inference-engines', 'gpu-lab'],
            'platform': ['gpu-kubernetes', 'llm-gateway', 'llmops', 'fine-tuning', 'design-inference-platform'],
        },
        # Optional depth: never picked for you, and counted nowhere until you open one of its lessons.
        'deep': ['inference', 'platform'],
        # The rounds of a typical AI engineering loop, and what in the app prepares you for each.
        'rounds': [
            ('assisted', 'AI-assisted coding', 'Fix, extend and scale unfamiliar code with an AI pair. Scored on approach, control, verification and communication.',
             ['ai-coding-round', 'ai-debugging'], ['ai-pair-rooms', 'ai-pair-chunker']),
            ('practical', 'LLM practical coding', 'Build the pieces around a model: an eval harness, hybrid retrieval, an agent loop with budgets, validated structured output.',
             ['prompting', 'rag', 'evals-practice', 'agents'], ['llm-structured-output', 'llm-hybrid-retrieval', 'llm-eval-harness', 'llm-agent-loop']),
            ('depth', 'LLM and RAG depth', 'Tokens and sampling, choosing a model, RAG vs fine-tuning, embeddings, evals and agents, explained and defended.',
             ['llm-basics', 'prompting', 'choosing-models', 'embeddings', 'rag', 'evals', 'evals-practice', 'agents', 'mcp', 'multi-agent', 'durable-agents'], []),
            ('design', 'AI system design', 'An open prompt (support bot, review assistant, extraction pipeline, research agent) covering retrieval, evals, failure modes, cost and safety.',
             ['serving', 'guardrails', 'design-support-assistant', 'design-review-assistant', 'design-extraction-pipeline', 'design-research-agent'], []),
            ('product', 'Scoping with a customer', 'Some loops role-play a customer with a vague AI idea. Find the job, the success metric and the risks before proposing anything.',
             ['ai-product', 'choosing-models'], []),
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


def deep(track):
    """Lessons in the track's optional deep-dive categories."""
    cats = set(COURSES[track].get('deep', ()))
    return {k for k, l in lessons(track).items() if l['category'] in cats}


def asleep(track, records):
    """Deep-dive lessons not opened yet: they stay out of picks, totals and placement until you choose one."""
    opened = {r.get('lesson_id') for r in records if r.get('kind') in ('lesson', 'answer')}
    return deep(track) - opened


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

    Within a tier, course order. `exclude` keeps a session from repeating itself. Unopened
    deep-dive lessons are left out unless asked for by name.
    """
    hidden = asleep(track, records) if lesson is None else set()
    pool = [q for q in questions(track).values()
            if q['id'] not in exclude and (lesson is None or q['lesson_id'] == lesson) and q['lesson_id'] not in hidden]
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


def placement_question(track, records, exclude=(), category=None):
    """The first question, in course order, from a lesson of `category` with no answers yet and none
    asked this round (`exclude`). Quickfire questions first. None when every lesson has one.
    Deep-dive lessons are placed only when their category is asked for."""
    qs = questions(track)
    tested = {r['lesson_id'] for r in records if r.get('kind') == 'answer'} | {qs[q]['lesson_id'] for q in exclude if q in qs}
    order = {key: i for i, key in enumerate(lessons(track))}
    skip = deep(track) if category is None else set()
    pool = [q for q in qs.values() if q['lesson_id'] not in tested and q['lesson_id'] not in skip
            and (category is None or lessons(track)[q['lesson_id']]['category'] == category)]
    return min(pool, key=lambda q: (order[q['lesson_id']], q['kind'] != 'quickfire', q['id'])) if pool else None


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
    """Knowledge and the next lesson cover the core course plus any deep-dive lesson you have opened."""
    evs = events(track, records)
    hidden = asleep(track, records)
    its = [i for i in items(track) if i['topic'] not in hidden]
    s = knowledge.summary(its, evs, now)
    deep_cats = set(COURSES[track].get('deep', ()))
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
            statuses = item_status.get(key) or ['unseen'] * sum(i['topic'] == key for i in items(track))
            rows.append({'id': key, 'title': lesson['title'], 'minutes': lesson['minutes'], 'summary': lesson['summary'],
                         'interactive': lesson['interactive'], 'opened': bool(rec), 'checked': bool(rec.get('checked_at')),
                         'activities_done': sum(1 for a in (rec.get('activities') or {}).values() if a.get('done')),
                         'items': len(statuses), 'solid': statuses.count('solid'),
                         'held': sum(1 for x in statuses if x in ('solid', 'learning'))})
        course.append({'id': cid, 'title': title, 'blurb': blurb, 'deep': cid in deep_cats, 'lessons': rows})
    titles = {k: l['title'] for k, l in lessons(track).items()}
    for group in s['mistakes'].values():
        for v in group:
            v['topic_title'] = titles.get(v['topic'], v['topic'])
    nxt = next((l for c in course if not c['deep'] for l in c['lessons'] if not l['checked']), None)
    return {'knowledge': s['knowledge'], 'total': s['total'], 'pct': s['pct'], 'counts': s['counts'],
            'due': s['due'], 'mistakes': s['mistakes'], 'history': s['history'], 'daily': s['daily'],
            'heatmap': heatmap(track, s['items']), 'course': course, 'next_lesson': nxt,
            'rounds': rounds(track, course, exercises), 'answers': len(evs)}
