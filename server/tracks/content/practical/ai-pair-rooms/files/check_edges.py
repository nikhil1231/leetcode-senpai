from rooms import Calendar, Clash


def office():
    return Calendar({'Ada': 4, 'Turing': 8, 'Hopper': 12, 'Lovelace': 8})


def test_back_to_back_booking_before_is_allowed():
    cal = office()
    cal.book('Ada', 600, 660, 'planning')
    cal.book('Ada', 540, 600, 'standup')  # ends as planning starts


def test_containing_booking_clashes():
    cal = office()
    cal.book('Ada', 600, 620, 'call')
    try:
        cal.book('Ada', 540, 700, 'workshop')
    except Clash:
        return
    raise AssertionError('a booking that contains another was accepted')


def test_is_free_for_adjacent_range():
    cal = office()
    cal.book('Ada', 540, 600, 'standup')
    assert cal.is_free('Ada', 600, 660)
    assert cal.is_free('Ada', 480, 540)
    assert not cal.is_free('Ada', 599, 601)


def test_free_slots_with_bookings_made_out_of_order():
    cal = office()
    cal.book('Turing', 840, 900, 'retro')
    cal.book('Turing', 600, 660, 'review')
    assert cal.free_slots('Turing', 540, 1020, 30) == [(540, 600), (660, 840), (900, 1020)]


def test_free_slots_stay_inside_the_day():
    cal = office()
    cal.book('Turing', 1000, 1100, 'late call')
    cal.book('Turing', 400, 560, 'early call')
    assert cal.free_slots('Turing', 540, 1020, 30) == [(560, 1000)]


def test_find_room_ties_break_by_name():
    assert office().find_room(540, 600, 6) == 'Lovelace'
