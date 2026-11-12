"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface Overview {
  solved: number; total_problems: number; due_reviews: number; streak: number; xp_today: number; drills_today: number;
  leeches: number; llm_enabled: boolean; llm_provider?: string; llm_model?: string; newly_mastered?: { category: string }[];
}
export interface ReadinessSection {
  id: string; title: string; ready: number; coverage: number; band: string; slipping: number; focus: string; headline: string; weight: number;
}
export interface Readiness {
  overall: { ready: number; coverage: number; band: string; weakest?: string; strongest?: string; gained_week?: number; slipped_week?: number; slipping?: number };
  sections: ReadinessSection[];
  interview: { date: string; days_left: number; target: number; gap: number; per_week: number } | null;
}

export const useOverview = () => useQuery<Overview>({ queryKey: ["api", "/overview"], queryFn: () => api("/overview"), staleTime: 15_000 });
export const useReadiness = () => useQuery<Readiness>({ queryKey: ["api", "/readiness"], queryFn: () => api("/readiness"), staleTime: 60_000 });
export const useMe = () => useQuery<{ code_updated_at?: { iso: string } }>({ queryKey: ["api", "/me"], queryFn: () => api("/me"), staleTime: 300_000 });
export const useLeetcodeStatus = () => useQuery<{ state: "ok" | "missing" | "expired" | "unknown" }>({
  queryKey: ["api", "/leetcode-status"], queryFn: () => api("/leetcode-status"), staleTime: 5 * 60_000, retry: false,
});

export const unknownBand = (b: string) => b === "Not started" || b === "Not enough tested to say";
export const pctText = (r: { band: string; ready: number }) => (unknownBand(r.band) ? "–" : r.ready + "%");
