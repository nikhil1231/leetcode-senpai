import time

from rooms import Calendar

N = 2500
BUDGET = 0.5  # seconds; a sorted index does this in a few milliseconds


def test_busy_room_stays_fast():
    cal = Calendar({'Ada': 4})
    order = [(i * 7919) % N for i in range(N)]  # every slot once, in scrambled order
    started = time.perf_counter()
    for i in order:
        cal.book('Ada', i * 10, i * 10 + 5, 'x')
    for i in order:
        assert cal.is_free('Ada', i * 10 + 5, i * 10 + 10)
        assert not cal.is_free('Ada', i * 10 + 4, i * 10 + 6)
    took = time.perf_counter() - started
    assert took < BUDGET, f'{N} bookings and {2 * N} lookups took {took:.2f}s (budget {BUDGET}s)'
