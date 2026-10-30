"""Retry a flaky call with exponential backoff and jitter."""
import random
import time


def retry(fn, attempts=3, base_delay=0.1, max_delay=5.0,
          retry_on=(ConnectionError, TimeoutError), sleep=time.sleep, rand=random.random):
    for n in range(1, attempts):
        try:
            return fn()
        except Exception as exc:
            last = exc
            delay = min(max_delay, base_delay) * 2 ** (n - 1)
            sleep(delay + rand() * delay)
