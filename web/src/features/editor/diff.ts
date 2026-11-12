// The single replacement turning prev into next (common prefix/suffix trimmed), or null when nothing changed.
// Mirrors recording.diff on the server.
export interface Edit { f: number; to: number; s: string }

export function diff(prev: string, next: string): Edit | null {
  if (prev === next) return null;
  let start = 0;
  const limit = Math.min(prev.length, next.length);
  while (start < limit && prev[start] === next[start]) start++;
  let endPrev = prev.length, endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) { endPrev--; endNext--; }
  return { f: start, to: endPrev, s: next.slice(start, endNext) };
}

// The line of your code an error names: the innermost traceback frame that isn't LeetCode's driver, or a compile
// error's "line N".
export function errorLine(text: string): number | null {
  for (const m of String(text).matchAll(/\bline (\d+)(?: in (\S+))?/gi)) {
    if (m[2] === "_driver" || m[2] === "<module>") continue;
    return Number(m[1]);
  }
  return null;
}
