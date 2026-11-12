import { describe, expect, it } from "vitest";
import { fmtTime, pct, planSecOf, solveSecOf } from "./format";
import { escapeHtml, isoWeek, mdToHtml, plural } from "./md";

describe("format", () => {
  it("formats clocks", () => { expect(fmtTime(0)).toBe("00:00"); expect(fmtTime(75)).toBe("01:15"); expect(fmtTime(null)).toBe("—"); });
  it("counts planning time into a solve unless the plan was skipped", () => {
    expect(solveSecOf({ time_taken_sec: 600, plan_time_sec: 120 })).toBe(720);
    expect(solveSecOf({ time_taken_sec: 600, plan_time_sec: 120, plan_status: "skipped" })).toBe(600);
    expect(solveSecOf({ time_taken_sec: null })).toBeNull();
    expect(planSecOf({})).toBe(0);
  });
  it("formats percentages", () => { expect(pct(12.345)).toBe("12.3%"); expect(pct(undefined)).toBe("—"); });
});

describe("md", () => {
  it("escapes everything before it formats", () => {
    expect(escapeHtml('<b>"x"</b>')).toBe("&lt;b&gt;&quot;x&quot;&lt;/b&gt;");
    expect(mdToHtml("# Title\n- **bold** and `code`\n\ntext <script>")).toBe("<h2>Title</h2><ul><li><b>bold</b> and <code>code</code></li></ul><p>text &lt;script&gt;</p>");
  });
  it("names ISO weeks", () => { expect(isoWeek(new Date(2026, 0, 1))).toBe("2026-W01"); expect(isoWeek(new Date(2026, 11, 31))).toBe("2026-W53"); });
  it("pluralises", () => { expect(plural(1, "solve")).toBe("1 solve"); expect(plural(2, "category", "categories")).toBe("2 categories"); });
});
