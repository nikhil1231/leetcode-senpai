"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoachSidebar, coachWidth } from "@/features/editor/CoachSidebar";
import { Chat, type ChatMessage } from "@/components/chat/Chat";
import { api } from "@/lib/api";
import { mdHtml as mdToHtml } from "@/lib/lesson-md";
import { useToast } from "@/lib/toast";
import { CONSOLE_PX, STATEMENT_PCT, useLayout } from "@/features/editor/editor-store";
import { CodeViewer, type Focus } from "./CodeViewer";
import { parseRefs, refSpans, deleteRefAt, insertRef, refToken, type Ref } from "./refs";
import { Assistant, type ChatMsg } from "./Assistant";
import { ReviewPanel } from "./Review";
import { TestPanel, type RunResult } from "./TestPanel";
import { CATEGORY_LABELS, type Attempt, type Exercise } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SAVE_MS = 1500;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The shared workspace: task, file tree, code viewer, and an explanation panel docked underneath. The same component
// serves every exercise category; the parts that differ (editing, tests, the assistant) arrive as props.
export function Workspace({ exercise, attempt, onAttempt, onNext, onExit }: {
  exercise: Exercise; attempt: Attempt; onAttempt: (a: Attempt) => void; onNext: (category?: string) => void; onExit: () => void;
}) {
  const toast = useToast();
  const paths = useMemo(() => Object.keys(exercise.files).sort((a, b) => a.localeCompare(b)), [exercise.files]);
  const [path, setPath] = useState(() => paths.find((p) => /^readme/i.test(p)) ?? paths[0]);
  const [files, setFiles] = useState<Record<string, string>>({ ...exercise.files, ...(attempt.files || {}) });
  const [text, setText] = useState(attempt.explanation || "");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [coachChat, setCoachChat] = useState<NonNullable<Attempt["coach_chat"]>>(attempt.coach_chat || []);
  const [coachPending, setCoachPending] = useState<string | null>(null);
  const coachLock = useRef(false);
  const [hints] = useState<string[]>(attempt.hints || []);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(() => (attempt.last_run ? { ...attempt.last_run, passed: attempt.last_run.rows.filter((r) => r.status === "passed").length, total: attempt.last_run.rows.length } : null));
  const [running, setRunning] = useState(false);
  const [diffText, setDiffText] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>(attempt.chat || []);
  const [dock, setDock] = useState<"tests" | "changes" | "explain">("explain");
  const [side, setSide] = useState<"task" | "assistant">("task");
  const filesRef = useRef(files);
  filesRef.current = files;
  const [now, setNow] = useState(() => Date.now() / 1000);
  const box = useRef<HTMLTextAreaElement>(null);
  const revision = useRef(attempt.revision);
  const dirty = useRef(false);
  const submitted = attempt.status !== "open";
  const counts = useMemo(() => Object.fromEntries(Object.entries(files).map(([p, c]) => [p, c.split("\n").length - (c.endsWith("\n") ? 1 : 0)])), [files]);
  const refs = useMemo(() => parseRefs(text, counts), [text, counts]);
  const spans = useMemo(() => refSpans(text, counts), [text, counts]);
  const mirror = useRef<HTMLDivElement>(null);
  const referenced = useMemo(() => new Set(refs.map((r) => r.path)), [refs]);

  // Working takes the whole screen, laid out like the LeetCode editor (same panes, folds and drag handles, kept in the
  // same per-browser layout); the page's own colours apply. Once submitted it falls back to the page with the review.
  const layout = useLayout((st) => st.layout);
  const patch = useLayout((st) => st.patch);
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => { useLayout.getState().hydrate(); }, []);
  useEffect(() => {
    const el = pane.current; if (!el) return;
    const w = Math.min(STATEMENT_PCT.max, Math.max(STATEMENT_PCT.min, Number(layout.pct) || STATEMENT_PCT.def));
    el.style.setProperty("--statement-w", `${w}%`);
    const ch = Number(layout.consoleH) ? Math.round(Math.max(CONSOLE_PX.min, Number(layout.consoleH))) : null;
    if (ch) el.style.setProperty("--console-h", `${ch}px`); else el.style.removeProperty("--console-h");
  }, [layout, submitted]);
  const drag = (onMove: (e: PointerEvent) => void) => (e: React.PointerEvent) => {
    e.preventDefault(); const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const up = () => { t.removeEventListener("pointermove", onMove); t.removeEventListener("pointerup", up); };
    t.addEventListener("pointermove", onMove); t.addEventListener("pointerup", up);
  };

  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t); }, []);

  // Saves go one at a time, each on the revision the last one returned, so a blur and a click never race.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback(() => {
    if (submitted) return chain.current;
    chain.current = chain.current.then(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      try { revision.current = (await api(`/coding/attempts/${attempt.id}`, "PUT", { explanation: box.current?.value ?? "", revision: revision.current, files: editedFiles() })).revision; }
      catch { dirty.current = true; }
    });
    return chain.current;
  }, [attempt.id, submitted]);
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(save, SAVE_MS); return () => clearTimeout(t); }, [text, files, save]);
  const editedFiles = () => (exercise.editable.length ? Object.fromEntries(exercise.editable.map((p) => [p, filesRef.current[p]])) : undefined);

  const runTests = async () => {
    if (running) return;
    setRunning(true);
    try {
      await save();
      const r = await api(`/coding/attempts/${attempt.id}/run`, "POST", { files: editedFiles() });
      revision.current = r.revision; setRun(r); setDiffText(r.diff || ""); setDock((d) => (d === "changes" ? d : "tests"));
    } catch (e) { toast((e as Error).message); } finally { setRunning(false); }
  };
  const showChanges = async () => {
    try { setDiffText((await api(`/coding/attempts/${attempt.id}/diff`, "POST", { files: editedFiles() })).diff || ""); } catch (e) { toast((e as Error).message); }
  };
  const applyPatch = (patch: Record<string, string>) => { setFiles((f) => ({ ...f, ...patch })); dirty.current = true; const first = Object.keys(patch)[0]; if (first) open(first); };
  const resetFile = () => { setFiles((f) => ({ ...f, [path]: exercise.files[path] })); dirty.current = true; };

  const open = useCallback((p: string, start?: number, end?: number) => {
    if (!(p in exercise.files) && !(p in files)) return;
    setPath(p);
    setFocus(start ? { start, end: end ?? start, n: Date.now() } : null);
  }, [exercise.files, files]);

  const lastToken = useRef("");
  const addRef = (r: Ref, extend = false) => {
    if (submitted) return;
    const el = box.current;
    const token = refToken(r);
    // Shift-clicking a range right after clicking its first line widens that reference instead of adding a second.
    if (extend && lastToken.current && text.split(lastToken.current).length === 2) {
      setText(text.replace(lastToken.current, token)); lastToken.current = token; dirty.current = true; return;
    }
    lastToken.current = token;
    const at = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? text.length;
    const out = insertRef(text, at, to, r);
    setText(out.text); dirty.current = true;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(out.cursor, out.cursor); });
  };
  // A reference is one unit in the text: Backspace or Delete beside it takes the whole thing.
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.key !== "Backspace" && e.key !== "Delete") || el.selectionStart !== el.selectionEnd) return;
    const out = deleteRefAt(el.value, el.selectionStart, e.key === "Delete", counts);
    if (!out) return;
    e.preventDefault();
    setText(out.text); dirty.current = true;
    requestAnimationFrame(() => el.setSelectionRange(out.cursor, out.cursor));
  };
  const onPick = (start: number, end: number, extend: boolean) => { setFocus({ start, end, n: Date.now() }); addRef({ path, start, end }, extend); };

  const askCoach = async (message = "") => {
    if (coachLock.current || submitted || busy) return;
    coachLock.current = true; setCoachPending(message || "Give me a hint");
    try {
      await save();
      const r = await api(`/coding/attempts/${attempt.id}/coach`, "POST", { message, files: editedFiles() || {}, explanation: box.current?.value ?? text });
      revision.current = r.revision; setCoachChat(r.chat);
      const mark = r.chat.at(-1)?.refs?.[0];
      if (mark) open(mark.path, mark.start, mark.end);
    } catch (e) { toast((e as Error).message); throw e; }
    finally { coachLock.current = false; setCoachPending(null); }
  };
  const submit = async () => {
    const el = box.current;
    if (el) await (window as Any).Dictate?.settle?.(el);   // the transcript catches up before it is read
    const value = el?.value ?? text;
    dirty.current = true;
    await save();
    if (value.trim().length < 10) { toast("Write your explanation first."); return; }
    setBusy(true);
    try {
      const r = await api(`/coding/attempts/${attempt.id}/submit`, "POST", { explanation: value, revision: revision.current, elapsed_sec: Math.round(now - attempt.started_at), files: extraFiles() });
      if (r.message) toast(r.message);
      onAttempt(r.attempt);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const extraFiles = () => editedFiles() ?? {};
  const readOnly = !exercise.editable.includes(path) || submitted;
  const elapsed = Math.max(0, Math.round((submitted ? attempt.started_at + (attempt.elapsed_sec || 0) : now) - attempt.started_at));

  const leave = async () => { dirty.current = true; await save(); onExit(); };
  const explainOn = dock === "explain" || !exercise.can_run;
  // The explanation grows to fit what you've written instead of scrolling inside a fixed box.
  useEffect(() => {
    const el = box.current; if (submitted || !el || layout.console) return;
    el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`;
  }, [text, submitted, explainOn, layout.console]);
  const consoleHeight = () => pane.current?.querySelector(".editor-console")?.getBoundingClientRect().height ?? 0;
  const setH = (h: number | null) => {
    const work = pane.current?.querySelector(".editor-work")?.getBoundingClientRect();
    if (h != null && work) h = Math.min(work.height - CONSOLE_PX.editor, Math.max(CONSOLE_PX.min, h));
    patch({ consoleH: h });
  };
  const pct = Number(layout.pct) || STATEMENT_PCT.def;

  const taskTabs = exercise.assistant && (
    <div className="pane-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={side === "task"} className="pane-tab" onClick={() => setSide("task")}>Task</button>
      <button type="button" role="tab" aria-selected={side === "assistant"} className="pane-tab" onClick={() => setSide("assistant")}>Assistant{chat.some((m) => m.role === "user") ? ` (${chat.filter((m) => m.role === "user").length})` : ""}</button>
    </div>
  );
  const taskBody = exercise.assistant && side === "assistant" ? (
    <Assistant attemptId={attempt.id} chat={chat} setChat={setChat} files={files} editFiles={applyPatch} getFiles={editedFiles} onRevision={(r) => { revision.current = r; }} disabled={submitted} />
  ) : (
    <>
      <div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(exercise.task) }} />
      {hints.map((h, i) => <p key={i} className="cw-hint"><b>Hint {i + 1}.</b> {h}</p>)}
      {!submitted && hints.length > 0 && <p className="cw-note">Hints are counted in how this one is marked.</p>}
    </>
  );
  const tree = (
    <nav className="cw-tree" aria-label="Files">
      {paths.map((p, i) => {
        const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
        const prev = i ? paths[i - 1] : "", prevDir = prev.includes("/") ? prev.slice(0, prev.lastIndexOf("/")) : "";
        return (
          <div key={p} className="cw-tree-row">
            {dir && dir !== prevDir && <div className="cw-folder">{dir}/</div>}
            <button type="button" className={`cw-file ${p === path ? "is-open" : ""}`} style={{ paddingLeft: dir ? 22 : 12 }} onClick={() => open(p)} title={p}>
              <span className="cw-file-name">{p.split("/").pop()}</span>
              {referenced.has(p) && <span className="cw-dot" aria-label="referenced" />}
              {exercise.editable.includes(p) && files[p] !== exercise.files[p] && <span className="cw-edited" aria-label="edited">edited</span>}
            </button>
          </div>
        );
      })}
    </nav>
  );
  const viewer = (
    <div className="cw-viewer">
      <div className="cw-viewer-bar">
        <span className="cw-path">{path}</span>
        <span className="cw-bar-hint">{readOnly ? "Click a line number to reference it. Shift-click for a range." : "Edit here. Click a line number to reference it."}</span>
        {!readOnly && files[path] !== exercise.files[path] && <button className="button is-small" type="button" onClick={resetFile}>Reset file</button>}
      </div>
      <CodeViewer key={path} path={path} code={files[path] ?? ""} language={exercise.language} readOnly={readOnly} focus={focus}
        onChange={(c) => { setFiles((f) => ({ ...f, [path]: c })); dirty.current = true; }} onPick={onPick} onReference={submitted ? undefined : (r) => addRef({ path, ...r })} />
    </div>
  );
  const title = (
    <div className="cw-title">
      <span className="cw-kicker">{CATEGORY_LABELS[exercise.category] ?? exercise.category} · {exercise.language} · level {exercise.difficulty}</span>
      <h2>{exercise.title}</h2>
    </div>
  );
  const clockEl = <span className={`cw-clock ${exercise.minutes && elapsed > exercise.minutes * 60 ? "is-over" : ""}`} aria-label="Time on this exercise">{clock(elapsed)}{exercise.minutes ? ` / ${exercise.minutes}:00` : ""}</span>;

  const tab = (id: "tests" | "changes" | "explain", label: string, on = () => setDock(id)) => (
    <button type="button" role="tab" aria-selected={(id === "explain" ? explainOn : dock === id)} className="pane-tab" onClick={on}>{label}</button>
  );
  return (
    <div className={`cwf active-run has-editor${layout.coach ? " coach-hidden" : ""}`} style={{ "--coach-w": coachWidth(layout.coachW) } as React.CSSProperties}>
      <header className="cwf-head">
        <button className="button is-ghost is-small" type="button" onClick={leave} title="Back to Coding practice. Your work is saved.">‹ Back</button>
        {title}
        {clockEl}
        {!submitted && <div className="cwf-actions">
          <button className="button is-ghost" type="button" onClick={async () => { dirty.current = true; await save(); onNext(); }} title="End this exercise and start another">Skip</button>
          {exercise.can_run && <button className="button" type="button" disabled={running} onClick={runTests}>{running ? "Running…" : "Run tests"}</button>}
          <button className="button is-primary" type="button" disabled={busy || coachPending !== null} onClick={submit}>{busy ? "Marking…" : "Submit"}</button>
        </div>}
      </header>
      <div ref={pane} className={`editor-pane cwf-pane${layout.hidden ? " statement-hidden" : ""}${layout.console ? " console-folded" : ""}`}>
        <div className="editor-statement">
          <div className="pane-head">
            {taskTabs || <div className="pane-tabs"><span className="pane-title">Task</span></div>}
            <button className="panel-toggle" type="button" aria-label="Hide the task" title="Hide the task" onClick={() => patch({ hidden: true })}>&#x2039;</button>
          </div>
          <div className="editor-statement-body cwf-task">{taskBody}</div>
        </div>
        <button className="panel-rail" type="button" title="Show the task" onClick={() => patch({ hidden: false })}><span>&#x203A;</span><span className="panel-rail-label">Task</span></button>
        <div className="editor-split" role="separator" aria-orientation="vertical" aria-label="Resize the task" tabIndex={0} title="Drag to resize · double-click to reset"
          onPointerDown={(e) => { const box = pane.current!.getBoundingClientRect(); drag((ev) => patch({ pct: Math.round((((ev.clientX - box.left) / box.width) * 100) * 10) / 10 }))(e); }}
          onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); patch({ pct: pct + (e.key === "ArrowLeft" ? -2 : 2) }); }}
          onDoubleClick={() => patch({ pct: STATEMENT_PCT.def })} />
        <div className="editor-work">
          <div className="cwf-code">{tree}{viewer}</div>
          <div className="console-split" role="separator" aria-orientation="horizontal" aria-label="Resize the console" tabIndex={0} title="Drag to resize · double-click to reset"
            onPointerDown={(e) => { const bottom = pane.current!.querySelector(".editor-work")!.getBoundingClientRect().bottom; drag((ev) => setH(bottom - ev.clientY))(e); }}
            onKeyDown={(e) => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); setH(consoleHeight() + (e.key === "ArrowUp" ? 20 : -20)); }}
            onDoubleClick={() => setH(null)} />
          <div className="editor-console">
            <div className="console-head">
              {submitted ? <div className="pane-tabs"><span className="pane-title">Review</span></div> : (
                <div className="pane-tabs" role="tablist">
                  {exercise.can_run && tab("tests", `Tests${run ? ` ${run.passed}/${run.total}` : ""}`)}
                  {exercise.can_run && tab("changes", "Your changes", () => { setDock("changes"); showChanges(); })}
                  {tab("explain", "Your explanation")}
                </div>
              )}
              <div className="console-tools">
                {!submitted && exercise.can_run && !explainOn && <span>{run ? (run.timed_out ? "Timed out." : `${run.passed} of ${run.total} visible tests pass`) : "More checks run when you submit"}</span>}
                <button className="panel-toggle" type="button" aria-label="Collapse the console" title="Collapse the console" onClick={() => patch({ console: !layout.console })}>&#x2304;</button>
              </div>
            </div>
            {submitted && attempt.status !== "abandoned" ? <div className="console-panel"><ReviewPanel attempt={attempt} onAttempt={onAttempt} onOpen={open} onNext={onNext} category={exercise.category} /></div> : null}
            {attempt.status === "abandoned" && <div className="console-panel"><p className="cw-note">Session ended. Your saved code and explanation are available here.</p><pre className="cw-note">{attempt.explanation}</pre></div>}
            {!submitted && !explainOn && <div className="console-panel"><TestPanel tab={dock === "changes" ? "changes" : "tests"} run={run} diff={diffText} /></div>}
            {!submitted && <div className={`console-panel cwf-explain${explainOn ? "" : " hidden"}`}>
              <div className="cw-field">
                <div className="textarea cw-mirror" ref={mirror} aria-hidden="true">
                  {(() => {
                    const out: React.ReactNode[] = []; let at = 0;
                    spans.forEach((s, i) => { out.push(text.slice(at, s.from), <mark key={i} className="cw-reftok">{text.slice(s.from, s.to)}</mark>); at = s.to; });
                    out.push(text.slice(at), "\n");
                    return out;
                  })()}
                </div>
                <textarea id="cw-text" ref={box} className="textarea cw-text" data-dictate rows={4} autoComplete="off" spellCheck={false} onKeyDown={onKey}
                  onScroll={(e) => { if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop; }}
                  placeholder={exercise.can_run ? "Say what the bug was, why it happened, and how your change fixes it. Type it, or use the mic. Click line numbers in the code to add references like [file:12-30]." : "Say what happens, where it goes wrong, and why. Type it, or use the mic. Click line numbers in the code to add references like [file:12-30]; you don't have to pin one line."}
                  value={text} onChange={(e) => { setText(e.target.value); dirty.current = true; }} onBlur={save} />
              </div>
              <div className="cw-chips" aria-label="References in your explanation">
                {refs.length === 0 ? <span className="cw-note">No references yet. They are optional.</span> :
                  refs.map((r, i) => <button key={i} type="button" className="cw-chip" onClick={() => open(r.path, r.start, r.end)}>{refToken(r).slice(1, -1)}</button>)}
              </div>
            </div>}
          </div>
        </div>
      </div>
      <CoachSidebar>
        <div className="active-notes" onClick={(e) => e.stopPropagation()}>
          {!coachChat.length && <p className="coach-empty">Think out loud below, or ask for a hint. The coach points at relevant code without giving the answer.</p>}
          <p className="cw-note">Coach help is counted when this exercise is marked.</p>
        </div>
        <div className="run-chat-host" onClick={(e) => e.stopPropagation()}>
          <Chat className="run-chat" messages={[
            ...coachChat.map((m): ChatMessage => ({ ...m, after: m.refs?.length ? <div className="cw-chips">{m.refs.map((r, i) => <button key={i} type="button" className="cw-chip" onClick={() => open(r.path, r.start, r.end)}>{refToken(r).slice(1, -1)}</button>)}<button type="button" className="note-action" onClick={() => setFocus(null)}>Clear marks</button></div> : undefined })),
            ...(coachPending === null ? [] : [{ id: "pending", role: "user" as const, text: coachPending }]),
          ]} running={coachPending !== null} disabled={submitted || busy} composer={!submitted} inputId="practical-coach-input"
            placeholder="Message the interviewer" label="Talk to the interviewer" typingLabel="The interviewer is typing" onSend={askCoach} />
        </div>
        {!submitted && <div className="coach-actions" onClick={(e) => e.stopPropagation()}>
          <button className="button is-small" type="button" disabled={coachPending !== null || busy} onClick={() => { void askCoach().catch(() => {}); }}>{coachChat.length ? "Another hint" : "Give me a hint"}</button>
        </div>}
      </CoachSidebar>
    </div>
  );
}
