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
    autocompletion: autocomplete.autocompletion, completionKeymap: autocomplete.completionKeymap,
  };
}

// The SQL dialects a database problem can be judged in (LeetCode's slugs).
const SQL_DIALECTS = ["mysql", "postgresql", "mssql", "oraclesql"];
export const isSql = (lang?: string | null) => SQL_DIALECTS.includes(lang || "");

// A language as the feed names it ("C++", "Python3", "Go") or already a slug, as the slug; "" when unknown.
const FEED_NAMES: Record<string, string> = { "c++": "cpp", "c#": "csharp", go: "golang", python: "python3", "ms sql server": "mssql", oracle: "oraclesql" };
export function langSlug(name?: string | null) { const k = String(name || "").trim().toLowerCase(); return FEED_NAMES[k] || k; }

// A database problem's dialect, with the problem's tables and columns to complete. Loaded only for those.
export async function sqlLanguage(schema: Record<string, string[]>, lang = "mysql") {
  const { sql, MySQL, PostgreSQL, MSSQL, PLSQL, SQLDialect } = await import("@codemirror/lang-sql");
  const base = { postgresql: PostgreSQL, mssql: MSSQL, oraclesql: PLSQL }[lang] ?? MySQL;
  // Case-insensitive names, so completing `Address` or `firstName` doesn't wrap it in backticks.
  const dialect = SQLDialect.define({ ...base.spec, caseInsensitiveIdentifiers: true });
  return sql({ dialect, schema, upperCaseKeywords: true });
}

// Highlighting and indentation for a language, loaded the first time it is used. Python is the default for anything
// unlisted, and the languages CodeMirror has no package of its own for use its older stream parsers.
export async function languageFor(lang: string, schema: Record<string, string[]> = {}) {
  if (isSql(lang)) return sqlLanguage(schema, lang);
  const stream = async (mode: unknown) => (await import("@codemirror/language")).StreamLanguage.define(mode as never);
  switch (lang) {
    case "cpp": case "c": return (await import("@codemirror/lang-cpp")).cpp();
    case "java": return (await import("@codemirror/lang-java")).java();
    case "javascript": return (await import("@codemirror/lang-javascript")).javascript();
    case "typescript": return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "golang": return (await import("@codemirror/lang-go")).go();
    case "rust": return (await import("@codemirror/lang-rust")).rust();
    case "php": return (await import("@codemirror/lang-php")).php();
    case "csharp": return stream((await import("@codemirror/legacy-modes/mode/clike")).csharp);
    case "kotlin": return stream((await import("@codemirror/legacy-modes/mode/clike")).kotlin);
    case "scala": return stream((await import("@codemirror/legacy-modes/mode/clike")).scala);
    case "dart": return stream((await import("@codemirror/legacy-modes/mode/clike")).dart);
    case "swift": return stream((await import("@codemirror/legacy-modes/mode/swift")).swift);
    case "ruby": return stream((await import("@codemirror/legacy-modes/mode/ruby")).ruby);
    case "text": return [];
    default: return (await import("@codemirror/lang-python")).python();
  }
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
