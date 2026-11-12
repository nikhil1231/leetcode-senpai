import { beforeEach, describe, expect, it, vi } from "vitest";
import { clockNow, elapsedNow, useRun } from "./run-store";
import { pendingRun } from "@/features/run/useRunActions";

beforeEach(() => useRun.getState().setActive(null));

describe("run clock", () => {
  it("counts the plan's minutes and the run's own time, and freezes while paused", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    useRun.getState().setActive({ session_id: "s", elapsed_sec: 30, plan_sec: 120, is_paused: false });
    const { active, clockBase } = useRun.getState();
    vi.setSystemTime(new Date("2026-01-01T10:00:10Z"));
    expect(elapsedNow(active, clockBase)).toBe(40);
    expect(clockNow(active, clockBase)).toBe(160);
    expect(clockNow({ ...active, is_paused: true }, clockBase)).toBe(150);
    vi.useRealTimers();
  });
  it("keeps the editor payload across updates to the same run, and drops it with the run", () => {
    useRun.getState().setActive({ session_id: "s" }, { code: "x" });
    useRun.getState().setActive({ session_id: "s", hint_level: 1 });
    expect(useRun.getState().editor).toEqual({ code: "x" });
    useRun.getState().setActive(null);
    expect(useRun.getState().editor).toBeNull();
  });
  it("cannot minimise a run that is not there", () => {
    useRun.getState().setMinimised(true);
    expect(useRun.getState().minimised).toBe(false);
  });
});

describe("pendingRun", () => {
  it("shows a run at once from what the plan modal already holds", () => {
    const body = { slug: "two-sum", kind: "adhoc", plan_status: "planned", plan_time_sec: 90, surface: "editor", interview: true };
    const { active, editor } = pendingRun({ slug: "two-sum", kind: "adhoc", title: "Two Sum", editor: { par_sec: 900, available: true, can_judge: true, starter_code: "def f(): ...", example_testcases: ["1"], interview_runs: 2 } }, body);
    expect(active).toMatchObject({ session_id: null, title: "Two Sum", plan_sec: 90, par_sec: 900, interview: true });
    expect(editor).toMatchObject({ code: "def f(): ...", runs_left: 2 });
  });
  it("has no editor payload for a run on LeetCode", () => {
    const { editor } = pendingRun({ slug: "x", kind: "adhoc", editor: { par_sec: 1 } }, { slug: "x", kind: "adhoc", surface: "leetcode" });
    expect(editor).toBeNull();
  });
});
