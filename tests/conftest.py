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


@pytest.fixture
def store():
    return FakeStore()
