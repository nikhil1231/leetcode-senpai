"""Area overviews (pass one): a short guided tour of one area of a course, one step per lesson.

Authored in system_design_lessons/overviews/<area>.yaml for system design, and in
tracks/content/<track>/overviews/<category>.yaml for the AI and fundamentals courses. Every step has the same shape: the problem,
the usual answer, the catch, one thing to remember, then a check or something to try (`check` /
`use`) and what the full lesson adds (`later`); a wrap-up can end on a check of its own. A check is
either a block of that step's lesson ("lesson/key") or a block written in the overview. The page shows
it with or without the tutor; the tutor teaches from the same steps.

`lesson(area)` turns an overview into a tutor lesson: its blocks are numbered b1, b2, … and borrowed
ones carry `from` (their lesson and key), so an answer lands on the real ledger item. Answers to the
overview's own blocks stay with the overview. Pure apart from reading the files once; anything
malformed fails loudly at import.
"""
import os

import yaml

from .. import system_design_lessons as rich
from ..system_design_curriculum import LESSONS as SD_LESSONS
from ..tracks import courses

SD = 'system-design'
TRACKS = ('fundamentals', 'ai')
STEP_FIELDS = ('lesson', 'title', 'minutes', 'problem', 'answer', 'catch', 'remember', 'later', 'recap')


class OverviewError(ValueError):
    pass


def folder(section):
    if section == SD:
        return os.path.join(os.path.dirname(rich.__file__), 'overviews')
    return os.path.join(courses.HERE, section, 'overviews')


def order(section):
    """{area: [lesson ids in course order]} for a section."""
    return rich.ORDER if section == SD else courses.COURSES[section]['order']


def all_lessons(section):
    return SD_LESSONS if section == SD else courses.lessons(section)


def _block(ref, lesson, where, section=SD):
    """A step's activity: a block written here ({type, …}) or one borrowed from its lesson ("lesson/key")."""
    if isinstance(ref, dict):
        own = dict(ref)
        kind = own.pop('type', None)
        if kind not in rich.REQUIRED or kind in ('outage', 'interview', 'recall'):
            raise OverviewError(f'{where}: a block written here needs a supported type, not {kind!r}')
        rich._check_block(where, kind, own, 0)
        return {'type': kind, **own}
    owner, _, key = str(ref).partition('/')
    if owner != lesson:
        raise OverviewError(f'{where}: {ref} is not a block of {lesson}')
    b = next((x for x in all_lessons(section)[lesson]['blocks'] if x.get('key') == key), None)
    if not b or b['type'] == 'md':
        raise OverviewError(f'{where}: no block {ref}')
    return b


def parse(data, name, section=SD):
    area = data.get('area')
    keys = order(section).get(area)
    if not keys:
        raise OverviewError(f'{name}: unknown area {area!r}')
    for f in ('title', 'minutes', 'intro', 'steps'):
        if not data.get(f):
            raise OverviewError(f'{name}: missing {f}')
    steps = data['steps']
    if [s.get('lesson') for s in steps] != keys:
        raise OverviewError(f'{name}: steps must be the area\'s lessons in course order: {keys}')
    for n, s in enumerate(steps):
        where = f'{name} step {n + 1}'
        missing = [f for f in STEP_FIELDS if not s.get(f)]
        if missing:
            raise OverviewError(f'{where}: missing {missing}')
        if not (s.get('check') or s.get('use')):
            raise OverviewError(f'{where}: needs a check or something to use')
        for f in ('check', 'use'):
            if s.get(f):
                _block(s[f], s['lesson'], where, section)
    if data.get('picture'):
        rich._check_block(name, 'arch', data['picture'], 0)
    if (data.get('finish') or {}).get('check'):
        _block(data['finish']['check'], None, f'{name} finish', section)
    return data


def load():
    """{(section, area): overview} for every authored overview."""
    out = {}
    for section in (SD, *TRACKS):
        here = folder(section)
        if not os.path.isdir(here):
            continue
        for f in sorted(os.listdir(here)):
            if f.endswith('.yaml'):
                with open(os.path.join(here, f), encoding='utf-8') as fh:
                    o = parse(yaml.safe_load(fh), f'{section}/{f}', section)
                if o['area'] + '.yaml' != f:
                    raise OverviewError(f'{section}/{f} declares area {o["area"]}')
                out[(section, o['area'])] = o
    return out


OVERVIEWS = load()


def get(area, section=SD):
    return OVERVIEWS.get((section, area))


def areas(section):
    """Areas of a section that have an authored overview, in course order."""
    return [a for a in order(section) if (section, a) in OVERVIEWS]


def lesson(area, section=SD):
    """The overview as a lesson: {steps, blocks, objectives, picture} with each step's block keys, or None."""
    o = get(area, section)
    if not o:
        return None
    blocks, steps = [], []
    if o.get('picture'):
        blocks.append({'type': 'arch', 'key': 'b1', **o['picture']})
    for s in o['steps']:
        step = {k: s.get(k) for k in (*STEP_FIELDS, 'use_note')}
        for f in ('use', 'check'):
            if s.get(f):
                b = _block(s[f], s['lesson'], area, section)
                key = f'b{len(blocks) + 1}'
                blocks.append({**b, 'key': key, **({'from': {'lesson': s['lesson'], 'key': b['key']}} if 'key' in b else {})})
                step[f] = key
        steps.append(step)
    finish = dict(o.get('finish') or {})
    if finish.get('check'):
        key = f'b{len(blocks) + 1}'
        blocks.append({**_block(finish['check'], None, area, section), 'key': key})
        finish['check'] = key
    return {'title': o['title'], 'minutes': o['minutes'], 'intro': o['intro'], 'picture_note': o.get('picture_note', ''),
            'picture': 'b1' if o.get('picture') else None, 'steps': steps, 'blocks': blocks, 'finish': finish,
            'objectives': [s['title'] for s in o['steps']]}


def notes(area, section=SD):
    """The overview as the tutor's private notes: each step's content in order, with its block marked."""
    ov = lesson(area, section)
    parts = [ov['intro'].strip()]
    if ov['picture']:
        parts.append(f"[BLOCK {ov['picture']} · arch] The big picture. {ov['picture_note'].strip()}")
    for n, s in enumerate(ov['steps'], 1):
        tried = ''.join(f"\n[BLOCK {s[f]} · {f}]" for f in ('use', 'check') if s.get(f))
        parts.append(f"### Step {n}: {s['title']} ({s['lesson']})\nProblem: {s['problem'].strip()}\nUsual answer: {s['answer'].strip()}\n"
                     f"Catch: {s['catch'].strip()}\nRemember: {s['remember'].strip()}{tried}\n"
                     f"For the full lesson (name, don't teach): {'; '.join(s['later'])}")
    if ov['finish'].get('check'):
        parts.append(f"### Wrap-up\nOne line per topic, then the closing check: [BLOCK {ov['finish']['check']} · check]")
    return '\n\n'.join(parts)
