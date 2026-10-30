"""Authored lessons: Markdown prose plus typed interactive blocks, validated at import.

Each `<id>.md` file holds YAML frontmatter, a body and a closing ```questions block.
Fenced blocks whose language is a block type become structured blocks; all other
Markdown (including ordinary code fences) stays prose and is rendered client-side.
Block keys are positional (b0, b1, …) and practice history is keyed by them, so new blocks
in a published lesson are appended after the existing ones, never inserted.
Question IDs are `<lesson>-check-<n>-v2` / `<lesson>-fire-<n>-v2`; once published
their semantics are immutable, like v1. Anything malformed fails loudly at import.
"""
import hashlib
import os
import re

import yaml

VERSION = 2
HERE = os.path.dirname(os.path.abspath(__file__))
# Course order. A lesson listed here must have a file; a file must be listed.
ORDER = {
    'foundations': ['request-flow', 'guarantees', 'service-quality', 'numbers', 'estimates'],
    'apis': ['api-contracts', 'stateless-balancing', 'sync-async', 'retry-identity', 'realtime-push'],
    'storage': ['data-models', 'indexes', 'transactions', 'storage-engines', 'object-storage', 'id-generation'],
    'caching': ['cache-aside', 'cache-freshness', 'http-cdn', 'hot-keys'],
    'queues': ['queue-basics', 'acknowledgements', 'dead-letters', 'outbox', 'event-streams'],
    'distributed': ['replication', 'partitioning', 'consistent-hashing', 'consistency', 'consensus', 'concurrent-holds'],
    'reliability': ['scaling', 'overload', 'rate-limiting', 'observability', 'recovery'],
    'specialised': ['search-index', 'geo-index', 'feed-fanout'],
    'designs': ['design-links', 'design-jobs', 'design-seats', 'tradeoffs'],
    'casebook': ['design-feed', 'design-chat', 'design-ratelimiter', 'design-notifications', 'design-typeahead',
                 'design-video', 'design-rides', 'design-kv', 'design-crawler', 'design-payments'],
}
NEW_CATEGORIES = [
    ('specialised', 'Search, geo and feeds', 'Specialised indexes and the fan-out problem behind social products.'),
    ('casebook', 'Classic interview designs', 'Full walkthroughs of the designs interviewers ask most, decision by decision.'),
]
FENCE = re.compile(r'^```([a-z-]+)[ \t]*\n(.*?)^```[ \t]*$', re.M | re.S)
REQUIRED = {
    'predict': ['prompt', 'choices', 'answer', 'reveal'],
    'timeline': ['lanes', 'steps'],
    'sim': ['name'],
    'sort': ['prompt', 'buckets', 'items'],
    'order': ['prompt', 'items'],
    'calc': ['prompt', 'answer', 'unit', 'steps'],
    'bug': ['prompt', 'code', 'bug', 'explain'],
    'faded': ['prompt', 'text'],
    'recall': ['prompt', 'points', 'model'],
    'incident': ['title', 'start', 'nodes'],
    'arch': ['nodes', 'edges'],
    'interview': ['say', 'followups', 'weak', 'strong'],
}
FRONT = ['id', 'category', 'skill', 'title', 'minutes', 'summary', 'objectives', 'sources']
SKILLS = {'requirements', 'reads', 'capacity', 'retries', 'concurrency', 'operations'}
FORMATS = {'choice', 'multi', 'numeric', 'order'}


class LessonError(ValueError):
    pass


# Prose values are written plainly (colons, quotes and # are common in them); they are
# turned into literal block scalars before YAML parsing so authors needn't quote them.
PROSE = re.compile(r'^(\s*(?:- )?)(prompt|explain|explanation|reveal|intro|caption|steps|hint|given|model|say|weak|strong|why|text|label|note|takeaway|title|q|a|summary|debrief|ask): (.+)$', re.M)


def _prose(text):
    def literal(m):
        value = m[3].strip()
        quoted = len(value) > 1 and value[0] in '\'"' and value[-1] == value[0]
        if quoted or value[0] in '|>{[':
            return m[0]
        return f'{m[1]}{m[2]}: |-\n{" " * (len(m[1]) + 2)}{value}'
    return PROSE.sub(literal, text)


def _shift(seed, n):
    return int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16) % n


def _permute(seed, items):
    """Deterministic shuffle that never returns the authored order for 2+ items."""
    out, pool = [], list(items)
    for i in range(len(items)):
        out.append(pool.pop(_shift(f'{seed}:{i}', len(pool))))
    if len(out) > 1 and out == list(items):
        out = out[1:] + out[:1]
    return out


