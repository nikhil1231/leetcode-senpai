"""Phase 2: find_room."""
from rooms import Calendar


def office():
    return Calendar({'Ada': 4, 'Turing': 8, 'Hopper': 12})


def test_picks_the_smallest_room_that_fits():
    assert office().find_room(540, 600, 3) == 'Ada'
    assert office().find_room(540, 600, 6) == 'Turing'


def test_skips_rooms_that_are_taken():
    cal = office()
    cal.book('Ada', 500, 560, 'standup')
    assert cal.find_room(540, 600, 3) == 'Turing'


def test_none_when_nothing_fits():
    cal = office()
    cal.book('Hopper', 540, 600, 'all hands')
    assert cal.find_room(550, 580, 10) is None
