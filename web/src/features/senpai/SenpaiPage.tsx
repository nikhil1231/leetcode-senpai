"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useHeading } from "@/lib/heading";
import { useToast } from "@/lib/toast";
import { Loader } from "@/components/ui/Loader";
import { Blocks, Brief, day, pct, when } from "./parts";
import { useStartBlock } from "./start";
import { DailyReviews } from "@/features/leetcode/DailyReviews";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const STATUS: Record<string, [string, string]> = {
  needs_check: ["Needs a check", "is-warn"], overdue: ["Reviews overdue", "is-warn"], stale: ["Not seen recently", "is-muted"],
  untested: ["No evidence yet", "is-muted"], practised: ["Practised · technique unconfirmed", ""], developing: ["Developing", ""], demonstrated: ["Demonstrated", "is-good"],
};
const DECISION: Record<string, string> = { auto: "Applied", approval: "Needs approval", approved: "Approved", rejected: "Rejected", defer: "Deferred", reject: "Refused", user: "You changed", duplicate: "Duplicate" };

function describe(c: Any, d: Any): string {
  if (!c) return "Plan created";
  const name = (id: string) => d.capabilities.find((x: Any) => x.id === id)?.name || id;
  switch (c.kind) {
    case "rebalance": return "Rebalance time: " + Object.entries(c.target || {}).map(([b, v]) => `${d.buckets[b] || b} ${pct(v as number)}`).join(", ");
    case "focus_add": return "Focus on " + name(c.capability_id);
    case "focus_remove": return "Stop focusing on " + name(c.capability_id);
    case "overlay_add": return "Temporary priority: " + (c.label || "");
    case "overlay_remove": return "Remove temporary priority";
    case "objective_add": return "New objective: " + (c.title || "");
    case "objective_complete": return "Mark objective done";
    case "objective_remove": return "Retire objective";
    case "set_protected": return `Protect ${pct(c.share)} for ${d.buckets[c.bucket] || c.bucket}`;
    case "weekly_minutes": return `Weekly time: ${c.minutes} min`;
    case "checkpoint": return "Later check: " + name(c.capability_id);
    case "intervention_outcome": return `Advice outcome: ${c.outcome}`;
    default: return c.kind || "Change";
  }
}

