import { LEETCODE_TABS } from "./sections";

// Every page the palette can jump to (and Settings' usage panel can say you never open).
export interface PageEntry { key: string; title: string; sub: string; href: string }

export const SD_VIEWS: [string, string][] = [["", "Home"], ["curriculum", "Learn"], ["simulators", "Simulators"], ["practise", "Practise"], ["principles", "Principles"], ["progress", "What you know"],
  ["quickfire", "Quickfire"], ["mistakes", "Mistakes book"], ["papers", "Past papers"], ["drills", "Estimation drills"], ["skills", "Skill drills"], ["cases", "Design cases"]];
export const TRACK_VIEWS: [string, string, [string, string][]][] = [
  ["fundamentals", "Fundamentals", [["", "Home"], ["lessons", "Learn"], ["practise", "Practise"], ["progress", "What you know"]]],
  ["ai", "AI Engineering", [["", "Home"], ["lessons", "Learn"], ["practise", "Practise"], ["progress", "What you know"]]],
  ["experience", "Experience", [["", "Home"], ["stories", "Story bank"], ["drill", "Timed answers"], ["dives", "Deep dives"], ["mistakes", "Mistakes book"]]],
  ["practical", "Practical Coding", [["", "Home"], ["mistakes", "Mistakes book"]]],
  ["readiness", "Overview", [["", "Interview readiness"], ["tutor", "Tutor"]]],
];

export function staticPages(): PageEntry[] {
  const out: PageEntry[] = LEETCODE_TABS.map((t) => ({ key: "leetcode/" + t.id, title: t.label, sub: "LeetCode", href: `/leetcode/${t.id}` }));
  SD_VIEWS.forEach(([v, t]) => out.push({ key: "system-design/" + (v || "home"), title: t, sub: "System Design", href: `/system-design${v ? "/" + v : ""}` }));
  TRACK_VIEWS.forEach(([s, name, views]) => views.forEach(([v, t]) => out.push({ key: `${s}/${v || "home"}`, title: `${name}: ${t}`, sub: name, href: `/${s}${v ? "/" + v : ""}` })));
  return out;
}

export const pageLabel = (p: PageEntry) => (p.sub === "LeetCode" ? "LeetCode: " + p.title : p.title.includes(": ") ? p.title : p.sub + ": " + p.title);
