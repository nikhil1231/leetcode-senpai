"""Draft knowledge points from the lessons as reviewable files: points, links and practice maps.

Three passes, each resumable and idempotent:

  points    per lesson: its points and the item → point map. A lesson whose points file matches
            its current source hash is skipped. Regenerating keeps existing slugs for ideas
            still taught; ids that disappear are kept as retired, never deleted.
  links     per lesson: each point's prerequisites among earlier points, and whether it
            duplicates an earlier point (then it becomes an alias, sharing one memory).
  practice  once: maps system design items that belong to no lesson (skill drills,
            estimation templates) onto points.

Who answers is explicit. The default is the agent running this script (Claude Code on
Nikhil's subscription): `--export DIR` writes each pending prompt to DIR, the agent writes its
answer next to it as `<name>.json`, and `--import DIR` validates and applies the answers.
`--openrouter` calls the paid API instead, which spends the shared OpenRouter balance that Kimi
and the app's live AI features rely on, so use it only when Nikhil has asked for that.

    .venv/bin/python scripts/generate_knowledge_points.py --pass links --export /tmp/kp
    .venv/bin/python scripts/generate_knowledge_points.py --pass links --import /tmp/kp
    .venv/bin/python scripts/generate_knowledge_points.py --pass points --lesson cache-aside --openrouter
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Literal

import yaml
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import config, llm  # noqa: E402
from server.knowledge_base import catalog as cat  # noqa: E402
from server.system_design_content import EXERCISES  # noqa: E402
from server.system_design_curriculum import LESSONS as SD_LESSONS, QUESTIONS as SD_QUESTIONS  # noqa: E402
from server.system_design_drills import TEMPLATES  # noqa: E402
from server.tracks import courses  # noqa: E402

PROMPT_VERSION = 1
MODEL = 'openai/gpt-5.6-luna'  # never an Anthropic model through OpenRouter (see CLAUDE.md)
HEADING = re.compile(r'^##\s+(.+?)\s*$', re.M)
INTRO = 'Introduction'
_print = threading.Lock()


def say(*a):
    with _print:
        print(*a, flush=True)


# ---- schemas ---------------------------------------------------------------------------

class GenPoint(BaseModel):
    slug: str = Field(description='2-6 lowercase words joined by hyphens, naming the idea')
    subtopic: str
    kind: Literal['fact', 'principle', 'mechanism', 'tradeoff', 'procedure']
    claim: str = Field(max_length=400)
    prompt: str = Field(max_length=300)
    objectives: list[int]


class GenItem(BaseModel):
    item: str
    points: list[str] = Field(description='1-3 slugs, the point it mostly tests first')


class LessonPoints(BaseModel):
    points: list[GenPoint]
    items: list[GenItem]


class GenLink(BaseModel):
    point: str = Field(description='full id of a point in THIS LESSON')
    requires: list[str]
    same_as: str


class LessonLinks(BaseModel):
    links: list[GenLink]


class PracticeMap(BaseModel):
    items: list[GenItem]


POINTS_SYSTEM = """You turn an interview-prep lesson into knowledge points: the ideas a strong candidate holds after studying it. The output becomes a model of what one learner knows, so precise, consistent granularity matters more than covering trivia.

A point:
- is one idea, stated as a self-contained claim that can be checked without the lesson (never "as the story showed"). Concrete: include the numbers, names and conditions that make it useful. At most two sentences.
- kind: fact (a number, definition or name worth remembering), principle (a rule of thumb or law that predicts behaviour), mechanism (how something works), tradeoff (when to choose what, and what it costs), procedure (a method you carry out, such as an estimate or a requirements pass).
- prompt: one question whose answer is the claim, answerable in a sentence or a number, standalone, not giving the answer away.
- subtopic: exactly one of the listed subtopics: where the idea is taught.
- objectives: indexes of the lesson objectives the point serves (may be empty).
- slug: 2-6 lowercase words joined by hyphens naming the idea, unique within the lesson.

Granularity: one point per idea an interviewer could probe separately. Merge restatements; split claims that can be known independently. Skip narrative details (company names, story specifics) unless the detail is itself the lesson. Usually 10-25 points; dense reference lessons may need up to 40.

Items: map every listed ITEM to the 1-3 points it tests, the one it mostly tests first. Every item id appears exactly once. If an item tests something no point covers, add a point for it.

If EXISTING POINTS are listed, reuse their slugs for ideas that are still taught (you may improve the wording) so the learner's history stays attached.

