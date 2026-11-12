"use client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useHeading } from "@/lib/heading";
import { TAB_TITLES } from "@/lib/sections";
import { Loader } from "@/components/ui/Loader";

// Quickfire: pick a kind of question and answer a stream of small ones. Each answer is shown as soon as it is submitted;
// Enter moves on, Esc stops. The server picks every next question from past outcomes (practice_queue.py). No timers,
// sessions, or review-card advances. Works offline: the server saves answers locally and syncs them later.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const MIXED = { id: "", title: "Mixed", duration: "30 sec – 3 min", description: "A bit of everything, weighted toward what you miss." };

interface Run { mode: string; topic: string; recent: string[]; answered: number; correct: number; next: Promise<Any> | null; limit: number; outcomes: Any[] }
interface Store {
  topic: string; roundSize: number; difficulty: string; recallFirst: boolean; run: Run | null; current: Any; result: Any; loading: boolean; submitting: boolean; ticket: number;
  assisted: boolean; recall: boolean; exposedAt: number | null; feedbackAt: number | null; timingUncertain: boolean; savedRound: Any; draft: string; pendingAnswer: Any; pendingGuess: boolean;
  lastRun: { answered: number; correct: number; outcomes: Any[] } | null; error: string; hintBox: Any; fatal: string | null; catalog: Any;
}

const tallyOf = (s: Store) => {
  const run = s.run as Run;
  return (run.limit ? `${run.answered} / ${run.limit} answered · ${run.correct} right` : run.answered ? `${run.answered} answered · ${run.correct} right` : "") + (s.catalog.sync?.offline ? `${run.answered ? " · " : ""}offline, saved locally` : "");
};

