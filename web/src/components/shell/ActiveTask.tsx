"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import { useFlow } from "@/lib/flow-store";
import { useRun } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { fmtTime } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";

export interface TimedActivity {
  key: string; id: string; kind: string; title: string; label: string; href: string;
  elapsed_sec: number; duration_sec?: number | null; ticking: boolean; paused?: boolean; run_id?: string;
}
interface Status { activities: TimedActivity[]; server_now: number }
export const TIMED_KEY = ["api", "/timed-sessions"];

export async function returnToActivity(a: TimedActivity) {
  if (a.kind === "leetcode" || (a.kind === "mock" && a.run_id)) {
    const { active } = await api("/session/active");
    useRun.getState().setActive(active);
    useRun.getState().setMinimised(false);
  } else if (a.kind === "sprint") useFlow.getState().setSprint(true);
  else if (a.kind === "mock") useFlow.getState().setMock(true);
  navigate(a.href);
}

export function activityTime(a: TimedActivity, since: number) {
  return Math.max(0, a.elapsed_sec + (a.ticking ? Math.max(0, since) : 0));
}

export function ActiveTask() {
  const qc = useQueryClient();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState<TimedActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery<Status>({ queryKey: TIMED_KEY, queryFn: () => api("/timed-sessions"), refetchInterval: 10_000, refetchOnWindowFocus: true, retry: false });
  useEffect(() => {
    if (!q.data?.activities.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [q.data?.activities.length]);
  useEffect(() => {
    const changed = () => { void qc.invalidateQueries({ queryKey: TIMED_KEY }); };
    window.addEventListener("timed-sessions-changed", changed);
    return () => window.removeEventListener("timed-sessions-changed", changed);
  }, [qc]);
  useEffect(() => {
    if (!q.data) return;
    const data = q.data;
    const active = useRun.getState().active;
    if (active?.session_id && data.server_now >= active.started_at &&
        !data.activities.some((a) => a.id === active.session_id || a.run_id === active.session_id)) {
      const id = active.session_id;
      void api("/session/active").then(({ active: fresh }) => {
        if (useRun.getState().active?.session_id === id) useRun.getState().setActive(fresh);
      }).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent("timed-sessions-status", { detail: data }));
  }, [q.data]);
  const resume = async (a: TimedActivity) => { try { await returnToActivity(a); } catch (e) { toast((e as Error).message); } };
  const end = async () => {
    if (!ending) return;
    setBusy(true);
    try {
      await api("/timed-sessions/end", "POST", { key: ending.key });
      if (ending.kind === "leetcode" || ending.kind === "mock") {
        const { active } = await api("/session/active"); useRun.getState().setActive(active);
        if (ending.kind === "mock") useFlow.getState().setMock(false);
      }
      if (ending.kind === "sprint") useFlow.getState().setSprint(false);
      // Tear down a local workspace too, so it can't carry on displaying an ended timer.
      if (ending.kind === "coding" && location.pathname.startsWith("/practical/coding")) navigate("/practical");
      if (["design", "paper", "drill", "redesign"].includes(ending.kind) && location.pathname.startsWith("/system-design")) navigate("/system-design");
      if (ending.kind === "practical" && location.pathname.startsWith("/practical/exercise")) navigate("/practical");
      setEnding(null); void qc.invalidateQueries();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const tasks = q.data?.activities || [];
  if (!tasks.length && !ending) return q.isError ? <div id="active-task" className="active-task-wrap"><button className="button is-small" type="button" onClick={() => void q.refetch()}>Session status unavailable · Retry</button></div> : null;
  return (
    <div id="active-task" className="active-task-wrap">
      {tasks.map((a) => {
        const elapsed = activityTime(a, (now - q.dataUpdatedAt) / 1000);
        const over = !!a.duration_sec && elapsed >= a.duration_sec;
        return <div className={`active-task${a.paused ? " is-paused" : ""}${over ? " is-over" : ""}`} key={a.key}>
          <button type="button" className="active-task-return" onClick={() => void resume(a)} title={`Return to ${a.title}`}>
            <span className="active-task-dot" aria-hidden="true" />
            <span className="active-task-copy"><small>{a.paused || !a.ticking ? "Paused" : "Running"} · {a.label}</small><strong>{a.title}</strong></span>
            <span className="active-task-clock">{over ? "Time up · " : ""}{fmtTime(elapsed)}{a.duration_sec ? ` / ${fmtTime(a.duration_sec)}` : ""}</span>
            <span aria-hidden="true">↗</span>
          </button>
          <button type="button" className="active-task-end" aria-label={`End ${a.title}`} onClick={() => setEnding(a)}>End</button>
        </div>;
      })}
      {ending && createPortal(<Modal open locked={busy} title="End this session?" onClose={() => { if (!busy) setEnding(null); }}>
        <p>End <strong>{ending.title}</strong> and stop its timer? You can then start another session. Ending a mock interview or paper also finishes it.</p>
        <div className="overlay-actions"><button className="button" type="button" disabled={busy} onClick={() => setEnding(null)}>Keep going</button>
          <button className="button is-primary" type="button" disabled={busy} onClick={() => void end()}>{busy ? "Ending…" : "End session"}</button></div>
      </Modal>, document.body)}
    </div>
  );
}
