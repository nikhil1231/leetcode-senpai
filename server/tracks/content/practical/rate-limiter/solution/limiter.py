"""A per-key token-bucket rate limiter."""
import time


class RateLimiter:
    def __init__(self, rate, burst, clock=time.monotonic):
        if rate <= 0 or burst <= 0:
            raise ValueError("rate and burst must be positive")
        self.rate = rate
        self.burst = burst
        self.clock = clock
        self._buckets = {}   # key -> [tokens, last_refill]

    def _refill(self, key):
        now = self.clock()
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = self._buckets[key] = [float(self.burst), now]
        else:
            bucket[0] = min(self.burst, bucket[0] + (now - bucket[1]) * self.rate)
            bucket[1] = now
        return bucket

    def allow(self, key, cost=1):
        bucket = self._refill(key)
        if bucket[0] + 1e-12 < cost:
            return False
        bucket[0] -= cost
        return True

    def retry_after(self, key, cost=1):
        if cost > self.burst:
            raise ValueError("cost exceeds burst; the request can never succeed")
        tokens = self._refill(key)[0]
        return max(0.0, (cost - tokens) / self.rate)

    def prune(self):
        now = self.clock()
        full = [k for k, (tokens, last) in self._buckets.items()
                if tokens + (now - last) * self.rate >= self.burst]
        for k in full:
            del self._buckets[k]
        return len(full)