export function QuickfirePage() {
  useHeading(...TAB_TITLES.practice);
  const catalogQ = useQuery({ queryKey: ["api", "/practice"], queryFn: () => api("/practice"), staleTime: Infinity, refetchOnMount: false });
  const preset = useFlow((s) => s.quickfireTopic);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const S = useRef<Store>({ topic: "", roundSize: 5, difficulty: "", recallFirst: false, run: null, current: null, result: null, loading: false, submitting: false, ticket: 0, assisted: false, recall: false,
    exposedAt: null, feedbackAt: null, timingUncertain: false, savedRound: null, draft: "", pendingAnswer: null, pendingGuess: false, lastRun: null, error: "", hintBox: null, fatal: null, catalog: null }).current;
  S.catalog = catalogQ.data ?? S.catalog;
  const catalog = S.catalog;
  const rerender = bump as () => void;

  const modeOf = (id: string) => [MIXED, ...catalog.modes].find((m: Any) => m.id === id);
  const storageKey = () => (catalog?.storage_scope ? `light-practice-round:v1:${catalog.storage_scope}` : null);
  const forgetRound = () => { S.savedRound = null; try { if (storageKey()) window.sessionStorage.removeItem(storageKey() as string); } catch { /* ignore */ } };
  const readRound = () => {
    try {
      const s = JSON.parse(window.sessionStorage.getItem(storageKey() as string) || "null");
      if (!s) return;
      const r = s.run;
      if (s.version !== 1 || Date.now() - s.savedAt > 86400000 || s.savedAt > Date.now() || !Number.isFinite(s.savedAt) || !r || !modeOf(r.mode) || ![0, 5, 10].includes(r.limit) || !Number.isInteger(r.answered) || r.answered < 0
        || !Number.isInteger(r.correct) || r.correct < 0 || r.correct > r.answered || !Array.isArray(r.recent) || r.recent.length > 50 || !r.recent.every((t: unknown) => typeof t === "string")
        || !Array.isArray(r.outcomes) || r.outcomes.length > catalog.exercises.length || !r.outcomes.every((o: Any) => o && typeof o.skill === "string" && typeof o.explanation === "string")
        || typeof r.topic !== "string" || typeof s.draft !== "string" || s.draft.length > 300 || !["", "foundation", "standard", "stretch"].includes(s.difficulty)
        || (s.questionId !== null && (typeof s.questionId !== "string" || !catalog.exercises.some((e: Any) => s.questionId.startsWith(`v1:${e.id}:`))))
        || (s.pendingAnswer && (s.pendingAnswer.question_id !== s.questionId || typeof s.pendingAnswer.reveal !== "boolean" || (s.pendingAnswer.answer !== null && typeof s.pendingAnswer.answer !== "string")))) throw new Error("Stale round");
      S.savedRound = s;
    } catch { forgetRound(); }
  };
  const saveRound = () => {
    const run = S.run; if (!run || !storageKey()) return;
    // Store counts before the current answer: resume gets that answer from the server and adds it exactly once.
    const outcomes = run.outcomes.filter((o) => o.id !== S.current?.id);
    const compact = [...new Map(outcomes.map((o) => [o.skill, o])).values()];
    const snapshot = { version: 1, savedAt: Date.now(), run: { mode: run.mode, topic: run.topic, limit: run.limit, recent: run.recent.slice(-50), answered: run.answered - (S.result ? 1 : 0), correct: run.correct - (S.result?.correct ? 1 : 0), outcomes: compact },
      questionId: S.current?.id || null, exposedAt: S.exposedAt, draft: S.draft, assisted: S.assisted, recall: S.recall, recallFirst: S.recallFirst, difficulty: S.difficulty, pendingAnswer: S.pendingAnswer, pendingGuess: S.pendingGuess };
    try { window.sessionStorage.setItem(storageKey() as string, JSON.stringify(snapshot)); } catch { /* a full or disabled store must never block practice */ }
  };

  const saveTiming = () => {
    if (!S.current) return;
    const origin = S.result ? S.feedbackAt : S.exposedAt; if (!origin) return;
    api("/practice/timing", "POST", { question_id: S.current.id, kind: S.result ? "feedback" : "abandoned", elapsed_sec: Math.max(0, (Date.now() - origin) / 1000), uncertain: S.timingUncertain }).catch(() => {});
  };
  const stop = useCallback(() => {
    saveTiming(); S.ticket++; forgetRound();
    if (S.run && S.run.answered) S.lastRun = { answered: S.run.answered, correct: S.run.correct, outcomes: S.run.outcomes };
    S.run = null; S.current = null; S.result = null; S.loading = false; S.submitting = false; S.error = ""; S.hintBox = null; rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fetchNext = () => {
    const run = S.run as Run;
    const params = new URLSearchParams({ mode: run.mode, topic: run.topic, recent: run.recent.join(",") });
    if (S.difficulty) params.set("difficulty", S.difficulty);
    const pending = api(`/practice/next?${params}`); pending.catch(() => {}); return pending;
  };
  const advance = useCallback(async () => {
    const run = S.run; if (!run || S.submitting) return;
    if (run.limit && run.answered >= run.limit) { stop(); return; }
    saveTiming();
    const t = ++S.ticket, pending = run.next || fetchNext();
    run.next = null; S.current = null; S.result = null; S.loading = true; S.draft = ""; S.pendingAnswer = null; S.pendingGuess = false; S.error = ""; S.hintBox = null; S.fatal = null;
    saveRound(); rerender();
    try {
      const q = await pending;
      if (t !== S.ticket) return;
      if (q.completed) { stop(); return; }
      S.current = q; S.assisted = false; S.recall = (S.recallFirst || !!q.familiar) && ["trace", "fill"].includes(q.mode);
      S.exposedAt = Date.now(); S.feedbackAt = null; S.timingUncertain = false;
      api("/practice/exposure", "POST", { question_id: q.id, choices: q.input_type === "choice" && !S.recall, exposed_at: Math.floor(S.exposedAt / 1000) }).catch(() => {});
      run.recent = [...run.recent, q.template].slice(-50);
      saveRound();
    } catch (e) { if (t !== S.ticket) return; S.fatal = (e as Error).message; } finally { if (t === S.ticket) { S.loading = false; rerender(); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const start = (mode: string) => { forgetRound(); S.run = { mode, topic: S.topic, recent: [], answered: 0, correct: 0, next: null, limit: S.roundSize, outcomes: [] }; void advance(); };

  const acceptResult = (r: Any) => {
    const run = S.run as Run;
    S.result = r; S.feedbackAt = Date.now();
    if (r.sync) catalog.sync = r.sync;
    catalog.status[r.template] = r.correct ? (r.assisted || r.guessed ? "uncertain" : "learned") : "missed";
    S.pendingAnswer = null; run.answered++;
    run.outcomes.push({ id: S.current.id, skill: S.current.skill || S.current.title, explanation: r.explanation, secure: r.correct && !r.assisted && !r.guessed && !r.revealed });
    if (r.correct) run.correct++;
    run.next = run.limit && run.answered >= run.limit ? null : fetchNext();
    saveRound(); rerender();
  };
  const submit = async (reveal: boolean, answerIn = "") => {
    if (S.submitting || S.result || !S.current) return;
    const answer = answerIn.trim();
    if (!reveal && !answer) { S.error = "Enter an answer first."; rerender(); return; }
    const q = S.current, t = S.ticket;
    S.submitting = true; S.error = ""; S.hintBox = null; rerender();
    try {
      if (!reveal && q.input_type === "array") {
        const check = await api("/practice/check", "POST", { question_id: q.id, answer });
        if (t !== S.ticket) return;
        if (!check.correct) { S.assisted = true; saveRound(); S.hintBox = check; S.submitting = false; rerender(); return; }
      }
      S.pendingAnswer = { question_id: q.id, answer: reveal ? null : answer, reveal, assisted: S.assisted, recall: S.recall, timing_uncertain: S.timingUncertain, answered_at: Math.floor(Date.now() / 1000), exposed_at: Math.floor((S.exposedAt as number) / 1000), elapsed_sec: S.exposedAt ? (Date.now() - S.exposedAt) / 1000 : null };
      saveRound();
      const r = await api("/practice/answer", "POST", S.pendingAnswer);
      catalog.status[r.template] = r.correct ? (r.assisted || r.guessed ? "uncertain" : "learned") : "missed";
      if (t !== S.ticket) { if (!S.run && !S.loading) rerender(); return; }
      acceptResult(r);
    } catch (e) { if (t !== S.ticket) return; S.error = (e as Error).message; } finally { if (t === S.ticket) { S.submitting = false; rerender(); } }
  };
  const markGuessed = async () => {
    if (S.submitting || !S.result?.correct || S.result.guessed) return;
    const t = S.ticket, q = S.current, round = S.run as Run;
    S.submitting = true; S.pendingGuess = true; saveRound(); rerender();
    try {
      const updated = await api("/practice/guess", "POST", { question_id: q.id });
      catalog.status[q.template] = "uncertain";
      const outcome = round.outcomes.find((o) => o.id === q.id); if (outcome) outcome.secure = false;
      if (t !== S.ticket) return;
      S.result = updated; S.pendingGuess = false;
      round.next = round.limit && round.answered >= round.limit ? null : fetchNext();
      saveRound();
    } catch (e) { if (t === S.ticket) S.error = (e as Error).message; } finally { if (t === S.ticket) { S.submitting = false; rerender(); } }
  };
  const resumeRound = async (snapshot = S.savedRound) => {
    if (S.loading || S.submitting || !snapshot) return;
    const t = ++S.ticket;
    S.run = { ...snapshot.run, recent: [...snapshot.run.recent], outcomes: [...snapshot.run.outcomes], next: null };
    S.topic = S.run!.topic; S.roundSize = S.run!.limit; S.difficulty = snapshot.difficulty; S.recallFirst = !!snapshot.recallFirst; S.recall = !!snapshot.recall; S.assisted = !!snapshot.assisted;
    S.exposedAt = snapshot.exposedAt || Date.now(); S.timingUncertain = true; S.draft = snapshot.draft; S.pendingAnswer = snapshot.pendingAnswer; S.pendingGuess = !!snapshot.pendingGuess;
    S.current = null; S.result = null; S.loading = true; S.fatal = null; rerender();
    try {
      if (!snapshot.questionId) { S.loading = false; await advance(); return; }
      const restored = await api(`/practice/resume/${encodeURIComponent(snapshot.questionId)}`);
      if (t !== S.ticket) return;
      S.current = restored.question;
      if (typeof restored.result?.answer === "string" && (S.recall || S.current.input_type === "array")) S.draft = restored.result.answer;
      S.loading = false; rerender();
      if (restored.result) { S.pendingGuess = S.pendingGuess && restored.result.correct && !restored.result.guessed; acceptResult(restored.result); if (S.pendingGuess && !S.result.guessed) await markGuessed(); }
      else if (S.pendingAnswer) await submit(S.pendingAnswer.reveal, S.pendingAnswer.answer || "");
      else saveRound();
    } catch (e) { if (t !== S.ticket) return; S.fatal = (e as Error).message; } finally { if (t === S.ticket) { S.loading = false; rerender(); } }
  };

  useEffect(() => { if (catalog && !S.savedRound && !S.run) { readRound(); rerender(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [catalog?.storage_scope]);
  useEffect(() => { if (preset) { S.topic = preset; useFlow.getState().presetQuickfire(null); rerender(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [preset]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState !== "visible") S.timingUncertain = true; };
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !S.run || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".overlay")) return;
      const tag = (e.target as HTMLElement | null)?.tagName, id = (e.target as HTMLElement | null)?.id;
      if (e.key === "Escape") { e.preventDefault(); stop(); return; }
      if (id === "practice-input") return;   // it handles Enter itself
      if (e.key === "Enter" && ["BUTTON", "SUMMARY", "A", "SELECT", "INPUT"].includes(tag || "") && id !== "practice-next") return;
      if (S.result && !S.loading && e.key === "Enter") { e.preventDefault(); void advance(); return; }
      if (!S.result && !S.submitting && S.current && S.current.input_type === "choice" && !S.recall) {
        const i = "1234".indexOf(e.key);
        if (e.key.length === 1 && i >= 0 && i < S.current.options.length) { e.preventDefault(); void submit(false, S.current.options[i].id); }
      }
    };
    document.addEventListener("visibilitychange", vis); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", vis); document.removeEventListener("keydown", key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (catalogQ.isLoading || !catalog) return catalogQ.error ? <div className="empty"><p>{(catalogQ.error as Error).message}</p><button className="button" onClick={() => catalogQ.refetch()}>Try again</button></div> : <Loader message="Loading Quickfire…" />;

  const runBar = () => {
    const run = S.run as Run, m = modeOf(run.mode);
    return (
      <div className="light-run-bar"><button id="practice-stop" className="button is-ghost is-small" type="button" onClick={stop}>← Stop <kbd>Esc</kbd></button>
        <span className="light-run-title">{m.title}{run.topic ? ` · ${run.topic}` : ""}</span><span id="practice-tally" className="light-tally">{tallyOf(S)}</span></div>
    );
  };

  // ---- the library ----
  if (!S.run) {
    const topics = [...new Set(catalog.exercises.map((x: Any) => x.topic))].sort() as string[];
    const counts = (mode: string) => {
      const xs = catalog.exercises.filter((x: Any) => (!mode || x.mode === mode) && (!S.topic || x.topic === S.topic) && (!S.difficulty || x.difficulty === S.difficulty));
      return { total: xs.length, missed: xs.filter((x: Any) => ["missed", "uncertain"].includes(catalog.status[x.id])).length, fresh: xs.filter((x: Any) => !catalog.status[x.id]).length };
    };
    const sy = catalog.sync || {};
    const n = sy.unsynced ? `${sy.unsynced} answer${sy.unsynced === 1 ? "" : "s"} waiting to sync.` : "";
    const recap = (outcomes: Any[]) => {
      const latest = new Map<string, Any>(); outcomes.forEach((o) => latest.set(o.skill, o));
      const lessons = [...latest.values()], revisit = lessons.find((o) => !o.secure), learned = lessons.filter((o) => o.secure).pop();
      return (
        <div className="light-recap" aria-label="Practice takeaway">
          {learned && <p><strong>Takeaway · {learned.skill}</strong><br />{learned.explanation}</p>}
          {revisit ? <p><strong>Revisit · {revisit.skill}</strong><br />{revisit.explanation}</p> : <p>No unresolved mistakes in this round. Check these skills again another day.</p>}
          <p className="light-footnote">Based on this round’s answers; this is not a mastery score.</p></div>
      );
    };
    const sr = S.savedRound;
    return (
      <>
        <div className="light-intro"><div><span className="light-eyebrow">A small rep is enough</span><h2>Pick a kind of question</h2><p>Questions keep coming until you stop. The ones you miss come back.</p></div>
          <div className="light-filters">
            <label><input id="practice-recall-first" type="checkbox" checked={S.recallFirst} onChange={(e) => { S.recallFirst = e.target.checked; rerender(); }} /> Recall first</label>
            <div className="light-field"><label htmlFor="practice-length">Round</label><div className="select"><select id="practice-length" value={S.roundSize} onChange={(e) => { S.roundSize = Number(e.target.value); rerender(); }}><option value="0">Until I stop</option><option value="5">5 questions</option><option value="10">10 questions</option></select></div></div>
            <div className="light-field"><label htmlFor="practice-difficulty">Level</label><div className="select"><select id="practice-difficulty" value={S.difficulty} onChange={(e) => { S.difficulty = e.target.value; rerender(); }}><option value="">Adaptive</option><option value="foundation">Foundation</option><option value="standard">Standard</option><option value="stretch">Stretch</option></select></div></div>
            <div className="light-field"><label htmlFor="practice-topic">Topic</label><div className="select"><select id="practice-topic" value={S.topic} onChange={(e) => { S.topic = e.target.value; rerender(); }}><option value="">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></div></div>
          </div></div>
        {sy.offline ? <p className="light-sync">Offline. Answers are saved on this computer and sync when you’re back online. {n}</p> : n ? <p className="light-sync">{n}</p> : null}
        {S.lastRun && <><p className="light-last">Last run: {S.lastRun.answered} answered, {S.lastRun.correct} right.</p>{recap(S.lastRun.outcomes)}</>}
        {sr && (
          <div className="light-recap"><p><strong>Your unfinished round</strong> · {modeOf(sr.run.mode).title}{sr.run.topic ? ` · ${sr.run.topic}` : ""}</p><p>Your place and draft are kept in this tab for up to a day.</p>
            <div className="light-actions"><button id="practice-resume" className="button is-primary" type="button" onClick={() => resumeRound()}>Resume round</button><button id="practice-discard" className="button is-ghost" type="button" onClick={() => { forgetRound(); rerender(); }}>Discard round</button></div></div>
        )}
        <div className="light-modes">{[MIXED, ...catalog.modes].map((m: Any) => {
          const c = counts(m.id);
          return (
            <button key={m.id} className="light-mode" type="button" disabled={!c.total} onClick={() => start(m.id)}>
              <span className="light-duration">{m.duration}</span><strong>{m.title}</strong><span>{m.description}</span>
              <span className="light-mode-stats">{c.total} question{c.total === 1 ? "" : "s"}{c.missed ? <> · <b>{c.missed} to revisit</b></> : null}{c.fresh ? ` · ${c.fresh} new` : ""}</span></button>
          );
        })}</div>
        <p className="light-footnote"><kbd>1</kbd>–<kbd>4</kbd> answer a choice · <kbd>Enter</kbd> checks and moves on · <kbd>Esc</kbd> stops. These reps don’t change your solve counts, mastery, or review schedule.</p>
      </>
    );
  }

  // ---- a round ----
  if (S.fatal) return <>{runBar()}<div className="empty"><p>{S.fatal}</p><button id="practice-retry" className="button" onClick={() => (S.current ? resumeRound(S.savedRound) : advance())}>Try again</button></div></>;
  if (S.loading || !S.current) return <>{runBar()}<Loader message={S.pendingAnswer || S.draft ? "Restoring your round…" : "Loading the next question…"} /></>;
  const q = S.current, r = S.result, recall = S.recall, choice = q.input_type === "choice" && !recall, array = q.input_type === "array";
  const busy = S.submitting || !!r;
  const run = S.run;
  return (
    <div className="light-workspace">{runBar()}
      <article className="light-question" aria-labelledby="practice-question-title">
        <div className="light-question-meta"><span>{catalog.modes.find((m: Any) => m.id === q.mode)?.title}{q.difficulty ? ` · ${q.difficulty}` : ""}</span></div>
        <h2 id="practice-question-title" className="light-prompt" tabIndex={-1}>{q.prompt}</h2>{q.rules && <p className="light-rules">{q.rules}</p>}
        {q.code && <pre className="light-code"><code>{q.code}</code></pre>}
        {q.input_type === "choice" && ["trace", "fill"].includes(q.mode) && (
          <button id="practice-recall" className="button is-small" type="button" disabled={busy} onClick={() => { if (S.submitting || S.result) return; S.assisted = true; S.recall = !S.recall;
            if (!S.recall) api("/practice/exposure", "POST", { question_id: q.id, choices: true, exposed_at: Math.floor((S.exposedAt as number) / 1000) }).catch(() => {}); saveRound(); rerender(); }}>{recall ? "Show choices" : "Answer from memory"}</button>
        )}
        {choice ? (
          <div className="light-options" role="group" aria-label="Answer choices">{q.options.map((o: Any, i: number) => (
            <button key={o.id} className={`light-option${r && o.id === r.correct_option ? " is-correct" : ""}${r && !r.correct && o.id === r.answer ? " is-wrong" : ""}`} type="button" disabled={busy} onClick={() => submit(false, o.id)}>
              <kbd className="light-key">{i + 1}</kbd><span>{o.text}</span></button>))}</div>
        ) : (
          <>
            <label className="label-sm" htmlFor="practice-input">{recall ? "Your answer" : "Your counterexample"}</label>
            <textarea id="practice-input" className="input mono light-input" rows={2} placeholder={recall ? "Type the state or missing code" : "[1, 2, 1]"} autoComplete="off" spellCheck={false} maxLength={300} disabled={busy} autoFocus
              defaultValue={S.draft} onChange={(e) => { S.draft = e.target.value; saveRound(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); void submit(false, (e.target as HTMLTextAreaElement).value); } }} />
            <p className="light-input-help">{recall ? "Use the displayed variable names and expression structure for code; JSON or Python literals for states." : "A JSON array."} <kbd>Enter</kbd> checks · <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line.</p>
          </>
        )}
        <p id="practice-error" className="light-error" role="alert">{S.error}</p>
        {!r && <div id="practice-actions" className="light-actions">{!choice && <button className="button is-primary" id="practice-check" type="button" disabled={busy} onClick={() => submit(false, (document.getElementById("practice-input") as HTMLTextAreaElement).value)}>Check <kbd>Enter</kbd></button>}<button className="button is-ghost" id="practice-reveal" type="button" disabled={busy} onClick={() => submit(true)}>Show answer</button></div>}
        <div id="practice-feedback" aria-live="polite">
          {S.hintBox && !r && <section className="light-feedback"><h3>Try another input</h3><p>Expected <code>{JSON.stringify(S.hintBox.expected)}</code>; returned <code>{JSON.stringify(S.hintBox.actual)}</code>. This input does not expose the bug.</p><details><summary>Hint</summary><p>Try the smallest allowed input, duplicates, or boundary values. Check which elements the code actually visits.</p></details></section>}
          {r && (
            <>
              <section className={`light-feedback ${r.correct ? "is-correct" : ""}`}>
                <h3>{r.revealed ? "Here’s the answer" : r.correct ? "That’s right" : array ? "This input doesn’t expose the bug" : "Not quite"}</h3>
                {r.mistake && <p>{r.mistake}</p>}
                {array && !r.revealed && <div className="light-output"><span>Expected <code>{JSON.stringify(r.expected)}</code></span><span>Function returned <code>{JSON.stringify(r.actual)}</code></span></div>}
                {array ? (!r.correct && <p>A breaking input: <code>{r.solution}</code>{r.revealed ? "" : <>. Expected <code>{JSON.stringify(r.example_expected)}</code>, returned <code>{JSON.stringify(r.example_actual)}</code></>}.</p>) : (!r.correct && <p className="light-solution">{r.solution}</p>)}
                <p>{r.explanation}</p>
                {r.related_problems?.length > 0 && <aside className="light-apply"><strong>Apply this skill in a full problem</strong><p>You’ve completed at least two unassisted reps of this concept.</p>{r.related_problems.map((p: Any) => <a key={p.url} className="button is-small" href={p.url} target="_blank" rel="noopener">{p.title} ↗ </a>)}</aside>}
                {r.walkthrough?.length > 0 && <details className="light-walkthrough"><summary>Walk through the values</summary><table><caption>{array ? "Where the outputs diverge" : "Given values and the answer"}</caption><tbody>{r.walkthrough.map(([label, value]: string[]) => <tr key={label}><th scope="row">{label}</th><td><code>{value}</code></td></tr>)}</tbody></table>{q.mode === "fill" && <pre className="light-code"><code>{q.code.replace("___", r.solution)}</code></pre>}</details>}
              </section>
              <div className="light-actions">
                {r.correct && !r.guessed && <button id="practice-guess" className="button is-ghost" type="button" disabled={S.submitting} onClick={markGuessed}>I guessed — revisit sooner</button>}
                {r.guessed ? <span>Marked as a guess · will revisit sooner</span> : r.assisted ? <span>Completed with help · will revisit sooner</span> : null}
                <button id="practice-next" className="button is-primary" type="button" autoFocus onClick={() => advance()}>{run.limit && run.answered >= run.limit ? "Finish round" : "Next"} <kbd>Enter</kbd></button>
              </div>
            </>
          )}
        </div>
      </article>
    </div>
  );
}
