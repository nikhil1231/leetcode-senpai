"""The retrieval index: chunk vectors per document, kept in step with the documents.

`embed(texts) -> list of vectors` is the embedding API. It is slow and billed per call, so
re-indexing a document must embed only chunks the index doesn't already have.
"""
import hashlib

from chunker import chunk


def chunk_id(doc_id, text):
    """Content-addressed: the same text in the same document always gets the same id."""
    return hashlib.sha1(f'{doc_id}\0{text}'.encode()).hexdigest()[:16]


class Index:
    def __init__(self, embed, size=800, overlap=100):
        self.embed, self.size, self.overlap = embed, size, overlap
        self.docs = {}     # doc_id -> list of chunk ids, in document order
        self.vectors = {}  # chunk id -> vector

    def upsert(self, doc_id, text):
        """Phase 2: see the brief. Returns (embedded, removed): how many chunk ids were added and dropped."""
        raise NotImplementedError

    def remove(self, doc_id):
        for cid in self.docs.pop(doc_id, []):
            self.vectors.pop(cid, None)
