"""System design ledger adapter: catalogue coverage and event derivation from stored records."""
from collections import Counter

from server import system_design_items as items
from server.system_design_curriculum import LESSONS

T0 = 1_700_000_000


def test_catalogue_counts_every_gradeable_block_and_active_question_once():
    ids = [i['id'] for i in items.ITEMS]
    assert len(ids) == len(set(ids))
    kinds = Counter(i['kind'] for i in items.ITEMS)
    for kind in ('predict', 'calc', 'faded', 'sort', 'order', 'bug', 'recall', 'quickfire', 'check', 'exercise'):
        assert kinds[kind], kind
    assert 'interview' not in kinds and 'sim' not in kinds
    lesson = next(iter(LESSONS))
    assert all(i['label'] for i in items.ITEMS if i['topic'] == lesson)


def test_events_come_from_existing_records_without_migration():
    lesson = 'cache-aside'
    block = next(b['key'] for b in LESSONS[lesson]['blocks'] if b['type'] == 'predict')
    talk = next(b['key'] for b in LESSONS[lesson]['blocks'] if b['type'] == 'interview')
    qid = LESSONS[lesson]['quickfire_ids'][0]
    records = [
        {'kind': 'course_lesson', 'lesson_id': lesson, 'at': T0,
         'activities': {block: {'done': True, 'first_correct': True, 'at': T0},
                        talk: {'done': True, 'first_correct': None, 'at': T0}}},
        {'id': 'f1', 'kind': 'quickfire', 'question_id': qid, 'lesson_id': lesson,
         'result': {'answered_at': T0 + 5, 'correct': True, 'guessed': True}},
        {'kind': 'practice', 'exercise_id': next(iter(items.EXERCISES)), 'answered_at': T0 + 9, 'correct': False},
    ]
    evs = {e['item']: e for e in items.events(records)}
    assert evs[f'{lesson}:{block}']['clean'] and f'{lesson}:{talk}' not in evs
    assert evs[qid]['marks'] == 1 and not evs[qid]['clean']   # a guess scores but is not held
    ledger = items.ledger(records, now=T0 + 10)
    assert ledger['knowledge'] == 1.0 and ledger['total'] == len(items.ITEMS)
    assert {m['id'] for m in ledger['mistakes']['fix']} == {qid, 'exercise:' + next(iter(items.EXERCISES))}
    cache = next(c for c in ledger['heatmap'] if c['id'] == 'caching')
    squares = {s['id']: s for t in cache['topics'] for s in t['items']}
    assert squares[f'{lesson}:{block}']['status'] == 'learning'
