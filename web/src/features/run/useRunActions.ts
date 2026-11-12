"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useRun, type Active } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { leetcodeProblemUrl } from "@/lib/format";

export interface StartBody { slug: string; kind: string; plan_status?: string; plan_time_sec?: number | null; surface: string; interview?: boolean;
  predicted_approach?: string | null; complexity_target_time?: string | null; complexity_target_space?: string | null; planned_edge_cases?: string[] }
export interface Ctx { slug: string; kind: string; title?: string; url?: string; content_html?: string; editor?: Active }

// The run about to start, from what the plan modal holds: enough to switch to it now. Server-only fields (hints,
// takeaway, plan check) arrive with the start's answer.
export function pendingRun(ctx: Ctx, body: StartBody) {
  const e = ctx.editor;
  const active: Active = {
    session_id: null, slug: ctx.slug, kind: ctx.kind, title: ctx.title || ctx.slug, url: ctx.url || leetcodeProblemUrl(ctx.slug),
    started_at: Math.floor(Date.now() / 1000), elapsed_sec: 0, plan_sec: body.plan_time_sec || 0, is_paused: false, paused_at: null, paused_sec: 0,
    hint_level: 0, hints_available: false, give_up_available: false, plan_status: body.plan_status, surface: body.surface, interview: !!body.interview,
    par_sec: e ? e.par_sec : null, takeaway: null, plan_check_available: false, plan_check: null,
  };
  const editor = e && body.surface === "editor" ? {
    available: e.available, can_judge: e.can_judge, content_html: ctx.content_html, starter_code: e.starter_code, example_testcases: e.example_testcases,
    code: e.starter_code, seq: 0, last_input: null, planned_edge_cases: body.planned_edge_cases || [], interview: body.interview,
    runs_left: body.interview ? e.interview_runs : null, edges_checked: [], optimizing: null, truncated: false,
  } : null;
  return { active, editor };
}

export function useRunActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const setActive = useRun((s) => s.setActive);

  const refresh = useCallback(async () => {
    const { active } = await api("/session/active");
    setActive(active);
    return active as Active | null;
  }, [setActive]);

  const startSession = useCallback(async (body: StartBody, opts: { tabOpened?: boolean; pending?: { active: Active; editor: unknown } | null } = {}) => {
    useRun.getState().setNudge(null);
    const request = api("/session/start", "POST", body);
    if (opts.pending) setActive(opts.pending.active, opts.pending.editor);
    let s;
    try { s = await request; } catch (e) {
      if (!opts.pending) throw e;
      setActive(null);
      toast(`Couldn't start the run: ${(e as Error).message}`);
      return;
    }
    const inEditor = s.active && s.active.surface === "editor";
    const opened = inEditor || opts.tabOpened || Boolean(window.open(s.url, "_blank", "noopener"));
    setActive(s.active, s.editor);
    qc.invalidateQueries();
    toast(inEditor ? "Timer started — solve it below." : opened ? "Timer started — solve it on LeetCode, it'll auto-log." : "Timer started — open the problem with the link above.");
  }, [qc, setActive, toast]);

  return { startSession, refresh };
}
