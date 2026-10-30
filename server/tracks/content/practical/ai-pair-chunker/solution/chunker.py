"""Splits documents into overlapping chunks for the retrieval index.

A chunk is at most `size` characters. When a window doesn't reach the end of the text, it ends
just after the last space in its second half, so words aren't cut, if there is one. The next
chunk starts `overlap` characters before the previous one ended, but always after the previous
one started; if the overlap wouldn't move forward, it starts where the previous one ended.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    start: int
    end: int
    text: str


def chunk(text, size=800, overlap=100):
    if size <= 0 or not 0 <= overlap < size:
        raise ValueError('need size > 0 and 0 <= overlap < size')
    chunks, start = [], 0
    while start < len(text):
        end = start + size
        if end >= len(text):
            end = len(text)
        else:
            cut = text.rfind(' ', start + size // 2, end)
            if cut != -1:
                end = cut + 1
        chunks.append(Chunk(start, end, text[start:end]))
        if end == len(text):
            break
        start = end - overlap if end - overlap > start else end
    return chunks
