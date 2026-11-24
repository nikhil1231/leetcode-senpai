"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// GET /api/tracks/experience (server/tracks/experience.py overview). Stories and questions come from Notion via
// Job Scout; practice (drills, dives) is Senpai's own.
export type Status = "solid" | "learning" | "fading" | "shaky" | "unseen";
export interface Story {
  id: string; source: "notion" | "local"; title: string; summary?: string; competencies: string[]; themes?: string[];
  status: string; employer?: string; period?: string; url?: string; body?: string; drills: number; last_drilled: number | null;
  situation?: string; task?: string; action?: string; result?: string; reflection?: string;
}
export interface Prompt {
  id: string; text: string; competencies: string[]; kind: string; rounds: string[]; source: string; company?: string | null;
  answers: { company: string | null; job_id: number | null }[]; status: Status;
}
export interface FocusApp { job_id: number; company: string; title?: string; weight: number; days: number | null; round: string; round_label: string; scheduled: boolean; has_pack: boolean }
export interface Focus { active: boolean; applications: FocusApp[]; ranked: { id: string; text: string; score: number; for: string[] }[]; shared_themes: string[]; stories: string[] }
export interface Drift { kind: string; text: string; fix: string; topic?: string; state?: string }
export interface Tracker { topic: string; prefix: string; state: string | null; suggested: string | null }
export interface MistakeView { id: string; kind: string; label: string; topic_title?: string }
export interface Experience {
  llm: boolean; knowledge: number; total: number; due: number;
  stories: Story[]; prompts: Prompt[]; next_prompt: string; focus: Focus; drift: Drift[]; tracker: Tracker[];
  coverage: { id: string; title: string; blurb: string; stories: string[]; prompts: number; held: number }[];
  competencies: { id: string; title: string; blurb: string }[];
  checks: { key: string; text: string; required: boolean }[]; min_checks: number; target_seconds: [number, number]; max_clean_seconds: number;
  probes: string[]; recent_drills: { id: string; prompt_id: string; story_id: string | null; seconds: number; clean: boolean; at: number }[];
  packs: { id: string; title: string; blurb: string; questions: { id: string; prompt: string; status: Status }[] }[];
  mistakes: { fix: MistakeView[]; confirm: MistakeView[] };
  notion: { available: boolean; fetched_at: number | null; general_answers: boolean };
  links: { job_scout: string; review: string; new_role: string; job: string; notion_stories: string; notion_questions: string };
}
export interface ModelAnswer {
  company: string | null; stale: boolean; generated_at?: string; story_id: string | null; answer: string; short_answer: string;
  follow_ups: { question: string; answer: string }[]; caveats: string | null; why?: string;
}

export const KEY = ["api", "/tracks/experience"];
export const useExperience = () => useQuery<Experience>({ queryKey: KEY, queryFn: () => api("/tracks/experience"), staleTime: 15_000 });
export const call = <T = unknown>(path: string, method: "GET" | "POST" = "GET", body?: unknown) => api<T>("/tracks/experience" + path, method, body);

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const when = (t: number | null | undefined) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
export const STATUS_LABEL: Record<Status, string> = { solid: "Solid", learning: "Learning", fading: "Fading", shaky: "Missed last time", unseen: "Not tried" };
export const isHeld = (s: Status) => s === "solid" || s === "learning";
export const inDays = (d: number | null) => (d === null ? "not booked yet" : d < 1 ? "today" : `in ${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`);

export const useGo = () => {
  const router = useRouter();
  return (view: string) => router.push("/experience" + (view && view !== "home" ? "/" + view : ""));
};
