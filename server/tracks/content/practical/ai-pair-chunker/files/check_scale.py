import time

from index import Index

BUDGET = 0.5  # seconds; with sets this takes a few tens of milliseconds
CLAUSES = [f'Clause {i}: the on-call rota rotates weekly and swaps need two days notice.' for i in range(8000)]
HANDBOOK = '\n\n'.join(' '.join(CLAUSES[i:i + 10]) for i in range(0, len(CLAUSES), 10))


def test_one_line_edit_to_a_big_handbook_is_cheap_and_fast():
    idx = Index(lambda texts: [[0.0] for _ in texts], size=120, overlap=20)
    idx.upsert('handbook', HANDBOOK)
    edited = HANDBOOK.replace('Clause 4005:', 'Clause 4005 (updated):')
    started = time.perf_counter()
    added, removed = idx.upsert('handbook', edited)
    took = time.perf_counter() - started
    assert added <= 10, f'a one-line edit re-embedded {added} chunks; only its paragraph should change'
    assert 1 <= added and 1 <= removed <= 10
    assert took < BUDGET, f're-indexing after a one-line edit took {took:.2f}s (budget {BUDGET}s)'
