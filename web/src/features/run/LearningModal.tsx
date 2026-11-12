"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Loader } from "@/components/ui/Loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Focused lessons overlay the current editor, preserving its draft and clock.
function Sequence({ sequence, onClose }: { sequence: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["learning-sequence", sequence], staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const state = await api("/learning/sequence", "POST", { sequence, action: "open" }); const lesson = await api(`/learning/sequence/${encodeURIComponent(sequence)}`); return { state, lesson }; },
  });
  const [answer, setAnswer] = useState(""), [explanation, setExplanation] = useState("");
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  const state: Any = q.data?.state, lesson: Any = q.data?.lesson;
  const draftKey = state ? `learning-draft:${sequence}:${state.episode}` : "";

  const show = (r: Any) => {
    const done = r.correct === true; setCompleted(done);
    const reviewDate = r.probe_due_at ? new Date(r.probe_due_at * 1000).toLocaleDateString() : "";
    setResult({ ok: done, text: done ? `Correct — focused practice complete. ${lesson.correct_feedback} A separate retention review${reviewDate ? ` on ${reviewDate}` : ""} will appear in Today.` : `Not quite. ${lesson.incorrect} Edit the missing step and try again.` });
  };
  useEffect(() => {
    if (!q.data || loaded.current) return; loaded.current = true;
    let draft: Any = {}; try { draft = JSON.parse(localStorage.getItem(draftKey) || "null") || {}; } catch { /* none */ }
    const a = state.correct ? state.answer || "" : draft.answer ?? state.answer ?? "", e = state.correct ? state.explanation || "" : draft.explanation ?? state.explanation ?? "";
    setAnswer(a); setExplanation(e);
    if (state.correct || (state.correct === false && a === state.answer && e === state.explanation)) show(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const edit = (a: string, e: string) => { setAnswer(a); setExplanation(e); try { localStorage.setItem(draftKey, JSON.stringify({ answer: a, explanation: e })); } catch { /* ignore */ } setResult(null); };
  const check = async () => {
    if (completed) { onClose(); return; }
    setBusy(true);
    try {
      const r = await api("/learning/sequence", "POST", { sequence, action: "complete", answer, explanation });
      show(r);
      if (r.correct === true) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } qc.invalidateQueries(); }
    } catch (e) { setResult({ ok: false, text: `Could not check this step: ${(e as Error).message}. Your answers are kept; try again.` }); } finally { setBusy(false); }
  };
  if (q.isLoading) return <Loader />;
  if (q.error) return <p className="missed">{(q.error as Error).message}</p>;
  return (
    <>
      <div className="learning-principle"><p>{lesson.principle}</p><p className="learning-worked"><span>Example</span>{lesson.worked}</p></div>
      <section className="learning-step"><span className="learning-step-n">1</span><div>
        <label className="learning-q" htmlFor="learning-explanation">{lesson.explain}</label><p className="label-sm">Reflection — saved for you, not automatically graded.</p>
        <textarea id="learning-explanation" className="input" rows={3} placeholder="Explain in your own words…" value={explanation} readOnly={busy || completed} onChange={(e) => edit(answer, e.target.value)} /></div></section>
      <section className="learning-step"><span className="learning-step-n">2</span><div>
        <p className="learning-q">{lesson.objective}</p><pre className="code">{lesson.code}</pre>
        <label className="label-sm" htmlFor="learning-answer">Complete the missing step</label>
        <textarea id="learning-answer" className="input mono" rows={2} value={answer} readOnly={busy || completed} onChange={(e) => edit(e.target.value, explanation)} /></div></section>
      <p id="learning-result" className={`learning-result${result ? (result.ok ? " is-ok" : " is-bad") : ""}`} role="status" aria-live="polite">{result?.text}</p>
      <div className="overlay-actions learning-actions">
        {!completed && <button id="learning-decline" className="button is-ghost" disabled={busy} onClick={async () => { await api("/learning/sequence", "POST", { sequence, action: "decline" }); qc.invalidateQueries(); onClose(); }}>Dismiss for this session</button>}
        <button id="learning-check" className="button is-primary" disabled={busy} onClick={check}>{busy ? "Checking…" : completed ? "Done" : result && !result.ok ? "Try again" : "Check this step"}</button>
      </div>
      <span hidden>{state?.episode}</span>
    </>
  );
}

function Application({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const opened = useRef(Date.now());
  const q = useQuery({ queryKey: ["learning-application", id], queryFn: () => api(`/learning/application/${encodeURIComponent(id)}`), retry: false });
  const [answer, setAnswer] = useState(""), [seen, setSeen] = useState(false), [result, setResult] = useState<{ ok: boolean } | null>(null);
  useEffect(() => { if (q.error) { onClose(); toast((q.error as Error).message); } }, [q.error, onClose, toast]);
  if (!q.data) return <Loader />;
  return (
    <>
      <div className="learning-principle"><p>{q.data.prompt}</p></div>
      <label className="label-sm" htmlFor="application-answer">Your answer</label>
      <textarea id="application-answer" className="input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <label className="learning-seen"><input id="application-seen" type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} /> I have seen this task before</label>
      <p id="application-result" className={`learning-result${result ? (result.ok ? " is-ok" : " is-bad") : ""}`}>{result ? (result.ok ? "Correct application." : "This application needs more practice.") : ""}</p>
      <div className="overlay-actions learning-actions"><button id="application-submit" className="button is-primary" disabled={!!result}
        onClick={async () => { const r = await api("/learning/application", "POST", { id, answer, seen_before: seen, elapsed_sec: (Date.now() - opened.current) / 1000 }); setResult({ ok: !!r.probe_correct }); }}>Check</button></div>
    </>
  );
}

export function LearningModal({ learning, onClose }: { learning: { type: "sequence"; sequence: string } | { type: "application"; id: string }; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay-card wide" role="dialog" aria-modal="true" aria-labelledby="learning-title">
        <div className="modal-titlebar"><div><p className="learning-kicker">Focused practice</p><h2 className="modal-title" id="learning-title">{learning.type === "application" ? "Later application" : "Focused practice"}</h2></div>
          <button id="learning-close" className="button is-ghost icon-button" type="button" aria-label="Close" title="Close (Esc)" onClick={onClose}>&times;</button></div>
        <div id="learning-body">{learning.type === "sequence" ? <Sequence sequence={learning.sequence} onClose={onClose} /> : <Application id={learning.id} onClose={onClose} />}</div>
      </div>
    </div>
  );
}
