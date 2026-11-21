import { describe, expect, it } from "vitest";
import { lineDiff } from "./linediff";

describe("lineDiff", () => {
  it("is empty for identical text", () => expect(lineDiff("a\nb", "a\nb")).toBe(""));
  it("shows changed lines with context and skips the far ones", () => {
    const a = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n");
    const b = ["1", "2", "3", "4", "X", "6", "7", "8", "9"].join("\n");
    expect(lineDiff(a, b, 1)).toBe("@@ …\n 4\n-5\n+X\n 6");
  });
  it("handles added and removed lines", () => expect(lineDiff("a\nb", "a\nc\nb", 0)).toBe("@@ …\n+c"));
});
