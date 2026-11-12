"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { ComplexityFields } from "@/components/forms/ComplexityFields";
import { ProblemStatement } from "@/components/ProblemStatement";
import { Loader } from "@/components/ui/Loader";
import { leetcodeProblemUrl } from "@/lib/format";
import { pendingRun, useRunActions, type Ctx, type StartBody } from "./useRunActions";

// A run starts from a plan: the approach as you'd say it to the interviewer (the key idea and why it works) and a
// time target. Space is optional. Nothing here waits on the network once you commit: the plan is graded after the
// solve, on whether it was ready to code, and critiqued mid-run only if you ask.
const DEFAULT_LIMIT = 6 * 60;
const KEY = "predict_interview";
const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function PredictModal({ ctx, onClose }: { ctx: Ctx & { interview?: boolean }; onClose: () => void }) {
  const { startSession } = useRunActions();
  const opened = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [approach, setApproach] = useState("");
  const [time, setTime] = useState("");
  const [space, setSpace] = useState("");
  const [interview, setInterview] = useState(() => { try { return ctx.interview || localStorage.getItem(KEY) === "1"; } catch { return !!ctx.interview; } });
  const [onLeetcode, setOnLeetcode] = useState(false);
  const problem = useQuery({ queryKey: ["api", "recall-context", ctx.slug], queryFn: () => api(`/problem/${encodeURIComponent(ctx.slug)}/recall-context?editor=1`), staleTime: 0, retry: false });
  const approachRef = useRef<HTMLTextAreaElement>(null);
  const preload = useFlow((s) => s.preloadEditor);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { approachRef.current?.focus(); preload?.(); }, [preload]);
  const sec = Math.max(0, Math.round((now - opened.current) / 1000));
  const limit = problem.data?.plan_soft_limit_sec || DEFAULT_LIMIT;
  const ready = useMemo(() => Boolean(approach.trim() && time.trim()), [approach, time]);

  const go = (status: "planned" | "blank" | "skipped") => {
    if (status === "planned" && !ready) return;
    const full: Ctx = { ...ctx, url: problem.data?.url, content_html: problem.data?.content_html, editor: problem.data?.editor, title: problem.data?.title || ctx.title };
    const surface = onLeetcode ? "leetcode" : "editor";
    const body: StartBody = {
      slug: ctx.slug, kind: ctx.kind, plan_status: status, plan_time_sec: status === "skipped" ? null : sec,
      ...(status === "planned" ? { predicted_approach: approach.trim() || null, complexity_target_time: time.trim() || null, complexity_target_space: space.trim() || null } : {}),
      surface, interview: surface === "editor" && interview,
    };
    // Opened from the click itself: nothing is awaited before this, so the browser still honours it.
    const tabOpened = surface === "leetcode" && Boolean(window.open(full.url || leetcodeProblemUrl(ctx.slug), "_blank", "noopener"));
    onClose();
    void startSession(body, { tabOpened, pending: pendingRun(full, body) });
  };

  return (
    <div className="overlay" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go("planned"); } if (e.key === "Escape") onClose(); }}>
      <div className="overlay-card box predict-wide" role="dialog" aria-modal="true" aria-labelledby="predict-heading">
        <div className="modal-titlebar">
          <div><h2 className="modal-title" id="predict-heading">Plan the solve</h2><p id="predict-problem" className="small">{problem.data?.title || ctx.title || ctx.slug}</p></div>
          <div className="predict-titlebar-side">
            <span id="predict-clock" className={`predict-clock${sec >= limit ? " is-over" : ""}`} title={`Aim to have a plan within ${Math.round(limit / 60)} minutes, as you would in an interview`}>{fmtClock(sec)}</span>
            <button id="btn-close-predict" className="button is-ghost is-small icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div id="predict-statement">
          {problem.isLoading ? <Loader message="Loading problem prompt..." /> : <ProblemStatement problem={problem.data} slug={ctx.slug} error={problem.error as Error | null} />}
        </div>
        <div className="predict-form">
          <label className="label-sm" htmlFor="predict-approach">How would you solve it? <span className="help-inline">say it as you would to the interviewer: the key idea and why it works</span></label>
          <textarea id="predict-approach" ref={approachRef} className="textarea" data-dictate rows={4} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={approach}
            onChange={(e) => setApproach(e.target.value)} placeholder="e.g. a sliding window over character counts. Grow the right edge, and shrink from the left while a character repeats, because any window containing a repeat can't be the answer." />
          <p className="help predict-graded">Graded on whether an interviewer would let you start coding. Bounds, base cases and edge cases are judged with your code, not here.</p>
          <div id="predict-complexities" className="mt-2">
            <ComplexityFields idPrefix="predict" time={time} space={space} onTime={setTime} onSpace={setSpace} timeLabel="Target time" spaceLabel="Target space"
              onEnterTime={() => (ready ? go("planned") : approachRef.current?.focus())} />
          </div>
          <p className="help predict-keys"><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> locks in</p>
          <div className="overlay-actions predict-actions">
            <span className="predict-surface-group">
              <label className={`predict-surface small${onLeetcode ? " is-off" : ""}`} title="A plain editor (no highlighting, no auto-closing brackets) and only a couple of Runs — trace it by hand">
                <input type="checkbox" id="predict-interview" checked={interview && !onLeetcode} disabled={onLeetcode}
                  onChange={(e) => { setInterview(e.target.checked); try { localStorage.setItem(KEY, e.target.checked ? "1" : "0"); } catch { /* per-browser nicety */ } }} /> Interview mode
              </label>
              <label className="predict-surface small" title="Open LeetCode's own page instead of solving in the app's editor">
                <input type="checkbox" id="predict-on-leetcode" checked={onLeetcode} onChange={(e) => setOnLeetcode(e.target.checked)} /> Solve on LeetCode
              </label>
            </span>
            <button id="btn-skip-predict" className="button is-ghost" type="button" title="Start without planning" onClick={() => go("skipped")}>Skip</button>
            <button id="btn-blank-predict" className="button is-ghost" type="button" title="Start the run and record that you had no plan" onClick={() => go("blank")}>No idea yet</button>
            <button id="btn-start-predict" className="button is-primary" type="button" disabled={!ready} title="Needs an approach and a time target" onClick={() => go("planned")}>Lock in &amp; start</button>
          </div>
        </div>
      </div>
    </div>
  );
}
