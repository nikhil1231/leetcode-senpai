"use client";
// CodeMirror 6, loaded on demand (it is the heaviest thing on the page and only a run or a practical exercise needs it).
export async function loadCodeMirror() {
  const [state, view, commands, language, python, theme] = await Promise.all([
    import("@codemirror/state"), import("@codemirror/view"), import("@codemirror/commands"),
    import("@codemirror/language"), import("@codemirror/lang-python"), import("@codemirror/theme-one-dark"),
  ]);
  const autocomplete = await import("@codemirror/autocomplete");
  return {
    ...state, ...view, ...commands, ...language, python: python.python, oneDarkHighlightStyle: theme.oneDarkHighlightStyle,
    closeBrackets: autocomplete.closeBrackets, closeBracketsKeymap: autocomplete.closeBracketsKeymap,
  };
}
export type CM = Awaited<ReturnType<typeof loadCodeMirror>>;
export const preloadCodeMirror = () => { loadCodeMirror().catch(() => {}); };

// Decorations drawn over the buffer, never in it: the code and its log are untouched. A live hint points at up to two
// lines (a tint and a ghost margin note); an error marks the line it names until the next Run or Submit.
export function lineMarks(CM: CM) {
  const set = CM.StateEffect.define<import("@codemirror/view").DecorationSet>();
  class Note extends CM.WidgetType {
    constructor(readonly text: string) { super(); }
    eq(other: Note) { return other.text === this.text; }
    toDOM() { const el = document.createElement("span"); el.className = "cm-hint-note"; el.textContent = `# ${this.text}`; return el; }
  }
  const field = CM.StateField.define<import("@codemirror/view").DecorationSet>({
    create: () => CM.Decoration.none,
    update(deco, tr) { deco = deco.map(tr.changes); for (const e of tr.effects) if (e.is(set)) deco = e.value; return deco; },
    provide: (f) => CM.EditorView.decorations.from(f),
  });
  return { field, set, Note };
}

// The line a mark meant: where it was if the text still matches, else the nearest line with that text.
export function findLine(doc: import("@codemirror/state").Text, mark: { line: number; text: string }) {
  const fits = (n: number) => n >= 1 && n <= doc.lines && doc.line(n).text === mark.text;
  if (fits(mark.line)) return doc.line(mark.line);
  for (let d = 1; d < doc.lines; d++) {
    if (fits(mark.line - d)) return doc.line(mark.line - d);
    if (fits(mark.line + d)) return doc.line(mark.line + d);
  }
  return null;
}

// Undo/redo keys with redo on Mod-Shift-z (Ctrl+Shift+Z, ⌘+Shift+Z on macOS) and nothing else: CodeMirror's own
// historyKeymap puts redo on Ctrl+Y on Windows/Linux and its Ctrl+Shift+Z binding is Linux-only.
export function historyKeys(CM: CM) {
  const redo = CM.historyKeymap.find((b) => b.key === "Mod-y")?.run;
  return [...CM.historyKeymap.filter((b) => b.key !== "Mod-y" && !b.linux), { key: "Mod-Shift-z", run: redo, preventDefault: true }];
}
