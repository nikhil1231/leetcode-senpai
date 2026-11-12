"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { shortLocalDate } from "@/lib/format";
import { TAB_TITLES } from "@/lib/sections";
import { DiffLabel } from "@/components/ui/Badge";
import { Loader, LoadError } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { StudyPromptButton } from "@/features/study/StudyPrompt";
import { useStartFlow } from "./useStartFlow";
import { useRouter } from "next/navigation";
import { useFlow } from "@/lib/flow-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const Progress = ({ coverage }: { coverage: number }) => <div className="bar progress"><span style={{ width: `${Math.round(coverage * 100)}%` }} /></div>;

export function MasteryPill({ t }: { t: Any }) {
  if (!t.solved) return <span className="mastery-pill is-empty">untested</span>;
  return <span className="mastery-pill">{t.implementation_count || 0} independent · {t.retention_count || 0} later</span>;
}

export const CompactState = ({ state }: { state?: string }) => (
  <span className={`tag problem-state${state ? ` state-${String(state).replace(/_/g, "-")}` : ""}`}>{(state || "-").replace(/_/g, " ")}</span>
);

function TopicModal({ topic, onClose }: { topic: Any; onClose: () => void }) {
  const start = useStartFlow();
  const router = useRouter();
  const q = useQuery({ queryKey: ["api", "topic-problems", topic.category], queryFn: () => api(`/problems?category=${encodeURIComponent(topic.category)}&sort=difficulty`) });
  const rows: Any[] = q.data || [];
  const row = (r: Any, i: number) => {
    const done = r.attempt_count > 0;
    const go = (mode: string) => { onClose(); start(r.slug, "adhoc", mode, r.title, r.neetcode_category || ""); };
    return (
      <li key={r.slug} className={`topic-problem${done ? " is-done" : ""}`}>
        <span className="topic-problem-check" aria-hidden="true">{done ? "✓" : ""}</span>
        <span className="topic-problem-title"><a href={r.url} target="_blank" rel="noopener">{r.title}</a>
          {done && <span className="small">{r.attempt_count}× · last {shortLocalDate(r.last_attempt_at)}</span>}</span>
        <DiffLabel difficulty={r.difficulty} />
        <span className="topic-problem-state">{done ? <CompactState state={r.mastery_state} /> : null}</span>
        <span className="problem-actions">
          {done && <button className="button is-small is-link is-light topic-recall" type="button" title="Recall the method from memory" onClick={() => go("recall")}>Recall</button>}
          <button className={`button is-small${!done && i === 0 ? " is-primary" : ""} topic-start`} type="button" onClick={() => go("")}>Start</button>
        </span>
      </li>
    );
  };
  const section = (label: string, list: Any[]) => list.length ? <><h3 className="topic-section-head small">{label} <span>{list.length}</span></h3><ul className="topic-problems">{list.map(row)}</ul></> : null;
  return (
    <Modal open onClose={onClose} cardClassName="wide" title={topic.category}>
      <div id="topic-summary" className="topic-summary">
        <span className="topic-map-count">{topic.solved}<span className="small">/{topic.total} solved</span></span>
        <Progress coverage={topic.coverage} /><MasteryPill t={topic} />
        <button className="button is-small" type="button" onClick={() => { onClose(); router.push("/leetcode/practice"); useFlow.getState().presetQuickfire(topic.category); }}>Warm up with Quickfire</button>
        <StudyPromptButton scope={{ section: "leetcode", topic: topic.category }} label={topic.category} />
      </div>
      <div id="topic-body">
        {q.isLoading ? <Loader message="Loading problems…" /> : q.error ? <LoadError error={q.error} retry={() => q.refetch()} />
          : !rows.length ? <p className="empty">No problems in this topic yet.</p>
          : <>{section("To do", rows.filter((r) => !r.attempt_count))}{section("Done", rows.filter((r) => r.attempt_count))}</>}
      </div>
    </Modal>
  );
}

export function TopicsPage() {
  useHeading(...TAB_TITLES.topics);
  const q = useQuery({ queryKey: ["api", "/topics/tree"], queryFn: () => api("/topics/tree") });
  const [open, setOpen] = useState<Any>(null);
  if (q.isLoading) return <Loader message="Loading topics…" />;
  if (q.error) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const families: Any[] = q.data;
  if (!families.length) return <p className="empty">No data yet. Import a pack and solve a few.</p>;
  // Weakness is annotated in place rather than re-sorting the map, so the tree stays a stable picture of where you are.
  const focus = new Set(families.flatMap((f) => f.topics).filter((t: Any) => t.solved).sort((a: Any, b: Any) => b.weakness - a.weakness).slice(0, 3).map((t: Any) => t.category));
  const solved = families.reduce((n, f) => n + f.solved, 0), total = families.reduce((n, f) => n + f.total, 0);
  return (
    <>
      <div className="topic-map-head">
        <div><h2 className="section-title">Your map</h2><div className="topic-map-count">{solved}<span className="small">/{total} solved</span></div></div>
        <Progress coverage={total ? solved / total : 0} />
      </div>
      {families.map((f) => (
        <details className="family" open key={f.family}>
          <summary>
            <span className="family-name">{f.family}<StudyPromptButton scope={{ section: "leetcode", family: f.family }} label={f.family} /></span>
            <span className="family-count small">{f.solved}/{f.total}</span><Progress coverage={f.coverage} /><MasteryPill t={f} />
          </summary>
          <div className="family-body">{f.topics.map((t: Any) => {
            const meta = [t.independence_rate != null ? `${Math.round(t.independence_rate * 100)}% solo` : null, t.avg_confidence != null ? `conf ${t.avg_confidence}` : null,
              t.sprint_accuracy != null ? `${Math.round(t.sprint_accuracy * 100)}% pattern` : null].filter(Boolean).join(" · ");
            return (
              <div key={t.category} className={`topic-node${t.solved === t.total && t.total ? " is-complete" : ""}`} role="button" tabIndex={0} aria-label={`Open ${t.category} problems`}
                onClick={() => setOpen(t)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(t); } }}>
                <div className="topic-node-name">{t.category}{focus.has(t.category) && <span className="focus-chip">focus</span>}
                  <StudyPromptButton scope={{ section: "leetcode", topic: t.category }} label={t.category} />
                  {meta && <div className="small">{meta}</div>}</div>
                <div className="topic-node-count">{t.solved}<span className="small">/{t.total}</span></div>
                <Progress coverage={t.coverage} /><MasteryPill t={t} />
              </div>
            );
          })}</div>
        </details>))}
      {open && <TopicModal topic={open} onClose={() => setOpen(null)} />}
    </>
  );
}