export function SenpaiPage() {
  useHeading("Senpai", "Your learning plan, today's session, and teaching");
  const qc = useQueryClient();
  const toast = useToast();
  const start = useStartBlock();
  const { teach, openTeach } = useFlow();
  const q = useQuery({ queryKey: ["api", "senpai-page"], queryFn: async () => { const [d, s] = await Promise.all([api("/senpai"), api("/senpai/today")]); return { d, s }; } });
  const [opts, setOpts] = useState<{ budget: number | null; mode: string | null; objective: string }>({ budget: null, mode: null, objective: "" });
  const [obj, setObj] = useState({ title: "", bucket: "" });
  const [reviewing, setReviewing] = useState(false);

  const act = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); await qc.invalidateQueries(); } catch (e) { toast((e as Error).message); }
  }, [qc, toast]);
  const change = (body: Any, msg: string) => act(() => api("/senpai/changes", "POST", body), msg);

  if (q.isLoading) return <Loader message="Loading Senpai…" />;
  if (q.error || !q.data) return <div className="dc-panel"><h2>Senpai could not load</h2><p>{(q.error as Error)?.message}</p><button className="button" type="button" onClick={() => q.refetch()}>Retry</button></div>;
  const { d, s } = q.data as { d: Any; s: Any };
  const js = d.job_scout, target: string | undefined = d.settings.target_job;
  const synced = d.settings.target_job_source === "job_scout";
  const short = target ? target.split(/[(:\-–—.;,]/)[0].trim() : "";
  const fresh = js.configured ? (js.error ? `Job Scout unreachable (${js.error}); using the copy from ${when(js.fetched_at)}.` : `Synced from Job Scout ${when(js.fetched_at)}.`)
    : "Job Scout is not connected on this server; using the target saved here.";
  const p = d.plan_summary;
  const focus = new Set<string>(p.focus.map((f: Any) => f.capability_id));
  const capName = (id: string) => d.capabilities.find((c: Any) => c.id === id)?.name || id;

  return (
    <>
      <header className="dc-hero sp-hero">
        <span className="dc-eyebrow">Senpai · your career target</span>
        <h2>{short || "No career target yet"}</h2>
        {target && target !== short && <p className="help">{target}</p>}
        <p className="help">{fresh} {js.configured && <a href={js.links.settings} target="_blank" rel="noopener">Edit target in Job Scout</a>}</p>
        <div className="dc-actions">
          {js.configured && <button type="button" className="button is-small" onClick={() => act(() => api("/senpai/sync", "POST"), "Synced with Job Scout")}>Sync now</button>}
          {!synced && !js.configured && <Link className="button is-small" href="/leetcode/settings">Set target</Link>}
          <button type="button" className="button is-small is-ghost" disabled={reviewing}
            onClick={async () => { setReviewing(true); await act(() => api("/senpai/weekly", "POST"), "Weekly review done"); setReviewing(false); }}>{reviewing ? "Reviewing…" : "Run weekly review"}</button>
          <Link className="button is-small is-ghost" href="/leetcode/settings">Preferences &amp; charter</Link>
        </div>
      </header>

      <Brief brief={s.brief} />

      {d.proposals.length > 0 && (
        <section className="dc-panel sp-approvals"><h3>Waiting for your approval</h3>
          <ul className="sp-list">{d.proposals.map((pr: Any) => (
            <li key={pr.id}><b>{describe(pr.change, d)}</b><p>{pr.rationale || ""}</p>
              <p className="help">{(pr.reasons || []).join(" ")} · {pr.source} · {day(pr.created_at)}</p>
              <div className="dc-actions">
                <button type="button" className="button is-small is-primary" onClick={() => act(() => api(`/senpai/proposals/${encodeURIComponent(pr.id)}/approve`, "POST", {}), "Approved")}>Approve</button>
                <button type="button" className="button is-small is-ghost" onClick={() => act(() => api(`/senpai/proposals/${encodeURIComponent(pr.id)}/reject`, "POST", {}), "Rejected")}>Reject</button>
              </div></li>))}</ul></section>
      )}

      <div id="sp-session">
        <section className="dc-panel sp-session">
          <div className="sp-row"><h3>Today&apos;s session</h3><span className="help">{s.planned_minutes} of {s.budget_minutes} min · {s.mode} · plan r{s.plan_revision}</span></div>
          {s.blocks.length ? <Blocks blocks={s.blocks} /> : <p>{s.note}</p>}
          {s.outside?.length > 0 && <p className="help">Outside the app this week: {s.outside.map((o: Any) => `${o.label} ~${o.minutes_per_week} min`).join(" · ")}.</p>}
          <div className="dc-toolbar sp-controls">
            <label>Time<select className="input" value={opts.budget ?? d.settings.senpai_session_minutes} onChange={(e) => setOpts({ ...opts, budget: +e.target.value })}>
              {[20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
            <label>Mode<select className="input" value={opts.mode ?? d.settings.senpai_mode} onChange={(e) => setOpts({ ...opts, mode: e.target.value })}>
              {[["mixed", "Mixed"], ["retrieval", "Retrieval"], ["learn", "Learn"], ["interview", "Interview conditions"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Objective<select className="input" value={opts.objective} onChange={(e) => setOpts({ ...opts, objective: e.target.value })}>
              <option value="">Follow the plan</option>
              {p.objectives.map((o: Any) => <option key={o.id} value={o.id}>{o.title}</option>)}
              {p.focus.map((f: Any) => <option key={f.capability_id} value={f.capability_id}>Focus: {capName(f.capability_id)}</option>)}</select></label>
            <button type="button" className="button" onClick={() => act(() => api("/senpai/session", "POST", { budget: opts.budget ?? d.settings.senpai_session_minutes, mode: opts.mode ?? d.settings.senpai_mode, objective: opts.objective || null }), "Session prepared")}>Prepare session</button>
          </div>
        </section>
      </div>

      {teach && <TeachPanel capability={teach} name={capName(teach)} onClose={() => openTeach(null)} />}

      {(d.state.questions || []).length > 0 && <Questions d={d} act={act} />}

      <section className="dc-panel">
        <div className="sp-row"><h3>Plan</h3><span className="help">Revision {p.revision} · {p.weekly_minutes} min/week</span></div>
        <details><summary>Time split in detail</summary>
          <div className="sp-bars">{Object.keys(d.buckets).map((b) => {
            const eff = p.effective_allocation[b] || 0, base = p.allocation[b] || 0, prot = p.protected[b];
            return (
              <div className="sp-bar-row" key={b}><span>{d.buckets[b]}</span>
                <div className="sp-bar"><i style={{ width: pct(eff) }} />{prot ? <em style={{ left: pct(prot) }} title={`Protected minimum ${pct(prot)}`} /> : null}</div>
                <b>{pct(eff)}</b><span className="help">{Math.abs(eff - base) > 0.005 ? `plan ${pct(base)}` : ""}</span></div>
            );
          })}</div></details>
        <p className="help">Senpai moves at most {pct(d.limits.max_weekly_shift)} of your time per week on its own (learning rate {d.limits.learning_rate}); larger moves wait for you.</p>
        <h4>Focus <span className="help">(at most {d.limits.max_focus})</span></h4>
        <div className="sp-chips">{p.focus.length ? p.focus.map((f: Any) => (
          <span key={f.capability_id} className="sp-chip is-focus" title={f.reason || ""}>{capName(f.capability_id)}
            <button type="button" aria-label="Remove focus" onClick={() => change({ kind: "focus_remove", capability_id: f.capability_id }, "Focus removed")}>×</button></span>
        )) : <span className="help">No focus yet. Pick one from Capabilities, or let Senpai propose one.</span>}</div>
        {p.overlays.length > 0 && (<><h4>Temporary priorities</h4><ul className="sp-list">{p.overlays.map((o: Any) => (
          <li key={o.id}>{o.label} · until {day(o.expires_at)} <button type="button" className="button is-ghost is-small" onClick={() => change({ kind: "overlay_remove", overlay_id: o.id }, "Removed")}>Remove</button></li>))}</ul></>)}
        <h4>Objectives</h4>
        <ul className="sp-list">{p.objectives.map((o: Any) => (
          <li key={o.id}><b>{o.title}</b> <span className="help">{d.buckets[o.bucket] || o.bucket}{o.protected ? " · protected" : ""}</span>
            <button type="button" className="button is-ghost is-small" onClick={() => change({ kind: "objective_complete", objective_id: o.id }, "Objective done")}>Done</button>
            <button type="button" className="button is-ghost is-small" onClick={() => { if (confirm("Retire this objective?")) change({ kind: "objective_remove", objective_id: o.id }, "Objective retired"); }}>Retire</button></li>))}</ul>
        <details><summary>Add an objective</summary>
          <div className="dc-toolbar">
            <input className="input" maxLength={200} placeholder="e.g. Explain consistency trade-offs from memory" value={obj.title} onChange={(e) => setObj({ ...obj, title: e.target.value })} />
            <select className="input" value={obj.bucket || Object.keys(d.buckets)[0]} onChange={(e) => setObj({ ...obj, bucket: e.target.value })}>
              {Object.entries(d.buckets).map(([b, l]) => <option key={b} value={b}>{l as string}</option>)}</select>
            <button type="button" className="button is-small" onClick={() => change({ kind: "objective_add", title: obj.title, bucket: obj.bucket || Object.keys(d.buckets)[0] }, "Objective added")}>Add</button>
          </div></details>
      </section>

      {d.interventions.length > 0 && <Follow d={d} act={act} />}

      <section className="dc-panel"><h3>Capabilities</h3>
        <p className="help">In focus, or recent answers needed help. Status describes recorded evidence, not you; your CV and job fit never count as evidence.</p>
        <div className="sp-caps">
          {d.capabilities.filter((c: Any) => focus.has(c.id) || c.status === "needs_check").map((c: Any) => <Cap key={c.id} c={c} d={d} focus={focus} act={act} start={start} onTeach={() => openTeach(c.id)} />)}
          {!d.capabilities.some((c: Any) => focus.has(c.id) || c.status === "needs_check") && <p className="help">Nothing needs attention.</p>}
        </div>
        <details><summary>All {d.capabilities.length} capabilities</summary>
          {Object.entries({ dsa: "Coding (DSA)", system_design: "System design", stack: "Role stack" }).map(([b, label]) => (
            <div key={b}><h4>{label}</h4><div className="sp-caps">{d.capabilities.filter((c: Any) => c.bucket === b).map((c: Any) =>
              <Cap key={c.id} c={c} d={d} focus={focus} act={act} start={start} onTeach={() => openTeach(c.id)} />)}</div></div>))}
        </details>
      </section>

      <Career d={d} />
      <History d={d} />
      <h2 className="sp-section">Daily reviews</h2>
      <div id="senpai-reviews"><DailyReviews /></div>
    </>
  );
}

function Questions({ d, act }: { d: Any; act: (f: () => Promise<unknown>, m?: string) => Promise<void> }) {
  const [text, setText] = useState<Record<string, string>>({});
  const qs = d.state.questions as Any[];
  return (
    <details className="dc-panel sp-fold"><summary><h3>Senpai&apos;s questions <span className="sp-chip">{qs.length}</span></h3></summary>
      <p className="help">Things the logs can&apos;t tell. Your answers inform the next weekly review.</p>
      {qs.map((q) => (
        <div className="sp-question" key={q.id}><p>{q.text}</p>
          <textarea className="input" rows={2} maxLength={1000} value={text[q.id] || ""} onChange={(e) => setText({ ...text, [q.id]: e.target.value })} />
          <button type="button" className="button is-small" onClick={() => act(() => api(`/senpai/questions/${encodeURIComponent(q.id)}`, "POST", { answer: text[q.id] || "" }), "Thanks — noted")}>Answer</button></div>))}
    </details>
  );
}

function Follow({ d, act }: { d: Any; act: (f: () => Promise<unknown>, m?: string) => Promise<void> }) {
  const outcome: Record<string, string> = { pending: "Waiting for the check date", helped: "Helped", not_helped: "Did not help yet", not_tried: "Not tried", unclear: "Unclear" };
  const respond = (id: string, response: string) => act(() => api(`/senpai/interventions/${encodeURIComponent(id)}`, "POST", { response }));
  return (
    <details className="dc-panel sp-fold"><summary><h3>Advice follow-through <span className="sp-chip">{d.interventions.length}</span></h3></summary>
      <p className="help">Whether advice was tried comes from your recorded practice; whether it helped, from a later independent check. Ineffective advice is revised, not repeated.</p>
      <ul className="sp-list">{d.interventions.map((i: Any) => (
        <li key={i.id}><b>{i.action}</b>
          <p className="help">{i.intended_outcome ? `Aim: ${i.intended_outcome} · ` : ""}{i.tried_at ? "tried " + day(i.tried_at) : "not tried yet"} · check {day(i.check_at)} · <span className={`sp-chip ${i.outcome === "helped" ? "is-good" : i.outcome === "not_helped" ? "is-warn" : ""}`}>{outcome[i.outcome] || i.outcome}</span></p>
          <div className="dc-actions">
            <button type="button" className={`button is-small${i.response === "accepted" ? " is-primary" : ""}`} onClick={() => respond(i.id, "accepted")}>I&apos;ll try this</button>
            <button type="button" className={`button is-small${i.response === "dismissed" ? " is-primary" : ""}`} onClick={() => respond(i.id, "dismissed")}>Not useful</button></div></li>))}</ul>
    </details>
  );
}

function Cap({ c, d, focus, act, start, onTeach }: { c: Any; d: Any; focus: Set<string>; act: (f: () => Promise<unknown>, m?: string) => Promise<void>; start: (a: Any) => void; onTeach: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Any>(null);
  const [text, cls] = STATUS[c.status] || [c.status, ""];
  const toggle = async () => {
    setOpen(!open);
    if (!open && !detail) {
      setDetail("loading");
      try { setDetail(await api("/senpai/capabilities/" + encodeURIComponent(c.id))); } catch (e) { setDetail({ error: (e as Error).message }); }
    }
  };
  return (
    <div className="sp-cap" data-cap={c.id}>
      <div><b>{c.name}</b> <span className={`sp-chip ${cls}`}>{text}</span>{focus.has(c.id) && <> <span className="sp-chip is-focus">Focus</span></>} <span className="help">last {day(c.last_at)}</span></div>
      <div className="sp-cap-actions">
        {!focus.has(c.id) && <button type="button" className="button is-ghost is-small" onClick={() => act(() => api("/senpai/changes", "POST", { kind: "focus_add", capability_id: c.id }), "Added to focus")}>Focus</button>}
        <button type="button" className="button is-ghost is-small" onClick={toggle}>Evidence</button>
        <button type="button" className="button is-ghost is-small" disabled={!d.model_enabled} title={d.model_enabled ? undefined : "Teaching needs the model"} onClick={onTeach}>Teach me</button>
      </div>
      {open && (
        <div className="sp-cap-detail">
          {detail === "loading" ? <p className="help">Loading…</p> : detail?.error ? <p className="help">{detail.error}</p> : detail && (
            <>
              <p className="help">{detail.observations.length ? "Recent observations:" : "No observations recorded."}</p>
              <ul>{detail.observations.map((o: Any) => <li key={o.id}>{day(o.at)} · {o.format || ""} · {o.outcome}{o.help && o.help !== "none" ? ` · with ${o.help.replace("_", " ")}` : ""} <span className="help">{o.id}</span></li>)}</ul>
              {detail.resources.length > 0 && (<><p className="help">Material:</p><ul>{detail.resources.map((x: Any, i: number) => (
                <li key={i}><button type="button" className="button is-ghost is-small" onClick={() => start(x.type === "problem" ? { ...x, kind: "adhoc", mode: "" } : x)}>{x.title}</button> <span className="help">{x.minutes} min{x.attempted ? " · attempted" : ""}</span></li>))}</ul></>)}
              <div className="dc-actions"><button type="button" className="button is-small is-ghost" onClick={() => act(() => api("/senpai/checkpoints", "POST", { capability_id: c.id, days: 7 }), "Check scheduled")}>Schedule a later check (7 days)</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Career({ d }: { d: Any }) {
  const js = d.job_scout, w = d.weekly[0], iv: Any[] = js.interviews || [];
  return (
    <section className="dc-panel">
      <div className="sp-row"><h3>Career context</h3>{js.configured && <a className="help" href={js.links.insights} target="_blank" rel="noopener">Job Scout insights</a>}</div>
      {w ? (
        <div className="sp-weekly"><span className="dc-eyebrow">Weekly review · {w.iso_week}</span><p>{w.summary || ""}</p>
          {(w.explanation || []).length > 0 && <ul>{w.explanation.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}</div>
      ) : <p className="help">No weekly review yet. It runs on your chosen day, or now with &quot;Run weekly review&quot;.</p>}
      {iv.length > 0 && (<><h4>Upcoming interviews</h4><ul className="sp-list">{iv.map((i, n) => (
        <li key={n}><b>{i.round_label}</b> · {i.company} · {new Date(i.starts_at).toLocaleString()}
          {i.expectations.documented.length > 0 && <p>Documented: {i.expectations.documented.map((x: Any) => x.statement).join("; ")}</p>}
          {i.expectations.predicted.length > 0 && <p className="help">Predicted (AI prep, not documented): {i.expectations.predicted.flatMap((x: Any) => x.topics).join(", ")}</p>}</li>))}</ul></>)}
      {js.demand?.tags?.length > 0 && (
        <details><summary>What relevant roles ask for</summary>
          <p className="help">{js.demand.cohort?.roles ?? 0} roles at {js.demand.cohort?.companies ?? 0} companies since {js.demand.cohort?.since || ""}; reposts count once. Demand, not your ability.</p>
          <div className="sp-chips">{js.demand.tags.map((t: Any) => <span key={t.tag} className="sp-chip" title={`${t.roles} roles, ${t.companies} companies`}>{t.tag} · {t.companies}</span>)}</div></details>
      )}
    </section>
  );
}

function History({ d }: { d: Any }) {
  const item = (x: Any, i: number) => (
    <li key={i}><span className="sp-chip">{DECISION[x.decision] || x.decision}</span> <b>{describe(x.change, d)}</b>{" "}
      <span className="help">{when(x.at)} · {x.source}{x.plan_revision_after ? ` · r${x.plan_revision_before}→r${x.plan_revision_after}` : ""}</span>
      {x.rationale && <p>{x.rationale}</p>}{(x.reasons || []).length > 0 && <p className="help">{x.reasons.join(" ")}</p>}</li>
  );
  return (
    <section className="dc-panel"><h3>Recent decisions</h3>
      <ul className="sp-list sp-history">{d.decisions.slice(0, 3).map(item)}{!d.decisions.length && <li className="help">Nothing yet.</li>}</ul>
      {d.decisions.length > 3 && <details><summary>{d.decisions.length - 3} earlier</summary><ul className="sp-list sp-history">{d.decisions.slice(3).map(item)}</ul></details>}
      <details><summary>Snapshot (Markdown)</summary><pre className="sp-snapshot">{d.snapshot_md}</pre></details>
    </section>
  );
}

interface Msg { role: "you" | "senpai"; text: string; assistance?: string; exercise?: Any; actions?: Any[] }
function TeachPanel({ capability, name, onClose }: { capability: string; name: string; onClose: () => void }) {
  const [mode, setMode] = useState("learn");
  const [history, setHistory] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ behavior: "smooth" }); }, []);
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const prior = history;
    setHistory([...prior, { role: "you", text: t }]); setText(""); setBusy(true);
    try {
      const r = await api("/senpai/teach", "POST", { capability_id: capability, message: t, mode, history: prior.map((m) => ({ role: m.role, text: m.text })) });
      setHistory((h) => [...h, { role: "senpai", text: r.reply, assistance: r.assistance, exercise: r.exercise, actions: r.actions }]);
    } catch (e) { setHistory((h) => [...h, { role: "senpai", text: (e as Error).message }]); } finally { setBusy(false); }
  };
  return (
    <div id="sp-teach-host" ref={box}>
      <div className="sp-teach" role="dialog" aria-label="Teach me">
        <div className="sp-row"><h3>Senpai · {name}</h3><button type="button" className="button is-ghost is-small" onClick={onClose}>Close</button></div>
        <label>Mode <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
          {[["learn", "Learn (explanations welcome)"], ["independent", "Independent (conceptual hints only)"], ["interview", "Interview (clarifications only)"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <p className="help">Help is recorded as assistance{mode !== "learn" ? ", and on any run in progress" : ""}. Exercises Senpai writes are practice material, not assessments.</p>
        <div className="sp-chat">
          {history.length === 0 && <p className="help">Ask a question, or say what you think you know. Senpai usually starts by checking.</p>}
          {history.map((m, i) => (
            <div key={i} className={`sp-msg ${m.role === "senpai" ? "is-senpai" : ""}`}><b>{m.role === "senpai" ? "Senpai" : "You"}</b>
              {m.assistance && m.assistance !== "none" && <> <span className="sp-chip">{m.assistance.replace("_", " ")}</span></>}<p>{m.text}</p>
              {m.exercise && <details className="sp-exercise"><summary>Practice exercise · supplemental, not validated</summary><p>{m.exercise.prompt}</p><details><summary>Outline</summary><p>{m.exercise.answer_outline}</p></details></details>}
              {(m.actions || []).length > 0 && <p className="help">{m.actions!.map((a) => a.tool === "request_checkpoint" ? `Later check scheduled ${day(a.check_at)}` : `Focus proposal: ${DECISION[a.decision] || a.decision}`).join(" · ")}</p>}</div>))}
          {busy && <p className="help">Senpai is thinking…</p>}
        </div>
        <textarea className="input" rows={3} maxLength={4000} placeholder="What I think the invariant is…" disabled={busy} value={text} autoFocus
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
        <div className="dc-actions"><button type="button" className="button is-primary" disabled={busy} onClick={send}>Send</button></div>
      </div>
    </div>
  );
}
