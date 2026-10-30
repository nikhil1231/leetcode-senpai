import sys

from chunker import chunk
from index import Index


def bounded(fn, limit=300_000):
    """Runs fn, failing instead of hanging if it executes more than `limit` lines."""
    steps = [0]

    def tracer(frame, event, arg):
        if event == 'line':
            steps[0] += 1
            if steps[0] > limit:
                raise TimeoutError('looped without finishing (an infinite loop?)')
        return tracer
    sys.settrace(tracer)
    try:
        return fn()
    finally:
        sys.settrace(None)


FAQ = ('Q: Can I pay yearly? A: Yes. Q: Is there a student discount? A: Ask support. ' * 6).strip()


def test_large_overlap_still_finishes():
    parts = bounded(lambda: chunk(FAQ, size=30, overlap=25))
    assert parts[0].start == 0 and parts[-1].end == len(FAQ)
    assert all(b.start > a.start for a, b in zip(parts, parts[1:]))


def test_empty_document_has_no_chunks():
    assert bounded(lambda: chunk('', size=100, overlap=10)) == []


def test_text_exactly_one_window_long():
    text = 'x' * 100
    assert [(c.start, c.end) for c in bounded(lambda: chunk(text, size=100, overlap=10))] == [(0, 100)]


def test_chunks_cover_the_whole_text():
    parts = bounded(lambda: chunk(FAQ, size=60, overlap=15))
    covered = set()
    for c in parts:
        covered.update(range(c.start, c.end))
        assert len(c.text) <= 60 and c.text == FAQ[c.start:c.end]
    assert covered == set(range(len(FAQ)))


def test_bad_arguments_are_rejected():
    for size, overlap in ((0, 0), (10, 10), (10, -1)):
        try:
            chunk('abc', size=size, overlap=overlap)
        except ValueError:
            continue
        raise AssertionError(f'size={size}, overlap={overlap} was accepted')


def test_repeated_boilerplate_is_embedded_once_and_survives_edits():
    calls = []
    idx = Index(lambda texts: calls.extend(texts) or [[1.0] for _ in texts], size=40, overlap=0)
    footer = 'Contact support for help. '
    idx.upsert('faq', footer * 4)
    assert len(calls) == len(set(calls))
    idx.upsert('faq', footer * 3)
    assert set(idx.vectors) == set(idx.docs['faq']) and idx.docs['faq']


def test_documents_do_not_share_or_steal_chunks():
    idx = Index(lambda texts: [[1.0] for _ in texts], size=200, overlap=40)
    idx.upsert('a', 'Shared paragraph about refunds.')
    idx.upsert('b', 'Shared paragraph about refunds.')
    idx.upsert('a', 'Something else entirely.')
    assert all(cid in idx.vectors for cid in idx.docs['b'])
