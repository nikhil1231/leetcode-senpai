"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { shortLocalDate } from "@/lib/format";
import { plural } from "@/lib/md";
import { TAB_TITLES } from "@/lib/sections";
import { useFlow } from "@/lib/flow-store";
import { Bars, Dumbbells, Forecast, Lines } from "@/components/charts/Charts";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader, LoadError } from "@/components/ui/Loader";
import { useStartFlow } from "./useStartFlow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const pctOrDash = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const quality = (v: number | null | undefined) => (v == null ? "-" : Number(v).toFixed(1));
const gap = (v: number | null | undefined) => (v == null ? "-" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)}`);
const sourceLabel = (s?: string) => ({ solution_grade: "solution", recall_grade: "recall", review_failure: "review" } as Record<string, string>)[s || ""] || s || "objective";

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className="column"><div className={`panel-box ${className}`}><h3>{title}</h3>{children}</div></div>;
}

function Pace({ p }: { p?: Any }) {
  if (!p) return null;
  return (
    <div className="pace"><div className="pace-big">{p.solved}/{p.total}</div><div className="small">{p.remaining} left · {p.rate_per_week}/week</div>
      {p.eta ? <div className="pace-eta">Library complete ~ <b>{p.eta}</b></div> : <div className="small">Solve a few to project a finish date.</div>}</div>
  );
}

function Planning({ pl, pa }: { pl?: Any; pa?: Any }) {
  const sprint = pa?.sprint_graded ? <p className="small plan-sprint">Sprint pattern guesses: <b>{pctOrDash((pa.by_kind.sprint.correct || 0) / pa.sprint_graded)}</b> right ({pa.sprint_graded} graded)</p> : null;
  const o = pl?.overall;
  if (!o || !o.starts) return <><p className="empty">Lock in a plan before a run and this fills in: your plan score, how often plans hold, and where you plan worst.</p>{sprint}</>;
  const slow = o.over_limit_rate != null && o.over_limit_rate >= 0.5;
  const stats: [string, React.ReactNode][] = [["Held", pctOrDash(o.held_rate)], ["Ready to code", pctOrDash(o.ready_rate)], ["Optimal target", pctOrDash(o.optimal_rate)],
    ["Median plan time", o.median_plan_sec == null ? "—" : <span className={slow ? "is-over" : ""}>{clock(o.median_plan_sec)}</span>], ["Over time", pctOrDash(o.over_limit_rate)], ["No idea yet", `${o.blanks} of ${o.starts}`]];
  const rows = (pl.categories || []).filter((c: Any) => c.avg_score != null).map((c: Any) => ({
    label: c.category, value: c.avg_score, display: `${c.avg_score}/5`,
    hint: `${c.category}: ${c.avg_score}/5 over ${c.scored} graded plan${c.scored === 1 ? "" : "s"}${c.blanks ? `, ${c.blanks} no-idea start${c.blanks === 1 ? "" : "s"}` : ""}`,
    color: c.avg_score >= 4 ? "var(--green)" : c.avg_score >= 2.5 ? "var(--amber)" : "var(--red)",
  }));
  const w = pl.weakest;
  return (
    <>
      <div className="pace-big">{o.avg_score == null ? "—" : `${o.avg_score}/5`}</div>
      <div className="small">average plan score · {o.plans} plan{o.plans === 1 ? "" : "s"}, {o.scored} scored</div>
      <dl className="plan-stats">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {w && <p className="plan-weakest">Weakest: <b>{w.category}</b> — {w.avg_score}/5 over {w.count} start{w.count === 1 ? "" : "s"}{w.blanks ? ` (${w.blanks} with no idea)` : ""}. Plan misses feed the drill lane.</p>}
      {rows.length > 0 && <Bars data={rows} max={5} />}
      {sprint}
    </>
  );
}

function Habits({ h }: { h?: Any }) {
  if (!h || !h.recorded) return <p className="empty">Solve in the in-app editor and this fills in: whether you run before submitting, how soon you start typing, where you stall, and which edge cases keep biting.</p>;
  const warn = (bad: boolean, v: React.ReactNode) => <span className={bad ? "is-over" : ""}>{v}</span>;
  const stats: [string, React.ReactNode][] = [
    ["Submitted before running", h.submit_unrun_rate == null ? "—" : warn(h.submit_unrun_rate >= 0.3, pctOrDash(h.submit_unrun_rate))],
    ["First edit", h.median_first_edit_sec == null ? "—" : clock(h.median_first_edit_sec)],
    ["First run", h.median_first_run_sec == null ? "—" : clock(h.median_first_run_sec)],
    ["Failed submits", h.failed_submits_per_solve == null ? "—" : warn(h.failed_submits_per_solve >= 1, `${h.failed_submits_per_solve} / solve`)],
    ["Stalled", h.idle_share == null ? "—" : warn(h.idle_share >= 0.25, pctOrDash(h.idle_share))],
    ["Over pace", h.over_pace_rate == null ? "—" : warn(h.over_pace_rate >= 0.5, <>{pctOrDash(h.over_pace_rate)} <span className="small">of {h.timed}</span></>)],
  ];
  const s = h.stall_category, edges: Any[] = h.edge_misses || [];
  return (
    <>
      <div className="small">medians over {plural(h.recorded, "recorded solve")} · stalled is time with no edits or runs for a minute or more</div>
      <dl className="plan-stats">{stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {s && <p className="plan-weakest">Stalls most in <b>{s.category}</b> — {pctOrDash(s.idle_share)} of the clock over {plural(s.count, "solve")}.</p>}
      {edges.length > 0 && <><p className="small"><b>Edge cases that bit</b></p><ul className="process-list">{edges.map((e, i) => <li key={i} title={e.case}>{clip(e.case, 70)}{e.count > 1 && <> <b>×{e.count}</b></>}</li>)}</ul></>}
    </>
  );
}

function Calibration({ c }: { c?: Any }) {
  const rows: Any[] = c?.categories || [];
  const graded = c?.graded_attempts ?? 0, min = c?.min_graded_attempts;
  const count = min != null && graded < min ? `${graded}/${min} graded solves` : plural(graded, "graded solve");
  const countHtml = <div className="small">{count + (rows.length ? ` · ${plural(rows.length, "graded category", "graded categories")}` : "")}</div>;
  if (!c || c.status === "not_enough_data" || !rows.length) return <div className="calibration-panel"><div className="empty calibration-empty"><div>Not enough graded data</div>{countHtml}</div></div>;
  const top = c.most_overrated_topic?.category;
  const evidence = (r: Any) => (
    <span className="calibration-evidence"><span className="calibration-evidence-chip">{plural(r.graded_attempts || 0, "graded solve")}</span>
      {r.review_failures ? <span className="calibration-evidence-chip is-stale">{plural(r.review_failures, "review failure")}</span> : null}
      {r.leech_count ? <span className="calibration-evidence-chip is-stale">{plural(r.leech_count, "leech")}</span> : null}</span>
  );
  const data = rows.map((r) => {
    const g = Number(r.gap) || 0;
    const parts = [plural(r.graded_attempts || 0, "graded solve")]; if (r.review_failures) parts.push(plural(r.review_failures, "review failure")); if (r.leech_count) parts.push(plural(r.leech_count, "leech"));
    return { label: r.category, hint: `${r.category}: self ${quality(r.self_quality)}, objective ${quality(r.objective_quality)}, gap ${gap(r.gap)}; ${parts.join(", ")}`,
      from: r.self_quality || 0, to: r.objective_quality || 0, display: `${quality(r.self_quality)} → ${quality(r.objective_quality)}`,
      color: g > 0.05 ? "var(--red)" : g < -0.05 ? "var(--green)" : "var(--muted)",
      meta: <>{evidence(r)}<span className={`tag ${r.overconfident ? "is-warning is-light" : "is-light"}`}>gap {gap(r.gap)}</span></> };
  });
  const groups = rows.filter((r) => r.overconfident && (r.examples || []).length);
  return (
    <div className="calibration-panel">
      <div className="calibration-topline"><div><div className="small">Most overrated topic</div><div className="name">{top || "No overrated topic flagged yet"}</div></div>{countHtml}</div>
      <Dumbbells data={data} max={5} legend="○ self → ● obj" />
      {groups.length > 0 && (
        <div className="calibration-examples">{groups.map((r) => (
          <div className="calibration-example-group" key={r.category}><div className="small">{r.category} examples</div>
            {(r.examples || []).map((ex: Any) => (
              <div className="calibration-example-row" key={ex.slug} title={ex.slug}><span className="calibration-example-title">{ex.title || ex.slug}</span>
                <span className="calibration-example-meta">self {quality(ex.self_quality)} · obj {quality(ex.objective_quality)} · gap {gap(ex.gap)} · {sourceLabel(ex.source)}</span></div>))}</div>))}</div>
      )}
    </div>
  );
}

function FailureModes({ modes }: { modes: Record<string, number> }) {
  const [tag, setTag] = useState<string | null>(null);
  const start = useStartFlow();
  const openDetail = useFlow((s) => s.openDetail);
  const q = useQuery({ queryKey: ["api", "failure-mode", tag], queryFn: () => api(`/failure-mode/${encodeURIComponent(tag as string)}`), enabled: !!tag });
  const rows = Object.entries(modes || {}).map(([k, v]) => ({ tag: k, label: k.replace(/_/g, " "), value: v }));
  if (!rows.length) return <p className="empty">No structured mistakes yet — the coach fills this in.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const attempts: Any[] = ((q.data?.attempts || []) as Any[]).slice().sort((a, b) => (b.solved_at || 0) - (a.solved_at || 0));
  return (
    <>
      <div className="chart-bars failure-mode-bars">{rows.map((d) => (
        <button key={d.tag} type="button" className={`chart-bar-row failure-mode-row${tag === d.tag ? " is-active" : ""}`} title={`${d.tag}: ${d.value} attempts`} onClick={() => setTag(d.tag)}>
          <span className="chart-bar-label">{d.label}</span>
          <span className="chart-bar-track"><span className="chart-bar-fill" style={{ width: `${Math.round((d.value / max) * 100)}%`, background: "var(--red)" }} /></span>
          <span className="chart-bar-val">{d.value}</span></button>))}</div>
      <div id="failure-mode-review" className="failure-mode-review">
        {!tag ? <p className="empty">Select a mistake tag to review related attempts.</p>
          : q.isLoading ? <Loader message={`Loading ${tag.replace(/_/g, " ")} attempts…`} />
          : q.error ? <LoadError error={q.error} retry={() => q.refetch()} />
          : !attempts.length ? <p className="empty">No saved attempts found for {tag.replace(/_/g, " ")}.</p>
          : (
            <>
              <div className="failure-mode-review-head"><div><b>{tag.replace(/_/g, " ")}</b><div className="small">{plural(attempts.length, "tagged attempt")}</div></div></div>
              <div className="failure-mode-attempts">{attempts.map((a) => (
                <div className="failure-mode-attempt" key={a.id}>
                  <div className="failure-mode-attempt-main">
                    <div className="failure-mode-title-row"><a href={a.url || `https://leetcode.com/problems/${a.slug}/`} target="_blank" rel="noopener">{a.title || a.slug}</a><DifficultyBadge difficulty={a.difficulty} /></div>
                    <div className="small">{shortLocalDate(a.solved_at)} · {a.category || "-"}</div>
                    {a.mistake_note ? <div className="failure-mode-note">{a.mistake_note}</div> : <div className="failure-mode-note is-muted">No mistake note saved.</div>}
                    {(a.mistake_tags || []).length > 0 && <div className="failure-mode-tags">{a.mistake_tags.map((t: string) => <span key={t} className="mtag">{t} </span>)}</div>}
                  </div>
                  <div className="failure-mode-actions">
                    <button className="button is-small failure-mode-detail" onClick={() => openDetail(a.id)}>Detail</button>
                    <button className="button start is-small failure-mode-start" onClick={() => start(a.slug, "adhoc", "", a.title || a.slug, a.category || "")}>Start</button>
                  </div>
                </div>))}</div>
            </>
          )}
      </div>
    </>
  );
}

