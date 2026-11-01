"""Multiple-choice answers must not be findable by length alone.

If the key is usually the longest, most detailed option, a learner can score without
knowing the material. Every single-answer bank is checked two ways: how often the key is
the longest option (close to chance, not the norm), and whether any key dwarfs every
distractor.
"""
import pytest

from server import practice
from server.system_design_content import EXERCISES
from server.system_design_curriculum import LESSONS, QUESTIONS
from server.tracks import courses

MAX_LONGEST_SHARE = 0.4  # chance is 1/n options, so 25-33% here
MAX_RATIO, SLACK = 1.3, 12  # key may exceed the longest distractor by 30% or 12 chars


def _predicts(lessons, bank):
    for key, lesson in lessons.items():
        for block in lesson.get('blocks', []):
            if block['type'] == 'predict':
                ch = [str(c) for c in block['choices']]
                yield bank, f"{key}:{block['key']}", ch[block['answer']], ch[:block['answer']] + ch[block['answer'] + 1:]


def _questions(questions, bank):
    for qid, q in questions.items():
        if q.get('retired') or q.get('format', 'choice') != 'choice':
            continue
        by = {c['id']: c['text'] for c in q['choices']}
        yield bank, qid, by[q['correct']], [t for k, t in by.items() if k != q['correct']]


def collect():
    yield from _questions(QUESTIONS, 'system-design')
    yield from _predicts(LESSONS, 'system-design')
    for track, (lessons, questions) in courses.CONTENT.items():
        yield from _questions(questions, track)
        yield from _predicts(lessons, track)
    for key, ex in EXERCISES.items():
        ch = ex['choices']
        if not ch:  # numeric answer
            continue
        yield 'sd-exercises', key, ch[ex['correct']], [c for i, c in enumerate(ch) if i != ex['correct']]
    for key, row in practice.CHOICES.items():
        yield 'coding', key, row[5][0], row[5][1:]


ROWS = list(collect())
BANKS = sorted({r[0] for r in ROWS})


def oversized(right, wrongs):
    top = max(len(w) for w in wrongs)
    return len(right) > top * MAX_RATIO and len(right) - top > SLACK


@pytest.mark.parametrize('bank', BANKS)
def test_key_is_rarely_the_longest(bank):
    rows = [r for r in ROWS if r[0] == bank]
    longest = [qid for _, qid, right, wrongs in rows if len(right) > max(len(w) for w in wrongs)]
    assert len(longest) / len(rows) <= MAX_LONGEST_SHARE, f'{bank}: key longest in {len(longest)}/{len(rows)}'


@pytest.mark.parametrize('bank', BANKS)
def test_no_key_dwarfs_its_distractors(bank):
    bad = [qid for b, qid, right, wrongs in ROWS if b == bank and oversized(right, wrongs)]
    assert not bad, f'{bank}: {len(bad)} keys much longer than every distractor: {bad[:20]}'


def test_every_bank_is_checked():
    assert {'system-design', 'ai', 'fundamentals', 'sd-exercises', 'coding'} <= set(BANKS)
    assert len(ROWS) > 600
