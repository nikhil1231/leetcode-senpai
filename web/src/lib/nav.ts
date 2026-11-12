"use client";
import { usePathname } from "next/navigation";
import { LEETCODE_TABS, isSection, type SectionId } from "./sections";

const KEY = "senpai:last-leetcode-tab";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const rememberLeetcodeTab = (tab: string) => { try { localStorage.setItem(KEY, tab); } catch { /* a per-browser nicety */ } };

// Coming back to LeetCode lands on the tab you left.
export function useLastLeetcodeTab(): string {
  const stored = typeof window === "undefined" ? null : read();
  return LEETCODE_TABS.some((t) => t.id === stored) ? (stored as string) : "today";
}

export function useRoute(): { section: SectionId; segments: string[] } {
  const path = usePathname() || "/";
  const [first, ...segments] = path.split("/").filter(Boolean);
  return { section: first && isSection(first) ? first : "readiness", segments };
}
