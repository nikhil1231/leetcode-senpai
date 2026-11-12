"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useHeading } from "@/lib/heading";
import { isoWeek } from "@/lib/md";
import { useOverview } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { SectionHome } from "@/components/SectionHome";
import { DiffLabel } from "@/components/ui/Badge";
import { Loader, LoadError } from "@/components/ui/Loader";
import { Icon } from "@/components/Icon";
import { TAB_TITLES } from "@/lib/sections";
import { useStartFlow } from "./useStartFlow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const laneOf = (it: Any) => (it.kind === "new" ? "new" : it.kind === "drill" ? "drill" : "review");
const SEGMENT_TONE: Record<string, string> = { overdue: "is-late", due: "is-now", soon: "is-soon" };
const SEGMENT_OPEN = new Set(["overdue", "due"]);
const SEGMENT_SHOWN = 6;

// Due dates read as "due 25 Jul". How late a card is only spelled out once it is genuinely overdue.
function dueLabel(iso: string | null, todayIso: string, overdue: boolean) {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00");
  if (isNaN(due.getTime())) return null;
  const today = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const days = Math.round((today.getTime() - due.getTime()) / 86400000);
  const short = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (overdue) return { text: `due ${short} · ${days}d late`, overdue: true };
  return days === 0 ? { text: "due today", overdue: false } : { text: `due ${short}`, overdue: false };
}

function QueueRow({ it, q, overdue = false, onStart, onImport }: { it: Any; q: Any; overdue?: boolean; onStart: (it: Any) => void; onImport?: () => void }) {
  const lane = laneOf(it);
  const due = dueLabel(it.due_date, q.date, overdue);
  const recall = it.mode === "recall";
  const label = it.grading_status === "pending" ? "Grading..." : it.grading_status === "ready" ? "View grade" : it.grading_status === "failed" ? "Retry" : "Recall";
  const meta: { text: string; overdue?: boolean }[] = [];
  if (lane === "drill" && it.reason) meta.push({ text: it.reason });
  if (due) meta.push(due);
  void onImport;
  return (
    <li className="q-row" data-recall-card={it.recall_attempt_id || ""}>
      <div className="q-main">
        <h3 className="q-title">{it.title}</h3>
        <DiffLabel difficulty={it.difficulty} />
        {it.leech && <span className="tag is-danger is-light">leech</span>}
        {it.grading_status === "pending" && <span className="tag recall-status-tag is-warning is-light">grading</span>}
        {it.grading_status === "ready" && <span className="tag recall-status-tag is-success is-light">grade ready</span>}
        {it.grading_status === "failed" && <span className="tag recall-status-tag is-danger is-light">failed</span>}
      </div>
      {meta.length > 0 && <div className="q-meta" title={meta.map((m) => m.text).join(" · ")}>{meta.map((m, i) => <span key={i} className={m.overdue ? "is-overdue" : undefined}>{m.text}</span>)}</div>}
      <button className={`button q-action ${recall ? "is-recall" : "is-start"}`} onClick={() => onStart(it)}>{recall ? label : "Start"}</button>
    </li>
  );
}

function Section({ title, count, desc, children, extraClass = "" }: { title: string; count: number; desc: string; children: React.ReactNode; extraClass?: string }) {
  return (
    <section className={`today-section ${extraClass}`}>
      <header className="section-head"><h2 className="section-title" title={desc}>{title}<span className="section-count">{count}</span></h2></header>
      {children}
    </section>
  );
}

function ProgressPanel({ families, onTopics }: { families: Any[]; onTopics: () => void }) {
  if (!families?.length) return null;
  const solved = families.reduce((n, f) => n + f.solved, 0), total = families.reduce((n, f) => n + f.total, 0);
  if (!total) return null;
  const cleared = families.filter((f) => f.total && f.solved >= f.total).length;
  return (
    <section className="progress-panel">
      <div className="progress-lead">
        <div className="progress-headline"><h2 className="section-title">Library progress</h2><div className="progress-count">{solved}<em>/{total}</em></div></div>
        <p className="progress-sub">{solved} of {total} problems covered{cleared ? ` · ${cleared} famil${cleared === 1 ? "y" : "ies"} cleared` : ""}</p>
        <button id="btn-goto-topics" className="button is-ghost is-small" type="button" onClick={onTopics}>Topic map</button>
      </div>
      <span className="bar progress-overall"><span style={{ width: `${Math.round((solved / total) * 100)}%` }} /></span>
      <div className="fam-strip">{families.map((f) => (
        <div key={f.family} className={`fam-chip${f.total && f.solved >= f.total ? " is-complete" : ""}`}>
          <div className="fam-chip-top"><span className="fam-chip-name">{f.family}</span><span className="fam-chip-count">{f.solved}<em>/{f.total}</em></span></div>
          <span className="bar"><span style={{ width: `${Math.round(f.coverage * 100)}%` }} /></span>
        </div>))}</div>
    </section>
  );
}

