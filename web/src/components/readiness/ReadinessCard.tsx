"use client";
import { NavLink } from "@/components/NavLink";
import type { CSSProperties, ReactNode } from "react";
import { Pips } from "./Pips";
import { pctText, unknownBand, useReadiness } from "@/lib/queries";
import { type SectionId } from "@/lib/sections";

export type Stat = [label: string, value: ReactNode, warn?: boolean];
// Where each section's "details" link goes.
const DETAILS: Record<string, [string, string]> = {
  leetcode: ["Topics", "/leetcode/topics"], "system-design": ["What you know", "/system-design/progress"], fundamentals: ["What you know", "/fundamentals/progress"],
  ai: ["What you know", "/ai/progress"], experience: ["Story bank", "/experience/stories"], practical: ["Mistakes book", "/practical/mistakes"],
};
const BAND_CLASS: Record<string, string> = { "Interview-ready": "is-ready", "Nearly there": "is-near", Building: "is-building", Early: "is-early" };
export const bandClass = (b: string) => BAND_CLASS[b] || "is-unknown";

// The same readiness card on every section Home (section-home.js): the section's number, how much is tested,
// what to work on, and the overall figure. Never in the critical path: with no data it draws nothing.
export function ReadinessCard({ id, stats = [], details, bare = false }: { id: SectionId; stats?: Stat[]; details?: [string, string]; bare?: boolean }) {
  const { data: d } = useReadiness();
  const r = d?.sections.find((x) => x.id === id);
  if (!d || !r) return null;
  const o = d.overall, unknown = unknownBand(r.band);
  const [label, to] = details || DETAILS[id];
  const known = !unknownBand(o.band);
  const body = (
    <>
      <span className="sd-eyebrow">INTERVIEW READINESS</span>
      <div className="sh-stand-num"><strong>{pctText(r)}</strong><span className={`rd-band ${bandClass(r.band)}`}>{r.band}</span></div>
      <p className="sh-stand-sub">{unknown ? (r.coverage ? "Too little tested to score yet." : "Nothing tested here yet, so there is no score.") : "of this section you would get right today"}</p>
      <div className="rd-bar" style={{ "--c": "var(--accent)" } as CSSProperties} role="img" aria-label={`${r.ready}% held, ${r.coverage}% tested, ready line at 70%`}>
        <span className="rd-bar-tested" style={{ width: `${r.coverage}%` }} /><span className="rd-bar-held" style={{ width: `${r.ready}%` }} />
      </div>
      <p className="sh-stand-key"><span><i className="is-held" />held</span><span><i className="is-tested" />{r.coverage}% tested</span><span><i className="is-line" />ready</span></p>
      <p className="rd-focus">{r.slipping ? <><b className="rd-slip">{r.slipping} slipping.</b> </> : null}{r.focus}</p>
      {stats.length > 0 && (
        <dl className="hub-stats">{stats.map(([k, v, warn]) => <div key={k} className={warn ? "is-warn" : ""}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      )}
      <NavLink className="hub-stand-link" href={to}>{label} →</NavLink>
      <NavLink className="sh-all" href="/readiness" aria-label={`Overall readiness ${known ? o.ready + " percent" : "unknown"}. Open Overview.`}>
        <span>All six sections <b>{known ? o.ready + "%" : "–"}</b></span><Pips rows={d.sections} />
      </NavLink>
    </>
  );
  return bare ? body : <aside className="sh-stand" data-sh-stand aria-label={`Interview readiness for ${r.title}`}>{body}</aside>;
}
