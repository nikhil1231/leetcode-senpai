// Code references inside an explanation: "[worker.py:42-58]". The text is the storage (typed, spoken and clicked
// references are all the same characters), and the structured form is read back from it; the server parses the same way.
export interface Ref { path: string; start: number; end: number }

const REF = /\[([^[\]\s:][^[\]:]*?):(\d+)(?:\s*[-–]\s*(\d+))?\]/g;

export const refToken = (r: Ref) => (r.end > r.start ? `[${r.path}:${r.start}-${r.end}]` : `[${r.path}:${r.start}]`);

// References to files that exist and lines that are in range, in order of appearance.
export function parseRefs(text: string, lineCounts: Record<string, number>): Ref[] {
  return refSpans(text, lineCounts).map((s) => s.ref);
}

// The same references with where each sits in the text, for drawing them as chips and deleting them whole.
export function refSpans(text: string, lineCounts: Record<string, number>): { ref: Ref; from: number; to: number }[] {
  const out: { ref: Ref; from: number; to: number }[] = [];
  for (const m of text.matchAll(REF)) {
    const path = m[1].trim().replace(/^\.\//, "");
    const total = lineCounts[path];
    if (!total) continue;
    let start = Number(m[2]), end = Number(m[3] ?? m[2]);
    if (end < start) [start, end] = [end, start];
    if (start >= 1 && start <= total) out.push({ ref: { path, start, end: Math.min(end, total) }, from: m.index!, to: m.index! + m[0].length });
  }
  return out;
}

// Backspace or Delete next to (or inside) a reference removes all of it, and the space it was set off with.
export function deleteRefAt(text: string, caret: number, forward: boolean, lineCounts: Record<string, number>): { text: string; cursor: number } | null {
  const hit = refSpans(text, lineCounts).find((s) => (forward ? caret >= s.from && caret < s.to : caret > s.from && caret <= s.to));
  if (!hit) return null;
  let { from, to } = hit;
  if (text[from - 1] === " " && (to >= text.length || /\s/.test(text[to]))) from--;
  else if (text[to] === " " && from === 0) to++;
  return { text: text.slice(0, from) + text.slice(to), cursor: from };
}

// Inserts a token at the cursor with a space either side where one is needed; returns the new text and cursor.
export function insertRef(text: string, at: number, end: number, r: Ref): { text: string; cursor: number } {
  const token = refToken(r);
  const before = text.slice(0, at), after = text.slice(end);
  const pre = before && !/\s$/.test(before) ? " " : "", post = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  const next = before + pre + token + post + after;
  return { text: next, cursor: (before + pre + token + post).length };
}
