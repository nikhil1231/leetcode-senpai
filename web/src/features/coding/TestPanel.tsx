"use client";
import { useState } from "react";
import type { TestRow } from "./types";

export interface RunResult { rows: TestRow[]; passed: number; total: number; timed_out: boolean; loaderror: string; crashed?: boolean }

// Coloured unified diff; also used by the review for the reference change.
export function Diff({ text, empty = "No changes yet." }: { text: string; empty?: string }) {
  if (!text.trim()) return <p className="cw-note">{empty}</p>;
  return (
    <pre className="cw-diff">{text.split("\n").map((l, i) => (
      <span key={i} className={l.startsWith("+++") || l.startsWith("---") ? "d-file" : l.startsWith("+") ? "d-add" : l.startsWith("-") ? "d-del" : l.startsWith("@@") ? "d-hunk" : ""}>{l + "\n"}</span>
    ))}</pre>
  );
}

export function Rows({ rows, showMessages = true }: { rows: TestRow[]; showMessages?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="cw-tests">
      {rows.map((r) => (
        <li key={r.id} className={`is-${r.status}`}>
          <button type="button" className="cw-test-row" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
            <span className="cw-test-mark" aria-label={r.status}>{r.status === "passed" ? "✓" : r.status === "skipped" ? "–" : "✕"}</span>
            <span className="cw-test-name">{r.id}</span>
          </button>
          {showMessages && open === r.id && r.message && <pre className="cw-test-msg">{r.message}</pre>}
        </li>
      ))}
    </ul>
  );
}

// The body of the tests dock: the visible tests' results, or your changes so far. The tabs and Run button live in the
// workspace's dock. The hidden tests are only run when you submit.
export function TestPanel({ tab, run, diff }: { tab: "tests" | "changes"; run: RunResult | null; diff: string }) {
  if (tab === "changes") return <Diff text={diff} />;
  if (!run) return <p className="cw-note">No runs yet.</p>;
  return (
    <>
      {run.loaderror && <pre className="cw-test-msg">{run.loaderror}</pre>}
      {run.crashed && <p className="cw-note">The test run crashed before reporting. Check for an infinite loop or an import error.</p>}
      <Rows rows={run.rows} />
    </>
  );
}