def _flat(value, where):
    """Plain list items like `- Cache-aside: reads…` parse as one-key mappings; undo that."""
    if isinstance(value, dict) and len(value) == 1:
        (k, v), = value.items()
        return f'{k}: {v}'
    if not isinstance(value, (str, int, float)):
        raise LessonError(f'{where}: expected text, got {value!r}')
    return str(value)


def _check_block(lesson, kind, data, n):
    where = f'{lesson} block {n} ({kind})'
    if not isinstance(data, dict):
        raise LessonError(f'{where}: expected a mapping')
    for field in ('points', 'choices') + (('items',) if kind == 'order' else ()):
        if isinstance(data.get(field), list):
            data[field] = [_flat(x, where) for x in data[field]]
    missing = [k for k in REQUIRED[kind] if k not in data]
    if missing:
        raise LessonError(f'{where}: missing {missing}')
    if kind == 'predict' and not 0 <= data['answer'] < len(data['choices']):
        raise LessonError(f'{where}: answer out of range')
    if kind == 'timeline':
        lanes = set(data['lanes'])
        for s in data['steps']:
            if s.get('lane') not in lanes or s.get('to', s['lane']) not in lanes:
                raise LessonError(f'{where}: unknown lane in {s}')
            for k in s.get('set', {}):
                if k not in data.get('state', {}):
                    raise LessonError(f'{where}: step sets undeclared state {k}')
        if 'find' in data and not 0 <= data['find']['answer'] < len(data['steps']):
            raise LessonError(f'{where}: find answer out of range')
        for c in data.get('crashes', []):
            if not 0 <= c['after'] < len(data['steps']) or c.get('verdict') not in ('safe', 'lost', 'duplicate', 'wrong', 'stuck'):
                raise LessonError(f'{where}: bad crash {c}')
    if kind == 'sort':
        for item in data['items']:
            if not 0 <= item['bucket'] < len(data['buckets']):
                raise LessonError(f'{where}: bucket out of range for {item}')
    if kind == 'bug':
        lines = data['code'].rstrip('\n').split('\n')
        if not data['bug'] or any(not 1 <= b <= len(lines) for b in data['bug']):
            raise LessonError(f'{where}: bug line out of range')
    if kind == 'faded' and '[[' not in data['text']:
        raise LessonError(f'{where}: no blanks')
    if kind == 'incident':
        nodes = data['nodes']
        if data['start'] not in nodes:
            raise LessonError(f'{where}: unknown start')
        for key, node in nodes.items():
            for opt in node.get('options', []):
                if opt['next'] not in nodes:
                    raise LessonError(f'{where}: {key} links to unknown {opt["next"]}')
            if not node.get('options') and 'verdict' not in node:
                raise LessonError(f'{where}: terminal {key} needs a verdict')
    if kind == 'arch':
        for node in data['nodes']:
            if set(node) - {'id', 'label', 'kind', 'x', 'y', 'note'} or not {'id', 'label', 'x', 'y'} <= set(node):
                raise LessonError(f'{where}: bad node {node} (quote values containing commas)')
        ids = {node['id'] for node in data['nodes']}
        for edge in data['edges']:
            if edge[0] not in ids or edge[1] not in ids:
                raise LessonError(f'{where}: edge {edge} names an unknown node')
        if 'missing' in data:
            if data['missing'] not in ids or 'choices' not in data:
                raise LessonError(f'{where}: missing node needs choices')
    if kind == 'calc' and float(data['answer']) <= 0:
        raise LessonError(f'{where}: answer must be positive')


