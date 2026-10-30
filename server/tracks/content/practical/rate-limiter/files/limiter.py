"""A per-key token-bucket rate limiter."""
import time


class RateLimiter:
    def __init__(self, rate, burst, clock=time.monotonic):
        if rate <= 0 or burst <= 0:
            raise ValueError("rate and burst must be positive")
        self.rate = rate
        self.burst = burst
        self.clock = clock

    def allow(self, key, cost=1):
        raise NotImplementedError

    def retry_after(self, key, cost=1):
        raise NotImplementedError

    def prune(self):
        raise NotImplementedError
