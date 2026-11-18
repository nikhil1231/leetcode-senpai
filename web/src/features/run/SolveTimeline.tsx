"use client";
// Where a solve's time went, as one bar on one clock: planning, then the in-editor recording split into work (edits and
// runs), quiet stretches (a minute or more with neither: thinking, notes or a break, the log can't tell), another tab and
// pauses. "Keep optimizing" runs follow on the same clock after a divider, their editing striped green. The moments that turned it (submits, hints, the approach explained) sit on the bar and are listed under it.
// From server/recording.py `phases`; no LLM. The coach's read of it (process review) goes underneath when there is one.
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/hooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Segment = { kind: string; from: number; to: number; opt?: boolean };
type Mark = { t: number; kind: string; ok?: boolean; status?: string; correct?: number; total?: number; level?: number; step?: number; text?: string; opt?: boolean };
type Timeline = { duration_ms: number; plan_ms: number; segments: Segment[]; marks: Mark[]; totals: Record<string, number>; finished_on?: string; truncated?: boolean; optimize_from?: number | null };

const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const mins = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)} min`);
const LEGEND: [string, string, string][] = [
  ["plan", "Planning", "Before the editor opened"],
  ["work", "Editing and running", "Edits or runs less than a minute apart"],
  ["quiet", "Quiet", "A minute or more with no edits or runs, on this tab: thinking, notes or a break"],
  ["away", "Other tab", "The editor tab was hidden or out of focus"],
  ["paused", "Paused", "The clock was paused"],
  ["optimize", "Optimising", "Editing and running after the first Accepted, to improve it"],
];

function moment(m: Mark): string | null {
  const said = momentOf(m);
  return said && m.opt ? `${said} (optimising)` : said;
}
function momentOf(m: Mark): string | null {
  if (m.kind === "submit") return m.status === "Accepted" ? "Accepted" : `${m.status || "Failed"}${m.total ? ` (${m.correct}/${m.total} tests)` : ""}`;
  if (m.kind === "hint") return `Hint ${m.level ?? ""}`.trim();
  if (m.kind === "explained") return (m.step || 1) > 1 ? `Walkthrough, step ${m.step}` : "Approach explained";
  if (m.kind === "reset") return "Reset to the starter code";
  if (m.kind === "end") return "Ended without an Accepted";
  return null;
}
const pinOf = (m: Mark) => (m.kind === "submit" ? (m.status === "Accepted" ? "is-ac" : "is-wa") : m.kind === "hint" || m.kind === "explained" ? "is-help" : "is-other");

export function SolveTimeline({ attempt }: { attempt: Any }) {
  const q = useApi<{ timeline: Timeline | null }>(attempt.recording_id ? `/attempt/${attempt.id}/timeline?sub=${attempt.submission_id ?? ""}` : null, { staleTime: Infinity });
  const tl = q.data?.timeline;
  if (!attempt.recording_id) return null;
  if (q.isLoading) return <p className="small muted">Loading the timeline…</p>;
  if (!tl || tl.duration_ms <= 0) return null;
  const at = (t: number) => `${Math.max(0, Math.min(100, (t / tl.duration_ms) * 100))}%`;
  const key = tl.marks.filter((m) => moment(m));
  const runs = tl.marks.filter((m) => m.kind === "run");
  const ticks = Array.from({ length: Math.floor(tl.duration_ms / 600_000) }, (_, i) => (i + 1) * 600_000).filter((t) => t < tl.duration_ms - 120_000);
  return (
    <div className="solve-timeline">
      <div className="tl-track" role="img" aria-label={`Timeline of ${clock(tl.duration_ms)}: ${LEGEND.filter(([k]) => tl.totals[k]).map(([k, l]) => `${l} ${mins(tl.totals[k])}`).join(", ")}`}>
        <div className="tl-pins">{key.map((m, i) => <span key={i} className={`tl-pin ${pinOf(m)}`} style={{ left: at(m.t) }} title={`${clock(m.t)} ${moment(m)}`} />)}</div>
        <div className="tl-bar">{tl.segments.map((s, i) => <span key={i} className={`tl-seg is-${s.kind}`} style={{ left: at(s.from), width: at(s.to - s.from) }}
          title={`${clock(s.from)}–${clock(s.to)} ${LEGEND.find(([k]) => k === s.kind)?.[1] || s.kind}${s.opt && s.kind !== "optimize" ? " while optimising" : ""} (${mins(s.to - s.from)})`} />)}
          {tl.optimize_from != null && <span className="tl-opt-start" style={{ left: at(tl.optimize_from) }} title={`${clock(tl.optimize_from)} Kept optimizing after the first Accepted`} />}</div>
        <div className="tl-runs">{runs.map((m, i) => <span key={i} className={`tl-run${m.ok ? " is-ok" : ""}`} style={{ left: at(m.t) }} title={`${clock(m.t)} run: ${m.ok ? "all cases matched" : m.total ? `${m.correct ?? 0}/${m.total} matched` : "failed"}`} />)}</div>
        <div className="tl-axis"><span style={{ left: 0 }}>0:00</span>{ticks.map((t) => <span key={t} style={{ left: at(t) }}>{clock(t)}</span>)}<span style={{ right: 0 }}>{clock(tl.duration_ms)}</span></div>
      </div>
      <ul className="tl-legend">{LEGEND.filter(([k]) => tl.totals[k] > 0).map(([k, label, help]) => (
        <li key={k} title={help}><i className={`tl-swatch is-${k}`} />{label} <b>{mins(tl.totals[k])}</b></li>))}
        {runs.length > 0 && <li title="Each tick under the bar is a Run; green ones matched every case"><i className="tl-swatch is-run" />Runs <b>{runs.length}</b>{runs.some((m) => m.ok) ? ` (${runs.filter((m) => m.ok).length} all matched)` : ""}</li>}
      </ul>
      {key.length > 0 && <ol className="tl-moments">{key.map((m, i) => (
        <li key={i}><span className={`tl-dot ${pinOf(m)}`} /><span className="tl-moment-at">{clock(m.t)}</span><span title={m.text || undefined}>{moment(m)}{m.text ? <span className="tl-moment-text">: {m.text}</span> : null}</span></li>))}</ol>}
      {tl.finished_on === "leetcode" && <p className="small muted">Finished on LeetCode&apos;s own site, so the end of the solve isn&apos;t in this timeline.</p>}
      {tl.truncated && <p className="small muted">The log hit its size limit, so the later part is incomplete.</p>}
    </div>
  );
}

// The accepted code, read-only and highlighted (CodeMirror, loaded only once it's opened).
export function CodeView({ code, lang }: { code: string; lang?: string }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !host.current) return;
    let view: { destroy(): void } | null = null, gone = false;
    import("@/features/editor/codemirror").then(({ loadCodeMirror }) => loadCodeMirror()).then((CM) => {
      if (gone || !host.current) return;
      const py = !lang || lang.startsWith("python");
      view = new CM.EditorView({ parent: host.current, state: CM.EditorState.create({ doc: code, extensions: [
        CM.lineNumbers(), CM.EditorState.readOnly.of(true), CM.EditorView.editable.of(false), CM.EditorView.lineWrapping,
        CM.syntaxHighlighting(CM.oneDarkHighlightStyle), ...(py ? [CM.python()] : []),
      ] }) });
    }).catch(() => { /* the <pre> below stays */ });
    return () => { gone = true; view?.destroy(); };
  }, [open, code, lang]);
  return (
    <details id="annotate-code" className="plan-card annotate-code" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><h3 className="plan-card-title">Your code</h3><span className="small muted">{lang || ""} · {code.split("\n").length} lines</span></summary>
      {open && <div ref={host} className="code-view">{null}</div>}
    </details>
  );
}
