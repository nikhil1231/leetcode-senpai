"use client";
import { useEffect, useRef, useState } from "react";
import { languageFor, loadCodeMirror, type CM } from "@/features/editor/codemirror";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export interface Focus { start: number; end: number; n: number }
const SLUG: Record<string, string> = { go: "golang" };

// One file in CodeMirror. Read-only for reading exercises; editable when the exercise is being repaired. Clicking a line
// number reports that line (shift-click extends it from the last one), selecting text offers a reference button over it, and `focus`
// scrolls to and tints a range, which is how a reference token takes you back to the code.
export function CodeViewer({ path, code, language, readOnly = true, focus, onChange, onPick, onReference }: {
  path: string; code: string; language: string; readOnly?: boolean; focus?: Focus | null;
  onChange?: (code: string) => void; onPick: (start: number, end: number, extend: boolean) => void;
  onReference?: (range: { start: number; end: number }) => void;   // when given, selecting text offers a button over it
}) {
  const host = useRef<HTMLDivElement>(null);
  const cm = useRef<{ CM: CM; view: Any; set: Any } | null>(null);
  const cb = useRef({ onChange, onPick, onReference });
  cb.current = { onChange, onPick, onReference };
  const last = useRef(1);
  const [failure, setFailure] = useState("");
  const [sel, setSel] = useState<{ start: number; end: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let destroyed = false, view: Any = null;
    Promise.all([loadCodeMirror(), languageFor(/\.(md|txt)$/i.test(path) ? "text" : SLUG[language] || language)]).then(([CM, lang]) => {
      if (destroyed || !host.current) return;
      const set = CM.StateEffect.define();
      const field = CM.StateField.define({
        create: () => CM.Decoration.none,
        update(deco: Any, tr: Any) { deco = deco.map(tr.changes); for (const e of tr.effects) if (e.is(set)) deco = e.value; return deco; },
        provide: (f: Any) => CM.EditorView.decorations.from(f),
      });
      const pick = (v: Any, line: Any, ev: Event) => {
        const e = ev as MouseEvent;
        const n = v.state.doc.lineAt(line.from).number;
        const from = e.shiftKey ? Math.min(last.current, n) : n, to = e.shiftKey ? Math.max(last.current, n) : n;
        last.current = n; cb.current.onPick(from, to, e.shiftKey); return true;
      };
      // The button sits just above the selection's first line (below its last when there is no room above).
      const place = (v: Any) => {
        const s = v.state.selection.main, h = host.current;
        if (s.empty || !h || !cb.current.onReference) { setSel(null); return; }
        const a = v.coordsAtPos(s.from), b = v.coordsAtPos(s.to), box = h.getBoundingClientRect();
        if (!a || !b || a.top > box.bottom || b.bottom < box.top) { setSel(null); return; }
        const above = a.top - box.top - 34;
        const y = above >= 0 ? above : Math.min(b.bottom - box.top + 6, box.height - 32);
        const x = Math.max(4, Math.min(a.left - box.left, box.width - 170));
        setSel({ start: v.state.doc.lineAt(s.from).number, end: v.state.doc.lineAt(s.to).number, x, y });
      };
      view = new CM.EditorView({
        parent: host.current,
        state: CM.EditorState.create({
          doc: code,
          extensions: [
            CM.lineNumbers({ domEventHandlers: { mousedown: pick } }), CM.highlightSpecialChars(), CM.drawSelection(), CM.indentUnit.of("    "), lang,
            CM.syntaxHighlighting(CM.oneDarkHighlightStyle), CM.EditorView.lineWrapping, field,
            ...(readOnly ? [CM.EditorState.readOnly.of(true), CM.EditorView.editable.of(true)] : [CM.history(), CM.closeBrackets(), CM.keymap.of([...CM.closeBracketsKeymap, ...CM.defaultKeymap, CM.indentWithTab, ...CM.historyKeymap]), CM.highlightActiveLine()]),
            CM.EditorView.updateListener.of((u: Any) => {
              if (u.docChanged) cb.current.onChange?.(u.state.doc.toString());
              if (u.selectionSet || u.docChanged || u.viewportChanged || u.geometryChanged) place(u.view);
            }),
            CM.EditorView.domEventHandlers({ scroll: (_: Event, v: Any) => { place(v); return false; } }),
          ],
        }),
      });
      cm.current = { CM, view, set };
      applyFocus();
    }).catch((e) => setFailure(e.message || "The code viewer failed to load."));
    return () => { destroyed = true; view?.destroy(); cm.current = null; };
    // A new file or language builds a new viewer; the document is edited in place afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, language, readOnly]);

  const applyFocus = () => {
    const c = cm.current;
    if (!c) return;
    const doc = c.view.state.doc;
    if (!focus || focus.start < 1 || focus.start > doc.lines) { c.view.dispatch({ effects: c.set.of(c.CM.Decoration.none) }); return; }
    const end = Math.min(focus.end, doc.lines);
    const marks = [];
    for (let n = focus.start; n <= end; n++) marks.push(c.CM.Decoration.line({ class: "cm-ref-line" }).range(doc.line(n).from));
    c.view.dispatch({ effects: [c.set.of(c.CM.Decoration.set(marks)), c.CM.EditorView.scrollIntoView(doc.line(focus.start).from, { y: "center" })] });
  };
  useEffect(applyFocus, [focus?.n, focus?.start, focus?.end]);   // eslint-disable-line react-hooks/exhaustive-deps

  // External edits (a reset, a restored file) replace the document without rebuilding the viewer.
  useEffect(() => {
    const c = cm.current;
    if (c && c.view.state.doc.toString() !== code) c.view.dispatch({ changes: { from: 0, to: c.view.state.doc.length, insert: code } });
  }, [code]);

  if (failure) return <p className="cw-error">{failure}</p>;
  return (
    <div className="cw-cm-wrap">
      <div className="cw-cm" ref={host} data-path={path} />
      {sel && onReference && (
        <button className="button is-small cw-selref" type="button" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => onReference({ start: sel.start, end: sel.end })}>
          Reference line{sel.end > sel.start ? `s ${sel.start}-${sel.end}` : ` ${sel.start}`}
        </button>
      )}
    </div>
  );
}
