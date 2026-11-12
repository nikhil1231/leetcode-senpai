"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLayout, useEditorUi, STATEMENT_PCT, CONSOLE_PX } from "./editor-store";
import { errorLine } from "./diff";
import { EditorRun, FLUSH_MS, TICK_MS } from "./session";
import { findLine, historyKeys, lineMarks, loadCodeMirror, type CM } from "./codemirror";
import { sanitizeProblemHtml } from "@/components/ProblemStatement";
import type { Active, EditorPayload } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { useUi } from "@/lib/ui-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
const SECTIONS: [string, string, RegExp | null][] = [["statement", "Statement", null], ["examples", "Examples", /^Example\b/i], ["constraints", "Constraints", /^Constraints\b/i]];

// The statement as one scroll, with tabs that jump to its Examples and Constraints, found by their headings.
function statementParts(html: string) {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<div>${html}</div>`;
  const box = tpl.content.firstChild as HTMLElement;
  const found: [string, string][] = [];
  for (const [key, label, re] of SECTIONS) {
    if (!re) continue;
    const head = [...box.querySelectorAll("strong, b")].find((el) => re.test((el.textContent || "").trim()));
    if (!head) continue;
    let el = head as HTMLElement;
    while (el.parentElement && el.parentElement !== box) el = el.parentElement;
    el.dataset.sec = key;
    found.push([key, label]);
  }
  return { html: box.innerHTML, tabs: found.length ? [[SECTIONS[0][0], SECTIONS[0][1]] as [string, string], ...found] : [] };
}

function Block({ label, value, cls = "" }: { label: string; value: unknown; cls?: string }) {
  if (value == null || value === "") return null;
  return <div className={`editor-io ${cls}`}><span>{label}</span><pre>{String(value)}</pre></div>;
}

function Statement({ state, url, hidden, onHide, onShow }: { state: EditorPayload; url?: string; hidden: boolean; onHide: () => void; onShow: () => void }) {
  const parts = useMemo(() => { const raw = sanitizeProblemHtml(state.content_html); return raw ? statementParts(raw) : { html: "", tabs: [] as [string, string][] }; }, [state.content_html]);
  const body = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState("statement");
  const picked = useRef<string | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = (key: string) => (key === "statement" ? body.current : body.current?.querySelector<HTMLElement>(`[data-sec="${key}"]`)) as HTMLElement;
  const top = (el: HTMLElement) => (el === body.current ? 0 : el.offsetTop - (body.current as HTMLElement).offsetTop - 12);
  const spy = () => {
    const b = body.current;
    if (!b || picked.current || !parts.tabs.length) return;
    let cur = "statement";
    for (const [k] of parts.tabs) if (k !== "statement" && top(target(k)) <= b.scrollTop + 4) cur = k;
    if (b.scrollTop > 0 && b.scrollTop + b.clientHeight >= b.scrollHeight - 2) cur = parts.tabs[parts.tabs.length - 1][0];
    setLit(cur);
  };
  void hidden;
  return (
    <>
      <div className="editor-statement">
        <div className="pane-head">
          <div className="pane-tabs" role="tablist">
            {parts.tabs.length ? parts.tabs.map(([key, label]) => (
              <button key={key} className="pane-tab" type="button" role="tab" data-sec={key} aria-selected={lit === key}
                onClick={() => { picked.current = key; setLit(key); if (release.current) clearTimeout(release.current); release.current = setTimeout(() => { picked.current = null; }, 800); body.current?.scrollTo({ top: top(target(key)), behavior: "smooth" }); }}>{label}</button>
            )) : <span className="pane-title">Statement</span>}
          </div>
          <button id="editor-hide-statement" className="panel-toggle" type="button" aria-label="Hide the statement" title="Hide the statement" onClick={onHide}>&#x2039;</button>
        </div>
        <div id="editor-statement-body" ref={body} className="editor-statement-body recall-statement" onScroll={spy}>
          {parts.html ? <div dangerouslySetInnerHTML={{ __html: parts.html }} /> : <p className="small">Statement unavailable — it&apos;s on LeetCode.</p>}
          <p className="editor-lc">{url && <a className="editor-lc-link" href={url} target="_blank" rel="noopener">Open on LeetCode ↗</a>}</p>
        </div>
      </div>
      <button id="editor-show-statement" className="panel-rail" type="button" title="Show the statement" onClick={onShow}><span>&#x203A;</span><span className="panel-rail-label">Statement</span></button>
    </>
  );
}

type ResultView = { kind: "none" } | { kind: "pending"; text: string } | { kind: "error"; message: string } | { kind: "doubts"; doubts: string[] } | { kind: "run"; r: Any } | { kind: "submit"; r: Any };

function Result({ view, onRun, onSubmit, onAddCase }: { view: ResultView; onRun: () => void; onSubmit: () => void; onAddCase: (input: string) => void }) {
  const [pickedCase, setPickedCase] = useState<number | null>(null);
  useEffect(() => { setPickedCase(null); }, [view]);
  if (view.kind === "none") return <p className="small editor-pending">Run ({MOD}&apos;) to see each case here.</p>;
  if (view.kind === "pending") return <p className="small editor-pending">{view.text}</p>;
  if (view.kind === "error") return <p className="editor-verdict is-bad">{view.message}</p>;
  if (view.kind === "doubts") {
    return (
      <div className="editor-confirm"><p><b>Submit anyway?</b></p>{view.doubts.map((d) => <p className="small" key={d}>{d}</p>)}
        <div className="editor-confirm-actions"><button id="editor-confirm-run" className="button is-small" type="button" onClick={onRun}>Run first</button>
          <button id="editor-confirm-submit" className="button is-small is-primary" type="button" onClick={onSubmit}>Submit anyway</button>
          <span className="small">or Ctrl/⌘ + Enter again</span></div></div>
    );
  }
  if (view.kind === "submit") {
    const r = view.r, good = r.accepted;
    const beats = [r.runtime_percentile != null ? `runtime beats ${Math.round(r.runtime_percentile)}%` : "", r.memory_percentile != null ? `memory beats ${Math.round(r.memory_percentile)}%` : ""].filter(Boolean).map((b) => ` · ${b}`).join("");
    return (
      <>
        <p className={`editor-verdict ${good ? "is-good" : "is-bad"}`}>{r.status || ""} <span className="small">{r.correct ?? "?"}/{r.total ?? "?"} tests{beats}</span></p>
        <Block label="Error" value={r.error} cls="is-error" />
        <div className="editor-io-split"><div className="editor-io-main"><Block label="Failing input" value={r.input} /><Block label="Output" value={r.output} cls="is-off" /><Block label="Expected" value={r.expected} /></div><div><Block label="Stdout" value={r.stdout} /></div></div>
        {!good && r.input && <button id="editor-add-case" className="button is-small" type="button" onClick={() => onAddCase(r.input)}>Add to test input</button>}
      </>
    );
  }
  const r = view.r;
  const cases: Any[] = r.error ? [] : r.cases || [];
  const ok = (c: Any) => c.ok ?? c.output === c.expected;
  const sel = pickedCase ?? Math.max(0, cases.findIndex((c) => !ok(c)));
  return (
    <>
      {r.error ? (
        <>
          <p className="editor-verdict is-bad">{r.status || "Error"}</p>{r.error !== r.status && <pre className="editor-error">{r.error}</pre>}
          <Block label="Failing input" value={r.input} />{(r.stdout || []).map((out: string, i: number) => <Block key={i} label={`Stdout · case ${i + 1}`} value={out} />)}
        </>
      ) : <p className={`editor-verdict ${r.passed ? "is-good" : "is-bad"}`}>{r.passed ? "All cases match" : "Mismatch"} <span className="small">{r.correct ?? 0}/{r.total} cases · {r.runtime || ""}</span></p>}
      {cases.length > 0 && (
        <>
          <div className="editor-case-tabs" role="tablist">{cases.map((c, i) => (
            <button key={i} className={`editor-case-tab ${ok(c) ? "is-good" : "is-bad"}`} type="button" role="tab" aria-selected={i === sel} onClick={() => setPickedCase(i)}>{ok(c) ? "✓" : "✗"} Case {i + 1}</button>))}</div>
          <div id="editor-case" role="tabpanel">
            <div className="editor-io-split"><div className="editor-io-main"><Block label="Input" value={cases[sel].input} /><Block label="Output" value={cases[sel].output} cls={ok(cases[sel]) ? "" : "is-off"} /><Block label="Expected" value={cases[sel].expected} /></div>
              <div><Block label="Stdout" value={cases[sel].stdout} /></div></div>
          </div>
        </>
      )}
    </>
  );
}

// The in-app editor for a live run: the statement, a CodeMirror buffer, and Run / Submit judged by LeetCode through the
// server. A new run opens before the server has it: mounted from what the plan modal prefetched, under no session id,
// until the start answers and it's adopted. Nothing reaches the server until then.
export function EditorPane({ active, prefetched }: { active: Active; prefetched: EditorPayload | null }) {
  const toast = useToast();
  const setCookie = useUi((s) => s.setCookie);
  const layout = useLayout((s) => s.layout);
  const patch = useLayout((s) => s.patch);
  const setEd = useEditorUi((s) => s.set);
  const canJudge = useEditorUi((s) => s.canJudge);
  const [state, setState] = useState<EditorPayload | null>(prefetched);
  const [failure, setFailure] = useState<string | null>(null);
  const [tab, setTab] = useState<"tests" | "result">("tests");
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [view, setView] = useState<ResultView>({ kind: "none" });
  const [notice, setNotice] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const run = useRef<EditorRun | null>(null);
  const cm = useRef<{ CM: CM; view: Any; marks: Any; errorMark: Any; readOnly: Any } | null>(null);
  const live = useRef({ judging: false, confirming: false, runsLeft: null as number | null, edges: [] as string[], readOnlyNow: false, starter: "" });
  const pane = useRef<HTMLDivElement>(null);
  const sessionId = active.session_id as string | null;

  // The run object lives for the life of the pane (one pane per run; a new run remounts it).
  if (!run.current) run.current = new EditorRun(sessionId, active.slug, active.started_at);
  const r = run.current;

  useEffect(() => { useLayout.getState().hydrate(); }, []);

  // Fetch the state when the plan modal had none (a very fast lock-in) and the run now exists.
  useEffect(() => {
    if (state || !sessionId) return;
    let cancelled = false;
    api(`/editor/state?session_id=${encodeURIComponent(sessionId)}`).then((s) => { if (!cancelled) setState(s); }).catch((e) => { if (!cancelled) setFailure(e.message); });
    return () => { cancelled = true; };
  }, [state, sessionId]);
  // A start's own copy of the state replaces a plan-modal prefetch when it lands.
  useEffect(() => { if (prefetched && state && prefetched !== state && sessionId && r.sessionId === null) setState(prefetched); }, [prefetched, state, sessionId, r]);

  // The pending run now exists on the server: take its id and clock.
  useEffect(() => { if (sessionId && !r.sessionId) r.adopt(sessionId, active.started_at, state?.now_ms); }, [sessionId, r, active.started_at, state]);

  const showConsole = useCallback((t: "tests" | "result") => { setTab(t); if (useLayout.getState().layout.console) patch({ console: false }); }, [patch]);
  const markTruncated = useCallback(() => { if (r.truncated) return; r.truncated = true; setNotice("This run's edit log is full — Run and Submit still work, but the review will only see the first part."); }, [r]);

  const showErrorLine = useCallback((n: number | null) => {
    const c = cm.current; if (!c) return;
    const doc = c.view.state.doc;
    const ok = n != null && n >= 1 && n <= doc.lines;
    const ranges = ok ? [c.CM.Decoration.line({ class: "cm-error-line" }).range(doc.line(n as number).from)] : [];
    const effects: Any[] = [c.errorMark.set.of(c.CM.Decoration.set(ranges))];
    if (ok) effects.push(c.CM.EditorView.scrollIntoView(doc.line(n as number).from, { y: "center" }));
    c.view.dispatch({ effects });
  }, []);

  const showMarks = useCallback((marks: { line: number; text: string; note: string }[]) => {
    const c = cm.current; if (!c) return 0;
    const doc = c.view.state.doc;
    const lines: { line: Any; note: string }[] = [];
    for (const m of marks || []) {
      const line = findLine(doc, m);
      if (line && !lines.some((l) => l.line.number === line.number)) lines.push({ line, note: m.note });
    }
    lines.sort((a, b) => a.line.from - b.line.from);
    const ranges = lines.flatMap(({ line, note }) => [c.CM.Decoration.line({ class: "cm-hint-line" }).range(line.from), c.CM.Decoration.widget({ widget: new c.marks.Note(note), side: 1 }).range(line.to)]);
    const effects: Any[] = [c.marks.set.of(c.CM.Decoration.set(ranges, true))];
    if (lines.length) effects.push(c.CM.EditorView.scrollIntoView(lines[0].line.from, { y: "center" }));
    c.view.dispatch({ effects });
    return lines.length;
  }, []);

  const judge = useCallback((kind: "run" | "submit") => {
    const L = live.current;
    if (!cm.current || L.judging) return;
    r.tick();
    if (kind === "run" && L.runsLeft === 0) { showConsole("result"); setView({ kind: "error", message: "Interview mode: no Runs left — trace it by hand, then submit." }); return; }
    if (kind === "submit" && !L.confirming) {
      const doubts = r.submitDoubts(L.edges, L.runsLeft);
      if (doubts.length) { L.confirming = true; showConsole("result"); setView({ kind: "doubts", doubts }); return; }
    }
    L.confirming = false; L.judging = true;
    setEd({ judging: true }); showErrorLine(null); showConsole("result"); setView({ kind: "pending", text: `${kind === "run" ? "Running" : "Judging"}…` });
    r.judge(kind, input).then(({ res, code }) => {
      if (res.runs_left != null) { L.runsLeft = res.runs_left; setEd({ runsLeft: res.runs_left }); }
      if (!res.ok) { setView({ kind: "error", message: res.error }); return; }
      if (res.truncated) markTruncated();
      if (kind === "run") r.lastRunCode = code; else r.submits += 1;
      r.persist();
      if (kind === "run") { setView({ kind: "run", r: res.result }); if (res.result.error) showErrorLine(errorLine(res.result.error)); }
      else { setView({ kind: "submit", r: res.result }); if (res.result.error) showErrorLine(errorLine(res.result.error)); }
      if (res.attempt_id) { EditorRun.forget(r.sessionId as string); r.finished = true; window.dispatchEvent(new CustomEvent("editor-solved", { detail: res })); }
    }).catch((e) => setView({ kind: "error", message: e.message || "Couldn't reach the server." })).finally(() => { L.judging = false; setEd({ judging: false }); });
  }, [r, input, showConsole, showErrorLine, markTruncated, setEd]);
  const judgeRef = useRef(judge); judgeRef.current = judge;

  // Build the buffer once the state and CodeMirror are in.
  useEffect(() => {
    if (!state || !state.available || !host.current || cm.current) return;
    let destroyed = false;
    loadCodeMirror().then((CM) => {
      if (destroyed || !host.current) return;
      if (state.now_ms != null) r.offsetMs = state.now_ms - (Date.now() - r.startedAtMs);
      setEd({ canJudge: !!state.can_judge, runsLeft: state.runs_left ?? null });
      const saved = r.sessionId ? EditorRun.restore(r.sessionId) : null;
      let doc: string = state.code;
      let inp: string = state.last_input ?? (state.example_testcases || []).join("\n");
      let chk: string[] = state.edges_checked || [];
      // This browser's copy wins unless another device has logged past it.
      if (saved && Number.isInteger(saved.seq) && saved.seq >= state.seq) {
        Object.assign(r, { lastLogged: saved.lastLogged, queue: saved.queue || [], inflight: saved.inflight || null, seq: saved.seq });
        doc = saved.code;
        if (typeof saved.input === "string") inp = saved.input;
        if (Array.isArray(saved.checked)) chk = saved.checked;
        r.lastRunCode = saved.lastRunCode ?? null; r.submits = saved.submits || 0;
      } else Object.assign(r, { lastLogged: state.code, seq: state.seq });
      r.input = inp; r.checked = chk; setInput(inp); setChecked(chk);
      live.current = { judging: false, confirming: false, runsLeft: state.runs_left ?? null, edges: state.planned_edge_cases || [], readOnlyNow: false, starter: state.starter_code };
      const marks = lineMarks(CM), errorMark = lineMarks(CM), readOnly = new CM.Compartment();
      const view = new CM.EditorView({
        parent: host.current,
        state: CM.EditorState.create({
          doc,
          extensions: [
            CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(), CM.history(), CM.drawSelection(), CM.indentOnInput(),
            CM.highlightActiveLine(), CM.indentUnit.of("    "), CM.python(),
            // Interview mode is a plain buffer: what a shared doc or whiteboard gives you.
            ...(state.interview ? [] : [CM.bracketMatching(), CM.closeBrackets(), CM.syntaxHighlighting(CM.oneDarkHighlightStyle)]),
            CM.keymap.of([
              { key: "Mod-'", run: () => { judgeRef.current("run"); return true; } },
              { key: "Mod-Enter", run: () => { judgeRef.current("submit"); return true; } },
              ...(state.interview ? [] : CM.closeBracketsKeymap), ...CM.defaultKeymap, ...historyKeys(CM), CM.indentWithTab,
            ]),
            readOnly.of(CM.EditorState.readOnly.of(false)), marks.field, errorMark.field, CM.EditorView.theme({}, { dark: true }),
          ],
        }),
      });
      cm.current = { CM, view, marks, errorMark, readOnly };
      r.getCode = () => view.state.doc.toString();
      if (state.truncated) markTruncated();
      timers.push(setInterval(() => r.tick(), TICK_MS), setInterval(() => r.flush(markTruncated), FLUSH_MS));
      r.flush(markTruncated);
      setReady((n) => n + 1);
    }).catch((e) => setFailure(e.message || "The editor failed to load."));
    const timers: ReturnType<typeof setInterval>[] = [];
    return () => { destroyed = true; timers.forEach(clearInterval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const [, setReady] = useState(0);

  // Paused: a frozen buffer, no coding off the clock.
  useEffect(() => {
    const c = cm.current; if (!c) return;
    live.current.readOnlyNow = !!active.is_paused;
    c.view.dispatch({ effects: c.readOnly.reconfigure(c.CM.EditorState.readOnly.of(!!active.is_paused)) });
  });

  // Away is the tab hidden or another window in front of it, whichever says so first.
  useEffect(() => {
    let away = false;
    const goAway = () => { if (away || !cm.current) return; away = true; r.tick(); r.note("blur"); r.flush(markTruncated); };
    const comeBack = () => { if (!away) return; if (document.visibilityState === "hidden" || !document.hasFocus()) return; away = false; r.note("focus"); };
    const vis = () => (document.visibilityState === "hidden" ? goAway() : comeBack());
    document.addEventListener("visibilitychange", vis); window.addEventListener("blur", goAway); window.addEventListener("focus", comeBack);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", goAway); window.removeEventListener("focus", comeBack); };
  }, [r, markTruncated]);

  // The handle the header and the coach use.
  useEffect(() => {
    setEd({ api: {
      judge: (k) => judgeRef.current(k),
      code: () => (cm.current ? r.currentCode() : null),
      tick: () => r.tick(), flush: () => r.flush(markTruncated),
      showMarks, clearMarks: () => { showMarks([]); },
      discard: (id) => { if (id) { if (r.sessionId === id) r.finished = true; EditorRun.forget(id); } },
      setCanJudge: (on) => { if (on) setEd({ canJudge: true }); },
    } });
    return () => {
      r.tick(); r.abandon(); void r.flush();
      cm.current?.view.destroy(); cm.current = null;
      setEd({ api: null, canJudge: false, judging: false, runsLeft: null });
    };
  }, [r, setEd, showMarks, markTruncated]);

  useEffect(() => { r.input = input; r.persist(); }, [input, r]);

  const resetToStarter = () => {
    const c = cm.current, L = live.current;
    if (!c || L.readOnlyNow || !L.starter) return;
    r.tick();
    if (r.lastLogged === L.starter) return;
    c.view.dispatch({ changes: { from: 0, to: c.view.state.doc.length, insert: L.starter } });
    r.note("reset"); r.queue.push({ t: r.nowMs(), k: "c", code: L.starter }); r.lastLogged = L.starter; r.persist();
    toast("Back to the starter code — Ctrl/⌘ + Z undoes it.");
  };
  const addCase = (inp: string) => {
    showConsole("tests");
    const cur = input.replace(/\s+$/, "");
    if (!cur.includes(inp.trim())) setInput(cur ? `${cur}\n${inp.trim()}` : inp.trim());
    toast("Added to the test input");
  };
  const tickEdge = (c: string, on: boolean) => {
    const next = checked.filter((x) => x !== c).concat(on ? [c] : []);
    r.checked = next; setChecked(next); r.note("edge", { case: c, on });
  };

  // Layout: folded panels and widths are per-browser preferences.
  useEffect(() => {
    const p = pane.current; if (!p) return;
    const w = Math.min(STATEMENT_PCT.max, Math.max(STATEMENT_PCT.min, Number(layout.pct) || STATEMENT_PCT.def));
    p.style.setProperty("--statement-w", `${w}%`);
    const ch = Number(layout.consoleH) ? Math.round(Math.max(CONSOLE_PX.min, Number(layout.consoleH))) : null;
    if (ch) p.style.setProperty("--console-h", `${ch}px`); else p.style.removeProperty("--console-h");
  }, [layout]);
  const drag = (el: HTMLElement | null, onMove: (e: PointerEvent) => void) => (e: React.PointerEvent) => {
    e.preventDefault(); const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(ev); const up = () => { t.removeEventListener("pointermove", move); t.removeEventListener("pointerup", up); };
    t.addEventListener("pointermove", move); t.addEventListener("pointerup", up); void el;
  };

  if (failure) return <p className="small">{failure} {active.url && <a className="editor-lc-link" href={active.url} target="_blank" rel="noopener">Solve it on LeetCode instead ↗</a>}</p>;
  if (!state) return <p className="small">Opening the editor…</p>;
  if (!state.available) return <p className="small">This problem can&apos;t be edited here yet — <a className="editor-lc-link" href={active.url} target="_blank" rel="noopener">solve it on LeetCode ↗</a></p>;
  const edges: string[] = state.planned_edge_cases || [];
  const consoleHeight = () => (document.getElementById("editor-console")?.getBoundingClientRect().height ?? 0);
  const setH = (h: number | null) => {
    const work = pane.current?.querySelector(".editor-work")?.getBoundingClientRect();
    if (h != null && work) h = Math.min(work.height - CONSOLE_PX.editor, Math.max(CONSOLE_PX.min, h));
    patch({ consoleH: h });
  };
  const pct = Number(layout.pct) || STATEMENT_PCT.def;

  return (
    <div ref={pane} id="editor-pane" className={`editor-pane${layout.hidden ? " statement-hidden" : ""}${layout.console ? " console-folded" : ""}${active.is_paused ? " is-paused" : ""}`}>
      <Statement state={state} url={active.url} hidden={!!layout.hidden} onHide={() => patch({ hidden: true })} onShow={() => patch({ hidden: false })} />
      <div id="editor-split" className="editor-split" role="separator" aria-orientation="vertical" aria-label="Resize the statement" tabIndex={0} title="Drag to resize · double-click to reset"
        onPointerDown={(e) => { const box = pane.current!.getBoundingClientRect(); drag(null, (ev) => patch({ pct: Math.round((((ev.clientX - box.left) / box.width) * 100) * 10) / 10 }))(e); }}
        onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); patch({ pct: pct + (e.key === "ArrowLeft" ? -2 : 2) }); }}
        onDoubleClick={() => patch({ pct: STATEMENT_PCT.def })} />
      <div className="editor-work">
        {state.optimizing && (
          <p className="small editor-optimizing">Optimizing your Accepted — runtime beats <b>{state.optimizing.runtime_percentile == null ? "—" : `${Math.round(state.optimizing.runtime_percentile)}%`}</b>,
            memory <b>{state.optimizing.memory_percentile == null ? "—" : `${Math.round(state.optimizing.memory_percentile)}%`}</b>. A better Accepted replaces it; Stop optimizing keeps it.</p>
        )}
        <div id="editor-cm" className="editor-cm" ref={host} />
        {notice && <p id="editor-notice" className="small editor-notice">{notice}</p>}
        <div id="console-split" className="console-split" role="separator" aria-orientation="horizontal" aria-label="Resize the console" tabIndex={0} title="Drag to resize · double-click to reset"
          onPointerDown={(e) => { const bottom = pane.current!.querySelector(".editor-work")!.getBoundingClientRect().bottom; drag(null, (ev) => setH(bottom - ev.clientY))(e); }}
          onKeyDown={(e) => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); setH(consoleHeight() + (e.key === "ArrowUp" ? 20 : -20)); }}
          onDoubleClick={() => setH(null)} />
        <div id="editor-console" className="editor-console">
          <div className="console-head">
            <div className="pane-tabs" role="tablist">
              <button className="pane-tab" type="button" role="tab" aria-selected={tab === "tests"} onClick={() => showConsole("tests")}>Tests</button>
              <button className="pane-tab" type="button" role="tab" aria-selected={tab === "result"} onClick={() => showConsole("result")}>Result</button>
            </div>
            <div className="console-tools">
              {state.interview && <span className="editor-mode" title="No highlighting or auto-closing brackets, and a couple of Runs: trace it by hand">Interview mode</span>}
              <button id="editor-copy" className="console-tool" type="button" onClick={async () => { try { await navigator.clipboard.writeText(r.currentCode()); toast("Code copied"); } catch { toast("Couldn't copy — select the code instead."); } }}>Copy</button>
              <button id="editor-reset" className="console-tool" type="button" title={`Put the starter code back (${MOD}Z undoes it)`} onClick={resetToStarter}>Reset</button>
              <span className="console-keys" title={`Run (${MOD}') · Submit (${MOD}Enter)`}><kbd>{MOD}&apos;</kbd> run</span>
              <button id="editor-console-toggle" className="panel-toggle" type="button" aria-label="Collapse the console" title="Collapse the console" onClick={() => patch({ console: !layout.console })}>&#x2304;</button>
            </div>
          </div>
          <div className={`console-panel${tab === "tests" ? "" : " hidden"}`} data-panel="tests">
            {edges.length > 0 && (
              <div id="editor-edges" className="editor-edges"><span className="label-sm">Planned edge cases — tick each once you&apos;ve checked it</span>
                {edges.map((c) => <label className="editor-edge" key={c}><input type="checkbox" checked={checked.includes(c)} onChange={(e) => tickEdge(c, e.target.checked)} /> {c}</label>)}</div>
            )}
            <label className="label-sm" htmlFor="editor-input">Test input <span className="help-inline">one argument per line, case after case</span></label>
            <textarea id="editor-input" className="editor-input" rows={4} spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "'" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); judge("run"); } }} />
            {!canJudge && <p className="small editor-nocookie"><button id="editor-set-cookie" className="console-tool" type="button" onClick={() => setCookie(true)}>Set your LeetCode cookie</button> to run and submit.</p>}
          </div>
          <div id="editor-result" className={`console-panel editor-result${tab === "result" ? "" : " hidden"}`} data-panel="result" aria-live="polite">
            <Result view={view} onRun={() => judge("run")} onSubmit={() => judge("submit")} onAddCase={addCase} />
          </div>
        </div>
      </div>
    </div>
  );
}

// The run header's editor controls: Focus folds both side panels away.
export function EditorHead() {
  const api = useEditorUi((s) => s.api);
  const judging = useEditorUi((s) => s.judging);
  const canJudge = useEditorUi((s) => s.canJudge);
  const runsLeft = useEditorUi((s) => s.runsLeft);
  const layout = useLayout((s) => s.layout);
  const patch = useLayout((s) => s.patch);
  if (!api) return null;
  const focused = !!(layout.hidden && layout.coach);
  return (
    <div id="editor-head" className="editor-head">
      <button id="editor-focus" className="button is-ghost" type="button" aria-pressed={focused} title="Just the editor: fold away the statement and the coach"
        onClick={() => patch({ hidden: !focused, coach: !focused })}>Focus</button>
      <button id="editor-run" className="button" type="button" title={`Run on the test input (${MOD}')`} disabled={judging || !canJudge || runsLeft === 0} onClick={() => api.judge("run")}>
        {runsLeft != null ? `Run (${runsLeft} left)` : "Run"}</button>
      <button id="editor-submit" className="button is-primary" type="button" title={`Submit (${MOD}Enter)`} disabled={judging || !canJudge} onClick={() => api.judge("submit")}>Submit</button>
    </div>
  );
}
