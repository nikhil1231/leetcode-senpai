"""Career context → learning: what the target, the market and the CV mean for the curriculum. Pure; no I/O.

Job Scout supplies a free-text career target (the job you want), the titles it searches for (a deliberately
wide net), CV excerpts and market demand tags. This module maps them onto material the app already has:
system-design categories, Fundamentals and AI Engineering track categories, and their lessons. The plan,
the weekly brief and the tutor all read it. CV claims are prompts for practice, never evidence of skill.
"""
import hashlib
import re

# Tags and target phrases → capability ids. System design keeps its own map in demand.SD_TAGS.
TRACK_TAGS = {
    **dict.fromkeys(('java', 'python', 'kotlin', 'jvm', 'spring', 'spring boot', 'concurrency in java',
                     'asyncio'), 'track:fundamentals:languages'),
    **dict.fromkeys(('linux', 'unix', 'networking', 'tcp/ip', 'tcp', 'dns', 'bash'), 'track:fundamentals:systems'),
    **dict.fromkeys(('postgres internals', 'database internals', 'mvcc'), 'track:fundamentals:data'),
    **dict.fromkeys(('kubernetes', 'k8s', 'docker', 'containers', 'aws', 'gcp', 'azure', 'terraform', 'ci/cd',
                     'infrastructure as code', 'cloud infrastructure', 'cloud', 'devops', 'helm', 'platform engineering',
                     'platform', 'infrastructure'), 'track:fundamentals:infrastructure'),
    **dict.fromkeys(('llm', 'llms', 'large language models', 'generative ai', 'genai', 'prompt engineering',
                     'machine learning', 'llm apis', 'openai', 'ai'), 'track:ai:models'),
    **dict.fromkeys(('ai agents', 'agents', 'agent', 'agentic', 'agentic ai', 'tool calling', 'mcp'), 'track:ai:agents'),
    **dict.fromkeys(('rag', 'retrieval', 'retrieval augmented generation', 'vector databases', 'vector search',
                     'embeddings', 'semantic search'), 'track:ai:retrieval'),
    **dict.fromkeys(('evals', 'evaluation', 'llm evaluation', 'model evaluation'), 'track:ai:evaluation'),
    **dict.fromkeys(('mlops', 'llmops', 'model serving', 'serving', 'inference', 'ml infrastructure',
                     'ai infrastructure', 'ai platform', 'gpu', 'cost', 'guardrails'), 'track:ai:production'),
    **dict.fromkeys(('ai-assisted coding', 'ai coding', 'copilot', 'cursor'), 'track:ai:assisted'),
}
# Words a target uses that job-ad tags don't.
TARGET_EXTRA = {'distributed': 'sd:distributed', 'reliability': 'sd:reliability', 'scale': 'sd:distributed',
                'api': 'sd:apis', 'apis': 'sd:apis', 'queues': 'sd:queues', 'storage': 'sd:storage',
                'databases': 'sd:storage', 'caching': 'sd:caching', 'observability': 'sd:reliability'}
# Capabilities that are not the default `stack` bucket.
BUCKET_OF = {'sd': 'system_design', 'dsa': 'dsa'}
TRACK_SECTION = {'fundamentals': 'fundamentals', 'ai': 'ai'}
# CV keywords → the system-design or track lesson that a defence of that work leans on.
CV_LESSONS = (
    ('zookeeper', ('system-design', 'consensus')), ('leader election', ('system-design', 'consensus')),
    ('quorum', ('system-design', 'consensus')), ('orchestration', ('system-design', 'design-jobs')),
    ('workflow', ('system-design', 'design-jobs')), ('incident', ('system-design', 'observability')),
    ('kafka', ('system-design', 'event-streams')), ('mongodb', ('system-design', 'data-models')),
    ('concurrency', ('fundamentals', 'java-concurrency')), ('kubernetes', ('fundamentals', 'kubernetes')),
    ('llm', ('ai', 'serving')), ('rag', ('ai', 'rag')),
)
MAX_TARGET_CAPS = 8
STACK_BASE, STACK_SPAN, STACK_MAX = 0.05, 0.35, 0.35


def bucket(cid):
    return BUCKET_OF.get(cid.split(':', 1)[0], 'stack')


def _phrases():
    from .demand import SD_TAGS
    table = {**{t: 'sd:' + c for t, c in SD_TAGS.items()}, **TRACK_TAGS, **TARGET_EXTRA}
    return sorted(table.items(), key=lambda kv: -len(kv[0]))


def target_capabilities(text):
    """Capabilities a career target names, in the order it names them (longest phrase wins)."""
    text = (text or '').lower()
    found, taken = [], []
    for phrase, cid in _phrases():
        for m in re.finditer(r'(?<![a-z0-9])' + re.escape(phrase) + r'(?![a-z0-9])', text):
            if any(a < m.end() and m.start() < b for a, b in taken):
                continue
            taken.append((m.start(), m.end()))
            found.append((m.start(), cid))
    out = []
    for _, cid in sorted(found):
        if cid not in out:
            out.append(cid)
    return out[:MAX_TARGET_CAPS]


def short_target(text):
    """'AI platform engineer (mid/senior): …' -> 'AI platform engineer'."""
    head = re.split(r'[(:\-–—.;,]', (text or '').strip(), maxsplit=1)[0].strip()
    return (head or (text or '').strip())[:60]


def goal(settings, job):
    """The career goal Senpai works toward: the saved target, else Job Scout's, else its search titles."""
    text = ((settings or {}).get('target_job') or '').strip()
    if text:
        return text
    ct = ((job or {}).get('context') or {}).get('career_target') or {}
    if (ct.get('text') or '').strip():
        return ct['text'].strip()
    titles = [t for t in ct.get('target_titles') or [] if t][:6]
    return ('Roles: ' + ', '.join(titles)) if titles else ''


