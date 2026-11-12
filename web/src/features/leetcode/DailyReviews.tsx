"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Loader } from "@/components/ui/Loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function prerequisites(d: Any) {
  if (!d.target_job.trim()) return "Add your career target (in Job Scout, or in Settings) to give Senpai a direction.";
  if (!d.model_enabled) return "Senpai's model is unavailable. Configure OPENROUTER_API_KEY on the server; saved reviews remain available.";
  if (!d.enabled) return "Automatic reviews are paused. You can still request a review below.";
  return `Automatic review at ${d.review_time} (${d.timezone}) for the previous completed day. The app server must be running; the browser can be closed.`;
}

function Citations({ ids, onShow }: { ids?: string[]; onShow: (id: string) => void }) {
  return (
    <span className="dc-citations">{(ids || []).map((id, i) => (
      <button key={id} type="button" className="button is-ghost is-small" title={`Show supporting activity ${id}`} onClick={() => onShow(id)}>Evidence {i + 1}</button>
    ))}</span>
  );
}

function Observations({ title, rows, onShow }: { title: string; rows?: Any[]; onShow: (id: string) => void }) {
  if (!rows?.length) return null;
  return (
    <section className="dc-panel"><h3>{title}</h3>
      <ul className="dc-observations">{rows.map((r, i) => (
        <li key={i}><span className="dc-confidence">{r.confidence === "tentative" ? "Tentative interpretation" : "Observed"}</span><p>{r.text}</p><Citations ids={r.evidence_ids} onShow={onShow} /></li>))}</ul>
    </section>
  );
}