British English. Plain, direct wording."""

LINKS_SYSTEM = """You link the knowledge points of one lesson to the earlier points they build on. For each point of THIS LESSON return:
- requires: up to 3 ids of points without which this point cannot really be understood or applied. Choose only from EARLIER POINTS or from points listed before it in THIS LESSON. Genuine prerequisites only, not merely related ideas; often empty.
- same_as: the id of an EARLIER POINTS entry that states the same idea (so both should share one memory), else an empty string. Only for the same idea, not a related, broader or more specific one.
Return every point of THIS LESSON exactly once, using full ids exactly as given."""

PRACTICE_SYSTEM = """Map each practice ITEM to the 1-3 knowledge points it tests, the one it mostly tests first, choosing only from the listed POINTS by exact id. Every item appears exactly once."""


# ---- lesson rendering --------------------------------------------------------------------

def lesson_doc(section, key):
    if section == 'system-design':
        l = SD_LESSONS[key]
        questions = {q: SD_QUESTIONS[q] for q in l['quiz_ids'] + l['quickfire_ids']}
    else:
        l = courses.lessons(section)[key]
        questions = l['questions']
    return l, questions


def dump(data):
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=1000).strip()


def render(section, key):
    """-> (prompt text, subtopics, item ids)."""
    lesson, questions = lesson_doc(section, key)
    info = {i: v for i, v in cat.items(section).items() if v['lesson'] == key}
    subtopics, parts = [INTRO], []
    for b in lesson['blocks']:
        if b['type'] == 'md':
            subtopics += HEADING.findall(b['text'])
            parts.append(b['text'])
            continue
        item = f'{key}:{b["key"]}'
        tag = f'[ITEM {item} · {b["type"]}]' if item in info else f'[BLOCK {b["type"]}, not an item]'
        parts.append(f'{tag}\n{dump({k: v for k, v in b.items() if k not in ("type", "key")})}')
    for qid, q in questions.items():
        if qid not in info:
            continue
        body = {k: q[k] for k in ('format', 'prompt', 'choices', 'correct', 'answer', 'unit', 'explanation') if k in q}
        parts.append(f'[ITEM {qid} · {info[qid]["kind"]}]\n{dump(body)}')
    if f'redesign:{key}' in info:
        parts.append(f'[ITEM redesign:{key} · redesign]\nRedesign the whole system from memory, as in the walkthrough above.')
    objectives = '\n'.join(f'{n}. {o}' for n, o in enumerate(lesson.get('objectives') or []))
    subtopics = list(dict.fromkeys(s.strip() for s in subtopics))
    head = (f'LESSON {section}/{key}: {lesson["title"]}\nCategory: {lesson["category"]}\n\n'
            f'OBJECTIVES\n{objectives or "(none)"}\n\nSUBTOPICS\n{json.dumps(subtopics, ensure_ascii=False)}\n\n'
            f'ITEM IDS\n{json.dumps(sorted(info))}\n\nLESSON TEXT\n')
    return head + '\n\n'.join(parts), subtopics, sorted(info)


# ---- files ---------------------------------------------------------------------------------

def path_for(section, key):
    return os.path.join(cat.HERE, section, key + '.yaml')


def read(section, key):
    p = path_for(section, key)
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as fh:
        return yaml.safe_load(fh)


def write(section, key, doc):
    os.makedirs(os.path.dirname(path_for(section, key)), exist_ok=True)
    header = ('# Knowledge points, drafted by scripts/generate_knowledge_points.py and reviewable by hand.\n'
              '# Point ids never change once published: retire a point instead of deleting it.\n')
    with open(path_for(section, key), 'w', encoding='utf-8') as fh:
        fh.write(header + dump(doc) + '\n')


# ---- model calls ---------------------------------------------------------------------------

COST = {'usd': 0.0, 'calls': 0, 'in': 0, 'out': 0}


def call(system, prompt, schema, model, max_tokens=32000):
    out = llm._raw_generate('openrouter', model, system, prompt, schema,
                            options={'effort': 'low', 'max_tokens': max_tokens, 'timeout': 900, 'metadata': True})
    usage = out.get('usage') or {}
    with _print:
        COST['calls'] += 1
        COST['usd'] += float(usage.get('cost') or 0)
        COST['in'] += int(usage.get('prompt_tokens') or 0)
        COST['out'] += int(usage.get('completion_tokens') or 0)
    if not out.get('content'):
        raise RuntimeError('empty response')
    return schema.model_validate(json.loads(out['content']))


class Skip(Exception):
    """Nothing to apply yet (a prompt was exported, or its answer file is missing)."""


class Answers:
    """Where answers come from: the agent running this script (export/import) or OpenRouter."""

    def __init__(self, mode, folder=None, model=MODEL):
        self.mode, self.folder, self.model = mode, folder, model
        self.label = model if mode == 'openrouter' else 'claude-code'

    def __call__(self, name, system, text, schema, max_tokens=32000):
        if self.mode == 'openrouter':
            return call(system, text, schema, self.model, max_tokens)
        path = os.path.join(self.folder, name)
        if self.mode == 'export':
            os.makedirs(self.folder, exist_ok=True)
            with open(path + '.md', 'w', encoding='utf-8') as fh:
                fh.write(f'# {name}\n\n## Instructions\n\n{system}\n\n## Answer format\n\nWrite `{name}.json` '
                         f'matching this JSON schema:\n\n```json\n{json.dumps(schema.model_json_schema(), indent=1)}\n```'
                         f'\n\n## Input\n\n{text}\n')
            raise Skip(f'exported {name}.md')
        if not os.path.exists(path + '.json'):
            raise Skip(f'no answer in {name}.json')
        with open(path + '.json', encoding='utf-8') as fh:
            return schema.model_validate(json.load(fh))

    @property
    def retries(self):
        return 3 if self.mode == 'openrouter' else 1


def points_pass(section, key, answers, force=False, dry=False):
    source = cat.source_hash(cat.lessons(section)[key]['path'])
    old = read(section, key)
    if old and old.get('source_hash') == source and not force:
        return 'current'
    text, subtopics, item_ids = render(section, key)
    if old:
        text += '\n\nEXISTING POINTS\n' + '\n'.join(
            f'{p["id"].rsplit(".", 1)[1]}: {p["claim"]}' for p in old.get('points', []) if not p.get('retired'))
    if dry:
        say(f'would draft {section}/{key}: ~{len(text) // 4:,} input tokens, {len(item_ids)} items')
        return 'dry'
    n_obj = len(cat.lessons(section)[key]['objectives'])
    feedback = ''
    for attempt in range(answers.retries):
        got = answers(f'points__{section}__{key}', POINTS_SYSTEM, text + feedback, LessonPoints)
        errors = check_points(got, subtopics, item_ids, n_obj)
        if not errors:
            break
        say(f'  {section}/{key}: attempt {attempt + 1} had {len(errors)} problems: {errors[:3]}')
        feedback = ('\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS; fix all of them:\n- ' + '\n- '.join(errors[:40]))
    else:
        raise RuntimeError(f'{section}/{key}: invalid answer: {errors[:10]}')
    pid = lambda slug: cat.point_id(section, key, slug)  # noqa: E731
    previous = {p['id']: p for p in (old or {}).get('points', [])}
    points = []
    for p in got.points:
        prior = previous.get(pid(p.slug), {})
        entry = {'id': pid(p.slug), 'subtopic': p.subtopic, 'kind': p.kind, 'claim': p.claim.strip(),
                 'prompt': p.prompt.strip(), 'objectives': sorted(set(p.objectives))}
        for keep in ('requires', 'same_as'):
            if prior.get(keep):
                entry[keep] = prior[keep]
        points.append(entry)
    fresh = {p['id'] for p in points}
    points += [{**p, 'retired': True} for i, p in previous.items() if i not in fresh]
    write(section, key, {
        'section': section, 'lesson': key, 'source_hash': source,
        'generated': {'model': answers.label, 'prompt_version': PROMPT_VERSION, 'date': dt.date.today().isoformat(),
                      'linked': False},
        'points': points,
        'items': {i.item: [pid(s) for s in dict.fromkeys(i.points)] for i in sorted(got.items, key=lambda i: i.item)},
    })
    return f'{len(got.points)} points, {len(got.items)} items'


def _norm(text):
    text = re.sub(r'\\+u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
    return re.sub(r'\W+', '', text).casefold()


def check_points(got, subtopics, item_ids, n_obj):
    """Problems with a model answer. Subtopics that differ only in escaping or punctuation are fixed in place."""
    errors, slugs = [], set()
    by_norm = {_norm(t): t for t in subtopics}
    for p in got.points:
        p.subtopic = p.subtopic if p.subtopic in subtopics else by_norm.get(_norm(p.subtopic), p.subtopic)
        if not cat.SLUG.match(p.slug) or len(p.slug.split('-')) > 8:
            errors.append(f'slug {p.slug!r} is not 2-6 lowercase hyphenated words')
        if p.slug in slugs:
            errors.append(f'duplicate slug {p.slug}')
        slugs.add(p.slug)
        if p.subtopic not in subtopics:
            errors.append(f'{p.slug}: subtopic {p.subtopic!r} is not one of the listed subtopics')
        if any(not 0 <= o < n_obj for o in p.objectives):
            errors.append(f'{p.slug}: objective index out of range 0-{n_obj - 1}')
    seen = {}
    for i in got.items:
        seen[i.item] = seen.get(i.item, 0) + 1
        if not 1 <= len(set(i.points)) <= 3:
            errors.append(f'{i.item}: must map to 1-3 points')
        for s in i.points:
            if s not in slugs:
                errors.append(f'{i.item}: unknown slug {s}')
    for item in item_ids:
        if item not in seen:
            errors.append(f'item {item} is missing')
        elif seen[item] > 1:
            errors.append(f'item {item} appears {seen[item]} times')
    errors += [f'{i} is not a listed item' for i in seen if i not in item_ids]
    return errors


def links_pass(section, key, earlier, answers, force=False, dry=False):
    doc = read(section, key)
    if not doc:
        return 'no points yet'
    if doc['generated'].get('linked') and not force:
        return 'current'
    mine = [p for p in doc['points'] if not p.get('retired')]
    prior = [p for p in earlier if not p.get('retired') and not p.get('same_as')]
    text = ('THIS LESSON\n' + '\n'.join(f'{p["id"]} ({p["kind"]}): {p["claim"]}' for p in mine) +
            '\n\nEARLIER POINTS\n' + ('\n'.join(f'{p["id"]}: {p["claim"]}' for p in prior) or '(none)'))
    if dry:
        say(f'would link {section}/{key}: ~{len(text) // 4:,} input tokens')
        return 'dry'
    order = {p['id']: n for n, p in enumerate(mine)}
    prior_ids = {p['id'] for p in prior}
    got = answers(f'links__{section}__{key}', LINKS_SYSTEM, text, LessonLinks, max_tokens=16000)
    unknown = [l.point for l in got.links if l.point not in order]
    if unknown:
        raise RuntimeError(f'{section}/{key}: links name points not in this lesson: {unknown[:5]}')
    by_id = {l.point: l for l in got.links}
    for p in doc['points']:
        p.pop('requires', None)
        p.pop('same_as', None)
        link = by_id.get(p['id'])
        if p.get('retired') or not link:
            continue
        reqs = [r for r in dict.fromkeys(link.requires)
                if r in prior_ids or (r in order and order[r] < order[p['id']])][:3]
        if reqs:
            p['requires'] = reqs
        if link.same_as in prior_ids and link.same_as != p['id']:
            p['same_as'] = link.same_as
    doc['generated']['linked'] = True
    doc['generated']['linked_by'] = answers.label
    write(section, key, doc)
    return f'{sum(bool(p.get("requires")) for p in doc["points"])} with prerequisites, ' \
           f'{sum(bool(p.get("same_as")) for p in doc["points"])} aliases'


def flatten_aliases(sections):
    """Lessons are linked in parallel, so an alias can point at a point that became an alias itself."""
    docs = {(s, k): read(s, k) for s in sections for k in cat.lessons(s)}
    target = {p['id']: p.get('same_as') for d in docs.values() if d for p in d['points']}
    for (s, k), doc in docs.items():
        changed = False
        for p in (doc or {}).get('points', []):
            t, seen = p.get('same_as'), set()
            while t and target.get(t) and t not in seen:
                seen.add(t)
                t = target[t]
            if t != p.get('same_as'):
                p['same_as'], changed = t, True
        if changed:
            write(s, k, doc)


def practice_pass(answers, force=False, dry=False):
    path = os.path.join(cat.HERE, 'system-design', cat.PRACTICE + '.yaml')
    if os.path.exists(path) and not force:
        return 'current'
    info = cat.items('system-design')
    targets = sorted(i for i, v in info.items() if v['lesson'] is None)
    parts = []
    for item in targets:
        if item.startswith('exercise:'):
            ex = EXERCISES[item.split(':', 1)[1]]
            parts.append(f'[ITEM {item}]\n' + dump({k: ex[k] for k in ('title', 'prompt', 'choices', 'explanation') if k in ex}))
        elif item.startswith('drill:'):
            parts.append(f'[ITEM {item}]\nEstimation drill: {TEMPLATES[item.split(":", 1)[1]][0]}')
    points = []
    for key in cat.lessons('system-design'):
        doc = read('system-design', key) or {}
        points += [p for p in doc.get('points', []) if not p.get('retired') and not p.get('same_as')]
    text = ('ITEMS\n' + '\n\n'.join(parts) + '\n\nPOINTS\n' +
            '\n'.join(f'{p["id"]}: {p["claim"]}' for p in points))
    if dry:
        say(f'would map {len(targets)} practice items: ~{len(text) // 4:,} input tokens')
        return 'dry'
    ids = {p['id'] for p in points}
    got = answers('practice__system-design', PRACTICE_SYSTEM, text, PracticeMap)
    mapped = {i.item: [p for p in dict.fromkeys(i.points) if p in ids][:3] for i in got.items if i.item in targets}
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('# Practice items with no lesson, mapped onto knowledge points. Reviewable by hand.\n' +
                 dump({'section': 'system-design', 'items': {k: v for k, v in sorted(mapped.items()) if v}}) + '\n')
    return f'{len(mapped)} of {len(targets)} items mapped'


# ---- driver --------------------------------------------------------------------------------

def run(args):
    mode = 'openrouter' if args.openrouter else 'export' if args.export else 'import'
    answers = Answers(mode, args.export or args.import_, args.model)
    sections = [args.section] if args.section else list(cat.SECTIONS)
    targets = [(s, k) for s in sections for k in cat.lessons(s) if not args.lesson or k in args.lesson]
    passes = ['points', 'links', 'practice'] if args.pass_ == 'all' else [args.pass_]
    failed = []

    def fan(fn, jobs):
        with ThreadPoolExecutor(max_workers=args.jobs) as ex:
            futures = {ex.submit(fn, *job): job for job in jobs}
            for f in as_completed(futures):
                s, k = futures[f][:2]
                try:
                    say(f'{s}/{k}: {f.result()}')
                except Skip as skip:
                    say(f'{s}/{k}: {skip}')
                except Exception as exc:
                    failed.append(f'{s}/{k}')
                    say(f'{s}/{k}: FAILED {type(exc).__name__}: {exc}')

    if 'points' in passes:
        fan(lambda s, k: points_pass(s, k, answers, args.force, args.dry_run), targets)
    if 'links' in passes:
        jobs = []
        for s in sections:
            earlier = []
            for k in cat.lessons(s):
                if not args.lesson or k in args.lesson:
                    jobs.append((s, k, list(earlier)))
                earlier += (read(s, k) or {}).get('points', [])
        fan(lambda s, k, e: links_pass(s, k, e, answers, args.force, args.dry_run), jobs)
        if not args.dry_run and mode != 'export':
            flatten_aliases(sections)
    if 'practice' in passes and 'system-design' in sections and not args.lesson:
        try:
            say(f'practice: {practice_pass(answers, args.force, args.dry_run)}')
        except Skip as skip:
            say(f'practice: {skip}')
        except Exception as exc:
            failed.append('practice')
            say(f'practice: FAILED {type(exc).__name__}: {exc}')
    if mode == 'openrouter':
        say(f'\n{COST["calls"]} calls, {COST["in"]:,} input and {COST["out"]:,} output tokens, ${COST["usd"]:.2f}')
    if failed:
        say('Failed: ' + ', '.join(failed))
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pass', dest='pass_', choices=['all', 'points', 'links', 'practice'], default='all')
    ap.add_argument('--section', choices=list(cat.SECTIONS))
    ap.add_argument('--lesson', action='append', help='limit to these lesson ids (repeatable)')
    ap.add_argument('--model', default=MODEL, help='with --openrouter')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--force', action='store_true', help='redo work that is already current')
    ap.add_argument('--dry-run', action='store_true')
    who = ap.add_mutually_exclusive_group()
    who.add_argument('--export', metavar='DIR', help='write pending prompts to DIR for the agent to answer')
    who.add_argument('--import', dest='import_', metavar='DIR', help='apply the agent\'s answers from DIR')
    who.add_argument('--openrouter', action='store_true', help='answer with the paid API (spends the shared balance)')
    args = ap.parse_args()
    if not (args.dry_run or args.export or args.import_ or args.openrouter):
        raise SystemExit('Say who answers: --export/--import (the agent) or --openrouter (paid). See --help.')
    if args.openrouter and not args.dry_run and not config.OPENROUTER_API_KEY:
        raise SystemExit('OPENROUTER_API_KEY is not set')
    sys.exit(run(args))


if __name__ == '__main__':
    main()
