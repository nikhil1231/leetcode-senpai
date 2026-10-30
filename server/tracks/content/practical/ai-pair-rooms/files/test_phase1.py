"""Phase 1: the bug report."""
from rooms import Calendar, Clash


def office():
    return Calendar({'Ada': 4, 'Turing': 8, 'Hopper': 12})


def test_back_to_back_booking_after_is_allowed():
    cal = office()
    cal.book('Ada', 540, 600, 'standup')
    cal.book('Ada', 600, 660, 'planning')  # starts as the standup ends


def test_real_clash_is_rejected():
    cal = office()
    cal.book('Ada', 540, 600, 'standup')
    try:
        cal.book('Ada', 570, 630, 'interview')
    except Clash:
        return
    raise AssertionError('overlapping booking was accepted')


def test_free_slots_around_one_meeting():
    cal = office()
    cal.book('Turing', 600, 660, 'review')
    assert cal.free_slots('Turing', 540, 720, 30) == [(540, 600), (660, 720)]