def objective_id(text):
    return 'career-' + hashlib.sha256(' '.join((text or '').lower().split()).encode()).hexdigest()[:8]


def plan_changes(text, plan, known):
    """Changes that make the plan follow the career target: one objective for it (retiring an older one)
    and a gradual shift of time toward the role stack when the target is mostly stack. Policy still decides."""
    caps = [c for c in target_capabilities(text) if c in known]
    if not caps:
        return []
    oid, name = objective_id(text), short_target(text)
    active = [o for o in plan.get('objectives', []) if o.get('status') == 'active']
    out = [{'kind': 'objective_remove', 'objective_id': o['id'], 'basis': 'career', 'confidence': 'high',
            'rationale': 'Your career target changed.'} for o in active if o['id'].startswith('career-') and o['id'] != oid]
    buckets = [bucket(c) for c in caps]
    main = max(set(buckets), key=lambda b: (buckets.count(b), b == 'stack'))
    if not any(o['id'] == oid for o in active):
        out.append({'kind': 'objective_add', 'id': oid, 'title': f'Interview-ready for {name}', 'bucket': main,
                    'capability_ids': caps, 'basis': 'career', 'confidence': 'high',
                    'rationale': f'Your career target in Job Scout: {text.strip()[:240]}'})
    stack = buckets.count('stack') / len(buckets)
    want = stack_target(text, known)
    if (plan.get('allocation') or {}).get('stack', 0) < want - 0.02:
        out.append({'kind': 'rebalance', 'target': {'stack': want}, 'basis': 'career', 'confidence': 'high',
                    'rationale': f'{round(stack * 100)}% of what your target names ({name}) is role stack: '
                                 'Fundamentals and AI Engineering. Time moves there gradually.'})
    return out


def stack_target(text, known=None):
    """The role-stack share the target asks for: more of it the more of the target is stack."""
    caps = [c for c in target_capabilities(text) if known is None or c in known]
    if not caps:
        return None
    return round(min(STACK_MAX, STACK_BASE + STACK_SPAN * sum(bucket(c) == 'stack' for c in caps) / len(caps)), 3)


def demand_for(cid, mapped):
    """Market rows behind one capability, most prominent first."""
    return sorted((m for m in mapped or [] if m.get('capability_id') == cid), key=lambda m: -(m.get('share') or 0))


def why_market(cid, mapped, roles):
    rows = demand_for(cid, mapped)
    if not rows or not roles:
        return ''
    top = rows[0]
    tags = ', '.join(r['tag'] for r in rows[:3])
    return f"{round(top['share'] * 100)}% of the {roles} roles Job Scout matched mention {tags}."


def cv_hook(experience, self_rated=()):
    """The CV claim an interviewer is most likely to dig into, with the lesson that backs its defence.
    -> {ref, excerpt, keyword, section, lesson, weak: [self-rated topics]} or None."""
    for e in sorted(experience or [], key=lambda e: -(e.get('cited_by_roles') or 0)):
        text = (e.get('excerpt') or '').lower()
        for kw, (section, lesson) in CV_LESSONS:
            if kw in text:
                weak = [t['topic'] for t in self_rated or []
                        if kw.split()[0] in (t.get('topic') or '').lower() and t.get('state') == 'Needs work'][:3]
                return {'ref': e.get('ref'), 'excerpt': e.get('excerpt', '')[:300], 'keyword': kw,
                        'section': section, 'lesson': lesson, 'weak': weak, 'cited_by_roles': e.get('cited_by_roles')}
    return None


def lesson_capability(section, category):
    return ('sd:' if section == 'system-design' else f'track:{section}:') + category


def tutor_brief(goal_text, job, plan, section, category, lesson_id=None):
    """A few lines for the tutor's system prompt: the goal, why this lesson matters to it, and the CV.
    -> {'text': str, 'experience': [excerpt, …]}. Empty text without a goal or Job Scout context."""
    ctx = (job or {}).get('context') or {}
    demand = ctx.get('demand') or {}
    roles = (demand.get('cohort') or {}).get('roles') or 0
    cid = lesson_capability(section, category)
    lines = []
    if goal_text:
        lines.append(f'- His career goal: {goal_text.strip()[:300]}')
    tags = [t for t in demand.get('tags') or [] if _cap_of_tag(t['tag']) == cid][:3]
    if tags and roles:
        lines.append('- Why this lesson matters to that: ' + '; '.join(
            f"{t['tag']} appears in {round((t.get('share') or 0) * 100)}% of the {roles} roles he's targeting" for t in tags) + '.')
    if cid in set(target_capabilities(goal_text)):
        lines.append('- His target names this area directly: connect the ideas to that kind of role when it helps.')
    # CV lines this lesson can probe come first (ZooKeeper work for consensus), then the most-cited.
    kws = [kw for kw, (_, les) in CV_LESSONS if les == lesson_id]
    experience = [e.get('excerpt', '')[:280] for e in sorted(
        ctx.get('experience') or [], key=lambda e: (not any(k in (e.get('excerpt') or '').lower() for k in kws),
                                                    -(e.get('cited_by_roles') or 0)))][:5]
    if experience and lines:
        lines.append('- His own work, for examples he will recognise (claims from his CV, not proof he knows the theory):\n'
                     + '\n'.join(f'  - {x}' for x in experience[:2]))
    return {'text': '\n'.join(lines), 'experience': experience}


def _cap_of_tag(tag):
    from .demand import classify_tag
    return classify_tag(tag)[1]
