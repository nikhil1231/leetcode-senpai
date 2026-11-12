"use client";
import { useHeadingValue } from "@/lib/heading";
import { useLeetcodeStatus, useOverview } from "@/lib/queries";
import { useUi } from "@/lib/ui-store";
import { useRun } from "@/lib/run-store";
import { StudyTopButtons } from "@/features/study/StudyPrompt";

const LC_WARNING = {
  missing: ["LeetCode cookie not set", "Solves are logged, but without your code — so they can't be graded. Click to set it."],
  expired: ["LeetCode cookie expired", "LeetCode is no longer accepting it. Solves are still logged, but without your code, so they can't be graded. Click to paste a fresh one."],
} as const;

function Stat({ label, value, sub, mod = "", optional = false }: { label: string; value: React.ReactNode; sub?: string; mod?: string; optional?: boolean }) {
  return (
    <div className={`stat${mod ? " " + mod : ""}${optional ? " is-optional" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}{sub && <em>{sub}</em>}</span>
    </div>
  );
}

export function Topbar() {
  const { title, sub } = useHeadingValue();
  const { data: o } = useOverview();
  const lc = useLeetcodeStatus().data?.state;
  const { setCookie, setQuickStart, setPageCoach, pageCoachOpen } = useUi();
  const minimised = useRun((s) => s.minimised);
  const setMinimised = useRun((s) => s.setMinimised);
  const warn = lc === "missing" || lc === "expired" ? LC_WARNING[lc] : null;
  return (
    <header className="topbar">
      <div className="topbar-lead">
        <h1 id="page-title" className="page-title">{title}</h1>
        <p id="page-sub" className="page-sub">{sub}</p>
      </div>
      <div className="topbar-side">
        {warn && <button id="lc-warning" className="lc-warning" type="button" title={warn[1]} onClick={() => setCookie(true)}>{warn[0]}</button>}
        {minimised && <button id="btn-back-to-run" className="back-to-run" type="button" title="The clock is still running" onClick={() => setMinimised(false)}>Back to run</button>}
        <div id="overview" className="overview">
          {o && (
            <>
              <Stat label="Solved" value={o.solved} sub={`/${o.total_problems}`} />
              <Stat label="Due" value={o.due_reviews} mod={o.due_reviews ? "is-due" : ""} />
              <Stat label="Streak" value={<>{o.streak}<em>🔥</em></>} />
              <Stat label="XP today" value={o.xp_today} optional />
              {o.drills_today > 0 && <Stat label="Drills" value={o.drills_today} optional />}
              <Stat label="Leeches" value={o.leeches} mod={o.leeches ? "is-alert" : ""} optional />
            </>
          )}
        </div>
        <button id="btn-quick-start" className="quick-start" type="button" aria-label="Start any problem" title="Start any problem by URL, number or title"
          onClick={() => setQuickStart(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-plus" /></svg>
        </button>
        <StudyTopButtons />
        <button id="btn-page-coach" className="quick-start" type="button" aria-label="Ask AI about this page" title="Ask AI about this page"
          aria-expanded={pageCoachOpen} aria-controls="page-coach" onClick={() => setPageCoach(!pageCoachOpen)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" /></svg>
        </button>
      </div>
    </header>
  );
}
