"""Retry a flaky call with exponential backoff and jitter."""
import random
import time


def retry(fn, attempts=3, base_delay=0.1, max_delay=5.0,
          retry_on=(ConnectionError, TimeoutError), sleep=time.sleep, rand=random.random):
    for n in range(1, attempts + 1):            # bug 1: range(1, attempts) made one call too few
        try:
            return fn()
        except retry_on:                        # bug 2: `except Exception` retried non-retryable errors
            if n == attempts:
                raise                           # bug 3: fell off the loop and returned None
            ceiling = min(max_delay, base_delay * 2 ** (n - 1))   # bug 4: cap applied before growth
            sleep(rand() * ceiling)             # bug 5: full jitter draws from [0, ceiling]
