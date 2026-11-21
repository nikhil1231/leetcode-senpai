// Code references inside an explanation: "[worker.py:42-58]". The text is the storage (typed, spoken and clicked
// references are all the same characters), and the structured form is read back from it; the server parses the same way.
export interface Ref { path: string; start: number; end: number }

const REF = /\[([^[\]\s:][^[\]:]*?):(\d+)(?:\s*[-–]\s*(\d+))?\]/g;

export const refToken = (r: Ref) => (r.end > r.start ? `[${r.path}:${r.start}-${r.end}]` : `[${r.path}:${r.start}]`);

// References to files that exist and lines that are in range, in order of appearance.
export function parseRefs(text: string, lineCounts: Record<string, number>): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(REF)) {
    const path = m[1].trim().replace(/^\.\//, "");
    const total = lineCounts[path];
    if (!total) continue;
    let start = Number(m[2]), end = Number(m[3] ?? m[2]);
    if (end < start) [start, end] = [end, start];
    if (start >= 1 && start <= total) out.push({ path, start, end: Math.min(end, total) });
  }
  return out;
}

// Inserts a token at the cursor with a space either side where one is needed; returns the new text and cursor.
export function insertRef(text: string, at: number, end: number, r: Ref): { text: string; cursor: number } {
  const token = refToken(r);
  const before = text.slice(0, at), after = text.slice(end);
  const pre = before && !/\s$/.test(before) ? " " : "", post = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  const next = before + pre + token + post + after;
  return { text: next, cursor: (before + pre + token + post).length };
}
