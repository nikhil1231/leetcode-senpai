"""Capture server log warnings and errors to surface them as toasts in the main UI."""
import asyncio
import collections
import logging
import sys
import threading
from typing import Optional

_LOCK = threading.Lock()
_SEQ = 0
_BUFFER: collections.deque = collections.deque(maxlen=200)
_SUBSCRIBERS: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()


class ToastLogHandler(logging.Handler):
    """Logging handler that captures warnings and errors into an in-memory queue."""

    def __init__(self, level: int = logging.WARNING):
        super().__init__(level)
        self._local = threading.local()

    def emit(self, record: logging.LogRecord):
        if record.levelno < logging.WARNING:
            return
        if getattr(self._local, "active", False):
            return
        self._local.active = True
        try:
            msg = record.getMessage()
            if record.exc_info and record.exc_info[1]:
                exc_str = str(record.exc_info[1])
                if exc_str and exc_str not in msg:
                    msg = f"{msg} ({exc_str})"
            global _SEQ
            with _LOCK:
                _SEQ += 1
                event = {
                    "id": _SEQ,
                    "t": record.created,
                    "level": record.levelname,
                    "name": record.name,
                    "message": msg,
                }
                _BUFFER.append(event)
                subs = list(_SUBSCRIBERS)

            for loop, q in subs:
                if not loop.is_closed():
                    try:
                        loop.call_soon_threadsafe(q.put_nowait, event)
                    except Exception:
                        pass
        except Exception:
            self.handleError(record)
        finally:
            self._local.active = False


class _StderrHandler(logging.StreamHandler):
    """A stream handler that writes to whatever `sys.stderr` is now, not the one captured at import
    (pytest and uvicorn's reloader swap it out)."""

    @property
    def stream(self):
        return sys.stderr

    @stream.setter
    def stream(self, value):
        pass


_HANDLER: Optional[ToastLogHandler] = None
_STREAM: Optional[logging.StreamHandler] = None


def install():
    """Attach the toast handler to the root logger, and keep warnings on stderr.

    A handler on the root logger suppresses logging's last-resort stderr writer (which only fires
    when no handler is configured), so capturing warnings for toasts would otherwise be the only
    place they went and the container logs (`docker logs`, journald, the whats dashboard) would
    show nothing. Keep both: the toasts are for the learner, the stderr lines are for the operator."""
    global _HANDLER, _STREAM
    root = logging.getLogger()
    if _HANDLER is None:
        _HANDLER = ToastLogHandler()
    if not any(isinstance(h, ToastLogHandler) for h in root.handlers):
        root.addHandler(_HANDLER)
    if _STREAM is None:
        _STREAM = _StderrHandler()
        _STREAM.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
    if not any(isinstance(h, _StderrHandler) for h in root.handlers):
        root.addHandler(_STREAM)


def get_warnings(since: int = 0, limit: int = 50) -> list[dict]:
    with _LOCK:
        items = [e for e in _BUFFER if e["id"] > since]
        return items[-limit:] if limit else items


def snapshot(since: int) -> dict:
    # Read the cursor and its batch together so a concurrent log cannot be skipped.
    with _LOCK:
        return {"events": [e for e in _BUFFER if e["id"] > since][-50:], "latest_id": _SEQ}


def subscribe(loop: asyncio.AbstractEventLoop, q: asyncio.Queue):
    with _LOCK:
        _SUBSCRIBERS.add((loop, q))


def unsubscribe(loop: asyncio.AbstractEventLoop, q: asyncio.Queue):
    with _LOCK:
        _SUBSCRIBERS.discard((loop, q))


def clear():
    """Reset events and counters for tests."""
    global _SEQ
    with _LOCK:
        _SEQ = 0
        _BUFFER.clear()
        _SUBSCRIBERS.clear()
