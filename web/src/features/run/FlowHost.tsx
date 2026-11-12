"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { useRun } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { useUi } from "@/lib/ui-store";
import { useRoute } from "@/lib/nav";
import { preloadCodeMirror } from "@/features/editor/codemirror";
import { ActiveRun } from "./ActiveRun";
import { AnnotateModal } from "./AnnotateModal";
import { CookieModal } from "./CookieModal";
import { DetailModal } from "./DetailModal";
import { LearningModal } from "./LearningModal";
import { MockModal } from "./MockModal";
import { PredictModal } from "./PredictModal";
import { QuickStartModal } from "./QuickStartModal";
import { RecallModal } from "./RecallModal";
import { SprintModal } from "./SprintModal";
import { useRunActions } from "./useRunActions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
// Solve detection has no timer: a solve on LeetCode happens in another tab, so coming back to this one is the moment
// it's worth asking (and a hidden tab's timers are throttled anyway). POSTing /poll also sweeps LeetCode for accepted
// submissions with no attempt behind them, so a problem solved on the phone is logged the next time this page is looked at.
const GAP = { idle: 60_000, modal: 5_000, session: 2_000 };
const FOLLOWUP_MS = 5_000;

// Everything that happens "on top of" a page: starting a run, the plan, the run screen, the post-solve review, recalls,
// sprints, mocks, the attempt archive, the quick-start and cookie dialogs, and noticing a solve that landed elsewhere.
export function FlowHost() {
  const qc = useQueryClient();
  const toast = useToast();
  const { section } = useRoute();
  const { startSession, refresh } = useRunActions();
  const flow = useFlow();
  const { cookieOpen, setCookie, quickStartOpen, setQuickStart } = useUi();
  const active = useRun((s) => s.active);
  const minimised = useRun((s) => s.minimised);
  const setMinimised = useRun((s) => s.setMinimised);
  const [predict, setPredict] = useState<Any>(null);
  const [runHost, setRunHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setRunHost(document.getElementById("run-host")); }, []);
  const last = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const followup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annotateRef = useRef<Any>(null); annotateRef.current = flow.annotate;
  const sectionRef = useRef(section); sectionRef.current = section;

  // The page behind a run steps aside: locked while a run is in front, free again once it is minimised.
  useEffect(() => {
    const locked = !!active && !minimised && section === "leetcode";
    document.body.classList.toggle("has-active-session", !!active);
    document.body.classList.toggle("run-minimised", !!active && minimised);
    document.body.classList.toggle("has-editor-run", !!active && active.surface === "editor");
    for (const el of document.querySelectorAll<HTMLElement>("#tabs, #overview, #user-chip, #coach-chip, main")) {
      if (locked) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); } else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
    }
  }, [active, minimised, section]);

  useEffect(() => { useFlow.setState({ preloadEditor: preloadCodeMirror }); }, []);

  const rateable = useCallback((pending: Any[]) => { const busy = useRun.getState().active?.optimizes; return busy ? pending.filter((p) => p.id !== busy) : pending; }, []);
  const openNextPending = useCallback(async () => {
    if (useFlow.getState().annotate) return;
    try { const { pending } = await api("/pending"); const next = rateable(pending || []); if (next.length) useFlow.getState().openAnnotate(next[0]); } catch { /* they're logged either way */ }
  }, [rateable]);

  const detect = useCallback(({ force = false, followupCheck = true } = {}) => {
    if (inFlight.current) return inFlight.current;
    const modalOpen = !!useFlow.getState().annotate;
    const sessionId = useRun.getState().active?.session_id;
    const gap = modalOpen ? GAP.modal : sessionId ? GAP.session : GAP.idle;
    if (!force && Date.now() - last.current < gap) return Promise.resolve();
    last.current = Date.now();
    if (followup.current) clearTimeout(followup.current);
    const job = (async () => {
      try {
        const res = await api("/poll", "POST");
        const cur = useRun.getState().active;
        if (sessionId && (!cur || cur.session_id !== sessionId)) return;   // a run cancelled or replaced mid-request
        const pending: Any[] = res.pending || [];
        const open = useFlow.getState().annotate as Any;
        if (open) {
          // Never stack a second modal over one being filled in, but restate this solve if a better submission took it over.
          const fresh = pending.find((p) => p.id === open.id);
          if (fresh && fresh.submission_id !== open.submission_id) { useFlow.getState().openAnnotate({ ...open, ...fresh }); toast("Picked up your newer submission for this one."); }
        } else if (rateable(pending).length && sectionRef.current !== "system-design") useFlow.getState().openAnnotate(rateable(pending)[0]);
        const logged = res.new_attempts && res.new_attempts.length;
        if (logged && sessionId) await refresh();
        if (logged) qc.invalidateQueries();
        else if (sessionId && followupCheck && document.visibilityState === "visible") followup.current = setTimeout(() => detect({ force: true, followupCheck: false }), FOLLOWUP_MS);
      } catch { /* detection is a convenience; never break the page over it */ } finally { inFlight.current = null; }
    })();
    inFlight.current = job;
    return job;
  }, [qc, refresh, rateable, toast]);

  // An Accepted from the in-app editor is logged by the submit itself: rate it now.
  const onSolved = useCallback(async (res: Any) => {
    const solved = (res.pending || []).find((p: Any) => p.id === res.attempt_id);
    if (solved && !useFlow.getState().annotate) useFlow.getState().openAnnotate(solved);
    await refresh(); qc.invalidateQueries();
  }, [qc, refresh]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") { void detect(); qc.invalidateQueries({ queryKey: ["api", "/leetcode-status"] }); } };
    const onFocus = () => { void detect(); qc.invalidateQueries({ queryKey: ["api", "/leetcode-status"] }); };
    const onSolvedEvt = (e: Event) => void onSolved((e as CustomEvent).detail);
    const onCheck = (e: Event) => void detect({ force: !!(e as CustomEvent).detail?.force });
    const onNext = () => void openNextPending();
    document.addEventListener("visibilitychange", onVis); window.addEventListener("focus", onFocus);
    window.addEventListener("editor-solved", onSolvedEvt); window.addEventListener("senpai-detect-solves", onCheck); window.addEventListener("senpai-open-next-pending", onNext);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onFocus); window.removeEventListener("editor-solved", onSolvedEvt); window.removeEventListener("senpai-detect-solves", onCheck); window.removeEventListener("senpai-open-next-pending", onNext); };
  }, [detect, onSolved, openNextPending, qc]);

  // App start: pick up a run already in progress, and anything solved while away.
  useEffect(() => { void refresh().catch(() => {}); void detect({ force: true }); }, [refresh, detect]);

  // A request to start something: one run at a time (a minimised one comes back rather than being replaced).
  useEffect(() => {
    const r = flow.start; if (!r) return;
    flow.requestStart(null);
    if (useRun.getState().active) { setMinimised(false); toast("Finish or end this run first."); return; }
    if (r.mode === "recall") { flow.openRecall({ slug: r.slug, title: r.title, category: r.category, attemptId: r.recallAttemptId, gradingStatus: r.gradingStatus, kind: r.kind }); return; }
    if (r.kind !== "mock") { setPredict({ slug: r.slug, kind: r.kind, title: r.title, category: r.category, interview: r.interview }); return; }
    void startSession({ slug: r.slug, kind: r.kind, surface: "editor" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.start]);

  const closeAnnotate = useCallback((opts?: { next?: boolean }) => { useFlow.getState().openAnnotate(null); if (opts?.next !== false) setTimeout(() => void openNextPending(), 0); }, [openNextPending]);

  return (
    <>
      {active && runHost && createPortal(<ActiveRun onSolved={onSolved} />, runHost)}
      {predict && <PredictModal ctx={predict} onClose={() => setPredict(null)} />}
      {flow.recall && <RecallModal req={flow.recall} onClose={() => { flow.openRecall(null); qc.invalidateQueries(); }} />}
      {flow.annotate && <AnnotateModal key={String(flow.annotate.id)} initial={flow.annotate} onClose={closeAnnotate} />}
      {flow.sprintOpen && <SprintModal onClose={() => flow.setSprint(false)} />}
      {flow.mockOpen && <MockModal onClose={() => flow.setMock(false)} />}
      {flow.detailId && <DetailModal id={flow.detailId} onClose={() => flow.openDetail(null)} />}
      {flow.learning && <LearningModal learning={flow.learning} onClose={() => flow.openLearning(null)} />}
      {quickStartOpen && <QuickStartModal onClose={() => setQuickStart(false)} />}
      {cookieOpen && <CookieModal onClose={() => setCookie(false)} />}
    </>
  );
}
