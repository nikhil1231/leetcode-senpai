"""An in-memory key-value store with nested transactions."""


class KVStore:
    def __init__(self):
        pass

    def set(self, key, value):
        raise NotImplementedError

    def get(self, key):
        raise NotImplementedError

    def delete(self, key):
        raise NotImplementedError

    def count(self, value):
        raise NotImplementedError

    def begin(self):
        raise NotImplementedError

    def rollback(self):
        raise NotImplementedError

    def commit(self):
        raise NotImplementedError
