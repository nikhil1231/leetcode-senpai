import { describe, expect, it } from "vitest";
import { GROUPS, SWAPS } from "./principles";

describe("system design principles", () => {
  const all = GROUPS.flatMap((g) => g.items);
  it("numbers the seventeen principles 1 to 17 in reading order", () => expect(all.map((p) => p.n)).toEqual([...Array(17)].map((_, i) => i + 1)));
  it("points every swap at principles that exist", () => {
    for (const s of SWAPS) for (const r of s.refs) expect(all.some((p) => p.n === r)).toBe(true);
  });
  it("keeps the copy free of em dashes", () => expect(JSON.stringify([GROUPS, SWAPS])).not.toContain("—"));
});
