from ttl_cache import TTLCache


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_put_refreshes_ttl():
    clock = FakeClock()
    c = TTLCache(2, ttl=10, clock=clock)
    c.put("a", 1)
    clock.now = 8
    c.put("a", 2)
    clock.now = 15
    assert c.get("a") == 2


def test_get_does_not_refresh_ttl():
    clock = FakeClock()
    c = TTLCache(2, ttl=10, clock=clock)
    c.put("a", 1)
    clock.now = 8
    c.get("a")
    clock.now = 10
    assert c.get("a") is None


def test_expired_entries_are_dropped_before_live_ones():
    clock = FakeClock()
    c = TTLCache(2, ttl=10, clock=clock)
    c.put("old", 1)
    clock.now = 5
    c.put("live", 2)
    c.get("old")           # old is most recently used, but expires first
    clock.now = 11         # old has expired, live has not
    c.put("new", 3)
    assert c.get("live") == 2
    assert c.get("new") == 3


def test_len_counts_only_live_entries():
    clock = FakeClock()
    c = TTLCache(3, ttl=10, clock=clock)
    c.put("a", 1)
    clock.now = 5
    c.put("b", 2)
    clock.now = 12
    assert len(c) == 1


def test_delete_expired_returns_false():
    clock = FakeClock()
    c = TTLCache(2, ttl=10, clock=clock)
    c.put("a", 1)
    clock.now = 20
    assert c.delete("a") is False


def test_capacity_one_and_falsy_values():
    c = TTLCache(1, ttl=10, clock=FakeClock())
    c.put("a", 0)
    assert c.get("a", "default") == 0
    c.put("b", None)
    assert c.get("a", "gone") == "gone"
    assert c.get("b", "default") is None


def test_many_operations_stay_fast():
    import time as _t
    c = TTLCache(1000, ttl=10, clock=FakeClock())
    start = _t.perf_counter()
    for i in range(50000):
        c.put(i, i)
        c.get(i - 500)
    assert _t.perf_counter() - start < 3, "get/put should be O(1)"
