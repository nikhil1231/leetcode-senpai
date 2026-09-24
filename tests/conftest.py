import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.fake_store import FakeStore  # noqa: E402


@pytest.fixture(autouse=True)
def _no_polite_delay(monkeypatch):
    """Zero the bulk-import politeness sleep so tests aren't slow."""
    from server import importer
    monkeypatch.setattr(importer, "POLITE_DELAY", 0)


@pytest.fixture(autouse=True)
def _no_fsrs_fuzz(monkeypatch):
    """FSRS fuzzes intervals by design, so two identical advances land on
    different dates. Off in tests, so they can say what a card should do."""
    from fsrs import Scheduler

    from server import fsrs_engine
    monkeypatch.setattr(fsrs_engine, "_scheduler", Scheduler(enable_fuzzing=False))


@pytest.fixture
def store():
    return FakeStore()


@pytest.fixture(autouse=True)
def _offline_practice_isolated(monkeypatch, tmp_path):
    """Tests never probe the real network or touch the real offline mirror."""
    from server import config, connectivity
    monkeypatch.setattr(connectivity, "online", lambda: True)
    monkeypatch.setattr(config, "PRACTICE_OFFLINE_PATH", str(tmp_path / "practice_offline.json"))
