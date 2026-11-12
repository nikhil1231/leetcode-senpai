"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Pips } from "@/components/readiness/Pips";
import { SectionSwitcher } from "./SectionSwitcher";
import { LEETCODE_TABS, SECTIONS, SIX, TRACKS, type SectionId } from "@/lib/sections";
import { pctText, unknownBand, useMe, useOverview, useReadiness } from "@/lib/queries";
import { useUi } from "@/lib/ui-store";

// Sub-views light up the sidebar item they live under.
const SD_UNDER: Record<string, string> = {
  lessons: "curriculum", lesson: "curriculum", map: "curriculum", setup: "practise", workspace: "practise", exercise: "practise",
  skills: "practise", cases: "practise", quickfire: "practise", papers: "practise", drills: "practise", mistakes: "practise", redesign: "practise",
};
const SD_NAV = [
  ["home", "Home", "i-today"], ["curriculum", "Learn", "i-topics"], ["simulators", "Simulators", "i-discover"],
  ["practise", "Practise", "i-drill"], ["progress", "What you know", "i-insights"],
] as const;

export const TRACK_NAV: Record<string, [string, string, string][]> = {
  course: [["", "Home", "i-today"], ["lessons", "Learn", "i-topics"], ["practise", "Practise", "i-drill"], ["progress", "What you know", "i-insights"]],
  experience: [["", "Home", "i-today"], ["stories", "Story bank", "i-playbook"], ["drill", "Timed answers", "i-drill"], ["dives", "Deep dives", "i-topics"], ["mistakes", "Mistakes book", "i-insights"]],
  practical: [["", "Home", "i-today"], ["mistakes", "Mistakes book", "i-insights"]],
  readiness: [["", "Home", "i-today"], ["tutor", "Tutor", "i-tutor"]],
};
const TRACK_KIND: Record<string, string> = { fundamentals: "course", ai: "course", experience: "experience", practical: "practical", readiness: "readiness" };
const NOTES: Record<string, string[]> = {
  course: ["Read it once.", "Recall it often.", "Explain it simply."], experience: ["Specific.", "Measured.", "In the first person."],
  practical: ["Run the tests.", "Change one thing.", "Say what you see."], readiness: ["One scale.", "Six disciplines.", "No blind spots."],
};
const COURSE_ACTIVE: Record<string, string> = { lesson: "lessons", map: "lessons", quickfire: "practise", mistakes: "practise", placement: "practise", round: "practise", exercise: "practise", nightshift: "practise" };
const OTHER_ACTIVE: Record<string, string> = { lesson: "lessons", story: "stories", dive: "dives", claim: "dives", exercise: "" };

function Notes({ lines }: { lines: string[] }) {
  return <div className="design-nav-note">{lines.map((l, i) => <span key={l}>{l}{i < lines.length - 1 && <br />}</span>)}</div>;
}

