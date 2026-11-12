"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime, pct, solveSecOf } from "@/lib/format";
import { useOverview, useLeetcodeStatus } from "@/lib/queries";
import { useRun } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { DifficultyBadge } from "@/components/ui/Badge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const PLAN_SOFT_LIMIT_DEFAULT_SEC = 6 * 60;
const APPROACH_VERDICTS: Record<string, [string, string]> = { viable: ["ready to code", "ok"], partial: ["missing the key step", "partial"], wrong: ["wouldn't work", "miss"] };
const PLAN_VERDICTS: Record<string, [string, string]> = { correct: ["right", "ok"], partial: ["partly", "partial"], wrong: ["off", "miss"] };
const Tag = ({ verdict, labels = PLAN_VERDICTS }: { verdict: string; labels?: Record<string, [string, string]> }) => { const [label, tone] = labels[verdict] || []; return label ? <span className={`plan-tag is-${tone}`}>{label}</span> : null; };

// Keyed by the code, so a better Accepted after "Try it" gets asked again.
const followupSeen = new Set<string>();
const followupKey = (a: Any) => `${a.id}|${a.code || ""}`;

function Facts({ attempt }: { attempt: Any }) {
  const untimed = attempt.time_taken_sec == null && attempt.source === "detected";
  const was = (key: string) => { const b = (attempt.before_optimize || {})[key]; return b != null && b !== attempt[key] ? <> <span className="small">(was {pct(b)})</span></> : null; };
  const perf = [["Runtime", "runtime_percentile"], ["Memory", "memory_percentile"]].filter(([, k]) => attempt[k] != null);
  const taken = solveSecOf(attempt);
  const facts: React.ReactNode[] = [];
  if (attempt.unsolved) facts.push(<>Ended <b>unsolved</b></>);
  if (untimed) facts.push(<>Solved <b>outside a session</b></>);
  else facts.push(<>Time <b>{fmtTime(taken)}</b>
    {attempt.plan_status !== "skipped" && attempt.plan_time_sec && attempt.time_taken_sec != null ? <> <span className="small">(plan {fmtTime(attempt.plan_time_sec)} · code {fmtTime(attempt.time_taken_sec)})</span></> : null}
    {attempt.par_sec && taken != null ? <> <span className={`small${taken > attempt.par_sec ? " is-over" : ""}`}>/ {Math.round(attempt.par_sec / 60)}m pace</span></> : null}</>);
  if (attempt.resubmissions) {
    facts.push(<>Accepted subs <b>{attempt.resubmissions + 1}</b></>);
    if (attempt.first_ac_time_taken_sec != null) facts.push(<>First AC <b>{fmtTime(solveSecOf(attempt, "first_ac_time_taken_sec"))}</b></>);
  }
  if (attempt.wrong_before_ac != null) facts.push(<>Wrong subs <b>{attempt.wrong_before_ac}</b></>);
  if (attempt.lang) facts.push(<>Lang <b>{attempt.lang}</b></>);
  if (attempt.interview) facts.push(<b>Interview mode</b>);
  return (
    <>
      {perf.length > 0 && (
        <div id="annotate-perf" className="solve-perf">{perf.map(([label, key]) => {
          const v = attempt[key];
          return <div key={key} className={`solve-perf-stat${v < 50 ? " is-low" : ""}`}><span className="solve-perf-label">{label}</span>
            <span className="solve-perf-value">beats <b>{pct(v)}</b>{was(key)}</span><span className="solve-perf-bar"><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span></div>;
        })}</div>
      )}
      <div id="annotate-facts" className="facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>
    </>
  );
}

