"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { mdHtml as mdToHtml } from "@/lib/lesson-md";
import { useToast } from "@/lib/toast";
import { CodeViewer, type Focus } from "./CodeViewer";
import { parseRefs, insertRef, refToken, type Ref } from "./refs";
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
export function Workspace({ exercise, attempt, onAttempt, onNext }: {
  exercise: Exercise; attempt: Attempt; onAttempt: (a: Attempt) => void; onNext: (category?: string) => void;
}) {
  const toast = useToast();
  const paths = useMemo(() => Object.keys(exercise.files).sort((a, b) => a.localeCompare(b)), [exercise.files]);
  const [path, setPath] = useState(() => paths.find((p) => /^readme/i.test(p)) ?? paths[0]);
  const [files, setFiles] = useState<Record<string, string>>({ ...exercise.files, ...(attempt.files || {}) });
  const [text, setText] = useState(attempt.explanation || "");
  const [focus, setFocus] = useState<Focus | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [hints, setHints] = useState<string[]>(attempt.hints || []);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(() => (attempt.last_run ? { ...attempt.last_run, passed: attempt.last_run.rows.filter((r) => r.status === "passed").length, total: attempt.last_run.rows.length } : null));
  const [running, setRunning] = useState(false);
  const [diffText, setDiffText] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>(attempt.chat || []);
  const [side, setSide] = useState<"task" | "assistant">("task");
  const filesRef = useRef(files);
  filesRef.current = files;
  const [now, setNow] = useState(() => Date.now() / 1000);
  const box = useRef<HTMLTextAreaElement>(null);
  const revision = useRef(attempt.revision);
  const dirty = useRef(false);
  const submitted = attempt.status === "submitted";
  const counts = useMemo(() => Object.fromEntries(Object.entries(files).map(([p, c]) => [p, c.split("\n").length - (c.endsWith("\n") ? 1 : 0)])), [files]);
  const refs = useMemo(() => parseRefs(text, counts), [text, counts]);
  const referenced = useMemo(() => new Set(refs.map((r) => r.path)), [refs]);

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
      revision.current = r.revision; setRun(r); setDiffText(r.diff || "");
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
  const onPick = (start: number, end: number, extend: boolean) => { setFocus({ start, end, n: Date.now() }); addRef({ path, start, end }, extend); };

  const hint = async () => {
    try { const r = await api(`/coding/attempts/${attempt.id}/hint`, "POST"); setHints(r.hints); revision.current = r.revision; }
    catch (e) { toast((e as Error).message); }
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

  return (
    <div className="cw">
      <header className="cw-head">
        <div className="cw-title">
          <span className="cw-kicker">{CATEGORY_LABELS[exercise.category] ?? exercise.category} · {exercise.language} · level {exercise.difficulty}</span>
          <h2>{exercise.title}</h2>
        </div>
        <div className="cw-actions">
          <span className={`cw-clock ${exercise.minutes && elapsed > exercise.minutes * 60 ? "is-over" : ""}`} aria-label="Time on this exercise">{clock(elapsed)}{exercise.minutes ? ` / ${exercise.minutes}:00` : ""}</span>
          {!submitted && <button className="button is-small" type="button" onClick={() => onNext()} title="Skip this one and start another">Skip</button>}
        </div>
      </header>
      <div className="cw-main">
        <aside className="cw-task">
          {exercise.assistant && (
            <div className="cw-tabs cw-sidetabs" role="tablist">
              <button type="button" role="tab" aria-selected={side === "task"} className={`cw-tabbtn ${side === "task" ? "is-on" : ""}`} onClick={() => setSide("task")}>Task</button>
              <button type="button" role="tab" aria-selected={side === "assistant"} className={`cw-tabbtn ${side === "assistant" ? "is-on" : ""}`} onClick={() => setSide("assistant")}>Assistant{chat.some((m) => m.role === "user") ? ` (${chat.filter((m) => m.role === "user").length})` : ""}</button>
            </div>
          )}
          {exercise.assistant && side === "assistant" ? (
            <Assistant attemptId={attempt.id} chat={chat} setChat={setChat} files={files} editFiles={applyPatch} getFiles={editedFiles} onRevision={(r) => { revision.current = r; }} disabled={submitted} />
          ) : <>
          <div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(exercise.task) }} />
          {hints.map((h, i) => <p key={i} className="cw-hint"><b>Hint {i + 1}.</b> {h}</p>)}
          {!submitted && hints.length < exercise.hint_count && <button className="button is-small" type="button" onClick={hint}>{hints.length ? "Another hint" : "Give me a hint"}</button>}
          {!submitted && hints.length > 0 && <p className="cw-note">Hints are counted in how this one is marked.</p>}
          </>}
        </aside>
        <div className="cw-code">
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
          <div className="cw-viewer">
            <div className="cw-viewer-bar">
              <span className="cw-path">{path}</span>
              <span className="cw-bar-hint">{readOnly ? "Click a line number to reference it. Shift-click for a range." : "Edit here. Click a line number to reference it."}</span>
              {!readOnly && files[path] !== exercise.files[path] && <button className="button is-small" type="button" onClick={resetFile}>Reset file</button>}
              {selection && !submitted && <button className="button is-small" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addRef({ path, ...selection })}>Reference lines {selection.start}{selection.end > selection.start ? `-${selection.end}` : ""}</button>}
            </div>
            <CodeViewer key={path} path={path} code={files[path] ?? ""} language={exercise.language} readOnly={readOnly} focus={focus}
              onChange={(c) => { setFiles((f) => ({ ...f, [path]: c })); dirty.current = true; }} onPick={onPick} onSelect={setSelection} />
          </div>
        </div>
      </div>
      {exercise.can_run && !submitted && <TestPanel run={run} running={running} onRun={runTests} diff={diffText} onChanges={showChanges} onOpen={open} />}
      {submitted ? (
        <ReviewPanel attempt={attempt} onAttempt={onAttempt} onOpen={open} onNext={onNext} category={exercise.category} />
      ) : (
        <section className="cw-explain" aria-label="Your explanation">
          <div className="cw-explain-head">
            <label htmlFor="cw-text"><b>Your explanation</b></label>
            <span className="cw-note">Type it, or use the mic to say it. Click lines in the code to drop references like <code>[file:12-30]</code> into it.</span>
          </div>
          <textarea id="cw-text" ref={box} className="textarea cw-text" data-dictate rows={5} autoComplete="off" spellCheck={false}
            placeholder={exercise.can_run ? "Say what the bug was, why it happened, and how your change fixes it. Reference the code where it helps." : "Say what happens, where it goes wrong, and why. Reference the code where it helps; you don't have to pin one line."}
            value={text} onChange={(e) => { setText(e.target.value); dirty.current = true; }} onBlur={save} />
          <div className="cw-explain-foot">
            <div className="cw-chips" aria-label="References in your explanation">
              {refs.length === 0 ? <span className="cw-note">No references yet. They are optional.</span> :
                refs.map((r, i) => <button key={i} type="button" className="cw-chip" onClick={() => open(r.path, r.start, r.end)}>{refToken(r).slice(1, -1)}</button>)}
            </div>
            <button className="button is-primary" type="button" disabled={busy} onClick={submit}>{busy ? "Marking…" : "Submit"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
