"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { useFlow } from "@/lib/flow-store";
import { useOverview, useLeetcodeStatus } from "@/lib/queries";
import { clockNow, useRun } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { useUi } from "@/lib/ui-store";
import { EditorHead, EditorPane } from "@/features/editor/EditorPane";
import { COACH_PX, useEditorUi, useLayout } from "@/features/editor/editor-store";
import { useRunActions } from "./useRunActions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const coachText = (t: string) => t.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p));
const IconBtn = ({ id, label, svg, hidden, disabled, busy, className = "", onClick }: { id: string; label: string; svg: React.ReactNode; hidden?: boolean; disabled?: boolean; busy?: boolean; className?: string; onClick: () => void }) => (
  hidden ? null : <button id={id} className={`button icon-button ${className}`} type="button" aria-label={label} data-tip={label} disabled={disabled} aria-busy={busy || undefined} onClick={onClick}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{svg}</svg></button>
);

function useArmed(ms = 4000): [boolean, () => void, () => void] {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = () => { setArmed(true); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setArmed(false), ms); };
  const disarm = () => { if (t.current) clearTimeout(t.current); setArmed(false); };
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return [armed, arm, disarm];
}

// The focus-mode run: the clock and its controls, the in-app editor, and the coach column. Dashboards behind it go inert.
export function ActiveRun({ onSolved }: { onSolved: (res: Any) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useRunActions();
  const { active, editor, clockBase, coachPending, nudge, nudgeShown, setMinimised, setCoachPending, setNudge, patchActive, setActive } = useRun();
  const ed = useEditorUi((s) => s.api);
  const overview = useOverview().data;
  const lc = useLeetcodeStatus().data?.state;
  const setCookie = useUi((s) => s.setCookie);
  const openAnnotate = useFlow((s) => s.openAnnotate);
  const layout = useLayout((s) => s.layout);
  const patchLayout = useLayout((s) => s.patch);
  const [, force] = useState(0);
  const [menu, setMenu] = useState(false);
  const [giveArmed, armGive, disarmGive] = useArmed();
  const [endArmed, armEnd, disarmEnd] = useArmed();
  const [busy, setBusy] = useState<string | null>(null);
  const pauseReq = useRef(0);
  const root = useRef<HTMLElement>(null);

  // One tick a second drives the clock and its nudges.
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const elapsed = clockNow(active, clockBase);
  useEffect(() => {
    if (!active || active.kind === "optimize") return;
    if (elapsed >= 35 * 60 && !nudgeShown.solution) setNudge("solution", "⏱️ 35 min in. Giving up now is a smart move — hear the approach, write it yourself, and it comes back in 2 days. That's the plan, not a failure.");
    else if (elapsed >= 20 * 60 && !nudgeShown.hint && !active.hint_level) setNudge("hint", "💡 20 min in. Stuck? Ask for a hint before pushing further.");
  }, [elapsed, active, nudgeShown, setNudge]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".run-menu")) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", away); document.removeEventListener("keydown", key); };
  }, [menu]);
  useEffect(() => { useLayout.getState().hydrate(); }, []);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [active?.chat?.length, coachPending]);

  const codeForCoach = useCallback(async () => { if (!ed) return null; ed.tick(); await ed.flush(); return ed.code(); }, [ed]);

  const askCoach = useCallback(async (message = "") => {
    const a = useRun.getState().active;
    if (!a || useRun.getState().coachPending) return false;
    const sessionId = a.session_id;
    setCoachPending(message ? { text: message, t: clockNow(a, useRun.getState().clockBase) } : {});
    try {
      const code = await codeForCoach();
      const body: Any = code == null ? {} : { code };
      if (message) body.message = message;
      const r = await api("/session/hint", "POST", body);
      setCoachPending(null);
      const cur = useRun.getState().active;
      if (!cur || cur.session_id !== sessionId) return true;
      if (r.hint == null) { patchActive({ hints_available: Boolean(r.available), chat: r.chat || cur.chat }); toast(r.available ? "Couldn't get a reply just now — try again." : overview?.llm_enabled ? "No more hints for this one." : "Hints need the coach enabled."); return true; }
      patchActive({ hint_level: r.level, chat: r.chat, hints: [...(cur.hints || []), r.hint], hints_available: r.available !== false });
      ed?.showMarks(r.marks || []);
      return true;
    } catch (e) { setCoachPending(null); toast((e as Error).message); return false; }
  }, [codeForCoach, ed, overview, patchActive, setCoachPending, toast]);

  if (!active) return null;
  const starting = !active.session_id;
  const chat: Any[] = active.chat || [];
  const lastCoach = chat.map((m) => m.role).lastIndexOf("coach");
  const optimizing = active.kind === "optimize";
  const walk = active.give_up, steps: Any[] = walk?.steps || [];
  const hasEditor = active.surface === "editor";
  const stamp = (t?: number | null) => (t == null ? null : <span className="chat-time">{fmtTime(t)}</span>);
  const over = Boolean(active.par_sec) && elapsed >= active.par_sec;
  const diff = active.difficulty || "";

  const giveUpStep = async () => {
    const a = useRun.getState().active; if (!a) return;
    const sessionId = a.session_id, seen = a.give_up?.steps?.length || 0;
    setBusy("walk");
    try {
      const code = await codeForCoach();
      const r = await api("/session/give-up", "POST", code == null ? { seen } : { code, seen });
      const cur = useRun.getState().active; if (!cur || cur.session_id !== sessionId) return;
      if (!r.steps?.length) { patchActive({ give_up_available: false }); toast("No walkthrough available for this one — the solution is on LeetCode."); }
      else { patchActive({ give_up: { steps: r.steps, done: r.done } }); if (r.error) toast(r.error); else if (r.steps.length > seen) ed?.showMarks(r.steps[r.steps.length - 1].marks || []); }
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  const endRun = async () => {
    setBusy("end"); const sessionId = active.session_id;
    try {
      const code = await codeForCoach();
      const r = await api("/session/end", "POST", code == null ? {} : { code });
      pauseReq.current++; ed?.discard(sessionId); onSolved(r);
    } catch (e) { setBusy(null); disarmEnd(); toast((e as Error).message); return; }
    setBusy(null); disarmEnd();
  };
  const cancelRun = async () => {
    pauseReq.current++; if (active.session_id) ed?.discard(active.session_id);
    const optimized = active.optimizes;
    await api("/session/cancel", "POST"); await refresh(); qc.invalidateQueries();
    if (optimized) {
      try { const { pending } = await api("/pending"); const solve = (pending || []).find((p: Any) => p.id === optimized); if (solve) openAnnotate(solve); else window.dispatchEvent(new Event("senpai-open-next-pending")); } catch { window.dispatchEvent(new Event("senpai-open-next-pending")); }
    }
  };
  const togglePause = async () => {
    const a = useRun.getState().active; if (!a) return;
    const paused = !a.is_paused, req = ++pauseReq.current, previous = { ...a };
    const el = clockNow(a, useRun.getState().clockBase) - (a.plan_sec || 0);
    setActive({ ...a, is_paused: paused, elapsed_sec: el, paused_at: paused ? Math.floor(Date.now() / 1000) : null });
    try {
      const r = await api("/session/pause", "POST", { paused });
      if (req !== pauseReq.current || !useRun.getState().active) return;
      setActive({ ...useRun.getState().active, is_paused: r.is_paused, paused_at: r.paused_at, paused_sec: r.paused_sec, elapsed_sec: r.elapsed_sec ?? el });
      toast(paused ? "Timer paused." : "Timer resumed.");
    } catch (e) { if (req === pauseReq.current) setActive(previous); toast((e as Error).message); }
  };
  const planCheck = async () => {
    setBusy("plan");
    try {
      const r = await api("/session/plan-check", "POST");
      if (!r.llm || !r.critique) { patchActive({ plan_check_available: false }); toast("Plan check needs an LLM — none is configured."); }
      else patchActive({ plan_check: r.critique, plan_check_available: true });
    } catch (e) { toast((e as Error).message); } finally { setBusy(null); }
  };
  const checkSolve = () => window.dispatchEvent(new CustomEvent("senpai-detect-solves", { detail: { force: true } }));
  const cw = Number(layout.coachW) ? Math.round(Math.min(COACH_PX.max, Math.max(COACH_PX.min, Number(layout.coachW)))) : null;
  const critique = active.plan_check;
  const items = critique ? [...(critique.nudges || []).filter(Boolean).map((n: string) => `${n}`), ...(critique.missing_edge_cases || []).filter(Boolean).map((m: string) => `Check ${m}.`)] : [];
  const verdict = critique ? ({ ready: "Looks ready", revise: "Worth revisiting" } as Any)[critique.overall_verdict] || "Plan check" : "";
  const dragCoach = (e: React.PointerEvent) => {
    e.preventDefault(); const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const right = root.current!.querySelector("#run-coach")!.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => patchLayout({ coachW: right - ev.clientX }); const up = () => { t.removeEventListener("pointermove", move); t.removeEventListener("pointerup", up); };
    t.addEventListener("pointermove", move); t.addEventListener("pointerup", up);
  };

  return (
    <section ref={root} id="active-run" className={`active-run${active.is_paused ? " is-paused" : ""}${hasEditor ? " has-editor" : ""}${layout.coach ? " coach-hidden" : ""}`} style={cw ? ({ "--coach-w": `${cw}px` } as React.CSSProperties) : undefined}>
      <div className="active-run-inner" aria-live="polite">
        <div className="active-kicker"><span className="dot" /><span id="active-status">{active.is_paused ? "Run paused" : "Current run"}</span></div>
        <h2 id="active-title">{active.title}</h2>
        {diff && <span id="active-diff" className={`tag active-diff diff-${diff.toLowerCase()}`}>{diff}</span>}
        <p id="active-kind" className="active-kind">{active.kind === "mock" ? "Mock interview problem" : optimizing ? "Optimizing an accepted solve — a better Accepted replaces it." : "Solve this problem before returning to the rest of the dashboard."}</p>
        <div className="active-clock" aria-label="Elapsed solving time"><span className="active-clock-label">Elapsed</span>
          <strong id="active-timer" className={`timer active-timer${over ? " is-over" : ""}`}>{fmtTime(elapsed)}</strong>
          <span id="active-par" className={`active-par${over ? " is-over" : ""}`}>{active.par_sec ? `${Math.round(active.par_sec / 60)}m pace` : ""}</span></div>
        {overview && (
          <div id="run-stats" className="run-stats"><span><b>{overview.solved}</b>/{overview.total_problems}</span><span className={overview.due_reviews ? "is-due" : ""}><b>{overview.due_reviews}</b> due</span>
            <span><b>{overview.streak}</b> streak</span><span><b>{overview.xp_today}</b> XP</span></div>
        )}
        {(lc === "missing" || lc === "expired") && <button id="run-lc" className="run-lc" type="button" title={`${lc === "missing" ? "LeetCode cookie not set" : "LeetCode cookie expired"} — click to paste a fresh one.`} onClick={() => setCookie(true)}>Cookie</button>}
        <div className="active-actions">
          <a id="active-link" className={`button is-lg${active.surface !== "editor" ? " is-primary" : ""}`} href={active.url} target="_blank" rel="noopener">Open on LeetCode</a>
          <button id="btn-resume-session" className="button is-primary resume-btn" type="button" onClick={togglePause}>Resume</button>
          <button id="btn-minimise-run" className="button is-ghost" type="button" title="Back to the app — Settings and the rest — with the run kept and its clock running" onClick={() => setMinimised(true)}>Minimise</button>
          <EditorHead />
        </div>
      </div>
      {hasEditor && <EditorPane key={`${active.slug}`} active={active} prefetched={editor} />}
      <aside id="run-coach" className="run-coach" aria-label="Coach" onClick={(e) => { if (layout.coach || (e.target as HTMLElement).closest("#btn-coach-toggle")) patchLayout({ coach: !layout.coach }); }}>
        <div id="coach-split" className="editor-split coach-split" role="separator" aria-orientation="vertical" aria-label="Resize the coach" tabIndex={0} title="Drag to resize · double-click to reset"
          onClick={(e) => e.stopPropagation()} onPointerDown={dragCoach} onDoubleClick={() => patchLayout({ coachW: null })}
          onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); const w = root.current!.querySelector("#run-coach")!.getBoundingClientRect().width; patchLayout({ coachW: w + (e.key === "ArrowLeft" ? 20 : -20) }); }} />
        <div className="coach-head"><span className="coach-title">Coach</span><span id="coach-model" className="coach-model-name">{overview?.llm_enabled ? overview.llm_model : "off"}</span>
          <button id="btn-coach-toggle" className="panel-toggle" type="button" aria-label="Hide the coach" title="Hide the coach">&#x203A;</button></div>
        <div className="active-notes" onClick={(e) => e.stopPropagation()}>
          {active.takeaway?.scope === "problem" && <p id="active-takeaway" className="active-takeaway"><b>Last time on this problem:</b> {active.takeaway.text}</p>}
          {critique && <div id="plan-check-panel" className="plan-critique"><div className="plan-critique-title"><span>Plan check</span><span>{verdict}</span></div>{items.length ? <ul>{items.map((i, n) => <li key={n}>{i}</li>)}</ul> : <p className="small">No specific concerns.</p>}</div>}
          {nudge && <div id="nudge" className="nudge">{nudge}</div>}
          {(chat.length > 0 || coachPending) && (
            <div id="hint-panel" className="hint-panel" ref={panel}>
              {chat.map((m, i) => m.role === "me" ? <div key={i} className="chat-msg is-me">{stamp(m.t)}<p>{m.text}</p></div> : (
                <div key={i} className={`hint-card${i === lastCoach ? " is-latest" : ""}`}>
                  {(m.t != null || i === lastCoach) && <div className="note-head">{stamp(m.t) || <span />}{i === lastCoach && <button className="note-action" type="button" onClick={() => ed?.clearMarks()}>Clear marks</button>}</div>}
                  <p>{coachText(m.text)}</p></div>))}
              {coachPending?.text && <div className="chat-msg is-me">{stamp(coachPending.t)}<p>{coachPending.text}</p></div>}
              {coachPending && <div className="hint-card chat-typing" aria-label="The interviewer is typing"><span /><span /><span /></div>}
            </div>
          )}
          {walk && (
            <div id="give-up-panel" className="give-up-panel"><div className="note-head"><span>Walkthrough</span><span className="note-meta">{walk.done ? "that's all of it" : "write each step, then ask for the next"}</span></div>
              <ol className="walk-steps">{steps.map((st, i) => <li key={i} className={i === steps.length - 1 ? "is-latest" : ""}>{coachText(st.text)}</li>)}</ol>
              {!walk.done && <div className="walk-actions"><button id="btn-walk-next" className="button is-small" type="button" title="Reads your code as it is now" disabled={busy === "walk"} aria-busy={busy === "walk" || undefined} onClick={giveUpStep}>Next step</button><span className="note-meta">Got it from here? Just keep writing.</span></div>}</div>
          )}
          {!chat.length && !coachPending && !walk && <p id="coach-empty" className="coach-empty">{optimizing ? (active.chat_available ? "Accepted! Ask a follow-up below, or request an optimization hint. End keeps your accepted solution and returns to rating." : "Enable the coach to discuss optimizations or ask follow-up questions. End keeps your accepted solution.")
            : active.chat_available ? "Stuck? Think out loud below, or ask for a hint. The interviewer reads your code and points, without giving the fix." : active.hints_available ? "Stuck? A hint reads the code you've written and points, without giving the fix."
            : active.kind === "mock" ? "A mock runs without hints — it's you and the clock." : "No hints for this one."}</p>}
        </div>
        {active.chat_available && (
          <form id="coach-chat" className="coach-chat" autoComplete="off" onSubmit={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
            <textarea id="coach-input" data-dictate rows={2} maxLength={4000} placeholder={optimizing ? "Ask about your solution or optimizations" : "Message the interviewer"} aria-label={optimizing ? "Talk to the coach" : "Talk to the interviewer"}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || e.shiftKey || (e.nativeEvent as KeyboardEvent).isComposing) return;
                e.preventDefault(); const input = e.currentTarget;
                if (useRun.getState().coachPending) return;
                const text = input.value.trim(); if (!text) return; input.value = "";
                if (!(await askCoach(text)) && !input.value) input.value = text;
              }} />
          </form>
        )}
        <div className="coach-actions" onClick={(e) => e.stopPropagation()}>
          <div className="assist-group" role="group" aria-label="Help">
            <IconBtn id="btn-learning" label="I’m stuck — focused lesson" hidden={!active.recovery_available} className="" onClick={async () => {
              try { const offer = await api("/learning/recovery"); if (!offer.sequence) toast("No focused lesson is available for this problem yet."); else useFlow.getState().openLearning({ type: "sequence", sequence: offer.sequence }); } catch (e) { toast((e as Error).message); } }}
              svg={<><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>} />
            <IconBtn id="btn-hint" label={chat.some((m) => m.role === "coach") ? "Another hint" : "Ask for a hint"} hidden={!active.hints_available} className="hint-btn" disabled={Boolean(coachPending) || starting} busy={Boolean(coachPending)}
              onClick={() => askCoach()} svg={<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>} />
            <IconBtn id="btn-give-up" label={giveArmed ? "Sure? Click again" : "Give up"} hidden={!active.give_up_available || Boolean(walk)} className="give-up-btn" disabled={starting || busy === "walk"} busy={busy === "walk"}
              onClick={async () => { if (!giveArmed) { armGive(); return; } disarmGive(); await giveUpStep(); }} svg={<><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></>} />
          </div>
          <IconBtn id="btn-end-run" label={endArmed ? "Sure? Click again" : "End"} hidden={!active.end_available} className="end-btn" disabled={starting || busy === "end"} busy={busy === "end"}
            onClick={() => { if (!endArmed) { armEnd(); return; } disarmEnd(); void endRun(); }} svg={<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />} />
          <div className="run-menu">
            <button id="btn-run-menu" className="button is-ghost icon-button" type="button" aria-haspopup="menu" aria-expanded={menu} aria-controls="run-menu" aria-label="More run actions" data-tip="More"
              onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>&#x22EF;</button>
            {menu && (
              <div id="run-menu" className="run-menu-list" role="menu" onClick={() => setMenu(false)}>
                {active.plan_check_available && !active.plan_check && <button id="btn-plan-check" type="button" role="menuitem" disabled={busy === "plan"} title="An LLM read of the plan you locked in. It's noted on this solve." onClick={planCheck}>{busy === "plan" ? "Checking…" : "Check my plan"}</button>}
                <button id="btn-check-solve" type="button" role="menuitem" disabled={starting} title="Solves are picked up when you come back to this tab. Solved elsewhere without leaving it? Check here." onClick={checkSolve}>Check for solve</button>
                <button id="btn-pause-session" type="button" role="menuitem" disabled={starting} aria-pressed={!!active.is_paused} onClick={togglePause}>{active.is_paused ? "Resume" : "Pause"}</button>
                <button id="btn-cancel-session" className="is-danger" type="button" role="menuitem" disabled={starting} title={optimizing ? "Keep the Accepted you had and go back to rating it" : ""} onClick={cancelRun}>{optimizing ? "Stop optimizing" : "Cancel run"}</button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