function PlanCard({ attempt, onGrade }: { attempt: Any; onGrade: (id: string) => void }) {
  const plan = attempt.plan || {};
  if (!(plan.status === "planned" || plan.status === "blank")) return null;
  const limit = plan.soft_limit_sec || PLAN_SOFT_LIMIT_DEFAULT_SEC;
  const prev = attempt.previous_plan;
  const facts: React.ReactNode[] = [];
  if (plan.target_time) facts.push(<>Target <b>{plan.target_time}</b>{plan.target_space ? <> / <b>{plan.target_space}</b></> : null}</>);
  if (plan.pattern) facts.push(<>Pattern <b>{plan.pattern}</b></>);
  if (plan.check_revealed) facts.push("Plan check used");
  const bits: React.ReactNode[] = [];
  if (plan.status === "planned" && plan.graded) {
    if (plan.approach_verdict && plan.approach_verdict !== "unknown") bits.push(<Tag key="a" verdict={plan.approach_verdict} labels={APPROACH_VERDICTS} />);
    if (plan.score != null) bits.push(<span key="s" className="plan-score">{plan.score}/5</span>);
    if (plan.held) bits.push(<span key="h" className="small">plan {plan.held}</span>);
  }
  return (
    <section id="annotate-plan" className="plan-card annotate-row" aria-labelledby="annotate-plan-heading">
      <div className="plan-card-head"><h3 id="annotate-plan-heading" className="plan-card-title">Plan</h3>
        <span id="annotate-plan-meta" className={`small${(plan.plan_time_sec || 0) >= limit ? " is-over" : ""}`}>{plan.plan_time_sec != null && plan.status === "planned" ? `${fmtClock(plan.plan_time_sec)} of ${fmtClock(limit)}` : ""}</span></div>
      <div id="annotate-plan-grade" className="plan-grade">
        {plan.grading_error ? <><p className="missed"><b>Plan grading failed:</b> {plan.grading_error || "Unknown error"}</p><div className="grade-actions"><button className="button is-small is-link" onClick={() => onGrade(attempt.id)}>Retry</button></div></>
          : plan.status === "blank" ? <p className="small">Started with no idea yet.</p>
          : plan.status === "planned" && !plan.graded ? <div className="grading"><span className="spinner" /><span className="grading-text">Grading your plan…</span></div>
          : <><div className="plan-headline">{bits}</div>{plan.missing_step && <p className="small">Missing: {plan.missing_step}</p>}{plan.note && <p className="plan-note">{plan.note}</p>}</>}
      </div>
      <details className="annotate-more"><summary>Your plan</summary>
        <div id="annotate-plan-body">
          {plan.status === "blank" ? <p className="plan-blank">Started with <b>no idea yet</b>{plan.plan_time_sec != null ? ` after ${fmtClock(plan.plan_time_sec)} of thinking` : ""}. That&apos;s recorded as a struggle, so this problem comes back sooner.</p> : <>
            {plan.approach && <p className="plan-approach">{plan.approach}</p>}
            {facts.length > 0 && <div className="plan-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>}
            {plan.edge_cases?.length > 0 && <div className="plan-edges">{plan.edge_cases.map((c: string) => <span className="tag" key={c}>{c} </span>)}</div>}
          </>}
        </div>
        {prev?.approach && <p id="annotate-plan-previous" className="small plan-previous"><b>Last time{prev.solved_at ? ` (${new Date(prev.solved_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })})` : ""}:</b>{" "}
          {[prev.score != null ? `${prev.score}/5` : null, prev.held, prev.target_time ? `target ${prev.target_time}` : null].filter(Boolean).join(" · ") || (prev.planned ? "planned" : "explained")}</p>}
      </details>
    </section>
  );
}

function Process({ attempt, llm }: { attempt: Any; llm: boolean }) {
  const r = attempt.recording;
  const known = (attempt.enrichment || {}).process_review;
  const q = useQuery({ queryKey: ["api", "review-process", attempt.id], enabled: !!r && llm && !known, retry: false, staleTime: Infinity, queryFn: () => api(`/attempt/${attempt.id}/review-process`, "POST") });
  if (!r) return null;
  const at = (ms: number | null) => (ms == null ? "—" : fmtClock(Math.round(ms / 1000)));
  const stats = `first run ${at(r.first_run_ms)} · ${r.runs} run${r.runs === 1 ? "" : "s"} · ${r.failed_submits} failed submit${r.failed_submits === 1 ? "" : "s"}`;
  const review = known || q.data?.review;
  const stuck: string[] = (review?.stuck_points || []).slice(0, 2);
  return (
    <section id="annotate-process" className="plan-card annotate-row" aria-labelledby="annotate-process-heading">
      <div className="plan-card-head"><h3 id="annotate-process-heading" className="plan-card-title">How it went</h3></div>
      <div id="annotate-process-body">
        <p className="small process-stats">{stats}</p>
        {llm && !known && q.isLoading && <div className="grading"><span className="spinner" /><span className="grading-text">Reading how it went…</span></div>}
        {review && <>{stuck.length > 0 && <ul className="process-list">{stuck.map((x, i) => <li key={i}>{x}</li>)}</ul>}{review.takeaway && <p className="process-next"><b>Next time:</b> {review.takeaway}</p>}</>}
        {!review && q.data?.error && <p className="missed small">Couldn&apos;t read the run: {q.data.error}</p>}
      </div>
    </section>
  );
}

const improvementsOf = (g: Any): string[] => {
  const seen = new Set<string>();
  return (g.improve && g.improve.length ? g.improve : g.negatives || g.improvements || []).filter((x: string) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};

function SolutionGrade({ g, attempt }: { g: Any; attempt: Any }) {
  const plan = attempt.plan;
  const improve = improvementsOf(g), positives = (g.positives || []).filter(Boolean), objections: Any[] = (g.assessment || {}).correctness_objections || [];
  const t = g.inferred_time, sp = g.inferred_space;
  let cx: React.ReactNode = null;
  if (t || sp) {
    const optimum = plan && (plan.optimal_time || plan.optimal_space) ? ` · optimal ${plan.optimal_time || "?"} / ${plan.optimal_space || "?"}` : "";
    if (!g.optimal) cx = <p className="hero-cx"><b>Your code:</b> {t || "?"} time, {sp || "?"} space{optimum}</p>;
    else if (plan?.target_time && t && plan.target_time.replace(/\s/g, "").toLowerCase() !== t.replace(/\s/g, "").toLowerCase()) cx = <p className="hero-cx">You planned {plan.target_time}; your code is {t}.</p>;
  }
  return (
    <>
      <div className="hero-head"><span className="hero-score">{g.score}/5</span>{g.optimal ? <span className="plan-tag is-ok">optimal</span> : <span className="plan-tag is-partial">can be better</span>}</div>
      {g.analysis && <p className="grade-analysis">{g.analysis}</p>}
      {(g.corrections || []).map((c: Any, i: number) => <p className="small" key={i}><b>Assessment correction:</b> the saved code returns {c.observed_output} for {c.input}, so the objection below was disproved.</p>)}
      {objections.map((c, i) => <p className="missed small" key={i}><b>Possible bug ({c.verification}):</b> {c.explanation}</p>)}
      <div className="hero-improve"><h4>How to improve</h4>{improve.length ? <ul>{improve.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="small">Nothing to change: this is optimal and clean.</p>}</div>
      {cx}
      {positives.length > 0 && <details className="annotate-more"><summary>What worked</summary><ul className="process-list">{positives.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></details>}
      {attempt.slug && <p className="small grade-editorial"><a href={`https://leetcode.com/problems/${encodeURIComponent(attempt.slug)}/editorial/`} target="_blank" rel="noopener">Read the editorial ↗</a></p>}
    </>
  );
}

function NeedsCookie({ state, note, onSaved }: { state?: string; note?: string; onSaved: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(note || "");
  const why = state === "missing" ? "no LeetCode cookie is saved" : "your LeetCode cookie has expired";
  return (
    <>
      <p className="missed"><b>Can&apos;t fetch your code:</b> {why}. Paste a fresh LEETCODE_SESSION and it&apos;s fetched and graded right here.</p>
      {msg && <p className="missed">{msg}</p>}
      <form className="grade-cookie" onSubmit={async (e) => {
        e.preventDefault(); if (!value.trim()) return; setBusy(true);
        try { await api("/leetcode-auth", "POST", { session: value.trim(), csrf: null }); } catch { /* checked below */ }
        let s = "unknown"; try { ({ state: s } = await api("/leetcode-status")); } catch { /* unknown */ }
        qc.setQueryData(["api", "/leetcode-status"], { state: s });
        setBusy(false);
        if (s === "expired") { setMsg("LeetCode rejected that one — copy it again from a signed-in leetcode.com tab."); return; }
        onSaved();
      }}>
        <input id="grade-cookie-input" className="input is-small" type="password" autoComplete="off" placeholder="LEETCODE_SESSION value" aria-label="LEETCODE_SESSION cookie" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="button is-small is-link" type="submit" disabled={busy}>{busy ? "Checking…" : "Use cookie"}</button>
      </form>
    </>
  );
}

// The post-solve modal. An Accepted from the editor first gets the interviewer's follow-up ("can we do better?"), with
// no feedback yet, so you can still improve it yourself. Then the review: the solution grade leads, the plan and how
// the run went sit below in one line each, and choosing a confidence saves. Grading starts as the modal opens.
export function AnnotateModal({ initial, onClose }: { initial: Any; onClose: (opts?: { next?: boolean }) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const llm = useOverview().data?.llm_enabled ?? false;
  const lcState = useLeetcodeStatus().data?.state;
  const { setActive } = useRun();
  const [attempt, setAttempt] = useState<Any>(initial);
  const [stage, setStage] = useState<"followup" | "review">("review");
  const [followup, setFollowup] = useState<string | null>(null);
  const [grade, setGrade] = useState<{ kind: "none" } | { kind: "grading" } | { kind: "ok"; g: Any } | { kind: "error"; err: string } | { kind: "cookie"; state?: string }>({ kind: "none" });
  const [conf, setConf] = useState<number | null>(null);
  const [minutes, setMinutes] = useState("");
  const [looked, setLooked] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [rating, setRating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [gradingMsg, setGradingMsg] = useState(0);
  const jobs = useRef(new Map<string, Promise<Any>>());
  const cur = useRef(attempt); cur.current = attempt;

  const requestGrade = useCallback((id: string): Promise<Any> => {
    const existing = jobs.current.get(id); if (existing) return existing;
    const job = api(`/attempt/${id}/grade-solution`, "POST").then((r) => {
      if (cur.current.id === id) setAttempt((a: Any) => ({ ...a, solution_grading_status: r.grading_status, ...(r.graded ? { solution_grade: r.graded } : {}), ...(r.grading_error ? { solution_grading_error: r.grading_error } : {}) }));
      return r;
    }).catch((e) => ({ grading_status: "failed", grading_error: e.message })).finally(() => jobs.current.delete(id));
    jobs.current.set(id, job);
    return job;
  }, []);
  const gradeSolution = useCallback(async (id: string) => {
    setGrade({ kind: "grading" });
    const r = await requestGrade(id);
    if (cur.current.id !== id) return;
    if (r.grading_status === "viewed" && r.graded) setGrade({ kind: "ok", g: r.graded });
    else if (r.grading_status === "skipped") setGrade({ kind: "none" });
    else if (r.grading_status === "needs_cookie") { qc.setQueryData(["api", "/leetcode-status"], { state: r.cookie_state }); setGrade({ kind: "cookie", state: r.cookie_state }); }
    else setGrade({ kind: "error", err: r.grading_error });
  }, [requestGrade, qc]);
  const initGrade = useCallback((a: Any) => {
    setGrade({ kind: "none" });
    if (!llm || a.unsolved) return;
    if (!a.code) {
      if (!a.submission_id) return;   // a manual log has no code to fetch
      if (lcState === "missing" || lcState === "expired") { setGrade({ kind: "cookie", state: lcState }); return; }
    }
    if (a.solution_grading_status === "viewed" && a.solution_grade) setGrade({ kind: "ok", g: a.solution_grade });
    else if (a.solution_grading_status === "failed") setGrade({ kind: "error", err: a.solution_grading_error });
    else gradeSolution(a.id);
  }, [llm, lcState, gradeSolution]);
  const gradePlan = useCallback(async (id: string) => {
    try {
      const r = await api(`/attempt/${id}/grade-plan`, "POST");
      if (cur.current.id !== id) return;
      setAttempt((a: Any) => ({ ...a, plan: r.plan }));
    } catch (e) { setAttempt((a: Any) => ({ ...a, plan: { ...(a.plan || {}), grading_error: (e as Error).message } })); }
  }, []);

  // Opening: the plan and the run are graded now, whichever stage shows first.
  useEffect(() => {
    const a = initial;
    if (llm && a.plan?.status === "planned" && !a.plan.graded && !a.plan.grading_error) gradePlan(a.id);
    const eligible = llm && a.via === "editor" && !!a.code && a.confidence == null && !a.unsolved && !followupSeen.has(followupKey(a));
    if (eligible) {
      setStage("followup");
      requestGrade(a.id).then((r) => {
        if (cur.current.id !== a.id || followupSeen.has(followupKey(a))) return;
        const q = r && r.grading_status === "viewed" && r.graded && (r.graded.followup || "").trim();
        if (!q) { followupSeen.add(followupKey(a)); setStage("review"); initGrade(cur.current); } else setFollowup(q);
      });
    } else initGrade(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (grade.kind !== "grading") return; const t = setInterval(() => setGradingMsg((n) => n + 1), 1400); return () => clearInterval(t); }, [grade.kind]);

  const finishFollowup = () => { followupSeen.add(followupKey(attempt)); setStage("review"); initGrade(attempt); };
  const keepOptimizing = async () => {
    try {
      const res = await api("/editor/optimize", "POST", { attempt_id: attempt.id });
      followupSeen.delete(followupKey(attempt));
      onClose({ next: false });
      setActive(res.active);
      toast("Optimizing — submit a better version, or Stop optimizing to keep this one.");
    } catch (e) { toast((e as Error).message); }
  };
  const rate = async (confidence: number) => {
    if (rating) return;
    setRating(true); setConf(confidence);
    const m = Number(minutes);
    try {
      await api(`/attempt/${attempt.id}/annotate`, "POST", { confidence, independence: looked ? "solution" : null, mistake_note: note.trim() || null, time_taken_sec: m > 0 ? Math.round(m * 60) : null });
    } catch (e) { setRating(false); setConf(null); toast((e as Error).message); return; }
    qc.invalidateQueries(); toast("Saved"); onClose();
  };
  const dismiss = async () => {
    onClose({ next: false });
    if (attempt?.id) { try { await api(`/attempt/${attempt.id}/dismiss-annotation`, "POST"); } catch (e) { toast((e as Error).message); } }
    qc.invalidateQueries(); window.dispatchEvent(new Event("senpai-open-next-pending"));
  };
  const addToLibrary = async () => {
    setAdding(true);
    try { await api("/import/problem", "POST", { slug: attempt.slug }); setAttempt({ ...attempt, in_library: true }); toast("Added to your library — it'll be scheduled from here."); qc.invalidateQueries(); }
    catch (e) { setAdding(false); toast((e as Error).message); }
  };

  const untimed = attempt.time_taken_sec == null && attempt.source === "detected";
  const GRADING = ["Reading your code…", "Checking it against the optimum…", "Writing it up…"];
  const meta = [attempt.neetcode_category, attempt.slug].filter(Boolean).join(" · ");
  return (
    <div className="overlay">
      <div className="overlay-card box annotate-wide" role="dialog" aria-modal="true" aria-labelledby="annotate-heading">
        <h2 className={`modal-title${attempt.unsolved ? "" : " celebrate"}`} id="annotate-heading">{attempt.unsolved ? "Run ended" : "Solved!"}</h2>
        <div className="solved-problem">
          <div className="solved-problem-main">
            <a id="annotate-problem-link" href={attempt.url || `https://leetcode.com/problems/${attempt.slug}/`} target="_blank" rel="noopener">
              <span id="annotate-problem-id">{attempt.frontend_id ? `#${attempt.frontend_id} · ` : ""}</span><span id="annotate-title">{attempt.title}</span></a>
            {attempt.difficulty && <DifficultyBadge difficulty={attempt.difficulty} />}
          </div>
          <div id="annotate-problem-meta" className="solved-problem-meta">{meta}</div>
          <Facts attempt={attempt} />
          {attempt.in_library === false && (
            <div id="annotate-library" className="solved-problem-meta"><span>Not in your library — logged, but it won&apos;t be scheduled.</span>
              <button className="button is-small is-link" disabled={adding} onClick={addToLibrary}>{adding ? "Adding…" : "Add to library"}</button></div>
          )}
          {untimed && (
            <div id="annotate-time-row" className="annotate-time-row"><label className="label-sm" htmlFor="annotate-minutes">Roughly how long did it take? <span className="help-inline">minutes, optional</span></label>
              <input id="annotate-minutes" className="input is-small" type="number" min={0} step={1} inputMode="numeric" placeholder="e.g. 25" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
          )}
        </div>

        {stage === "followup" && (
          <section id="annotate-followup" className="followup-card" aria-live="polite">
            <p className="followup-kicker">Interviewer</p>
            <p id="annotate-followup-text" className="followup-text">{followup ? `Correct. ${followup}` : <><span className="spinner" /> Reading your code…</>}</p>
            <div id="annotate-followup-actions" className="followup-actions">
              {followup && <button className="button is-primary" type="button" onClick={keepOptimizing}>Try it</button>}
              <button className="button" type="button" onClick={finishFollowup}>I&apos;m done, show feedback</button>
            </div>
          </section>
        )}

        {stage === "review" && (
          <div id="annotate-review" className="annotate-review">
            {grade.kind !== "none" && (
              <section id="annotate-grade" className="solution-hero" aria-labelledby="annotate-grade-heading">
                <h3 id="annotate-grade-heading" className="solution-hero-title">Your solution</h3>
                <div id="annotate-grade-body">
                  {grade.kind === "grading" && <div className="grading"><span className="spinner" /><span className="grading-text">{GRADING[gradingMsg % GRADING.length]}</span></div>}
                  {grade.kind === "ok" && <SolutionGrade g={grade.g} attempt={attempt} />}
                  {grade.kind === "error" && <><p className="missed"><b>Grading failed:</b> {grade.err || "Unknown error"}</p><div className="grade-actions"><button className="button is-small is-link" onClick={() => gradeSolution(attempt.id)}>Retry grading</button></div></>}
                  {grade.kind === "cookie" && <NeedsCookie state={grade.state} onSaved={() => gradeSolution(attempt.id)} />}
                </div>
              </section>
            )}
            <div className="annotate-rows"><PlanCard attempt={attempt} onGrade={gradePlan} /><Process attempt={attempt} llm={llm} /></div>
          </div>
        )}

        {stage === "review" && (
          <footer id="annotate-rate" className="annotate-rate">
            <label className="label-sm" id="conf-label">How confident are you with this pattern? <span className="help-inline">choosing saves</span></label>
            <div className="pill-group" id="conf-group" role="group" aria-labelledby="conf-label">
              {[[1, "Low"], [2, "Medium"], [3, "High"]].map(([v, l]) => <button key={v} type="button" className={conf === v ? "sel" : ""} disabled={rating && conf !== v} onClick={() => rate(v as number)}>{l}</button>)}
            </div>
            <div className="annotate-rate-extra">
              {!attempt.gave_up && !attempt.unsolved && <label className="small annotate-looked"><input type="checkbox" id="annotate-looked" checked={looked} onChange={(e) => setLooked(e.target.checked)} /> I looked at the answer</label>}
              {!noteOpen && <button id="btn-annotate-add-note" className="button is-ghost is-small" type="button" onClick={() => setNoteOpen(true)}>Add a note</button>}
            </div>
            {noteOpen && <input id="annotate-note" className="input" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label="Note on this solve" placeholder="Anything to remember about this solve" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}
            <div className="overlay-actions">
              <button id="btn-close-annotate" className="button is-ghost" type="button" title="Leave it unrated for now" onClick={dismiss}>Close</button>
              {attempt.via === "editor" && attempt.code && attempt.confidence == null && !attempt.unsolved && (
                <button id="btn-optimize-annotate" className="button" type="button" title="Back to the editor from this accepted code; a better Accepted replaces it before you rate" onClick={keepOptimizing}>Keep optimizing</button>)}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
