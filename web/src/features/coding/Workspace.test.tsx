import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Workspace } from "./Workspace";
import { api } from "@/lib/api";
import { useLayout } from "@/features/editor/editor-store";
import type { Attempt, Exercise } from "./types";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("./CodeViewer", () => ({ CodeViewer: ({ path, focus }: { path: string; focus?: { start: number } }) => <div data-testid="code">{path}:{focus?.start || ""}</div> }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
const exercise: Exercise = { id: "ex", mode: "reading", category: "localisation", language: "python", difficulty: 2, skills: [], title: "Trace writes", task: "Find the cause", files: { "a.py": "a = 1\n", "b.py": "b = 2\n" }, editable: [], readonly: true, can_run: false, hint_count: 3, curated: true, minutes: null, assistant: false };
const attempt: Attempt = { id: "at", mode: "reading", category: "localisation", status: "open", started_at: Date.now() / 1000, explanation: "", hints_used: 0, revision: 1, refs: [], hints: [] };
beforeEach(() => { localStorage.clear(); useLayout.setState({ layout: {} }); vi.mocked(api).mockReset(); });

it("requests a hint from the shared sidebar, shows the conversation and focuses its code reference", async () => {
  vi.mocked(api).mockResolvedValue({ revision: 2, chat: [
    { id: "u", role: "user", text: "Give me a hint" },
    { id: "c", role: "assistant", text: "Trace this call. [b.py:1]", refs: [{ path: "b.py", start: 1, end: 1 }] },
  ] });
  render(<Workspace exercise={exercise} attempt={attempt} onAttempt={vi.fn()} onNext={vi.fn()} onExit={vi.fn()} />);
  const coach = screen.getByRole("complementary", { name: "Coach" });
  fireEvent.click(within(coach).getByRole("button", { name: "Give me a hint" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/coding/attempts/at/coach", "POST", { message: "", files: {}, explanation: "" }));
  await waitFor(() => expect(screen.getByTestId("code")).toHaveTextContent("b.py:1"));
  expect(within(coach).getByRole("button", { name: "b.py:1" })).toBeInTheDocument();
  fireEvent.click(within(coach).getByRole("button", { name: "Hide the coach" }));
  expect(useLayout.getState().layout.coach).toBe(true);
  fireEvent.click(within(coach).getByRole("button", { name: "Show the coach" }));
  expect(useLayout.getState().layout.coach).toBe(false);
});

it("shows an ended attempt with a frozen clock and saved explanation", () => {
  render(<Workspace exercise={exercise} attempt={{ ...attempt, status: "abandoned", started_at: 1, elapsed_sec: 80, explanation: "My saved explanation" }} onAttempt={vi.fn()} onNext={vi.fn()} onExit={vi.fn()} />);
  expect(screen.getByLabelText("Time on this exercise")).toHaveTextContent("1:20");
  expect(screen.getByText("My saved explanation")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Submit$/ })).not.toBeInTheDocument();
});

it("runs a practice interview in the rail: the interviewer opens, you talk, and Finish shows the debrief", async () => {
  const onAttempt = vi.fn();
  vi.mocked(api).mockImplementation(async (path: string, _m?: string, body?: unknown) => {
    if (path.endsWith("/interview/finish")) return { attempt: { ...attempt, status: "submitted", via: "interview" } };
    const said = (body as { text: string }).text;
    return { revision: 3, interview: { started_at: 1, turns: [
      ...(said ? [{ id: "y", role: "you", text: said, at: 2 }] : []),
      { id: "m", role: "interviewer", kind: said ? "event" : "question", text: said ? "The ledger is timing out. [a.py:1]" : "Where would you start?", refs: said ? [{ path: "a.py", start: 1, end: 1 }] : [], at: 3 },
    ] } };
  });
  render(<Workspace exercise={{ ...exercise, category: "walkthrough" }} attempt={attempt} onAttempt={onAttempt} onNext={vi.fn()} onExit={vi.fn()} />);
  const coach = screen.getByRole("complementary", { name: "Coach" });
  fireEvent.click(within(coach).getByRole("tab", { name: "Interview" }));
  fireEvent.click(within(coach).getByRole("button", { name: "Start the interview" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/coding/attempts/at/interview", "POST", { text: "", files: {} }));
  expect(await within(coach).findByText("Where would you start?")).toBeInTheDocument();
  expect(within(coach).queryByRole("button", { name: "Finish and debrief" })).not.toBeInTheDocument();   // nothing said yet
  expect(screen.getByPlaceholderText(/Answer the four questions in order/)).toBeInTheDocument();
});

it("shows the Kotlin idioms of an exercise in the brief, folded", () => {
  render(<Workspace exercise={{ ...exercise, language: "kotlin", idioms: [{ kotlin: "a ?: b", java: "a != null ? a : b", note: "Elvis" }] }} attempt={attempt} onAttempt={vi.fn()} onNext={vi.fn()} onExit={vi.fn()} />);
  expect(screen.getByText(/Kotlin you'll meet here/)).toBeInTheDocument();
  expect(screen.getByText("a ?: b")).toBeInTheDocument();
});
