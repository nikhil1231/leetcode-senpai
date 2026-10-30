"""A fixed-capacity cache with least-recently-used eviction and a time-to-live."""
import time


class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        if capacity <= 0 or ttl <= 0:
            raise ValueError("capacity and ttl must be positive")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        # TODO: choose your data structure

    def put(self, key, value):
        raise NotImplementedError

    def get(self, key, default=None):
        raise NotImplementedError

    def delete(self, key):
        raise NotImplementedError

    def __len__(self):
        raise NotImplementedError
