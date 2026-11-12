"use client";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime, solveSecOf } from "@/lib/format";
import { useFlow } from "@/lib/flow-store";
import { useHeading } from "@/lib/heading";
import { TAB_TITLES } from "@/lib/sections";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader, LoadError } from "@/components/ui/Loader";
import { useStartFlow } from "./useStartFlow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Filter = "all" | "solve" | "drill" | "sprint" | "recall";
const typeOf = (r: Any): Exclude<Filter, "all"> => (r.kind === "recall" ? "recall" : r.kind === "sprint" ? "sprint" : r.kind === "drill" ? "drill" : "solve");
const dayKey = (ts: number) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ts?: number) {
  if (!ts) return "Undated";
  const now = Date.now() / 1000;
  if (dayKey(ts) === dayKey(now)) return "Today";
  if (dayKey(ts) === dayKey(now - 86400)) return "Yesterday";
  return new Date(ts * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function HistoryPage() {
  useHeading(...TAB_TITLES.history);
  const q = useQuery({ queryKey: ["api", "/history?limit=100"], queryFn: () => api("/history?limit=100") });
  const [filter, setFilter] = useState<Filter>("all");
  const start = useStartFlow();
  const openDetail = useFlow((s) => s.openDetail);
  if (q.isLoading) return <Loader message="Loading history…" />;
  if (q.error) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const rows: Any[] = q.data;
  if (!rows.length) return <p className="empty">No attempts logged yet.</p>;
  const counts: Record<Filter, number> = { all: rows.length, solve: 0, drill: 0, sprint: 0, recall: 0 };
  rows.forEach((r) => { counts[typeOf(r)]++; });
  const shown = rows.filter((r) => filter === "all" || typeOf(r) === filter);
  const perDay = new Map<string, number>();
  shown.forEach((r) => { const k = r.solved_at ? dayKey(r.solved_at) : ""; perDay.set(k, (perDay.get(k) || 0) + 1); });
  const fbtn = (f: Filter, label: string) => <button key={f} className={`button is-small${filter === f ? " is-primary" : ""}`} onClick={() => setFilter(f)}>{label} <span className="ml-1 has-text-grey">{counts[f]}</span></button>;
  let lastDay: string | null = null;
  return (
    <>
      <div className="buttons has-addons type-filter" id="history-filter">{fbtn("all", "All")}{fbtn("solve", "Completions")}{fbtn("drill", "Drills")}{fbtn("sprint", "Sprints")}{fbtn("recall", "Recalls")}</div>
      <table className="table is-app is-fullwidth is-hoverable">
        <thead><tr><th>Problem</th><th>Type</th><th>Topic</th><th>When</th><th>Time</th><th>Conf</th><th>How</th><th>Coach read</th><th /></tr></thead>
        <tbody>{shown.map((r) => {
          const t = typeOf(r), day = r.solved_at ? dayKey(r.solved_at) : "";
          const head = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={r.id}>
              {head && <tr className="hist-day"><td colSpan={9}><span className="hist-day-label">{dayLabel(r.solved_at)}</span><span className="hist-day-count">{perDay.get(day)}</span></td></tr>}
              <tr className="hist-row" onClick={() => openDetail(r.id)}>
                <td><a href={r.url} target="_blank" onClick={(e) => e.stopPropagation()}>{r.title}</a> <DifficultyBadge difficulty={r.difficulty} />{" "}
                  {r.prediction_verdict && <span className={`pred pred-${r.prediction_verdict}`} title={`pattern prediction ${r.prediction_verdict}`}>{({ correct: "✓", partial: "~", wrong: "✗" } as Any)[r.prediction_verdict] || ""}</span>}</td>
                <td><span className={`tag type-${t}`}>{t}</span></td>
                <td className="small">{r.actual_category || r.neetcode_category || ""}</td>
                <td className="small">{r.solved_at ? new Date(r.solved_at * 1000).toLocaleDateString() : "—"}</td>
                <td>{fmtTime(solveSecOf(r))}</td>
                <td>{r.confidence == null ? "—" : <span className={`conf-${r.confidence}`}>{["", "Low", "Med", "High"][r.confidence]}</span>}</td>
                <td className="small">{r.independence || "—"}</td>
                <td className="small">{r.kind === "sprint"
                  ? <>{r.predicted_category && <span className="pat">predicted {r.predicted_category}</span>} {r.prediction_note}</>
                  : <>{(r.mistake_tags || []).map((x: string) => <span key={x} className="mtag">{x} </span>)}{r.pattern_used && <span className="pat">{r.pattern_used}</span>}</>}</td>
                <td className="problem-action"><button className="button hist-solve is-small" onClick={(e) => { e.stopPropagation(); start(r.slug, "adhoc", "", r.title, r.neetcode_category || ""); }}>Solve again</button></td>
              </tr>
            </Fragment>
          );
        })}</tbody>
      </table>
      <p className="small">Click a row for its saved practice detail.</p>
    </>
  );
}
