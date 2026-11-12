export const fmtTime = (s: number | null | undefined) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

interface Timed { plan_status?: string; plan_time_sec?: number; [k: string]: unknown }
// A solve's time is planning plus coding, as an interview's clock counts it (plans.solve_sec).
export const planSecOf = (a: Timed) => (a.plan_status === "skipped" ? 0 : a.plan_time_sec || 0);
export const solveSecOf = (a: Timed, key = "time_taken_sec") => {
  const v = a[key] as number | null | undefined;
  return v == null ? null : v + planSecOf(a);
};

export const pct = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1) + "%");

export const diffClass = (d?: string | null) => ({ Easy: "diff-easy", Medium: "diff-medium", Hard: "diff-hard" } as Record<string, string>)[d ?? ""] ?? "";

export const shortLocalDate = (ts: number | null | undefined) => {
  if (ts == null) return "-";
  const d = new Date(Number(ts) * 1000);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const leetcodeProblemUrl = (slug: string) => `https://leetcode.com/problems/${encodeURIComponent(slug)}/`;
