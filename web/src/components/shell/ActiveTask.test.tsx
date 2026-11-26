import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActiveTask, activityTime, returnToActivity, type TimedActivity } from "./ActiveTask";
import { ToastProvider } from "@/lib/toast";
import { useRun } from "@/lib/run-store";
import { useFlow } from "@/lib/flow-store";
import * as apiModule from "@/lib/api";
import { setNavigator } from "@/lib/navigate";

const task: TimedActivity = { key: "coding:one", id: "one", kind: "coding", title: "Debug the retry loop", label: "Coding practice", href: "/practical/coding/one", elapsed_sec: 90, ticking: true };
const push = vi.fn();
beforeEach(() => { setNavigator({ push, replace: vi.fn() }); push.mockClear(); useRun.getState().setActive(null); useFlow.getState().setMock(false); });
afterEach(() => vi.restoreAllMocks());
function mount(tasks = [task]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(apiModule, "api").mockImplementation(async (path) => path === "/timed-sessions" ? { activities: tasks, server_now: Date.now() / 1000 } : { ok: true });
  return render(<QueryClientProvider client={qc}><ToastProvider><ActiveTask /></ToastProvider></QueryClientProvider>);
}

it("shows the task and clock, and returns to the exact attempt", async () => {
  mount();
  await screen.findByText(task.title);
  expect(screen.getByText("Running · Coding practice")).toBeInTheDocument();
  expect(screen.getByText("01:30")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle(`Return to ${task.title}`));
  await waitFor(() => expect(push).toHaveBeenCalledWith(task.href));
});

it("requires an explicit end and sends the selected session key", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: `End ${task.title}` }));
  expect(screen.getByRole("dialog")).toHaveTextContent("End this session?");
  expect(apiModule.api).not.toHaveBeenCalledWith("/timed-sessions/end", expect.anything(), expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await waitFor(() => expect(apiModule.api).toHaveBeenCalledWith("/timed-sessions/end", "POST", { key: task.key }));
});

it("restores the existing LeetCode run before opening it in another section", async () => {
  const active = { session_id: "lc-one", elapsed_sec: 80 };
  vi.spyOn(apiModule, "api").mockResolvedValue({ active });
  await act(async () => { await returnToActivity({ ...task, kind: "leetcode", href: "/leetcode/today" }); });
  expect(useRun.getState().active).toEqual(active);
  expect(useRun.getState().minimised).toBe(false);
  expect(push).toHaveBeenCalledWith("/leetcode/today");
});

it("reopens the mock overview when no question is running", async () => {
  await returnToActivity({ ...task, kind: "mock", href: "/leetcode/today" });
  expect(useFlow.getState().mockOpen).toBe(true);
});

it("freezes paused clocks and displays expired timed activities", async () => {
  expect(activityTime({ ...task, ticking: false }, 200)).toBe(90);
  mount([{ ...task, elapsed_sec: 4000, duration_sec: 3600 }]);
  expect(await screen.findByText(/Time up/)).toBeInTheDocument();
});
