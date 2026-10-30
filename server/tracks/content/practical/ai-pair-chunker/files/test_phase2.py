"""Phase 2: incremental re-indexing."""
from index import Index

DOC = ' '.join(f'Section {i} explains the refund rules for plan {i % 4}.' for i in range(40))


class Embedder:
    def __init__(self):
        self.texts = []

    def __call__(self, texts):
        self.texts.extend(texts)
        return [[float(len(t))] for t in texts]


def test_first_upsert_embeds_every_chunk():
    embed = Embedder()
    idx = Index(embed, size=200, overlap=40)
    added, removed = idx.upsert('policy', DOC)
    assert added == len(idx.docs['policy']) > 1 and removed == 0
    assert len(embed.texts) == added


def test_unchanged_document_embeds_nothing():
    embed = Embedder()
    idx = Index(embed, size=200, overlap=40)
    idx.upsert('policy', DOC)
    before = len(embed.texts)
    assert idx.upsert('policy', DOC) == (0, 0)
    assert len(embed.texts) == before


def test_edit_at_the_end_reembeds_only_the_end():
    embed = Embedder()
    idx = Index(embed, size=200, overlap=40)
    idx.upsert('policy', DOC)
    first = len(embed.texts)
    added, removed = idx.upsert('policy', DOC + ' Section 40 is new.')
    assert 1 <= added <= 2 and removed <= 2
    assert len(embed.texts) == first + added
    assert set(idx.vectors) == set(idx.docs['policy'])
