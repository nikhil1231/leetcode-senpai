import { describe, expect, it } from "vitest";
import { insertRef, parseRefs, refToken } from "./refs";

const counts = { "worker.py": 80, "jobq/queue.py": 40 };

describe("parseRefs", () => {
  it("reads ranges, single lines and several files", () => {
    const t = "The retry in [worker.py:42-58] acks early, see [jobq/queue.py:7] and [worker.py:60–61].";
    expect(parseRefs(t, counts)).toEqual([
      { path: "worker.py", start: 42, end: 58 }, { path: "jobq/queue.py", start: 7, end: 7 }, { path: "worker.py", start: 60, end: 61 },
    ]);
  });
  it("ignores unknown files and out-of-range lines, swaps reversed ranges and clamps the end", () => {
    expect(parseRefs("[nope.py:3] [worker.py:99] [worker.py:20-10] [worker.py:70-500]", counts)).toEqual([
      { path: "worker.py", start: 10, end: 20 }, { path: "worker.py", start: 70, end: 80 },
    ]);
  });
});

describe("insertRef", () => {
  it("spaces the token and moves the cursor past it", () => {
    const r = { path: "worker.py", start: 3, end: 3 };
    expect(refToken(r)).toBe("[worker.py:3]");
    const out = insertRef("see the ack", 7, 7, r);
    expect(out.text).toBe("see the [worker.py:3] ack");
    expect(out.text.slice(0, out.cursor)).toBe("see the [worker.py:3]");
  });
});
