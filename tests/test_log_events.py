import asyncio
import io
import logging
import sys
import pytest
from fastapi.testclient import TestClient

from server import log_events
from server.main import app


@pytest.fixture(autouse=True)
def clean_events():
    log_events.clear()
    log_events.install()
    yield
    log_events.clear()


def test_log_warnings_and_errors_are_captured():
    logger = logging.getLogger("test.logger")
    logger.info("This is an info message and should be ignored")
    logger.debug("This is a debug message and should be ignored")

    assert len(log_events.get_warnings()) == 0

    logger.warning("Warning 1: something degraded")
    logger.error("Error 1: something broke")

    events = log_events.get_warnings()
    assert len(events) == 2
    assert events[0]["level"] == "WARNING"
    assert events[0]["message"] == "Warning 1: something degraded"
    assert events[0]["id"] == 1

    assert events[1]["level"] == "ERROR"
    assert events[1]["message"] == "Error 1: something broke"
    assert events[1]["id"] == 2

    # Querying since=1 returns only event 2
    since_1 = log_events.get_warnings(since=1)
    assert len(since_1) == 1
    assert since_1[0]["id"] == 2


def test_exception_info_is_included_in_captured_message():
    logger = logging.getLogger("test.logger.exc")
    try:
        raise RuntimeError("connection refused")
    except RuntimeError:
        logger.warning("Operation failed", exc_info=True)

    events = log_events.get_warnings()
    assert len(events) == 1
    assert "Operation failed (connection refused)" in events[0]["message"]


def test_warnings_also_reach_stderr(monkeypatch):
    """install() puts a handler on the root logger, which suppresses logging's last-resort stderr
    writer (it only fires when no handler is configured). Warnings must still go to stderr, or the
    container logs (`docker logs`, the whats dashboard) would show nothing."""
    stream = io.StringIO()
    monkeypatch.setattr(sys, "stderr", stream)
    logging.getLogger("test.stderr").warning("a warning the operator should see")
    assert "a warning the operator should see" in stream.getvalue()
    assert any("operator should see" in e["message"] for e in log_events.get_warnings())


def test_api_log_warnings_endpoint():
    logger = logging.getLogger("test.api")
    logger.warning("Warning via API")

    from server import auth
    app.dependency_overrides[auth.require_user] = lambda: "test"
    try:
        client = TestClient(app)
        resp = client.get("/api/logs/warnings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["latest_id"] == 1
        assert len(data["events"]) == 1
        assert data["events"][0]["message"] == "Warning via API"

        resp2 = client.get("/api/logs/warnings?since=1")
        assert resp2.status_code == 200
        assert len(resp2.json()["events"]) == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_log_events_subscription():
    loop = asyncio.get_running_loop()
    q = asyncio.Queue()
    log_events.subscribe(loop, q)
    try:
        logger = logging.getLogger("test.sub")
        logger.warning("Live warning")
        event = await asyncio.wait_for(q.get(), timeout=1.0)
        assert event["message"] == "Live warning"
        assert event["level"] == "WARNING"
    finally:
        log_events.unsubscribe(loop, q)
