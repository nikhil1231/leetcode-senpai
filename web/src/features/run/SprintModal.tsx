"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { sanitizeProblemHtml } from "@/components/ProblemStatement";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const LIMIT = 60;

// Pattern sprint: read each statement without opening LeetCode, choose the pattern, add one short reason. 60 seconds a
// prompt. Next saves and moves on; Skip leaves the rep unanswered; Finish grades the answers saved so far.
export function SprintModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const round = useQuery({ queryKey: ["sprint-round"], staleTime: Infinity, gcTime: 0, retry: false, queryFn: () => api("/sprint/start", "POST", {}) });
  const topics = useQuery({ queryKey: ["api", "/topics"], queryFn: () => api("/topics") });
  const [stage, setStage] = useState<"intro" | "rep" | "grading" | "summary" | "error">("intro");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Any[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [category, setCategory] = useState("");
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reps: Any[] = round.data?.reps || [];

  useEffect(() => { if (stage !== "rep") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [stage]);
  useEffect(() => { if (round.error) toast((round.error as Error).message); }, [round.error, toast]);

  const rep = reps[index];
  const categories: string[] = useMemo(() => {
    const base: string[] = (topics.data || []).map((t: Any) => t.category);
    return rep?.category && !base.includes(rep.category) ? [...base, rep.category].sort((a, b) => a.localeCompare(b)) : base;
  }, [topics.data, rep]);
  const statement = useMemo(() => sanitizeProblemHtml(rep?.content_html), [rep]);

  const next = (res: Any[], i: number) => { setResults(res); setIndex(i); setCategory(""); setWhy(""); setStartedAt(Math.floor(Date.now() / 1000)); setNow(Date.now()); if (i >= reps.length) void summarise(res); };
  const submit = async () => {
    if (!category) { toast("Pick a category."); return; }
    if (!why.trim()) { toast("Add a one-line why."); return; }
    setSaving(true);
    try {
      const r = await api("/sprint/submit", "POST", { round_id: round.data.round_id, slug: rep.slug, predicted_category: category, why: why.trim() });
      next([...results, { slug: r.slug, title: rep.title || r.slug, actual_category: r.actual_category || rep.category || "Unknown", predicted_category: category, why: why.trim(), attempt_id: r.attempt_id, grading_status: r.grading_status || "pending" }], index + 1);
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };
  const skip = () => next([...results, { slug: rep?.slug, title: rep?.title, skipped: true }], index + 1);
  const summarise = async (res: Any[]) => {
    setStage("grading");
    try {
      const r = await api("/sprint/grade", "POST", { round_id: round.data.round_id });
      const by = Object.fromEntries((r.results || []).map((x: Any) => [x.attempt_id, x]));
      setResults(res.map((x) => (x.skipped || !x.attempt_id ? x : { ...x, ...(by[x.attempt_id] || {}) })));
      setStage("summary"); qc.invalidateQueries();
    } catch (e) { setError((e as Error).message); setStage("error"); toast((e as Error).message); }
  };

  const left = Math.max(0, LIMIT - Math.max(0, Math.floor(now / 1000) - startedAt));
  const progress = stage === "intro" ? `${reps.length} reps ready` : stage === "rep" ? `Rep ${index + 1} of ${reps.length}` : stage === "grading" ? "Grading" : stage === "summary" ? "Complete" : "";
  const counts: Record<string, number> = { correct: 0, partial: 0, wrong: 0, unknown: 0, skipped: 0 };
  const weak: Record<string, number> = {};
  if (stage === "summary") results.forEach((r) => { if (r.skipped) { counts.skipped++; return; } const v = counts[r.verdict] == null ? "unknown" : r.verdict; counts[v]++; if (v !== "correct" && r.actual_category) weak[r.actual_category] = (weak[r.actual_category] || 0) + 1; });
  const weakRows = Object.entries(weak).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="overlay">
      <div className="overlay-card sprint-wide" role="dialog" aria-modal="true" aria-labelledby="sprint-heading">
        <div className="modal-titlebar"><div><h2 className="modal-title" id="sprint-heading">Sprint round</h2><p id="sprint-progress" className="small">{progress}</p></div>
          <button id="btn-close-sprint" className="button is-ghost icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}>&times;</button></div>
        <div id="sprint-body">
          {round.isLoading && <Loader message="Building sprint round..." />}
          {round.error && <p className="missed"><b>Could not start sprint:</b> {(round.error as Error).message}</p>}
          {round.data && !reps.length && <p className="empty">No sprint reps available. Import more problems or finish a few attempts first.</p>}
          {round.data && reps.length > 0 && stage === "intro" && (
            <div className="sprint-intro"><h3>Pattern sprint rules</h3><p>Read each statement without opening LeetCode, choose the pattern, and add one short reason for the signal you noticed.</p>
              <ul><li>You get 60 seconds per prompt.</li><li>Next saves your answer and immediately moves on.</li><li>Skip leaves the rep unanswered; Finish grades the answers saved so far.</li></ul>
              <div className="overlay-actions"><button id="btn-begin-sprint" className="button is-primary" onClick={() => { setStartedAt(Math.floor(Date.now() / 1000)); setStage("rep"); }}>Start</button></div></div>
          )}
          {stage === "rep" && rep && (
            <div className="sprint-layout">
              <section className="sprint-statement">
                <div className="sprint-problem-head"><div><h3>{rep.title || rep.slug}</h3><div className="small">{rep.reason || ""}</div></div>
                  <div className="sprint-head-tags"><DifficultyBadge difficulty={rep.difficulty} /><span className={`sprint-countdown${left === 0 ? " is-expired" : ""}`} id="sprint-countdown">{fmtTime(left)}</span></div></div>
                <div className="recall-statement sprint-prompt">{statement ? <div dangerouslySetInnerHTML={{ __html: statement }} /> : <p className="small">Prompt unavailable for this rep.</p>}</div>
              </section>
              <section className="sprint-answer">
                <label className="label-sm">Pattern / category</label>
                <div className="select is-fullwidth"><select id="sprint-category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="" disabled>Choose category</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <label className="label-sm">Why</label>
                <input id="sprint-why" className="input" type="text" placeholder="One line: key signal in the statement" value={why} onChange={(e) => setWhy(e.target.value)} />
                <div className="overlay-actions" id="sprint-actions">
                  <button className="button is-ghost" onClick={skip}>Skip</button>
                  <button className="button is-ghost" onClick={() => { setIndex(reps.length); void summarise(results); }}>Finish</button>
                  <button className="button is-primary" disabled={saving} onClick={submit}>{saving ? <><span className="spinner spinner-sm" /> Saving...</> : "Next"}</button>
                </div>
              </section>
            </div>
          )}
          {stage === "grading" && <Loader message="Grading sprint answers..." />}
          {stage === "error" && <><p className="missed"><b>Could not grade sprint:</b> {error}</p><div className="overlay-actions"><button className="button is-primary" onClick={onClose}>Done</button></div></>}
          {stage === "summary" && (
            <div className="sprint-summary">
              <div className="sprint-summary-grid">{Object.entries(counts).map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div>
              <h3>Weakest categories</h3>
              {weakRows.length ? <ul>{weakRows.map(([c, n]) => <li key={c}>{c} <span className="small">{n} miss{n === 1 ? "" : "es"}</span></li>)}</ul> : <p className="empty">No misses this round.</p>}
              <h3>Answers</h3>
              {results.length ? <ul>{results.map((r, i) => r.skipped ? <li key={i}><b>{r.title || r.slug}</b><div className="small">Skipped</div></li> : (
                <li key={i}><b>{r.title || r.slug}</b><div className="small">Answer: {r.predicted_category || ""} — {r.why || ""}</div>
                  <div className="small">Actual: {r.actual_category || "Unknown"} · Verdict: <span className={`pred-${r.verdict || "unknown"}`}>{r.verdict || "unknown"}</span></div>{r.note && <div className="small">{r.note}</div>}</li>))}</ul> : <p className="empty">No submitted answers.</p>}
              <div className="overlay-actions"><button id="btn-done-sprint" className="button is-primary" onClick={onClose}>Done</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
