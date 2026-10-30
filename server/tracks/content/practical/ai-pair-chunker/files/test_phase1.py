"""Phase 1: the bug report."""
from chunker import chunk

HANDBOOK = ' '.join(f'Rule {i}: be kind to the on-call engineer.' for i in range(60))


def test_long_document_keeps_its_ending():
    parts = chunk(HANDBOOK, size=200, overlap=40)
    assert parts[-1].end == len(HANDBOOK)
    assert HANDBOOK.endswith(parts[-1].text)


def test_short_document_is_one_chunk():
    assert [c.text for c in chunk('Refunds take 14 days.', size=200, overlap=40)] == ['Refunds take 14 days.']


def test_chunks_respect_size_and_overlap():
    parts = chunk(HANDBOOK, size=200, overlap=40)
    assert all(len(c.text) <= 200 for c in parts)
    assert all(c.text == HANDBOOK[c.start:c.end] for c in parts)
    for a, b in zip(parts, parts[1:]):
        assert b.start == a.end - 40
