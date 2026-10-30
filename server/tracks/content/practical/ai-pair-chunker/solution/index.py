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
        """Returns (embedded, removed): how many distinct chunk ids were added and dropped.

        Paragraphs are chunked separately, so an edit only changes its own paragraph's chunks;
        fixed-size windows over the whole text would shift every chunk after the edit.
        """
        parts = [c for para in text.split('\n\n') if para.strip() for c in chunk(para, self.size, self.overlap)]
        ids = [chunk_id(doc_id, c.text) for c in parts]
        old, new = set(self.docs.get(doc_id, [])), set(ids)
        todo = {}
        for cid, c in zip(ids, parts):
            if cid not in old and cid not in todo:
                todo[cid] = c.text
        if todo:
            for cid, vector in zip(todo, self.embed(list(todo.values()))):
                self.vectors[cid] = vector
        gone = old - new
        for cid in gone:
            self.vectors.pop(cid, None)
        self.docs[doc_id] = ids
        return len(todo), len(gone)

    def remove(self, doc_id):
        for cid in self.docs.pop(doc_id, []):
            self.vectors.pop(cid, None)
