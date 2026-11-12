// The six learning spaces plus Overview. One place for names, hues and URLs, so the switcher, sidebar, palette and
// routing agree. Hues mirror themes.css (browser chrome colour only; the page itself follows the CSS tokens).

export type SectionId = "readiness" | "leetcode" | "system-design" | "fundamentals" | "ai" | "experience" | "practical";

export const SECTIONS: Record<SectionId, { name: string; sub: string; tagline: string; hue?: number; short: string; full: string }> = {
  readiness: { name: "Overview", sub: "Interview readiness", tagline: "", hue: 45, short: "Overview", full: "Overview" },
  leetcode: { name: "Leetcode Senpai", sub: "Interview prep", tagline: "Patterns you can produce under pressure.", short: "Coding", full: "LeetCode" },
  "system-design": { name: "System Design", sub: "Learn and practise", tagline: "Design it simply. Defend the trade-offs.", hue: 165, short: "System design", full: "System Design" },
  fundamentals: { name: "Fundamentals", sub: "Role stack knowledge", tagline: "The stack under your code, explained clearly.", hue: 205, short: "Fundamentals", full: "Fundamentals" },
  ai: { name: "AI Engineering", sub: "LLMs, RAG and agents", tagline: "LLM systems, from one call to production.", hue: 290, short: "AI", full: "AI Engineering" },
  experience: { name: "Experience", sub: "Your stories, tested", tagline: "Your own work, told well and tested.", hue: 22, short: "Experience", full: "Experience" },
  practical: { name: "Practical Coding", sub: "Build, debug and review", tagline: "Build, extend, debug and review real code.", hue: 78, short: "Practical", full: "Practical Coding" },
};

export const SIX: SectionId[] = ["leetcode", "system-design", "fundamentals", "ai", "experience", "practical"];
export const TRACKS: SectionId[] = ["fundamentals", "ai", "experience", "practical", "readiness"];
export const isSection = (s: string): s is SectionId => s in SECTIONS;
export const isTrack = (s: string) => TRACKS.includes(s as SectionId);

export const LEETCODE_TABS = [
  { id: "today", label: "Today", icon: "i-today" },
  { id: "senpai", label: "Senpai", icon: "i-focus" },
  { id: "practice", label: "Quickfire", icon: "i-drill" },
  { id: "discover", label: "Discover", icon: "i-discover" },
  { id: "topics", label: "Topics", icon: "i-topics" },
  { id: "insights", label: "Insights", icon: "i-insights" },
  { id: "visualise", label: "Visualise", icon: "i-insights" },
  { id: "playbook", label: "Playbook", icon: "i-playbook" },
  { id: "history", label: "History", icon: "i-history" },
  { id: "problems", label: "Problems", icon: "i-problems" },
  { id: "settings", label: "Settings", icon: "i-settings" },
] as const;
export type LeetcodeTab = (typeof LEETCODE_TABS)[number]["id"];

export const TAB_TITLES: Record<LeetcodeTab, [string, string]> = {
  today: ["Today", "Your queue for the day"],
  senpai: ["Senpai", "Your learning plan, today's session, and teaching"],
  practice: ["Quickfire", "Quick reps for a few spare minutes. Works offline."],
  discover: ["Discover", "Curated packs and highly-rated problems"],
  topics: ["Topics", "Coverage and mastery across the map"],
  insights: ["Insights", "What the data says about your prep"],
  visualise: ["Visualise", "Watch an algorithm run, step by step"],
  playbook: ["Playbook", "Synthesized cheat sheets per pattern"],
  history: ["History", "Every attempt you have logged"],
  problems: ["Problems", "Your imported library"],
  settings: ["Settings", "Account, Senpai, and scheduling"],
};

// Server-built routes (the palette index, links in lessons) still start with "#"; real paths do not.
export const routeToPath = (route: string) => route.replace(/^#/, "");
