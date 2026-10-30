"""A fixed-capacity cache with least-recently-used eviction and a time-to-live."""
import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        if capacity <= 0 or ttl <= 0:
            raise ValueError("capacity and ttl must be positive")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self._recency = OrderedDict()   # key -> value, least recently used first
        self._expiry = OrderedDict()    # key -> expires_at; one TTL, so put order is expiry order

    def _purge(self):
        """Drop expired entries from the front of the expiry order. Amortised O(1)."""
        now = self.clock()
        while self._expiry:
            key, expires_at = next(iter(self._expiry.items()))
            if now < expires_at:
                break
            del self._expiry[key]
            del self._recency[key]

    def put(self, key, value):
        self._purge()
        self._recency[key] = value
        self._recency.move_to_end(key)
        self._expiry.pop(key, None)
        self._expiry[key] = self.clock() + self.ttl
        if len(self._recency) > self.capacity:
            old, _ = self._recency.popitem(last=False)
            del self._expiry[old]

    def get(self, key, default=None):
        self._purge()
        if key not in self._recency:
            return default
        self._recency.move_to_end(key)
        return self._recency[key]

    def delete(self, key):
        self._purge()
        if key not in self._recency:
            return False
        del self._recency[key]
        del self._expiry[key]
        return True

    def __len__(self):
        self._purge()
        return len(self._recency)
