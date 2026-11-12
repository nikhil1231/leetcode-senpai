import { describe, expect, it } from "vitest";
import { diff, errorLine } from "./diff";

describe("diff", () => {
  it("is null when nothing changed", () => expect(diff("abc", "abc")).toBeNull());
  it("trims the common prefix and suffix into one replacement", () => {
    expect(diff("def f(a):\n    return a", "def f(a, b):\n    return a")).toEqual({ f: 7, to: 7, s: ", b" });
    expect(diff("hello world", "hello brave world")).toEqual({ f: 6, to: 6, s: "brave " });
  });
  it("handles deletions and total rewrites", () => {
    expect(diff("abcdef", "abef")).toEqual({ f: 2, to: 4, s: "" });
    expect(diff("abc", "xyz")).toEqual({ f: 0, to: 3, s: "xyz" });
  });
  it("replays: applying the edit to prev gives next", () => {
    for (const [a, b] of [["", "x"], ["x", ""], ["aaa", "aaaa"], ["abcabc", "abXabc"]]) {
      const d = diff(a, b)!;
      expect(a.slice(0, d.f) + d.s + a.slice(d.to)).toBe(b);
    }
  });
});

describe("errorLine", () => {
  it("names the innermost frame that is not the driver", () => {
    const tb = 'File "main.py", line 12, in solve\n  File "main.py", line 40, in _driver\n  File "x", line 1, in <module>';
    expect(errorLine(tb)).toBe(12);
  });
  it("reads a compile error's line", () => expect(errorLine("SyntaxError: invalid syntax (line 7)")).toBe(7));
  it("is null with no line", () => expect(errorLine("TypeError: boom")).toBeNull());
});
