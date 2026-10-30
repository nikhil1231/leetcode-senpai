"""An in-memory key-value store with nested transactions."""
_ABSENT = object()


class KVStore:
    def __init__(self):
        self._data = {}
        self._counts = {}
        self._undo = []   # one dict per open transaction: key -> value before it (or _ABSENT)

    def _write(self, key, value, log=True):
        old = self._data.get(key, _ABSENT)
        if old is value or (old is not _ABSENT and value is not _ABSENT and old == value):
            return
        if log and self._undo and key not in self._undo[-1]:
            self._undo[-1][key] = old
        if old is not _ABSENT:
            self._counts[old] -= 1
            if not self._counts[old]:
                del self._counts[old]
        if value is _ABSENT:
            del self._data[key]
        else:
            self._data[key] = value
            self._counts[value] = self._counts.get(value, 0) + 1

    def set(self, key, value):
        self._write(key, value)

    def get(self, key):
        return self._data.get(key)

    def delete(self, key):
        self._write(key, _ABSENT)

    def count(self, value):
        return self._counts.get(value, 0)

    def begin(self):
        self._undo.append({})

    def rollback(self):
        if not self._undo:
            raise RuntimeError("no transaction")
        for key, old in self._undo.pop().items():
            self._write(key, old, log=False)

    def commit(self):
        if not self._undo:
            raise RuntimeError("no transaction")
        self._undo.clear()
