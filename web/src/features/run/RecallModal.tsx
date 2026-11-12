"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useOverview } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { ComplexityFields } from "@/components/forms/ComplexityFields";
import { ProblemStatement } from "@/components/ProblemStatement";
import { Loader } from "@/components/ui/Loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
// The recall rubric (coach.RECALL_RUBRIC_VERSION 2) matches plan grading: could you start coding from it? Older grades keep their bare n/3.
const RECALL_VERDICTS: Record<number, string> = { 3: "Ready to code", 2: "Missing the key step", 1: "Too vague to code from", 0: "Wouldn't work" };
const coachText = (t: string) => t.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p));

type Phase = { k: "write" } | { k: "grading"; messages: string[] } | { k: "graded"; g: Any } | { k: "failed"; err: string } | { k: "pending" } | { k: "self"; confidence: number } | { k: "pick" } | { k: "error"; message: string };

function Grade({ g, recall, attemptId }: { g: Any; recall: Any; attemptId: string | null }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const positives: string[] = (g.positives || g.key_ideas_hit || []).filter(Boolean), negatives: string[] = (g.negatives || g.key_ideas_missed || []).filter(Boolean);
  const analysis = g.analysis || g.feedback || "";
  const word = g.grade != null && (g.rubric || 0) >= 2 ? RECALL_VERDICTS[g.grade] : null;
  const ask = async () => {
    if (!q.trim()) { toast("Ask a clarification question first."); return; }
    if (!attemptId) return;
    setBusy(true); setReply("Asking…");
    try { const r = await api(`/review/recall/${attemptId}/clarify`, "POST", { question: q.trim() }); setReply(r.reply || "No clarification returned."); }
    catch (e) { setReply((e as Error).message || "Recall clarification is unavailable."); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="grade-score">{g.grade == null ? "Recall" : word ? <>Recall: <b>{word}</b> <span className="small">{g.grade}/3</span></> : <>Recall grade: <b>{g.grade}/3</b></>}
        {g.optimal && <> <span className="tag grade-optimal">optimal</span></>}</div>
      {analysis && <p className="grade-analysis">{analysis}</p>}
      {positives.length > 0 && <div className="grade-bullets grade-positives"><b>What you had</b><ul>{positives.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {negatives.length > 0 && <div className="grade-bullets grade-negatives"><b>What was missing</b><ul>{negatives.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      <div className="grade-meta small">{recall.category && <span>{recall.category}</span>}<span>Next review scheduled</span>
        {recall.slug && <a href={`https://leetcode.com/problems/${encodeURIComponent(recall.slug)}/editorial/`} target="_blank" rel="noopener">Read the editorial ↗</a>}</div>
      {attemptId && (
        <div className="recall-clarify"><label className="label-sm" htmlFor="recall-clarify-text">Ask about this grade</label>
          <div className="recall-clarify-row">
            <textarea id="recall-clarify-text" className="textarea" data-dictate rows={2} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="What should I clarify about the answer or grade?" value={q} onChange={(e) => setQ(e.target.value)} />
            <button id="btn-recall-clarify" className="button" disabled={busy} onClick={ask}>Ask</button></div>
          {reply != null && <div id="recall-clarify-reply" className="small recall-clarify-reply">{reply}</div>}</div>
      )}
    </>
  );
}

// Approach-recall: from memory, as you would tell the interviewer. Graded on whether you could code from it, not on the code.
export function RecallModal({ req, onClose }: { req: NonNullable<ReturnType<typeof useFlow.getState>["recall"]>; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const llm = useOverview().data?.llm_enabled ?? false;
  const requestStart = useFlow((s) => s.requestStart);
  const opened = useRef(Date.now());
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [space, setSpace] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hinting, setHinting] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "write" });
  const [attemptId, setAttemptId] = useState<string | null>(req.attemptId ?? null);
  const [msgIndex, setMsgIndex] = useState(0);
  const selfGradeResolve = useRef<((c: number | null) => void) | null>(null);
  const ctx = useQuery({ queryKey: ["api", "recall-context", req.slug], queryFn: () => api(`/problem/${encodeURIComponent(req.slug)}/recall-context`), retry: false, staleTime: 0 });
  const title = ctx.data?.title || req.title || req.slug;
  const category = ctx.data?.category || req.category;

  useEffect(() => {
    if (!req.attemptId) return;
    api(`/review/recall/${req.attemptId}`).then((a) => {
      setText(a.approach || ""); setTime(a.complexity_time || ""); setSpace(a.complexity_space || "");
      if (a.grading_status === "pending") setPhase({ k: "pending" });
      else if ((a.grading_status === "ready" || a.grading_status === "viewed") && !a.recall_grade) setPhase({ k: "self", confidence: a.confidence });
      else if (a.grading_status === "ready" || a.grading_status === "viewed") setPhase({ k: "graded", g: a.recall_grade });
      else if (a.grading_status === "failed") setPhase({ k: "failed", err: a.grading_error });
    }).catch((e) => toast(e.message));
  }, [req.attemptId, toast]);
  useEffect(() => { if (phase.k !== "grading" || phase.messages.length < 2) return; const t = setInterval(() => setMsgIndex((n) => n + 1), 1400); return () => clearInterval(t); }, [phase]);

  const locked = phase.k === "grading" || phase.k === "graded" || phase.k === "pending" || phase.k === "self" || phase.k === "pick";
  const refresh = () => qc.invalidateQueries();
  const hint = async () => {
    setHinting(true);
    try { const res = await api("/review/recall/hint", "POST", { slug: req.slug, recall_text: text, previous: hints }); if (!res.hint) toast("No more hints for this one."); else setHints([...hints, res.hint]); }
    catch (e) { toast((e as Error).message); } finally { setHinting(false); }
  };
  const pickSelfGrade = () => new Promise<number | null>((resolve) => { selfGradeResolve.current = resolve; setPhase({ k: "pick" }); });
  const submit = async () => {
    const body: Any = { slug: req.slug, recall_text: text.trim(), elapsed_sec: (Date.now() - opened.current) / 1000, complexity_time: time.trim() || null, complexity_space: space.trim() || null, hints };
    if (!llm) {
      const c = await pickSelfGrade(); selfGradeResolve.current = null;
      if (c == null) { setPhase({ k: "write" }); return; }
      body.confidence = c; setPhase({ k: "grading", messages: ["Scheduling your next review…"] });
    } else {
      if (!text.trim()) { toast("Jot down your recall first."); return; }
      setMsgIndex(0); setPhase({ k: "grading", messages: ["Reading your recall…", "Comparing against your past solution…", "Checking for the key trick…", "Grading…"] });
    }
    let r;
    try { r = await api("/review/recall", "POST", body); } catch (e) { refresh(); setPhase({ k: "error", message: (e as Error).message }); return; }
    refresh(); setAttemptId(r.attempt_id);
    if (r.grading_status === "failed") { setPhase({ k: "failed", err: r.grading_error }); return; }
    if (r.graded) setPhase({ k: "graded", g: r.graded }); else { onClose(); toast("Recall logged ✅"); }
  };
  const selfGradeFailed = async () => {
    const c = await pickSelfGrade(); selfGradeResolve.current = null;
    if (c == null) { setPhase({ k: "failed", err: (phase as Any).err }); return; }
    try { await api(`/review/recall/${attemptId}/self-grade`, "POST", { confidence: c }); } catch (e) { toast((e as Error).message); setPhase({ k: "failed", err: "" }); return; }
    refresh(); onClose(); toast("Recall logged ✅");
  };
  const close = () => { selfGradeResolve.current?.(null); onClose(); };
  const codeInstead = () => { onClose(); requestStart({ slug: req.slug, kind: req.kind || "adhoc", mode: "", title, category }); };

  return (
    <div className="overlay">
      <div className={`overlay-card recall-wide${phase.k === "graded" ? " is-graded" : ""}`} role="dialog" aria-modal="true">
        <h2 className="modal-title">Quick recall</h2>
        <p className="small" id="recall-problem">{title}</p>
        <div id="recall-statement">{ctx.isLoading ? <Loader message="Loading problem prompt..." /> : <ProblemStatement problem={ctx.data} slug={req.slug} error={ctx.error as Error | null} />}</div>
        <p className="help">From memory, as you would tell the interviewer. A rough sketch is fine: you&apos;re graded on whether you could code from it, not on the code.</p>
        <label className="label-sm" htmlFor="recall-text">How would you solve it? <span className="help-inline">the key idea and why it works</span></label>
        <textarea id="recall-text" className="textarea" data-dictate rows={4} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} disabled={locked} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. a monotonic stack of increasing heights. When a shorter bar arrives, pop and measure each taller bar's rectangle, because the shorter bar is where it ends." />
        <div id="recall-complexities" className="mt-2"><ComplexityFields idPrefix="recall" time={time} space={space} onTime={setTime} onSpace={setSpace} disabled={locked} /></div>
        {hints.length > 0 && <div id="recall-hints">{hints.map((h, i) => <div key={i} className={`hint-card${i === hints.length - 1 ? " is-latest" : ""}`}><div className="note-head"><span>Hint {i + 1}</span></div><p>{coachText(h)}</p></div>)}</div>}
        <div id="recall-grade" className="recall-grade">
          {phase.k === "grading" && <div className="grading"><span className="spinner" /><span className="grading-text">{phase.messages[msgIndex % phase.messages.length]}</span></div>}
          {phase.k === "graded" && <Grade g={phase.g} recall={{ category, slug: req.slug }} attemptId={attemptId} />}
          {phase.k === "pending" && <p className="small">This recall is still grading. Try again in a moment.</p>}
          {phase.k === "self" && <p className="small">Self-graded: <b>{["", "Low", "Med", "High"][phase.confidence] || "—"}</b></p>}
          {phase.k === "failed" && <p className="missed"><b>Grading failed:</b> {phase.err || "Unknown error"}</p>}
          {phase.k === "error" && <p className="missed">{phase.message}</p>}
          {phase.k === "pick" && <><label>Self-grade your recall:</label><div className="pill-group" id="recall-selfgrade">{[[1, "Low"], [2, "Med"], [3, "High"]].map(([v, l]) => <button key={v} onClick={() => selfGradeResolve.current?.(v as number)}>{l}</button>)}</div></>}
        </div>
        <div className="overlay-actions" id="recall-actions">
          {phase.k === "write" || phase.k === "error" ? <>
            <button id="btn-close-recall" className="button is-ghost" onClick={close}>Cancel</button>
            {llm && <button id="btn-hint-recall" className="button" type="button" disabled={hinting} aria-busy={hinting || undefined} title="A small nudge from what you've written so far — words, not code" onClick={hint}>{hints.length ? "Another hint" : "Hint"}</button>}
            <button id="btn-code-recall" className="button" type="button" title="Write it out in the editor instead — a full re-solve, compared with your last one" onClick={codeInstead}>Code it instead</button>
            <button id="btn-submit-recall" className="button is-primary" onClick={submit}>{phase.k === "error" ? "Try again" : llm ? "Check my recall" : "Grade & schedule"}</button></>
            : phase.k === "grading" ? <><button className="button is-ghost" disabled>Cancel</button><button className="button is-primary" disabled><span className="spinner spinner-sm" /> Grading…</button></>
            : phase.k === "failed" ? <><button id="btn-close-recall" className="button is-ghost" onClick={close}>Cancel</button><button id="btn-selfgrade-recall" className="button" onClick={selfGradeFailed}>Grade it myself</button><button id="btn-submit-recall" className="button is-primary" onClick={() => { setPhase({ k: "write" }); setTimeout(submit, 0); }}>Retry grading</button></>
            : phase.k === "pick" ? <button className="button is-ghost" onClick={close}>Cancel</button>
            : <button id="btn-close-recall" className="button is-primary" onClick={close}>{phase.k === "graded" ? "Done" : "Close"}</button>}
        </div>
      </div>
    </div>
  );
}
