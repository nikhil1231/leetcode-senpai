import type { Ref } from "./refs";

export type Mode = "reading" | "assisted";
export interface Exercise {
  id: string; mode: Mode; category: string; language: string; difficulty: number; skills: string[]; title: string; task: string;
  files: Record<string, string>; editable: string[]; readonly: boolean; can_run: boolean; hint_count: number; curated: boolean; minutes: number | null; assistant: boolean;
  own_test?: string; idioms?: Idiom[];
}
export interface Idiom { kotlin: string; java: string; note: string }
export interface InterviewTurn { id: string; role: "you" | "interviewer"; kind?: "question" | "event"; text: string; refs?: Ref[]; at: number }
export interface Debrief { summary: string; went_well: string[]; work_on: string[]; misconceptions: string[]; skills: string[]; at: number }
export interface Interview { started_at: number; turns: InterviewTurn[]; debrief?: Debrief }
export interface OwnTest { catches: boolean; fails_before?: boolean; passes_after?: boolean; note: string; against: "yours" | "fix"; original: TestRow[]; fixed: TestRow[] }
export interface TestRow { id: string; status: "passed" | "failed" | "error" | "skipped"; message: string }
export interface TestSummary { passed: number; total: number; failed: string[] }
export interface Finding { id: string; text: string; key: boolean; locations: Ref[]; part?: string }
export interface Result {
  score: number; process: number | null; process_note: string; by: "examiner" | "self" | "tests";
  findings: { id: string; met: boolean; note: string }[]; misconceptions: string[]; strengths: string[]; improve: string[]; summary: string;
  takeaways?: { principle: string; evidence: string; next_time: string }[];
  omissions?: string[]; communication?: string[]; feedback_version?: number;
  alternative_accepted?: boolean; test_score?: number; explanation_score?: number;
  tests?: { visible: TestRow[]; hidden: TestRow[]; visible_summary: TestSummary; hidden_summary: TestSummary; timed_out: boolean };
}
export interface AiReview {
  planted: boolean; kind: string | null; description: string; tell: string; applied_flawed: boolean; ran_tests_after_applying: boolean; prompts: number; applied: number;
  detected: boolean | null; mistake_note?: string; assistant_review?: string; improve?: string[]; dims?: Record<string, { score: number; note: string }>;
}
export interface Review {
  expected_behaviour: string; execution_path: string; root_cause: string; interactions: string; findings: Finding[]; model_answer: string; fix_summary: string;
  reference_diff?: string; your_diff?: string; ai?: AiReview; idioms?: Idiom[]; chat?: import("./Assistant").ChatMsg[];
  [k: string]: unknown;
}
export interface Attempt {
  id: string; mode: Mode; category: string; status: "open" | "submitted" | "abandoned"; started_at: number; explanation: string; hints_used: number;
  revision: number; refs: Ref[]; hints: string[]; result?: Result | null; review?: Review | null; needs_self_mark?: boolean; elapsed_sec?: number;
  coach_chat?: { id: string; role: "user" | "assistant"; text: string; refs?: Ref[] }[];
  files?: Record<string, string>; runs?: unknown[]; chat?: import("./Assistant").ChatMsg[];
  last_run?: { rows: TestRow[]; at: number; timed_out: boolean; loaderror: string } | null;
  interview?: Interview; via?: "interview"; own_test?: OwnTest;
}
export interface ModeSummary {
  level: number; attempts: number; recent_score: number | null; by_category: Record<string, number | null>; ready: number; target: number; generating: boolean;
  error: string | null; open: string | null; overreliance?: boolean;
}
export interface Overview {
  modes: Record<Mode, ModeSummary>; model: boolean;
  language: { choice: string; choices: { id: string; label: string }[]; note: string };
  recent: { id: string; mode: Mode; category: string; difficulty: number; score: number | null; process: number | null; title: string; submitted_at: number; hints_used: number }[];
}
export const CATEGORY_LABELS: Record<string, string> = {
  comprehension: "Code comprehension", walkthrough: "Service walkthrough", localisation: "Bug localisation", repair: "Debug and repair", feature: "Feature", bugfix: "Bug fix",
};
export const AI_DIMENSIONS: Record<string, string> = {
  prompt_quality: "Your instructions", independent_investigation: "Your own investigation", critical_evaluation: "Questioning its answers", testing: "Testing", explanation: "Explaining the result",
};
export const CATEGORY_BLURBS: Record<string, string> = {
  comprehension: "Trace what the code does for a real request. No bug needed.",
  walkthrough: "The practical-round questions: trace a request, shared state, what happens if it fails halfway, and the test you'd write.",
  localisation: "A bug report and an unfamiliar repository: find the root cause.",
  repair: "Find the bug, fix it, and check your fix against the tests.",
  feature: "Add a small feature to a codebase you have not seen, with an assistant beside you.",
  bugfix: "Fix a reported bug with an assistant beside you. Check what it tells you.",
};
export const PART_LABELS: Record<string, string> = {
  trace: "Trace the request", state: "How state is shared", failure: "If it fails halfway", test: "The test you'd write",
};
export const READING_CATEGORIES = ["comprehension", "walkthrough", "localisation", "repair"];
