"""Knowledge ledger: pure memory model, counts, records and the results slip."""
from server import knowledge as k

DAY = k.DAY
T0 = 1_700_000_000  # a fixed instant; tests only use differences
ITEMS = [{'id': f'i{n}', 'category': 'c', 'topic': 't', 'kind': 'quickfire', 'label': ''} for n in range(4)]


def ev(item, at, clean=True, source='quickfire', marks=None, max_=1):
    return {'item': item, 'at': at, 'clean': clean, 'source': source,
            'marks': (max_ if clean else 0) if marks is None else marks, 'max': max_}


def test_grade_boundaries_cover_the_range():
    assert k.grade(100)['grade'] == 'A*' and k.grade(85)['grade'] == 'A*'
    assert k.grade(84.9)['grade'] == 'A' and k.grade(65)['grade'] == 'B'
    assert k.grade(50)['grade'] == 'C' and k.grade(35)['grade'] == 'D' and k.grade(0)['grade'] == 'U'


def test_same_day_repeats_never_grow_stability():
    once = k.replay([ev('i0', T0)])['i0']['stability']
    crammed = k.replay([ev('i0', T0 + n * 60) for n in range(10)])['i0']['stability']
    assert once == crammed == 1.0


def test_spaced_clean_answers_grow_and_misses_shrink():
    spaced = k.replay([ev('i0', T0), ev('i0', T0 + 3 * DAY), ev('i0', T0 + 12 * DAY)])['i0']
    assert spaced['stability'] > k.SOLID_DAYS
    assert k.status(spaced, T0 + 12 * DAY) == 'solid'
    missed = k.replay([ev('i0', T0), ev('i0', T0 + 3 * DAY), ev('i0', T0 + 12 * DAY, clean=False)])['i0']
    assert missed['stability'] < spaced['stability'] and k.status(missed, T0 + 12 * DAY) == 'shaky'
    assert k.held(missed, T0 + 12 * DAY) == 0


def test_late_review_grows_more_than_early_review():
    early = k.replay([ev('i0', T0), ev('i0', T0 + DAY)])['i0']['stability']
    late = k.replay([ev('i0', T0), ev('i0', T0 + 20 * DAY)])['i0']['stability']
    assert late > early


def test_knowledge_decays_with_time_and_items_become_due():
    evs = [ev('i0', T0), ev('i1', T0)]
    now = k.summary(ITEMS, evs, T0)
    later = k.summary(ITEMS, evs, T0 + 10 * DAY)
    assert now['knowledge'] == 2 and later['knowledge'] < 2
    assert now['due'] == 0 and later['due'] == 2
    assert later['counts'] == {'fading': 2, 'unseen': 2}


def test_events_for_unknown_items_count_as_activity_but_not_knowledge():
    s = k.summary(ITEMS, [ev('retired', T0)], T0)
    assert s['knowledge'] == 0
    assert sum(d['answers'] for d in s['daily'].values()) == 1


def test_mistakes_need_a_clean_answer_on_a_later_day_to_clear():
    states = k.replay([ev('i0', T0, clean=False)])
    assert [m['id'] for m in k.mistakes(ITEMS, states, T0)['fix']] == ['i0']
    states = k.replay([ev('i0', T0, clean=False), ev('i0', T0 + 60)])
    book = k.mistakes(ITEMS, states, T0 + 60)
    assert not book['fix'] and [m['id'] for m in book['confirm']] == ['i0']
    states = k.replay([ev('i0', T0, clean=False), ev('i0', T0 + 60), ev('i0', T0 + 2 * DAY)])
    assert k.mistakes(ITEMS, states, T0 + 2 * DAY) == {'fix': [], 'confirm': []}


def test_history_is_one_point_per_day_ending_now():
    h = k.history(ITEMS, [ev('i0', T0 - 2 * DAY), ev('i1', T0)], T0, days=5)
    # i0 is two days old (R ≈ 0.82); i1 was just answered.
    assert len(h) == 5 and h[-1]['value'] == 1.8
    assert h[0]['value'] == 0 and h[-1]['value'] >= h[-2]['value']


def test_combo_counts_consecutive_clean_quickfire_only():
    evs = [ev('i0', T0), ev('i1', T0 + 1), ev('i2', T0 + 2, source='lesson', clean=False),
           ev('i3', T0 + 3), ev('i0', T0 + 4, clean=False), ev('i1', T0 + 5)]
    assert k.combo(evs) == 3


def test_records_and_slip_report_new_bests_and_knowledge_change():
    papers = [{'scope_key': 'mixed', 'scope_label': 'mixed', 'pct': 60, 'max': 20, 'elapsed_sec': 900,
               'finished_at': T0 - DAY}]
    before = [ev('i0', T0 - DAY)]
    session = [ev('i1', T0 + 10), ev('i2', T0 + 20), ev('i3', T0 + 30, clean=False)]
    papers_after = papers + [{'scope_key': 'mixed', 'scope_label': 'mixed', 'pct': 90, 'max': 20,
                              'elapsed_sec': 600, 'finished_at': T0 + 40}]
    s = k.slip(ITEMS, before + session, T0, T0 + 50, papers_after)
    assert s['answers'] == 3 and s['clean'] == 2 and s['marks'] == 2 and s['new_items'] == 3
    assert s['knowledge_delta'] > 1.9
    keys = {r['key'] for r in s['records']}
    assert {'paper:mixed', 'pace', 'combo'} <= keys
    best = next(r for r in s['records'] if r['key'] == 'paper:mixed')
    assert best['value'] == 90 and best['display'].endswith('A*')
