from retry import retry


class Flaky:
    def __init__(self, failures, exc=TimeoutError):
        self.failures, self.exc, self.calls = failures, exc, 0

    def __call__(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise self.exc("boom")
        return self.calls


def test_full_jitter_upper_bounds():
    delays = []
    retry(Flaky(4), attempts=5, base_delay=0.1, max_delay=5, sleep=delays.append, rand=lambda: 1.0)
    assert [round(d, 6) for d in delays] == [0.1, 0.2, 0.4, 0.8]


def test_full_jitter_draws_from_zero():
    delays = []
    retry(Flaky(2), attempts=3, sleep=delays.append, rand=lambda: 0.0)
    assert delays == [0.0, 0.0]


def test_delays_are_capped():
    delays = []
    retry(Flaky(9), attempts=10, base_delay=1, max_delay=5, sleep=delays.append, rand=lambda: 1.0)
    assert max(delays) == 5
    assert delays[-1] == 5


def test_no_sleep_after_the_final_failure():
    delays = []
    try:
        retry(Flaky(10), attempts=3, sleep=delays.append, rand=lambda: 1.0)
    except TimeoutError:
        pass
    assert len(delays) == 2


def test_custom_retry_on():
    f = Flaky(1, exc=KeyError)
    assert retry(f, retry_on=(KeyError,), sleep=lambda _: None) == 2


def test_single_attempt_means_no_retry():
    f = Flaky(1)
    try:
        retry(f, attempts=1, sleep=lambda _: None)
    except TimeoutError:
        assert f.calls == 1
        return
    raise AssertionError("expected TimeoutError")
