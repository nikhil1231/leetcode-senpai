"""next_up: the open block from the bucket furthest behind its weekly share. Pure, no I/O."""
from server import next_up as nu

TARGET = {'dsa': 190, 'system_design': 126, 'behavioural': 42, 'stack': 62}


def block(bucket, title, done=False):
    return {'bucket': bucket, 'title': title, 'done': done, 'activity': 'retrieval', 'minutes': 10, 'action': {'type': 'x'}}


def test_served_counts_only_this_week():
    items = [('dsa', 100, 30), ('dsa', 5, 99), ('system_design', 200, 15), ('stack', 9999, 5)]
    assert nu.served(items, start=50, now=300) == {'dsa': 30, 'system_design': 15, 'behavioural': 0, 'stack': 0}


def test_picks_the_bucket_furthest_behind_its_share():
    blocks = [block('dsa', 'a'), block('system_design', 'b'), block('stack', 'c')]
    done = {'dsa': 150, 'system_design': 20, 'behavioural': 0, 'stack': 55}
    out = nu.choose(blocks, TARGET, done)
    assert out['primary']['title'] == 'b'
    assert 'furthest behind' in out['reason'] and '20 of 126' in out['reason']
    assert [a['title'] for a in out['alternatives']] == ['a', 'c']


def test_ties_fall_back_to_session_order():
    blocks = [block('dsa', 'first'), block('system_design', 'second')]
    done = {'dsa': 95, 'system_design': 63, 'behavioural': 0, 'stack': 0}   # both ~50%
    assert nu.choose(blocks, TARGET, done)['primary']['title'] == 'first'


def test_done_blocks_are_skipped_and_all_done_returns_nothing():
    blocks = [block('dsa', 'a', done=True), block('system_design', 'b', done=True)]
    out = nu.choose(blocks, TARGET, {k: 0 for k in TARGET})
    assert out['primary'] is None and out['alternatives'] == []


def test_bucket_with_no_target_is_last():
    blocks = [block('behavioural', 'x'), block('dsa', 'y')]
    out = nu.choose(blocks, {**TARGET, 'behavioural': 0}, {'dsa': 100, 'system_design': 0, 'behavioural': 0, 'stack': 0})
    assert out['primary']['title'] == 'y'


def test_single_bucket_left_says_so():
    out = nu.choose([block('dsa', 'a')], TARGET, {'dsa': 10, 'system_design': 0, 'behavioural': 0, 'stack': 0})
    assert out['primary']['title'] == 'a' and 'Only coding work is left' in out['reason']


def test_evidence_estimates_minutes_from_the_bundle():
    b = {'attempts': [{'solved_at': 100, 'time_taken_sec': 1200}, {'solved_at': 110}],
         'answers': [{'answered_at': 120}], 'design': [{'kind': 'course_lesson', 'at': 130}], 'tracks': {}}
    got = nu.evidence(b)
    assert ('dsa', 100, 20.0) in got and ('dsa', 110, nu.SOLVE_DEFAULT_MIN) in got
    assert ('dsa', 120, nu.QUICKFIRE_MIN) in got and ('system_design', 130, nu.LESSON_MIN) in got
