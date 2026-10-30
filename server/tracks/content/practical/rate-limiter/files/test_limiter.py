from limiter import RateLimiter


class FakeClock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def test_new_key_allows_a_full_burst():
    rl = RateLimiter(rate=1, burst=3, clock=FakeClock())
    assert [rl.allow("k") for _ in range(4)] == [True, True, True, False]


def test_refills_over_time():
    clock = FakeClock()
    rl = RateLimiter(rate=2, burst=2, clock=clock)
    assert rl.allow("k") and rl.allow("k")
    assert not rl.allow("k")
    clock.now += 0.5          # one token back
    assert rl.allow("k")
    assert not rl.allow("k")


def test_keys_are_independent():
    rl = RateLimiter(rate=1, burst=1, clock=FakeClock())
    assert rl.allow("a")
    assert not rl.allow("a")
    assert rl.allow("b")


def test_retry_after():
    clock = FakeClock()
    rl = RateLimiter(rate=2, burst=2, clock=clock)
    assert rl.retry_after("k") == 0
    rl.allow("k", cost=2)
    assert abs(rl.retry_after("k") - 0.5) < 1e-9