def _question(lesson, meta, raw, kind, n):
    qid = f'{lesson}-{kind}-{n}-v2'
    fmt = raw.get('type', 'choice')
    if fmt not in FORMATS or not raw.get('prompt') or not raw.get('explanation'):
        raise LessonError(f'{qid}: needs a known type, prompt and explanation')
    q = {'id': qid, 'version': VERSION, 'lesson_id': lesson, 'category': meta['category'],
         'skill': meta['skill'], 'kind': 'quiz' if kind == 'check' else 'quickfire', 'format': fmt,
         'difficulty': 'standard' if raw.get('level', 'core') == 'advanced' else 'beginner',
         'prompt': raw['prompt'].strip(), 'explanation': raw['explanation'].strip(), 'whys': {}}
    if fmt == 'numeric':
        q.update(choices=[], correct=float(raw['answer']), unit=raw.get('unit', ''),
                 tolerance=float(raw.get('tolerance', 0.1)))
        if q['tolerance'] <= 0:
            raise LessonError(f'{qid}: tolerance must be positive')
        return q
    if fmt == 'order':
        items = [_flat(x, qid) for x in raw['items']]
        if not 3 <= len(items) <= 7:
            raise LessonError(f'{qid}: order needs 3-7 items')
        ids = [f'c{i}' for i in range(len(items))]
        shown = _permute(qid, ids)
        q.update(choices=[{'id': i, 'text': str(items[int(i[1:])]).strip()} for i in shown], correct=ids)
        return q
    choices = raw['choices']
    texts = [str(c['text']).strip() for c in choices]
    right = [i for i, c in enumerate(choices) if c.get('correct')]
    if not 3 <= len(choices) <= 5 or len(set(texts)) != len(texts):
        raise LessonError(f'{qid}: needs 3-5 distinct choices')
    if (fmt == 'choice' and len(right) != 1) or (fmt == 'multi' and not right):
        raise LessonError(f'{qid}: wrong number of correct choices')
    shown = _permute(qid, list(range(len(choices))))
    q['choices'] = [{'id': f'c{n}', 'text': texts[i]} for n, i in enumerate(shown)]
    position = {i: f'c{n}' for n, i in enumerate(shown)}
    q['whys'] = {position[i]: c['why'].strip() for i, c in enumerate(choices) if c.get('why')}
    q['correct'] = position[right[0]] if fmt == 'choice' else sorted(position[i] for i in right)
    return q


def parse(text, name='lesson', skills=None):
    """`skills` lets another track validate against its own skill names (default: system design's)."""
    if not text.startswith('---\n'):
        raise LessonError(f'{name}: missing frontmatter')
    _, front, body = text.split('---\n', 2)
    meta = yaml.safe_load(_prose(front))
    missing = [k for k in FRONT if k not in meta]
    if missing:
        raise LessonError(f'{name}: frontmatter missing {missing}')
    if meta['skill'] not in (SKILLS if skills is None else skills):
        raise LessonError(f'{name}: unknown skill {meta["skill"]}')
    blocks, questions, pos = [], None, 0
    for m in FENCE.finditer(body):
        lang = m.group(1)
        if lang not in REQUIRED and lang != 'questions':
            continue
        prose = body[pos:m.start()].strip()
        if prose:
            blocks.append({'type': 'md', 'text': prose})
        pos = m.end()
        try:
            data = yaml.safe_load(_prose(m.group(2)))
        except yaml.YAMLError as exc:
            raise LessonError(f'{name}: bad YAML in {lang} block: {exc}') from exc
        if lang == 'questions':
            questions = data
            continue
        _check_block(meta['id'], lang, data, len(blocks))
        blocks.append({'type': lang, 'key': f'b{len(blocks)}', **data})
    tail = body[pos:].strip()
    if tail:
        blocks.append({'type': 'md', 'text': tail})
    if not questions:
        raise LessonError(f'{name}: missing questions block')
    out = {}
    for kind in ('check', 'fire'):
        subset = [q for q in questions if q.get('kind') == kind]
        if len(subset) < 3:
            raise LessonError(f'{name}: needs at least three {kind} questions')
        for n, raw in enumerate(subset, 1):
            q = _question(meta['id'], meta, raw, kind, n)
            out[q['id']] = q
    prompts = [q['prompt'] for q in out.values()]
    if len(set(prompts)) != len(prompts):
        raise LessonError(f'{name}: duplicate question prompt')
    # A plain diagram has nothing to complete, so it is not an activity.
    interactive = sum(b['type'] not in ('md', 'arch') or bool(b.get('paths') or b.get('missing')) for b in blocks)
    return {**meta, 'blocks': blocks, 'questions': out, 'interactive': interactive}


def load():
    lessons = {}
    listed = [k for keys in ORDER.values() for k in keys]
    files = {f[:-3] for f in os.listdir(HERE) if f.endswith('.md')}
    for key in listed:
        if key not in files:
            continue
        with open(os.path.join(HERE, key + '.md'), encoding='utf-8') as fh:
            lesson = parse(fh.read(), key)
        if lesson['id'] != key:
            raise LessonError(f'{key}.md declares id {lesson["id"]}')
        expected = next(c for c, keys in ORDER.items() if key in keys)
        if lesson['category'] != expected:
            raise LessonError(f'{key}: category {lesson["category"]} but ordered under {expected}')
        lessons[key] = lesson
    stray = files - set(listed)
    if stray:
        raise LessonError(f'Unlisted lesson files: {sorted(stray)}')
    return lessons
