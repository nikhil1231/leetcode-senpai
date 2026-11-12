"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { pctText, unknownBand, useReadiness, type Readiness, type ReadinessSection } from "@/lib/queries";
import { SECTIONS } from "@/lib/sections";
import { useToast } from "@/lib/toast";
import { Loader } from "@/components/ui/Loader";
import { bandClass } from "@/components/readiness/ReadinessCard";
import { SenpaiToday } from "@/features/senpai/SenpaiToday";
import { TutorLine } from "@/features/tutor/TutorLine";
import { TutorPage } from "@/features/tutor/TutorPage";
import Link from "next/link";
import type { CSSProperties } from "react";

const DETAILS: Record<string, [string, string]> = {
  leetcode: ["Topics", "/leetcode/topics"], "system-design": ["What you know", "/system-design/progress"], fundamentals: ["What you know", "/fundamentals/progress"],
  ai: ["What you know", "/ai/progress"], experience: ["Story bank", "/experience/stories"], practical: ["Mistakes book", "/practical/mistakes"],
};
const SHORT = (id: string) => SECTIONS[id as keyof typeof SECTIONS].short;
const known = (o: { band: string }) => !unknownBand(o.band);

function Radar({ rows }: { rows: ReadinessSection[] }) {
  const cx = 190, cy = 150, R = 96, n = rows.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number, r = R) => [cx + ((r * v) / 100) * Math.cos(ang(i)), cy + ((r * v) / 100) * Math.sin(ang(i))];
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(",")).join(" ");
  const alt = rows.map((r) => `${r.title} ${unknownBand(r.band) ? "not tested" : r.ready + " percent"}`).join(", ");
  return (
    <svg className="rd-radar" viewBox="0 0 380 300" role="img" aria-label={`Readiness by section: ${alt}`}>
      {[25, 50, 75, 100].map((v) => <polygon key={v} className={`rd-ring ${v === 75 ? "is-target" : ""}`} points={poly(rows.map(() => v))} />)}
      {rows.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} className="rd-spoke" x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} />; })}
      <polygon className="rd-area-tested" points={poly(rows.map((r) => r.coverage))} />
      <polygon className="rd-area-ready" points={poly(rows.map((r) => r.ready))} />
      {rows.map((r, i) => { const [x, y] = pt(i, r.ready); return <circle key={r.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r="4.5" style={{ fill: `var(--sec-${r.id})` }} />; })}
      {rows.map((r, i) => {
        const [x, y] = pt(i, 100, R + 18), c = Math.cos(ang(i)), anchor = Math.abs(c) < 0.25 ? "middle" : c > 0 ? "start" : "end";
        return (
          <g key={r.id}>
            <text className="rd-axis" x={x.toFixed(1)} y={(y - 2).toFixed(1)} textAnchor={anchor} style={{ fill: `var(--sec-${r.id})` }}>{SHORT(r.id)}</text>
            <text className="rd-axis-val" x={x.toFixed(1)} y={(y + 13).toFixed(1)} textAnchor={anchor}>{pctText(r)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Summary({ o, rows }: { o: Readiness["overall"] & { coverage: number }; rows: ReadinessSection[] }) {
  if (!known(o)) return <>{o.coverage ? `Only ${o.coverage}% of the syllabus has been tested` : "Nothing has been tested yet"}, so there is no score to trust. A placement check in a section takes about five minutes and starts the picture.</>;
  const w = rows.find((r) => r.id === o.weakest), s = rows.find((r) => r.id === o.strongest);
  return (
    <>You could produce about <b>{o.ready}%</b> of everything across the six sections right now, measured on the {o.coverage}% of it that has been tested.
      {w && s && w.id !== s.id && <> {s.title} is furthest along ({s.ready}%); <b>{w.title}</b> holds you back ({w.ready}%). A loop is usually only as strong as its weakest round.</>}</>
  );
}

function Interview({ iv, o }: { iv: Readiness["interview"]; o: Readiness["overall"] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(iv?.date || "");
  const save = useMutation({
    mutationFn: (value: string) => api("/config", "POST", { interview_date: value }),
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ["api", "/readiness"] }); },
    onError: (e: Error) => toast(e.message || "Could not save the date"),
  });
  if (editing) {
    return (
      <form className="rd-iv-form" onSubmit={(e) => { e.preventDefault(); if (date) save.mutate(date); }}>
        <label>Interview date <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus /></label>
        <button type="submit" className="button is-primary is-small">Save</button>
        {iv && <button type="button" className="button is-ghost is-small" onClick={() => save.mutate("")}>Remove</button>}
        <button type="button" className="button is-ghost is-small" onClick={() => setEditing(false)}>Cancel</button>
      </form>
    );
  }
  if (!iv) return <p className="rd-iv"><button type="button" className="rd-link" onClick={() => setEditing(true)}>Set your interview date</button> <span className="sd-muted">for a countdown and the weekly pace it needs.</span></p>;
  const past = iv.days_left < 0, n = Math.abs(iv.days_left);
  const when = past ? `was ${n} day${n === 1 ? "" : "s"} ago` : iv.days_left === 0 ? "is today" : `is in ${n} day${n === 1 ? "" : "s"}`;
  return (
    <p className="rd-iv"><b>Your interview {when}</b> ({iv.date}).
      {!past && known(o) && (iv.gap === 0 ? " You are past the line; keep it there." : <> To reach {iv.target}% you need about <b>+{iv.per_week}</b> points a week.</>)}{" "}
      <button type="button" className="rd-link is-quiet" onClick={() => setEditing(true)}>Change</button></p>
  );
}

function Card({ r, weakest }: { r: ReadinessSection; weakest: boolean }) {
  const [label, to] = DETAILS[r.id];
  const unknown = unknownBand(r.band);
  return (
    <article className={`rd-card ${weakest ? "is-weakest" : ""}`} style={{ "--c": `var(--sec-${r.id})` } as CSSProperties}>
      <header><h3>{r.title}</h3>{weakest && <span className="rd-flag">Biggest gap</span>}<span className={`rd-band ${bandClass(r.band)}`}>{r.band}</span></header>
      <div className="rd-num"><strong>{pctText(r)}</strong><span>{unknown ? (r.coverage ? "too little tested to score" : "not tested yet") : "held right now"}</span></div>
      <div className="rd-bar" role="img" aria-label={`${r.ready}% held, ${r.coverage}% tested`}><span className="rd-bar-tested" style={{ width: `${r.coverage}%` }} /><span className="rd-bar-held" style={{ width: `${r.ready}%` }} /></div>
      <p className="rd-head">{r.headline}</p>
      <p className="rd-focus">{r.slipping ? <><b className="rd-slip">{r.slipping} slipping.</b> </> : null}{r.focus}</p>
      <footer><span className="rd-weight">{Math.round(r.weight * 100)}% of your plan</span>
        <Link className="rd-link" href={`/${r.id === "leetcode" ? "leetcode/today" : r.id}`}>Continue →</Link>
        <Link className="rd-link is-quiet" href={to}>{label}</Link></footer>
    </article>
  );
}

function Overview() {
  useHeading("Overview", "Interview readiness");
  const q = useReadiness();
  if (q.isLoading || !q.data) return <Loader />;
  const { overall: o, sections: rows, interview } = q.data;
  const oo = o as Readiness["overall"] & { coverage: number };
  return (
    <div className="rd">
      <div className="sd-page-intro"><span className="sd-eyebrow">OVERVIEW</span><h2 id="sd-heading" tabIndex={-1}>Start with the next step. See where you stand.</h2></div>
      <SenpaiToday />
      <div id="rd-tutor"><TutorLine /></div>
      <section className="rd-hero">
        <div className="rd-hero-main"><span className="sd-eyebrow">INTERVIEW READINESS</span>
          <div className="rd-big"><strong>{known(o) ? o.ready + "%" : "–"}</strong><span className={`rd-band ${bandClass(o.band)}`}>{o.band}</span></div>
          <p className="rd-summary"><Summary o={oo} rows={rows} /></p>
          <div id="rd-iv"><Interview iv={interview} o={o} /></div>
          <p className="rd-week-line">{o.gained_week ? <><b>+{o.gained_week}</b> ideas learned this week</> : "Nothing new learned this week"}{o.slipped_week ? <> · <b>{o.slipped_week}</b> slipped</> : null}{o.slipping ? ` · ${o.slipping} due a review` : ""}</p>
          <p className="rd-key"><span><i className="is-held" />Held right now</span><span><i className="is-tested" />Tested so far</span><span><i className="is-target" />Interview-ready line</span></p></div>
        <div className="rd-hero-chart"><Radar rows={rows} /></div>
      </section>
      <div className="rd-grid">{rows.map((r) => <Card key={r.id} r={r} weakest={rows.length > 1 && known(o) && o.weakest === r.id} />)}</div>
      <p className="rd-note sd-muted">How this is measured: each section counts what you would get right today out of its whole syllabus (recall fades without practice), so an untested section reads as unknown, not zero. Coding counts skills by the evidence behind them; Experience also counts whether each competency has a story. The overall figure weights sections by your plan.</p>
    </div>
  );
}

export function ReadinessPage({ view }: { view: string }) {
  return view === "tutor" ? <TutorPage /> : <section className="tab"><div className="tr-view"><Overview /></div></section>;
}
