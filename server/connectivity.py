"""Is Firestore reachable? A cached TCP probe plus a breaker that real failures trip.

Without a network, a Firestore call does not fail — it retries for up to a
minute. Offline that turns every tab into a spinner and, since a browser holds
only six connections per host, starves the requests that could have worked.
One cheap probe answers "online?" for everyone; a timed-out call made anyway
(a captive portal, say) flips the answer without waiting for the next probe.
"""
import os
import socket
import threading
import time

PROBE_TIMEOUT = 1.5
RECHECK_ONLINE = 30.0
RECHECK_OFFLINE = 10.0

_lock = threading.Lock()
_state = {"online": True, "checked": 0.0}


def _target():
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if emulator:
        host, _, port = emulator.rpartition(":")
        return host or "localhost", int(port)
    return "firestore.googleapis.com", 443


def _probe():
    try:
        socket.create_connection(_target(), timeout=PROBE_TIMEOUT).close()
        return True
    except OSError:
        return False


def online():
    """Cached reachability; concurrent callers share a single probe."""
    with _lock:
        wait = RECHECK_ONLINE if _state["online"] else RECHECK_OFFLINE
        if time.monotonic() - _state["checked"] >= wait:
            _state["online"] = _probe()
            _state["checked"] = time.monotonic()
        return _state["online"]


def mark_offline():
    """A real call failed: stop trying until the next offline recheck."""
    with _lock:
        _state["online"] = False
        _state["checked"] = time.monotonic()
