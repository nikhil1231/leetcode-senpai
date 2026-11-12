import { diffClass } from "@/lib/format";

export function DifficultyBadge({ difficulty }: { difficulty?: string | null }) {
  return <span className={`tag ${diffClass(difficulty)}`}>{difficulty || "—"}</span>;
}

// In a queue, difficulty is a quiet coloured label rather than a filled chip: every row has one.
export function DiffLabel({ difficulty }: { difficulty?: string | null }) {
  return <span className={`q-diff diff-${String(difficulty || "unknown").toLowerCase()}`}>{difficulty || "—"}</span>;
}
