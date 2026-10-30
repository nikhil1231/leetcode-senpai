from limiter import RateLimiter


class FakeClock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def test_tokens_are_capped_at_burst():
    clock = FakeClock()
    rl = RateLimiter(rate=10, burst=3, clock=clock)
    rl.allow("k")
    clock.now += 1000
    assert [rl.allow("k") for _ in range(4)] == [True, True, True, False]


def test_rejection_consumes_nothing():
    clock = FakeClock()
    rl = RateLimiter(rate=1, burst=5, clock=clock)
    assert rl.allow("k", cost=4)
    assert not rl.allow("k", cost=3)    # only 1 left
    assert rl.allow("k", cost=1)        # the failed request took nothing


def test_cost_above_burst_is_an_error():
    rl = RateLimiter(rate=1, burst=5, clock=FakeClock())
    try:
        rl.retry_after("k", cost=6)
    except ValueError:
        return
    raise AssertionError("retry_after should raise ValueError for cost > burst")


def test_retry_after_with_cost():
    clock = FakeClock()
    rl = RateLimiter(rate=4, burst=8, clock=clock)
    rl.allow("k", cost=8)
    clock.now += 0.5                   # 2 tokens back
    assert abs(rl.retry_after("k", cost=5) - 0.75) < 1e-9
    clock.now += 0.75
    assert rl.allow("k", cost=5)


def test_prune_drops_only_full_buckets():
    clock = FakeClock()
    rl = RateLimiter(rate=1, burst=2, clock=clock)
    rl.allow("idle")
    rl.allow("busy")
    clock.now += 1.5                   # idle: 2.0 (full)... busy also refills
    rl.allow("busy", cost=2)           # busy: 0 left
    assert rl.prune() == 1
    assert not rl.allow("busy")        # pruning must not reset busy
    assert rl.allow("idle", cost=2)    # pruned keys come back full


def test_fractional_rates():
    clock = FakeClock()
    rl = RateLimiter(rate=0.5, burst=1, clock=clock)
    assert rl.allow("k")
    clock.now += 1.9
    assert not rl.allow("k")
    clock.now += 0.1
    assert rl.allow("k")
