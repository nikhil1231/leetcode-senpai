"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useToast } from "@/lib/toast";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Start any problem: paste a URL, number or title. Resolving is read-only; nothing is imported until a run actually
// starts, so a mistyped paste leaves no trace in the catalog.
export function QuickStartModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const requestStart = useFlow((s) => s.requestStart);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ kind: "hint" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "list"; res: Any }>({ kind: "hint" });
  const [pick, setPick] = useState<Any>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  const lookup = async () => {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq.current;
    setPick(null); setState({ kind: "loading" });
    try {
      const res = await api("/problem/resolve", "POST", { query: q });
      if (mine !== seq.current) return;
      setState({ kind: "list", res });
      // One unambiguous hit is the whole point of pasting a link or a number: don't make it a two-click operation.
      if (res.exact && (res.candidates || []).length === 1) setPick(res.candidates[0]);
    } catch (e) { if (mine === seq.current) setState({ kind: "error", message: (e as Error).message }); }
  };
  const start = async () => {
    if (!pick) return;
    setAdding(true);
    // Deliberately sitting down to solve something is what puts it in the library.
    if (!pick.in_library) {
      try { await api("/import/problem", "POST", { slug: pick.slug }); } catch (e) { setAdding(false); toast((e as Error).message); return; }
    }
    onClose(); qc.invalidateQueries();
    requestStart({ slug: pick.slug, kind: "adhoc", title: pick.title, category: pick.category });
  };
  return (
    <Modal open onClose={() => { seq.current++; onClose(); }} title="Start any problem" subtitle="A LeetCode link, a problem number, or a title.">
      <input id="quickstart-input" className="input" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} autoFocus value={query}
        placeholder="leetcode.com/problems/car-fleet  ·  853  ·  car fleet" onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (pick) start(); else lookup(); }} />
      <div id="quickstart-result" className="quickstart-result">
        {state.kind === "hint" && <p className="quickstart-hint">Paste a link, or type a number or title, then press Enter.</p>}
        {state.kind === "loading" && <Loader message="Looking it up…" />}
        {state.kind === "error" && <p className="quickstart-error">{state.message}</p>}
        {state.kind === "list" && (
          <div className="quickstart-list">{(state.res.candidates || []).map((c: Any) => (
            <button key={c.slug} className={`quickstart-option${pick?.slug === c.slug ? " sel" : ""}`} type="button" onClick={() => setPick(c)}>
              <span className="qs-name">{c.frontend_id ? <><span className="qs-num">#{c.frontend_id}</span> </> : null}{c.title}
                <span className="qs-meta">{c.category || "—"}{c.in_library ? " · already in your library" : ""}</span></span>
              <DifficultyBadge difficulty={c.difficulty} />
            </button>))}</div>
        )}
      </div>
      <div className="overlay-actions">
        <button className="button is-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="button is-primary" type="button" disabled={!pick || adding} onClick={start}>{adding ? "Adding…" : "Start run"}</button>
      </div>
    </Modal>
  );
}
