"use client";
import type { ReactNode } from "react";
import { NextUpBanner } from "@/components/nextup/NextUp";
import { ReadinessCard, type Stat } from "@/components/readiness/ReadinessCard";
import { SECTIONS, type SectionId } from "@/lib/sections";

export interface HomeAlt { title: string; why?: string; onClick: () => void }

// The one layout every section Home uses (LeetCode Today, System Design, Fundamentals, AI, Experience, Practical): the
// section's heading, the plan's next step as a slim line, then this section's own next step with up to two
// alternatives on the left and the readiness card on the right, then whatever the section lists below. A section
// supplies content; this owns the arrangement.
export function SectionHome({ section, next, alts = [], extra, below, note, stats, details }: {
  section: SectionId;
  next: { kicker?: string; title: string; why?: ReactNode; button: ReactNode };
  alts?: HomeAlt[]; extra?: ReactNode; below?: ReactNode; note?: ReactNode; stats?: Stat[]; details?: [string, string];
}) {
  const meta = SECTIONS[section];
  return (
    <div className="sh" data-sh={section}>
      <header className="sd-page-intro sh-intro">
        <span className="sd-eyebrow">{meta.full.toUpperCase()}</span>
        <h2 id={section === "leetcode" ? undefined : "sd-heading"} tabIndex={-1}>{meta.tagline}</h2>
        {note && <p className="sh-note">{note}</p>}
      </header>
      <div className="sh-plan"><NextUpBanner /></div>
      <div className="sh-layout">
        <div className="sh-main">
          <section className="hub-next">
            <span className="hub-kicker">{next.kicker || "Next step"}</span><h3>{next.title}</h3>
            {next.why && <p>{next.why}</p>}
            <div className="sd-actions">{next.button}</div>
          </section>
          {alts.length > 0 && (
            <div className="hub-alts" role="group" aria-label="Other options">
              {alts.map((a) => (
                <button key={a.title} type="button" className="hub-alt" onClick={a.onClick}>
                  <span className="hub-kicker">Or</span><b>{a.title}</b><small>{a.why || ""}</small><i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
          )}
          {extra}
        </div>
        <ReadinessCard id={section} stats={stats} details={details} />
      </div>
      {below && <div className="sh-below">{below}</div>}
    </div>
  );
}
