from ttl_cache import TTLCache


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_put_and_get():
    c = TTLCache(2, ttl=10, clock=FakeClock())
    c.put("a", 1)
    assert c.get("a") == 1
    assert c.get("missing") is None
    assert c.get("missing", "x") == "x"


def test_replacing_a_key_updates_value():
    c = TTLCache(2, ttl=10, clock=FakeClock())
    c.put("a", 1)
    c.put("a", 2)
    assert c.get("a") == 2
    assert len(c) == 1


def test_evicts_least_recently_used():
    c = TTLCache(2, ttl=10, clock=FakeClock())
    c.put("a", 1)
    c.put("b", 2)
    c.get("a")          # a is now most recently used
    c.put("c", 3)       # evicts b
    assert c.get("b") is None
    assert c.get("a") == 1
    assert c.get("c") == 3


def test_entries_expire():
    clock = FakeClock()
    c = TTLCache(2, ttl=10, clock=clock)
    c.put("a", 1)
    clock.now = 9.9
    assert c.get("a") == 1
    clock.now = 10.0
    assert c.get("a") is None
    assert len(c) == 0


def test_delete():
    c = TTLCache(2, ttl=10, clock=FakeClock())
    c.put("a", 1)
    assert c.delete("a") is True
    assert c.delete("a") is False
    assert c.get("a") is None
