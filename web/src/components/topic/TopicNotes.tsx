"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { inlineMd } from "@/lib/inline-md";

// Topic notes shared by Visualise and the simulators: a key-idea card above the animation, then tabs (steps, trade-offs,
// pitfalls, questions, practice) so the page reads in short pieces, not paragraphs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const split = (s: string, seps: string[]): [string, string] => { for (const sep of seps) { const i = s.indexOf(sep); if (i > 8 && i < s.length - 8) return [s.slice(0, i), s.slice(i + sep.length)]; } return [s, ""]; };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function KeyCard({ t }: { t: Any }) {
  const said = (v?: string) => v && !/^(varies|n\/?a|-|—)$/i.test(v.trim());
  const cx = [said(t.time) && ["Time", t.time], said(t.space) && ["Space", t.space]].filter(Boolean) as string[][];
  return (
    <div className="vz-key"><span className="vz-kicker">Key idea</span><p className="vz-key-text">{inlineMd(t.keyIdea || t.blurb)}</p>
      {cx.length > 0 && <p className="vz-cx">{cx.map(([k, v]) => <span key={k}>{k} <code>{v}</code></span>)}</p>}</div>
  );
}

export function TopicNotes({ t, background, practice }: { t: Any; background?: string; practice?: ReactNode }) {
  const uid = useId();
  const tabs: { id: string; label: string; body: ReactNode; n?: number }[] = [];
  tabs.push({ id: "how", label: "How it works", body: <>
    {t.steps?.length ? <ol className="vz-steps">{t.steps.map((x: string, i: number) => <li key={i}><span>{inlineMd(x)}</span></li>)}</ol> : <p className="vz-prose">{t.howItWorks || ""}</p>}
    {background && <details className="vz-bg"><summary>Background: why it matters</summary><p>{background}</p></details>}</> });
  if (t.tradeoffs?.length) tabs.push({ id: "trade", label: "Trade-offs", n: t.tradeoffs.length, body: <div className="vz-tiles">{t.tradeoffs.map((x: Any, i: number) => {
    const [choice, why] = split(x.rationale, [". "]);
    return <article className="vz-tile" key={i}><h4>{x.decision}</h4><p className="vz-choice">{choice.replace(/\.$/, "")}</p>{why && <p className="vz-why">{why}</p>}</article>; })}</div> });
  if (t.pitfalls?.length) tabs.push({ id: "pit", label: "Pitfalls", n: t.pitfalls.length, body: <ul className="vz-pits">{t.pitfalls.map((x: string, i: number) => {
    const [mistake, cost] = split(x, [" — ", " - ", "; ", ": "]);
    return cost ? <li key={i}><strong>{mistake}</strong><span>{cap(cost)}</span></li> : <li key={i}>{x}</li>; })}</ul> });
  const qs: string[] = t.questions || t.followUps || [], asks = qs.filter((x) => x.trim().endsWith("?")).length * 2 >= qs.length;
  if (qs.length) tabs.push({ id: "qs", label: asks ? "Interview questions" : "Interview follow-ups", n: qs.length, body: <>
    <p className="vz-hint">{asks ? "Answer each out loud in two or three sentences, then check yourself against the simulator." : "How an interviewer pushes this further. Say how your design or code would change for each."}</p>
    <ol className="vz-qs">{qs.map((x, i) => <li key={i}>{x}</li>)}</ol></> });
  if (practice) tabs.push({ id: "lc", label: "Practise", n: t.problems?.length, body: practice });
  const [on, setOn] = useState(tabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <div className="vz-notes" data-vz-notes>
      <div className="vz-tabs" role="tablist" aria-label="Notes">
        {tabs.map((tb, i) => (
          <button key={tb.id} type="button" role="tab" id={`${uid}-tab-${tb.id}`} ref={(el) => { refs.current[tb.id] = el; }} className={`vz-tab${on === tb.id ? " is-on" : ""}`} aria-selected={on === tb.id}
            aria-controls={`${uid}-panel-${tb.id}`} tabIndex={on === tb.id ? 0 : -1} onClick={() => setOn(tb.id)}
            onKeyDown={(e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; const n = tabs[(i + d + tabs.length) % tabs.length]; setOn(n.id); refs.current[n.id]?.focus(); e.preventDefault(); }}>
            {tb.label}{tb.n ? <> <span>{tb.n}</span></> : null}</button>
        ))}
      </div>
      {tabs.map((tb) => <div key={tb.id} className="vz-panel" role="tabpanel" id={`${uid}-panel-${tb.id}`} aria-labelledby={`${uid}-tab-${tb.id}`} hidden={on !== tb.id}>{tb.body}</div>)}
    </div>
  );
}