export function InsightsPage() {
  useHeading(...TAB_TITLES.insights);
  const q = useQuery({ queryKey: ["api", "/insights"], queryFn: () => api("/insights") });
  if (q.isLoading) return <Loader message="Crunching your stats…" />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const d: Any = q.data;
  const evidence: Any[] = d.topic_evidence || [];
  return (
    <>
      <div className="columns"><Panel title="Review forecast (30 days)"><Forecast fc={d.forecast} /></Panel><Panel title="Pace"><Pace p={d.pace} /></Panel></div>
      <div className="columns">
        <Panel title="Topic evidence">{!evidence.length ? <p className="empty">No topics covered yet.</p> : (
          <table className="evidence-table"><thead><tr><th>Topic</th><th>Covered</th><th>Independent</th><th>Later checks</th></tr></thead>
            <tbody>{evidence.map((t) => <tr key={t.category}><td>{t.category}</td><td>{t.solved}<span className="small">/{t.total}</span></td><td>{t.implementation_count}</td><td>{t.retention_count}</td></tr>)}</tbody></table>)}</Panel>
        <Panel title="Time to solve (weekly median)"><Lines series={d.time_trend} yLabel="min" /></Panel>
      </div>
      <div className="columns"><Panel title="Failure modes (30 days)" className="failure-mode-box"><FailureModes modes={d.failure_modes} /></Panel><Panel title="Planning"><Planning pl={d.planning} pa={d.prediction_accuracy} /></Panel></div>
      <div className="panel-box"><h3>Confidence calibration</h3><Calibration c={d.confidence_calibration} /></div>
      <div className="columns">
        <Panel title="Solve habits"><Habits h={d.habits} /></Panel>
        <Panel title="Mock score trend">{!d.mock_trend?.length ? <p className="empty">Take a weekly mock to start the trend.</p>
          : <Lines series={{ Score: d.mock_trend.map((t: Any) => ({ week: t.date, median_min: t.score })) }} valueKey="median_min" yLabel="score" />}</Panel>
      </div>
    </>
  );
}
