import { describe, expect, it } from "vitest";
import { LEETCODE_TABS, SECTIONS, SIX, TAB_TITLES, TRACKS, isSection, routeToPath } from "./sections";
import { staticPages, pageLabel } from "./pages";

describe("sections", () => {
  it("has an identity for each of the six sections and Overview", () => {
    for (const id of [...SIX, "readiness"]) expect(SECTIONS[id as keyof typeof SECTIONS].name).toBeTruthy();
    expect(SIX).toHaveLength(6);
    expect(TRACKS).toContain("readiness");
    expect(isSection("leetcode")).toBe(true); expect(isSection("nope")).toBe(false);
  });
  it("gives every LeetCode tab a heading", () => { for (const t of LEETCODE_TABS) expect(TAB_TITLES[t.id]).toHaveLength(2); });
  it("turns the server's hash routes into paths", () => expect(routeToPath("#/system-design/lesson/request-flow")).toBe("/system-design/lesson/request-flow"));
  it("lists each palette page once, with a readable label", () => {
    const pages = staticPages();
    expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
    expect(pages.every((p) => p.href.startsWith("/"))).toBe(true);
    expect(pageLabel(pages[0])).toBe("LeetCode: Today");
  });
});