function LeetcodeNav({ tab }: { tab: string }) {
  return (
    <nav className="nav" id="tabs" aria-label="Sections">
      <ul>
        {LEETCODE_TABS.map((t) => (
          <li key={t.id} className={t.id === tab ? "is-active" : ""} data-tab={t.id}>
            <Link href={`/leetcode/${t.id}`}><Icon id={t.icon} /><span>{t.label}</span></Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DesignNav({ view }: { view: string }) {
  const active = SD_UNDER[view] ?? view;
  return (
    <nav id="design-nav" className="design-nav" aria-label="System Design">
      <span className="design-nav-label">SYSTEM DESIGN</span>
      {SD_NAV.map(([id, label, icon]) => (
        <Link key={id} href={id === "home" ? "/system-design" : `/system-design/${id}`} data-design-view={id}
          className={id === active ? "is-active" : ""} aria-current={id === active ? "page" : undefined}><Icon id={icon} />{label}</Link>
      ))}
      <div className="design-nav-note">Think it through.<br />Build it simply.<br />Explain the trade-offs.</div>
    </nav>
  );
}

function TrackNav({ track, view }: { track: SectionId; view: string }) {
  const kind = TRACK_KIND[track];
  const readiness = useReadiness().data;
  const active = (kind === "course" ? COURSE_ACTIVE : OTHER_ACTIVE)[view] ?? view;
  return (
    <nav id="track-nav" className="design-nav" aria-label="Learning track">
      <span className="design-nav-label">{SECTIONS[track].full.toUpperCase()}</span>
      {TRACK_NAV[kind].map(([id, label, icon]) => (
        <Link key={id} href={id ? `/${track}/${id}` : `/${track}`} data-track-view={id || "home"}
          className={id === active ? "is-active" : ""} aria-current={id === active ? "page" : undefined}><Icon id={icon} />{label}</Link>
      ))}
      {kind === "readiness" && (
        <>
          <span className="design-nav-label rd-nav-label">JUMP TO</span>
          {SIX.map((id) => {
            const r = readiness?.sections.find((s) => s.id === id);
            return (
              <Link key={id} href={`/${id === "leetcode" ? "leetcode/today" : id}`} className="rd-nav-link" data-go-section={id}
                style={{ "--c": `var(--sec-${id})` } as React.CSSProperties}><i />{SECTIONS[id].full}<em>{r ? pctText(r) : ""}</em></Link>
            );
          })}
        </>
      )}
      <Notes lines={NOTES[kind]} />
    </nav>
  );
}

function ReadinessChip({ section }: { section: SectionId }) {
  const { data: d } = useReadiness();
  if (!d || section === "readiness") return null;
  const o = d.overall, known = !unknownBand(o.band);
  const iv = d.interview && d.interview.days_left >= 0 ? ` · ${d.interview.days_left}d` : "";
  return (
    <Link id="readiness-chip" className="readiness-chip" href="/readiness"
      aria-label={`Interview readiness ${known ? `${o.ready} percent, ${o.band}` : o.band.toLowerCase()}. Open the overview.`}>
      <span className="rd-chip-top"><span>Readiness{iv}</span><em>{known ? o.ready + "%" : "–"}</em></span>
      <Pips rows={d.sections} />
    </Link>
  );
}

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Sidebar({ section, segments }: { section: SectionId; segments: string[] }) {
  const setPalette = useUi((s) => s.setPalette);
  const overview = useOverview().data;
  const updated = formatUpdatedAt(useMe().data?.code_updated_at?.iso);
  const on = overview?.llm_enabled;
  return (
    <aside className="sidebar">
      <SectionSwitcher section={section} />
      {section === "leetcode" && <LeetcodeNav tab={segments[0] ?? "today"} />}
      {section === "system-design" && <DesignNav view={segments[0] ?? "home"} />}
      {TRACKS.includes(section) && <TrackNav track={section} view={segments[0] ?? "home"} />}
      <div className="sidebar-foot">
        <button id="btn-palette" className="palette-trigger" type="button" aria-label="Search and jump to anything"
          aria-keyshortcuts="Control+K Meta+K" onClick={() => setPalette(true)}><span>Search</span><kbd>{typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K"}</kbd></button>
        <ReadinessChip section={section} />
        <Link id="btn-go-tutor" className="go-tutor" href="/readiness/tutor" title="Back to your tutor, from anywhere">
          <Icon id="i-tutor" /><span>Your tutor</span>
        </Link>
        <div className="foot-row foot-chips">
          <div id="coach-chip">
            <div className={`coach-chip${on ? " ai-on" : ""}`} title={overview?.llm_model ? `${overview.llm_provider}/${overview.llm_model}` : "not configured"}>
              <span className="coach-dot" /><span className="coach-model">{on ? overview?.llm_model : "Coach off"}</span>
            </div>
          </div>
          <div id="design-coach-chip" />
        </div>
        <div className="foot-row foot-user">
          <div id="user-chip">{updated && <span className="last-updated" title={updated}>Updated {updated}</span>}</div>
          <Link id="btn-go-settings" className="go-settings" href="/leetcode/settings" title="Settings" aria-label="Settings"><Icon id="i-gear" /></Link>
        </div>
      </div>
    </aside>
  );
}