function WeeklyReport({ report, llm }: { report: Any; llm: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!report || report.iso_week !== isoWeek(new Date())) {
    if (!llm) return null;
    return (
      <div className="banner"><span className="banner-icon" aria-hidden="true">📋</span>
        <div className="banner-body"><div className="banner-title">Weekly coach report</div><p className="banner-sub">Get this week&apos;s diagnosis and focus plan.</p></div>
        <button id="btn-gen-report" className="button is-primary" disabled={busy}
          onClick={async () => { setBusy(true); await api("/report/weekly", "POST"); qc.invalidateQueries(); setBusy(false); }}>
          {busy ? <><span className="spinner spinner-sm" /> Thinking…</> : "Generate"}</button></div>
    );
  }
  return (
    <div className="banner is-report"><span className="banner-icon" aria-hidden="true">📋</span>
      <div className="banner-body"><div className="banner-title">Weekly coach report</div>
        <ul>{report.insights.map((i: string, n: number) => <li key={n}>{i}</li>)}</ul>
        {report.focus_plan && <p className="focus"><b>Focus:</b> {report.focus_plan}</p>}</div></div>
  );
}

function MockCard({ mock }: { mock: Any }) {
  const setMock = useFlow((s) => s.setMock);
  if (!mock || (!mock.active && mock.taken_this_week)) return null;
  return (
    <div className="banner"><span className="banner-icon" aria-hidden="true">⏱</span>
      <div className="banner-body">
        <div className="banner-title">{mock.active ? "Mock in progress" : "Weekly mock interview"}</div>
        <p className="banner-sub">{mock.active ? "Pick up where you left off." : "60 min · 3 problems · exam conditions. Builds the trend that actually tracks readiness."}</p>
      </div>
      <button id="btn-start-mock" className="button is-primary" onClick={() => setMock(true)}>{mock.active ? "Resume" : "Start mock"}</button></div>
  );
}

