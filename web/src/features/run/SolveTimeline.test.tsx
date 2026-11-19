import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/hooks", () => ({ useApi: () => ({ data: data.value, isLoading: false }) }));
import { SolveTimeline } from "./SolveTimeline";

const base = { duration_ms: 600_000, plan_ms: 0, marks: [], finished_on: "editor" };
const attempt = { id: "a1", recording_id: "r1" };

describe("SolveTimeline talk lane", () => {
  beforeEach(() => { data.value = null; });
  it("shows a talk legend entry and lane when speech was captured", () => {
    data.value = { timeline: { ...base, segments: [{ kind: "work", from: 0, to: 100_000 }, { kind: "talk", from: 100_000, to: 400_000 }, { kind: "quiet", from: 400_000, to: 600_000 }],
      totals: { work: 100_000, talk: 300_000, quiet: 200_000 }, speech: [{ from: 100_000, to: 400_000 }] } };
    const { container } = render(<SolveTimeline attempt={attempt} />);
    expect(screen.getByText("Talking it through")).toBeTruthy();
    expect(container.querySelectorAll(".tl-talk span")).toHaveLength(1);
    expect(container.querySelector(".tl-seg.is-talk")).toBeTruthy();
  });
  it("changes nothing without speech", () => {
    data.value = { timeline: { ...base, segments: [{ kind: "work", from: 0, to: 600_000 }], totals: { work: 600_000 }, speech: [] } };
    const { container } = render(<SolveTimeline attempt={attempt} />);
    expect(screen.queryByText("Talking it through")).toBeNull();
    expect(container.querySelector(".tl-talk")).toBeNull();
    expect(container.querySelector(".has-talk")).toBeNull();
  });
});
