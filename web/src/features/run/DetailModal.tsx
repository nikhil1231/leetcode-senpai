"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtTime, solveSecOf } from "@/lib/format";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/lib/toast";
import { useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const items = (x: unknown): string[] => (Array.isArray(x) ? x.filter(Boolean) : []);
const RECALL_VERDICTS: Record<number, string> = { 3: "Ready to code", 2: "Missing the key step", 1: "Too vague to code from", 0: "Wouldn't work" };

function GradeList({ title, rows, cls }: { title: string; rows: string[]; cls: string }) {
  return rows.length ? <div className={`grade-bullets ${cls}`}><b>{title}</b><ul>{rows.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
}
function GradeStatus({ status, err }: { status?: string; err?: string }) {
  return status === "failed" ? <div className="recall-grade detail-grade"><p className="missed"><b>Grading failed:</b> {err || "Unknown error"}</p></div> : null;
}
function SolutionGrade({ g, status, err }: { g: Any; status?: string; err?: string }) {
  if (!g || typeof g !== "object") return <GradeStatus status={status} err={err} />;
  const positives = items(g.positives), negatives = items(g.negatives).length ? items(g.negatives) : items(g.improvements), hasCx = g.inferred_time || g.inferred_space;
  if (g.score == null && !g.analysis && !g.feedback && !hasCx && !positives.length && !negatives.length) return <GradeStatus status={status} err={err} />;
  const a = g.assessment, d = a?.dimensions || {};
  return (
    <div className="recall-grade detail-grade">
      {(g.corrections || []).map((c: Any, i: number) => <p className="small" key={i}><b>Assessment correction:</b> the saved code returns {c.observed_output} for {c.input}. The original code objection was disproved. Original feedback is retained below; recorded help remains part of this attempt.</p>)}
      {a && <><p className="small"><b>Execution:</b> {a.execution_status || "unknown"} · <b>Help:</b> {a.assistance || "unknown"}</p><p className="small"><b>Constraints:</b> {d.constraints || "unassessed"}</p>
        {d.clarity && <p><b>Clarity:</b> {d.clarity}</p>}{d.optional_optimisation && <p><b>Optional optimisation:</b> {d.optional_optimisation}</p>}
        {(a.correctness_objections || []).map((c: Any, i: number) => <p key={i}><b>Correctness objection ({c.verification}):</b> {c.explanation}</p>)}</>}
      <div className="grade-score">Solution grade{g.score != null && <>: <b>{g.score}/5</b></>}{g.optimal && <> <span className="tag grade-optimal">optimal</span></>}</div>
      {(g.analysis || g.feedback) && <p className="grade-analysis">{g.analysis || g.feedback}</p>}
      {hasCx && <p className="small"><b>Complexity:</b> time {g.inferred_time || "?"}, space {g.inferred_space || "?"}</p>}
      <GradeList title="Positives" rows={positives} cls="grade-positives" /><GradeList title="Negatives" rows={negatives} cls="grade-negatives" />
      {g.prompt_version != null && <p className="small">Prompt v{g.prompt_version}</p>}
    </div>
  );
}
function RecallGrade({ g, status, err }: { g: Any; status?: string; err?: string }) {
  if (!g || typeof g !== "object") return <GradeStatus status={status} err={err} />;
  const positives = items(g.positives), negatives = items(g.negatives);
  if (g.grade == null && !g.analysis && !g.feedback && !positives.length && !negatives.length) return <GradeStatus status={status} err={err} />;
  const word = g.grade != null && (g.rubric || 0) >= 2 ? RECALL_VERDICTS[g.grade] : null;
  return (
    <div className="recall-grade detail-grade">
      <div className="grade-score">{g.grade == null ? "Recall" : word ? <>Recall: <b>{word}</b> <span className="small">{g.grade}/3</span></> : <>Recall grade: <b>{g.grade}/3</b></>}{g.optimal && <> <span className="tag grade-optimal">optimal</span></>}</div>
      {(g.analysis || g.feedback) && <p className="grade-analysis">{g.analysis || g.feedback}</p>}
      <GradeList title="What you had" rows={positives} cls="grade-positives" /><GradeList title="What was missing" rows={negatives} cls="grade-negatives" />
    </div>
  );
}

function PlanSummary({ plan }: { plan: Any }) {
  if (!plan || plan.status === "skipped" || !plan.status) return null;
  if (plan.status === "blank") return <p className="plan-blank">Started with <b>no idea yet</b>{plan.plan_time_sec != null ? ` after ${fmtClock(plan.plan_time_sec)} of thinking` : ""}. That&apos;s recorded as a struggle, so this problem comes back sooner.</p>;
  const facts: React.ReactNode[] = [];
  if (plan.target_time) facts.push(<>Target <b>{plan.target_time}</b>{plan.target_space ? <> / <b>{plan.target_space}</b></> : null}</>);
  if (plan.pattern) facts.push(<>Pattern <b>{plan.pattern}</b></>);
  if (plan.check_revealed) facts.push("Plan check used");
  return <>{plan.approach && <p className="plan-approach">{plan.approach}</p>}{facts.length > 0 && <div className="plan-facts">{facts.map((f, i) => <span key={i}>{f}</span>)}</div>}
    {plan.edge_cases?.length > 0 && <div className="plan-edges">{plan.edge_cases.map((c: string) => <span className="tag" key={c}>{c} </span>)}</div>}</>;
}
const Tag = ({ v, labels }: { v: string; labels: Record<string, [string, string]> }) => { const [l, t] = labels[v] || []; return l ? <span className={`plan-tag is-${t}`}>{l}</span> : null; };
const APPROACH: Record<string, [string, string]> = { viable: ["ready to code", "ok"], partial: ["missing the key step", "partial"], wrong: ["wouldn't work", "miss"] };
const PLANV: Record<string, [string, string]> = { correct: ["right", "ok"], partial: ["partly", "partial"], wrong: ["off", "miss"] };
const Hit = ({ h, yes = "optimal", no = "not optimal" }: { h?: boolean | null; yes?: string; no?: string }) => (h == null ? null : <span className={`plan-tag is-${h ? "ok" : "miss"}`}>{h ? yes : no}</span>);

function PlanDetail({ a }: { a: Any }) {
  const plan = a.plan;
  if (!plan || plan.status === "skipped" || !plan.status) return null;
  const rows: [string, React.ReactNode][] = [];
  if (plan.approach_verdict && plan.approach_verdict !== "unknown") rows.push(["Approach", <><Tag v={plan.approach_verdict} labels={APPROACH} />{plan.missing_step && <> <span className="small">{plan.missing_step}</span></>}</>]);
  if (plan.pattern && plan.pattern_verdict && plan.pattern_verdict !== "unknown") rows.push(["Pattern", <Tag v={plan.pattern_verdict} labels={PLANV} />]);
  if (plan.target_time && plan.optimal_time) rows.push(["Time", <>{plan.target_time} vs optimal {plan.optimal_time} <Hit h={plan.time_vs_optimal} />{plan.solution_time && plan.time_vs_solution === false && <span className="small"> · your code: {plan.solution_time}</span>}</>]);
  if (plan.target_space && plan.optimal_space) rows.push(["Space", <>{plan.target_space} vs optimal {plan.optimal_space} <Hit h={plan.space_vs_optimal} /></>]);
  return (
    <section className="detail-plan plan-card">
      <h3>Your plan{plan.plan_time_sec != null && plan.status === "planned" && <> <span className="small">planned in {fmtClock(plan.plan_time_sec)}</span></>}</h3>
      <PlanSummary plan={plan} />
      {plan.held && <p className="small">Plan <b>{plan.held}</b></p>}
      {plan.grading_error ? <p className="missed small">Plan grading failed: {plan.grading_error}</p> : plan.status === "planned" && (
        <>{plan.score != null && <div className="plan-score">Plan score <b>{plan.score}/5</b></div>}
          {rows.length > 0 && <dl className="plan-rows">{rows.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          {plan.note && <p className="grade-analysis">{plan.note}</p>}</>
      )}
    </section>
  );
}

function ProcessDetail({ a }: { a: Any }) {
  const r = a.recording; if (!r) return null;
  const review = (a.enrichment || {}).process_review, err = (a.enrichment || {}).process_review_error;
  const at = (ms: number | null) => (ms == null ? "—" : fmtClock(Math.round(ms / 1000)));
  const list = (title: string, xs?: string[]) => xs?.length ? <><p className="small"><b>{title}</b></p><ul className="process-list">{xs.map((i, n) => <li key={n}>{i}</li>)}</ul></> : null;
  return (
    <section className="detail-process plan-card"><h3>How it went</h3>
      <dl className="plan-stats">
        <div><dt>First run</dt><dd>{at(r.first_run_ms)}</dd></div>
        <div><dt>Runs</dt><dd>{r.runs}{r.runs_failed ? <> <span className="small">({r.runs_failed} off)</span></> : null}</dd></div>
        <div><dt>Failed submits</dt><dd>{r.failed_submits}</dd></div><div><dt>Idle</dt><dd>{at(r.idle_ms)}</dd></div>{r.away_ms ? <div><dt>Away</dt><dd>{at(r.away_ms)}</dd></div> : null}
      </dl>
      {a.finished_on === "leetcode" && <p className="small">Finished on LeetCode&apos;s site — the log stops where the editor was left.</p>}
      {review ? <>{list("Stuck", review.stuck_points)}{list("Fixes", review.fixes)}{list("Edge cases the plan missed", review.missed_edge_cases)}
        {review.testing_habit && <p className="small"><b>Testing:</b> {review.testing_habit}</p>}{review.takeaway && <p className="plan-weakest"><b>Next time:</b> {review.takeaway}</p>}</>
        : err ? <p className="missed small">Review failed: {err}</p> : null}
    </section>
  );
}

function PreviousSolve({ a }: { a: Any }) {
  const p = a.previous_solve; if (!p) return null;
  const when = p.solved_at ? new Date(p.solved_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  return (
    <section className="detail-previous plan-card"><h3>Against last time{when && <> <span className="small">({when})</span></>}</h3>
      {p.time_taken_sec != null && a.time_taken_sec != null && <p className="small">Time {fmtTime(solveSecOf(p))} → <b>{fmtTime(solveSecOf(a))}</b>{p.wrong_before_ac != null && a.wrong_before_ac != null && <> · wrong subs {p.wrong_before_ac} → <b>{a.wrong_before_ac}</b></>}</p>}
      {p.same_code && <p className="small">Same code as last time.</p>}
      {p.diff && <details className="code-diff"><summary className="small">What changed in the code</summary>
        <pre className="code">{p.diff.split("\n").map((line: string, i: number) => <span key={i} className={line.startsWith("+") ? "is-add" : line.startsWith("-") ? "is-del" : line.startsWith("@@") ? "is-hunk" : ""}>{line + "\n"}</span>)}</pre></details>}
    </section>
  );
}

export function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ["api", "attempt", id], queryFn: () => api(`/attempt/${id}`), retry: false });
  useEffect(() => { if (q.error) { onClose(); toast((q.error as Error).message); } }, [q.error, onClose, toast]);
  const a: Any = q.data, e = a?.enrichment || {};
  const header = a && <><h2>{a.title || a.slug} {a.difficulty && <DifficultyBadge difficulty={a.difficulty} />}</h2>
    <div className="detail-meta small">{a.neetcode_category || ""} · {a.solved_at ? new Date(a.solved_at * 1000).toLocaleString() : ""}</div></>;
  return (
    <div className="overlay" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="overlay-card wide" role="dialog" aria-modal="true">
        <div id="detail-body">
          {!a ? <Loader message="Loading attempt…" /> : a.kind === "sprint" ? (
            <>{header}
              <div className="facts"><span><b>Sprint rep</b></span>{a.round_id && <span>Round <b>{a.round_id}</b></span>}{a.predicted_category && <span>Prediction <b>{a.predicted_category}</b></span>}</div>
              {a.neetcode_category && <p><b>Prompt category:</b> {a.neetcode_category}</p>}{a.predicted_category && <p><b>Your prediction:</b> {a.predicted_category}</p>}
              {(a.approach || a.predicted_approach) && <p><b>Why:</b> {a.approach || a.predicted_approach}</p>}
              <p><b>Verdict:</b> <span className={`pred-${e.prediction_verdict || "ungraded"}`}>{e.prediction_verdict || "ungraded"}</span></p>
              {e.prediction_note && <p><b>Note:</b> {e.prediction_note}</p>}<PlanDetail a={a} /></>
          ) : (
            <>{header}
              <div className="facts">
                {a.time_taken_sec != null && <span>Time <b>{fmtTime(solveSecOf(a))}</b>{a.plan_time_sec && a.plan_status !== "skipped" ? <> <span className="small">(plan {fmtTime(a.plan_time_sec)} · code {fmtTime(a.time_taken_sec)})</span></> : null}
                  {a.par_sec && solveSecOf(a) != null ? <> <span className={`small${(solveSecOf(a) as number) > a.par_sec ? " is-over" : ""}`}>/ {Math.round(a.par_sec / 60)}m pace</span></> : null}</span>}
                {a.resubmissions ? <span>Accepted subs <b>{a.resubmissions + 1}</b></span> : null}
                {a.first_ac_time_taken_sec != null && <span>First AC <b>{fmtTime(solveSecOf(a, "first_ac_time_taken_sec"))}</b></span>}
                {a.confidence ? <span>Conf <b>{["", "Low", "Med", "High"][a.confidence]}</b></span> : null}
                {a.independence && <span><b>{a.independence}</b></span>}{a.interview && <span><b>Interview mode</b></span>}{a.complexity_time && <span>Time <b>{a.complexity_time}</b></span>}
              </div>
              {a.approach && <p><b>Your approach:</b> {a.approach}</p>}{a.mistake_note && <p><b>Note:</b> {a.mistake_note}</p>}
              {e.pattern_used && <p><b>Pattern used:</b> {e.pattern_used} {e.complexity_verdict && e.complexity_verdict !== "match" && <span className="warn-chip">{e.complexity_verdict.replace("_", " ")}</span>}</p>}
              {((e.user_overrides && e.user_overrides.tags) || e.mistake_tags || []).length > 0 && <p><b>Mistakes:</b> {((e.user_overrides && e.user_overrides.tags) || e.mistake_tags).map((t: string) => <span className="tag" key={t}>{t} </span>)}</p>}
              {e.diff_summary && <p><b>Since last time:</b> {e.diff_summary}</p>}
              <PreviousSolve a={a} /><PlanDetail a={a} /><ProcessDetail a={a} />
              {a.kind === "recall" || a.source === "recall" ? <RecallGrade g={a.recall_grade} status={a.grading_status} err={a.grading_error} /> : <SolutionGrade g={a.solution_grade} status={a.solution_grading_status} err={a.solution_grading_error} />}
              {a.code ? <pre className="code">{a.code}</pre> : <p className="small">No stored code for this attempt.</p>}</>
          )}
        </div>
        <div className="overlay-actions"><button id="btn-close-detail" className="button is-ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
