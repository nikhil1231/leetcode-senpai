// Finding a highlighted passage again on a later visit (page notes). The page's text is flattened with all whitespace
// removed, so layout and rendering differences between visits don't matter, and each kept character remembers its text
// node and offset. A passage is its exact text plus a little before and after to tell repeats apart.
export type Anchor = { exact: string; prefix: string; suffix: string };
export type Flat = { text: string; nodes: Text[]; starts: number[]; node: number[]; offset: number[] };

const CONTEXT = 32;
export const squash = (s: string) => s.replace(/\s+/g, "");

// Where `exact` occurs in `text`, preferring the occurrence whose neighbours match the prefix and suffix best; -1 if absent.
export function bestMatch(text: string, a: Anchor): number {
  if (!a.exact) return -1;
  let best = -1, score = -1;
  for (let i = text.indexOf(a.exact); i >= 0; i = text.indexOf(a.exact, i + 1)) {
    let s = 0;
    while (s < a.prefix.length && text[i - 1 - s] === a.prefix[a.prefix.length - 1 - s]) s++;
    const end = i + a.exact.length;
    for (let k = 0; k < a.suffix.length && text[end + k] === a.suffix[k]; k++) s++;
    if (s > score) { best = i; score = s; }
  }
  return best;
}

export function flatten(root: Node, skip: string): Flat {
  const flat: Flat = { text: "", nodes: [], starts: [], node: [], offset: [] };
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && !n.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const parts: string[] = [];
  while (walk.nextNode()) {
    const t = walk.currentNode as Text, i = flat.nodes.length;
    flat.nodes.push(t);
    flat.starts.push(flat.node.length);
    for (let k = 0; k < t.data.length; k++) {
      if (/\s/.test(t.data[k])) continue;
      parts.push(t.data[k]); flat.node.push(i); flat.offset.push(k);
    }
  }
  flat.text = parts.join("");
  return flat;
}

// The flat index of a DOM boundary point (a Range's start or end).
export function locate(flat: Flat, container: Node, offset: number): number {
  const i = flat.nodes.indexOf(container as Text);
  if (i >= 0) return flat.starts[i] + squash((container as Text).data.slice(0, offset)).length;
  const at = document.createRange();
  at.setStart(container, offset);
  const next = flat.nodes.findIndex((n) => at.comparePoint(n, 0) >= 0);
  return next < 0 ? flat.text.length : flat.starts[next];
}

export function anchorOf(flat: Flat, range: Range): Anchor | null {
  const s = locate(flat, range.startContainer, range.startOffset), e = locate(flat, range.endContainer, range.endOffset);
  if (e <= s) return null;
  return { exact: flat.text.slice(s, e), prefix: flat.text.slice(Math.max(0, s - CONTEXT), s), suffix: flat.text.slice(e, e + CONTEXT) };
}

export function rangeOf(flat: Flat, a: Anchor): Range | null {
  const s = bestMatch(flat.text, a);
  if (s < 0) return null;
  const e = s + a.exact.length - 1, r = document.createRange();
  r.setStart(flat.nodes[flat.node[s]], flat.offset[s]);
  r.setEnd(flat.nodes[flat.node[e]], flat.offset[e] + 1);
  return r;
}
