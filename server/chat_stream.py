"""Streaming chat replies to the browser as server-sent events.

`Visible` turns a reply arriving in pieces into what the learner may see as it arrives. The tutor's
replies carry hidden parts (server/tutor/session.py): `<private>` notes, `[[markers]]`, and fenced
`diagram`/`mermaid`/`design` blocks that become widgets. Text from a `<`, `[` or backtick run is held
back until it is known whether it starts one of those, so a private note never flashes on screen. A
marker or a widget fence becomes its own event, shown as a placeholder card until the stored turn
arrives. The stream is only a preview: the closing `done` event carries the canonical record.
Pure, no I/O.
"""
import json
import re

PRIVATE_OPEN, PRIVATE_CLOSE = '<private>', '</private>'
WIDGET_FENCES = {'diagram', 'mermaid', 'design'}
SPECIAL = re.compile(r'[<\[`]')


def _tail(buf, word):
    """Length of the longest end of `buf` that begins `word` (case-insensitive)."""
    low, word = buf.lower(), word.lower()
    for n in range(min(len(word) - 1, len(low)), 0, -1):
        if word.startswith(low[-n:]):
            return n
    return 0


class Visible:
    """feed(chunk) -> events; finish() -> the rest. Events: {"type": "text", "text"},
    {"type": "marker", "text"} for `[[...]]`, {"type": "widget", "kind"} when a widget fence opens."""

    def __init__(self):
        self.buf, self.mode = '', None   # mode: None, 'private' or 'fence'

    def feed(self, chunk):
        self.buf += chunk or ''
        return self._drain(False)

    def finish(self):
        return self._drain(True)

    def _drain(self, final):
        out = []

        def text(t):
            if not t:
                return
            if out and out[-1]['type'] == 'text':
                out[-1]['text'] += t
            else:
                out.append({'type': 'text', 'text': t})

        while self.buf:
            if self.mode == 'private':
                i = self.buf.lower().find(PRIVATE_CLOSE)
                if i >= 0:
                    self.buf, self.mode = self.buf[i + len(PRIVATE_CLOSE):], None
                    continue
                keep = 0 if final else _tail(self.buf, PRIVATE_CLOSE)
                self.buf = self.buf[len(self.buf) - keep:] if keep else ''
                break
            if self.mode == 'fence':
                i = self.buf.find('```')
                if i >= 0:
                    self.buf, self.mode = self.buf[i + 3:], None
                    continue
                keep = 0 if final else len(self.buf) - len(self.buf.rstrip('`'))
                self.buf = self.buf[len(self.buf) - keep:] if keep else ''
                break
            m = SPECIAL.search(self.buf)
            if not m:
                text(self.buf)
                self.buf = ''
                break
            i = m.start()
            text(self.buf[:i])
            rest = self.buf[i:]
            if rest[0] == '<':
                if rest.lower().startswith(PRIVATE_OPEN):
                    self.buf, self.mode = rest[len(PRIVATE_OPEN):], 'private'
                elif not final and PRIVATE_OPEN.startswith(rest.lower()):
                    self.buf = rest
                    break
                else:
                    text('<')
                    self.buf = rest[1:]
            elif rest[0] == '[':
                if rest.startswith('[['):
                    j = rest.find(']]', 2)
                    if j >= 0:
                        out.append({'type': 'marker', 'text': rest[2:j].strip()})
                        self.buf = rest[j + 2:]
                    elif not final:
                        self.buf = rest
                        break
                    else:
                        text(rest)
                        self.buf = ''
                elif not final and rest == '[':
                    self.buf = rest
                    break
                else:
                    text('[')
                    self.buf = rest[1:]
            else:
                run = len(rest) - len(rest.lstrip('`'))
                if run == len(rest) and not final:
                    self.buf = rest
                    break
                if run >= 3:
                    nl = rest.find('\n', run)
                    if nl < 0 and not final:
                        self.buf = rest
                        break
                    line = rest[run:nl if nl >= 0 else len(rest)]
                    kind = line.strip().lower()
                    if kind in WIDGET_FENCES:
                        out.append({'type': 'widget', 'kind': kind})
                        self.buf, self.mode = rest[nl + 1:] if nl >= 0 else '', 'fence'
                        continue
                    text(rest[:nl + 1] if nl >= 0 else rest)
                    self.buf = rest[nl + 1:] if nl >= 0 else ''
                else:
                    text(rest[:run])
                    self.buf = rest[run:]
        return out


def sse(event: dict) -> str:
    """One server-sent event; every event is a JSON object with a `type`."""
    return 'data: ' + json.dumps(event, ensure_ascii=False) + '\n\n'


# no-transform keeps proxies (Next's compression, Cloudflare) from buffering; a set Content-Encoding makes
# the app's own GZipMiddleware pass the stream through untouched instead of holding it to compress.
HEADERS = {'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity'}
