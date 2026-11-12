"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { DifficultyBadge } from "@/components/ui/Badge";
import { Loader } from "@/components/ui/Loader";
import { useRunActions } from "./useRunActions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// Mock interview: 60 minutes, three problems, no hints. Each opens in the editor in interview mode and logs itself;
// come back here from Today for the next.
export function MockModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { startSession } = useRunActions();
  const q = useQuery({ queryKey: ["mock-start"], queryFn: () => api("/mock/start", "POST"), staleTime: Infinity, gcTime: 0, retry: false });
  const [onLeetcode, setOnLeetcode] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (q.error) { onClose(); toast((q.error as Error).message); } }, [q.error, onClose, toast]);
  useEffect(() => { if (q.data) qc.invalidateQueries(); }, [q.data, qc]);
  const m: Any = q.data;
  const left = m ? m.started_at + m.duration_sec - Math.floor(now / 1000) : 0;
  const open = async (slug: string) => {
    const surface = onLeetcode ? "leetcode" : "editor";
    // Opened from the click itself, before anything is awaited.
    const tabOpened = surface === "leetcode" && Boolean(window.open(`https://leetcode.com/problems/${encodeURIComponent(slug)}/`, "_blank", "noopener"));
    if (surface === "editor") onClose();
    await startSession({ slug, kind: "mock", surface }, { tabOpened });
  };
  const finish = async () => {
    const res = await api(`/mock/${m.id}/finish`, "POST");
    onClose(); toast(`Mock scored: ${res.score}/100 (${res.solved_count}/${m.problems.length} solved)`); qc.invalidateQueries();
  };
  return (
    <div className="overlay">
      <div className="overlay-card wide" role="dialog" aria-modal="true">
        <div id="mock-body">
          {!m ? <Loader message="Setting up your mock…" /> : (
            <>
              <h2>Mock interview <span className="mock-timer" id="mock-timer">{left > 0 ? fmtTime(left) + " left" : "time up"}</span></h2>
              <p className="small">60 minutes, three problems, no hints. Each one opens in the editor in interview mode — plain, with a couple of Runs — and logs itself; come back here from Today for the next. Finish when done or time&apos;s up.</p>
              {m.problems.map((p: Any) => (
                <div className="mock-prob" key={p.slug}><span className={`mock-role ${p.role}`}>{p.role}</span>
                  <a href={p.url} target="_blank" rel="noopener">{p.title}</a> <DifficultyBadge difficulty={p.difficulty} />
                  <button className="button is-ghost is-small mock-open" onClick={() => open(p.slug)}>Start</button></div>))}
              <div className="overlay-actions">
                <label className="predict-surface small" title="Open LeetCode's own page instead of solving in the app's editor"><input type="checkbox" id="mock-on-leetcode" checked={onLeetcode} onChange={(e) => setOnLeetcode(e.target.checked)} /> Solve on LeetCode</label>
                <button id="btn-finish-mock" className="button is-primary" onClick={finish}>Finish &amp; score</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
