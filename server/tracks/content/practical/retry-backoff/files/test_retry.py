from retry import retry


class Flaky:
    def __init__(self, failures, exc=ConnectionError):
        self.failures, self.exc, self.calls = failures, exc, 0

    def __call__(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise self.exc(f"failure {self.calls}")
        return "ok"


def no_sleep(_):
    pass


def test_returns_first_success():
    f = Flaky(0)
    assert retry(f, sleep=no_sleep) == "ok"
    assert f.calls == 1


def test_makes_the_configured_number_of_attempts():
    f = Flaky(2)
    assert retry(f, attempts=3, sleep=no_sleep) == "ok"
    assert f.calls == 3


def test_reraises_after_last_attempt():
    f = Flaky(10)
    try:
        retry(f, attempts=3, sleep=no_sleep)
    except ConnectionError as e:
        assert str(e) == "failure 3"
        return
    raise AssertionError("expected the last ConnectionError to be raised")


def test_does_not_retry_other_errors():
    f = Flaky(1, exc=ValueError)
    try:
        retry(f, attempts=5, sleep=no_sleep)
    except ValueError:
        assert f.calls == 1
        return
    raise AssertionError("ValueError should propagate immediately")