function Report({ report, goal, onSaved }: { report: Any; goal: string; onSaved: (r: Any) => void }) {
  const fb = report.feedback || { status: "pending", note: "" };
  const [note, setNote] = useState<string>(fb.note);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const evidence = useRef<HTMLDetailsElement>(null);
  const adj = report.adjustment;
  const show = (id: string) => {
    if (evidence.current) evidence.current.open = true;
    const target = [...document.querySelectorAll<HTMLDetailsElement>("[data-event-id]")].find((n) => n.dataset.eventId === id);
    if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
  };
  const send = async (s: string) => {
    setBusy(true); setStatus("Saving…");
    try {
      const saved = await api(`/coach/daily/${encodeURIComponent(report.date)}/feedback`, "POST", { timezone: report.timezone, status: s, note });
      onSaved(saved.report);
    } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <article className="dc-report">
      <header className="dc-report-head"><div><span className="dc-eyebrow">{report.date} · {report.timezone}{report.partial ? " · Partial-day preview" : ""}</span>
        <h2>Daily review</h2><p className="dc-review-summary">{report.summary}</p></div><p className="help">Generated {new Date(report.generated_at * 1000).toLocaleString()}</p></header>
      <details className="dc-goal"><summary>Career target used for this review{report.target_job !== goal ? " (your saved goal has since changed)" : ""}</summary><p>{report.target_job}</p></details>
      <section className="dc-panel"><h3>What you practised</h3><p>{report.practiced}</p></section>
      <div className="dc-columns"><Observations title="What it noticed" rows={report.observations} onShow={show} /><Observations title="Keep doing" rows={report.keep_doing} onShow={show} /></div>
      <section className="dc-panel dc-adjustment"><span className="dc-eyebrow">One adjustment</span>
        {adj ? <><h3>{adj.action}</h3><p>{adj.rationale}</p><Citations ids={adj.evidence_ids} onShow={show} /></> : <><h3>No change recommended</h3><p>The available evidence does not justify an adjustment today.</p></>}
        <h3>Next session</h3><p>{report.tomorrow}</p></section>
      {report.curriculum_suggestions?.length > 0 && (
        <section className="dc-panel"><h3>Curriculum ideas</h3><p className="help">Suggestions only. Plan changes go through Senpai&apos;s limits and approvals.</p>
          <ul>{report.curriculum_suggestions.map((s: Any, i: number) => <li key={i}><b>{s.change}</b><p>{s.rationale}</p><Citations ids={s.evidence_ids} onShow={show} /></li>)}</ul></section>
      )}
      <section className="dc-panel"><h3>Make Senpai more useful</h3>
        {report.reflection_question && <p>{report.reflection_question}</p>}
        <label htmlFor="dc-note">Reflection or correction (optional)</label>
        <textarea id="dc-note" className="input" rows={3} maxLength={2000} placeholder="Context the activity log missed, or whether this advice helped…" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="help">Feedback informs future reviews and the advice follow-through above. Plan changes Senpai made or proposed are listed in the decision history.</p>
        <div className="dc-actions">
          <button type="button" className={`button${fb.status === "accepted" ? " is-primary" : ""}`} disabled={busy} onClick={() => send("accepted")}>I’ll try this</button>
          <button type="button" className={`button${fb.status === "dismissed" ? " is-primary" : ""}`} disabled={busy} onClick={() => send("dismissed")}>Not useful</button>
          <button type="button" className="button is-ghost" disabled={busy} onClick={() => send("pending")}>Save reflection only</button>
        </div>
        <p className="help" id="dc-feedback-status" role="status">{status || (fb.status === "pending" ? (fb.note ? "Reflection saved." : "") : fb.status === "accepted" ? "Marked as an experiment to try. Curriculum unchanged." : "Marked not useful; future reviews will receive this feedback.")}</p>
      </section>
      <details className="dc-panel"><summary>Coverage and uncertainty</summary><ul>{(report.limitations || []).map((l: string, i: number) => <li key={i}>{l}</li>)}</ul></details>
      <details className="dc-panel" id="dc-evidence" ref={evidence}><summary>Supporting activity · includes preceding days for trend context</summary>
        <div className="dc-evidence-list">{(report.evidence || []).map((e: Any) => {
          const { id, title, subject, at, activity, ...process } = e;
          return (
            <details key={id} data-event-id={id}>
              <summary><span>{subject}</span> · {title} · {new Date(at * 1000).toLocaleString(undefined, { timeZone: report.timezone })}</summary>
              <p>{activity}</p>
              <dl>{Object.entries(process).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>
              <p className="help">Source: {id}</p>
            </details>
          );
        })}</div></details>
    </article>
  );
}

// Senpai's daily reviews: process evidence against the plan, separate from each subject's answer tutor.
export function DailyReviews() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["api", "/coach/daily"], queryFn: () => api("/coach/daily") });
  const [picked, setPicked] = useState<string | null>(null);
  const [override, setOverride] = useState<Record<string, Any>>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader message="Loading your learning review…" />;
  if (q.error || !q.data) return <div className="dc-panel"><h2>Daily reviews could not load</h2><p>{(q.error as Error)?.message}</p><button className="button" type="button" onClick={() => q.refetch()}>Retry</button></div>;
  const data = q.data as Any;
  const date: string = picked || data.reports[0]?.date || data.eligible_date;
  const report = override[date] || data.reports.find((r: Any) => r.date === date);
  const cannot = !data.target_job.trim() || !data.model_enabled;
  const generate = async (force: boolean) => {
    setBusy(true); setStatus("Reviewing your practice process…");
    try {
      const r = await api("/coach/daily", "POST", { date, force });
      setOverride({ ...override, [date]: r.report });
      setStatus(r.report.partial ? "Partial-day preview saved." : "Daily review saved.");
      qc.invalidateQueries({ queryKey: ["api", "/coach/daily"] });
    } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <p className="help">{prerequisites(data)} <Link className="button is-ghost is-small" href="/leetcode/settings">Schedule</Link></p>
      <div className="dc-toolbar">
        <label htmlFor="dc-date">Review day <input id="dc-date" className="input" type="date" max={data.today} value={date} disabled={busy} onChange={(e) => setPicked(e.target.value || data.eligible_date)} /></label>
        <button className="button is-primary" type="button" disabled={cannot || busy} onClick={() => generate(false)}>Review selected day</button>
        {report && <button className="button is-ghost" type="button" disabled={cannot || busy} onClick={() => generate(true)}>Regenerate</button>}
        <button className="button is-ghost" type="button" disabled={busy} onClick={() => q.refetch()}>Refresh</button>
      </div>
      <p className="help">Today produces a labelled partial-day preview; the scheduled review finalises it after the day ends. Regeneration uses the current career target.</p>
      <nav className="dc-history" aria-label="Recent daily reviews">{data.reports.map((r: Any) => (
        <button key={r.date} type="button" disabled={busy} className={`button is-small${r.date === date ? " is-primary" : " is-ghost"}`} onClick={() => setPicked(r.date)}>{r.date}{r.partial ? " · preview" : ""}</button>))}</nav>
      <p id="dc-status" className="dc-status" role="status" aria-live="polite">{status || (["unavailable", "off"].includes(data.status?.state) ? data.status.message : "")}</p>
      <div id="dc-report">
        {report ? <Report key={`${date}:${report.generated_at}`} report={report} goal={data.target_job} onSaved={(r) => setOverride({ ...override, [date]: r })} />
          : <div className="dc-panel"><h3>No saved review for this day</h3><p>Choose a day with recorded activity and request a review. Empty days do not receive invented advice.</p></div>}
      </div>
    </>
  );
}