export function TodayPage() {
  const [title, sub] = TAB_TITLES.today;
  useHeading(title, sub);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const llm = useOverview().data?.llm_enabled ?? false;
  const start = useStartFlow();
  const setSprint = useFlow((s) => s.setSprint);
  const openLearning = useFlow((s) => s.openLearning);
  const query = useQuery({
    queryKey: ["api", "today-page"],
    queryFn: async () => {
      const [q, report, mock, families, board] = await Promise.all([
        api("/today"), api("/report/latest").catch(() => ({ report: null })), api("/mock/status").catch(() => ({})),
        api("/topics/tree").catch(() => []), api("/reviews/schedule").catch(() => []),
      ]);
      return { q, report: report.report, mock, families, board };
    },
  });
  if (query.isLoading) return <Loader message="Loading your queue…" />;
  if (query.error || !query.data) return <LoadError error={query.error} retry={() => query.refetch()} />;
  const { q, report, mock, families, board } = query.data as Any;

  const go = (it: Any) => start(it.slug, it.kind, it.mode || "", it.title, it.category || "", it.recall_attempt_id || null, it.grading_status || null);
  const waiting = (board as Any[]).filter((s) => s.key === "overdue" || s.key === "due").reduce((n, s) => n + s.count, 0);
  const due: Any[] = (board as Any[]).filter((s) => s.key === "overdue" || s.key === "due").flatMap((s) => s.items.map((it: Any) => ({ ...it, overdue: s.key === "overdue" })));
  const queue = [...due, ...q.new, ...(q.drills || [])];
  const lead = queue[0], second = queue[1];
  const kicker = (it: Any) => (due.includes(it) ? (it.overdue ? "Overdue review" : "Review due") : laneOf(it) === "drill" ? "Focused drill" : "New problem");
  const whyOf = (it: Any) => {
    const d = dueLabel(it.due_date, q.date, it.overdue);
    if (it.mode === "recall") return `A quick recall${d ? ", " + d.text.toLowerCase() : ""}: say the approach from memory, then check it.`;
    if (due.includes(it)) return `A review${d ? ", " + d.text.toLowerCase() : ""}: solve it again from scratch.`;
    if (laneOf(it) === "drill") return it.reason || "Short practice on something you recently got wrong.";
    return `A new ${it.difficulty ? String(it.difficulty).toLowerCase() + " " : ""}problem from a topic you have covered less.`;
  };
  const importOne = async (slug: string) => { await api("/import/problem", "POST", { slug }); toast("Imported."); qc.invalidateQueries(); };
  const recovery = q.learning_recovery;

  const segment = (seg: Any) => (
    <details key={seg.key} className={`q-seg ${SEGMENT_TONE[seg.key] || "is-later"}`} open={SEGMENT_OPEN.has(seg.key) || undefined}>
      <summary className="q-seg-head"><span className="q-seg-caret" aria-hidden="true" /><span className="q-seg-dot" aria-hidden="true" /><span className="q-seg-label">{seg.label}</span><span className="q-seg-count">{seg.count}</span></summary>
      <ul className="q-list">{seg.items.slice(0, SEGMENT_SHOWN).map((it: Any) => <QueueRow key={it.slug + it.kind} it={it} q={q} overdue={seg.key === "overdue"} onStart={go} />)}</ul>
      {seg.items.length > SEGMENT_SHOWN && (
        <details className="q-more"><summary>Show {seg.items.length - SEGMENT_SHOWN} more</summary>
          <ul className="q-list">{seg.items.slice(SEGMENT_SHOWN).map((it: Any) => <QueueRow key={it.slug + it.kind} it={it} q={q} overdue={seg.key === "overdue"} onStart={go} />)}</ul></details>
      )}
    </details>
  );

  const prep = <>
    <ProgressPanel families={families} onTopics={() => router.push("/leetcode/topics")} />
    <WeeklyReport report={report} llm={llm} />
    <MockCard mock={mock} />
  </>;
  const hasPrep = families?.length || llm || mock?.active || (mock && !mock.taken_this_week);

  return (
    <>
      <SectionHome section="leetcode"
        next={lead ? { kicker: kicker(lead), title: lead.title, why: whyOf(lead), button: <button type="button" className="button is-primary" onClick={() => go(lead)}>{lead.mode === "recall" ? "Recall" : "Start"}</button> }
          : { kicker: "Next step", title: "Nothing is due", why: "Every review is done for now. Import a pack in Discover, or run a sprint.", button: <button type="button" className="button is-primary" onClick={() => router.push("/leetcode/discover")}>Open Discover</button> }}
        alts={[...(second ? [{ title: second.title, why: kicker(second), onClick: () => go(second) }] : []), { title: "Sprint round", why: "Several quick problems against the clock.", onClick: () => setSprint(true) }]}
        stats={[["Reviews due", waiting, waiting > 0], ["New queued", q.new.length]]} />
      <div className="today-shell">
        <div className="today-grid">
          <Section title="Reviews due" count={waiting} extraClass="today-section-primary"
            desc="Every scheduled review, grouped by when it is due. A card stays in “Due now” for a week before it counts as overdue.">
            {board.length ? <div className="q-board">{board.map(segment)}</div> : <p className="empty">No reviews scheduled yet — solve a few problems.</p>}
          </Section>
          <div className="today-side">
            <Section title="New problems" count={q.new.length} desc="Problems you haven't solved yet, picked from topics you have covered least. Reviews still come first.">
              {q.new.length ? <ul className="q-list">{q.new.map((it: Any) => <QueueRow key={it.slug} it={it} q={q} onStart={go} />)}</ul> : <p className="empty">Nothing queued. Import a pack in Discover.</p>}
            </Section>
            <Section title="Focused drills" count={q.drills?.length || 0} desc="Short practice on problems you recently got wrong or found slow.">
              <div className="drill-tiles">
                <button className="drill-tile" type="button" id="btn-start-sprint" onClick={() => setSprint(true)}>
                  <span className="drill-tile-glyph" aria-hidden="true"><Icon id="i-drill" className="" /></span><span className="drill-tile-title">Sprint round</span></button>
                {recovery && (
                  <button className="drill-tile learning-recovery" type="button" onClick={() => openLearning({ type: "sequence", sequence: recovery.sequence })}>
                    <span className="drill-tile-glyph" aria-hidden="true"><Icon id="i-focus" className="" /></span><span className="drill-tile-title">{recovery.title}</span></button>
                )}
              </div>
              {q.drills?.length ? <ul className="q-list">{q.drills.map((it: Any) => <QueueRow key={it.slug} it={it} q={q} onStart={go} />)}</ul> : <p className="empty">No focused drills queued.</p>}
            </Section>
          </div>
        </div>
        {(q.learning_checks || []).length > 0 && (
          <div className="learning-cta-row">{q.learning_checks.map((c: Any) => (
            <button key={c.id} className="learning-cta learning-application" onClick={() => openLearning({ type: "application", id: c.id })}>
              <span className="learning-cta-kicker">Spaced check</span><span className="learning-cta-title">Later application check</span><span className="learning-cta-go">Answer &rarr;</span></button>))}</div>
        )}
        {q.expansion?.length > 0 && (
          <div className="today-expansion">
            <Section title="Grow your library" count={q.expansion.length} desc="Well-rated problems you could import, from topics you have already started.">
              <ul className="q-list">{q.expansion.map((x: Any) => (
                <li className="q-row is-expansion" key={x.slug}>
                  <div className="q-main"><h3 className="q-title">{x.title}</h3><DiffLabel difficulty={x.difficulty} />{x.like_ratio ? <span className="tag is-success is-light">{Math.round(x.like_ratio * 100)}% liked</span> : null}</div>
                  <div className="q-meta"><span>{x.reason}</span><span>{x.category}</span></div>
                  <button className="button q-action import-one" onClick={() => importOne(x.slug)}>Import</button></li>))}</ul>
            </Section>
          </div>
        )}
        {hasPrep ? <div className="today-prep">{prep}</div> : null}
      </div>
    </>
  );
}
