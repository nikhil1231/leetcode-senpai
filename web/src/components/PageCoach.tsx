"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { streamApi } from "@/lib/api";
import { Chat, useKeyboardFit, type ChatMessage } from "@/components/chat/Chat";
import { useHeadingValue } from "@/lib/heading";
import { useOverview } from "@/lib/queries";
import { useRun } from "@/lib/run-store";
import { useUi } from "@/lib/ui-store";
import { useRoute } from "@/lib/nav";

// "Ask AI about this page": a bounded, fresh page snapshot accompanies each message; chat stays in memory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) + "\n[truncated]" : text);
const visible = (n: Element) => n.getClientRects().length > 0;

export function snapshotPage(pageName: string, section: string) {
  // Settings and credential dialogs are deliberately excluded, including values.
  const roots = [...document.querySelectorAll(".overlay")].filter((n) => !["cookie-modal", "signin-gate"].includes(n.id) && visible(n));
  const tab = document.querySelector("main > .tab");
  if (tab && !location.pathname.endsWith("/settings") && visible(tab)) roots.push(tab);
  const parts: string[] = [];
  for (const root of roots) {
    const fields = [...root.querySelectorAll<HTMLInputElement>("input, textarea, select")]
      .filter((n) => visible(n) && !/password|hidden|file/.test(n.type) && !/cookie|token|secret|api.?key|password/i.test(n.id + " " + n.name) && !n.closest(".coach-chat, .sd-chat, .ch-thread"))
      .slice(0, 16).map((n) => ({ field: n.getAttribute("aria-label") || n.labels?.[0]?.innerText || n.id || n.name, value: clip(n.value || "", 1200), ...(/checkbox|radio/.test(n.type) ? { selected: n.checked } : {}) }));
    const answers = [...root.querySelectorAll<HTMLElement>(".is-wrong, .light-option.is-correct, .sd-choice-picked, .sd-choice-correct, .sd-choice-wrong")].filter(visible).slice(0, 10)
      .map((n) => ({ answer: clip(n.innerText || "", 1200), state: n.matches(".is-wrong, .sd-choice-wrong") ? "incorrect selection" : n.matches(".is-correct, .sd-choice-correct") ? "correct answer" : "selected answer" }));
    // Put draft/selection state before prose so long lessons cannot crowd it out.
    parts.push(clip(JSON.stringify({ fields, answers }), 3500));
    parts.push(clip((root as HTMLElement).innerText || "", 8000));
  }
  return { page: pageName, section, context: clip(parts.join("\n\n"), 11980) };
}

type Turn = { id: string; role: "me" | "coach"; text: string; page: string; streaming?: boolean };
let seq = 0;
const nextId = () => `pc${++seq}`;

export function PageCoach() {
  const { pageCoachOpen: open, setPageCoach } = useUi();
  const { title } = useHeadingValue();
  const { section } = useRoute();
  const overview = useOverview().data;
  const run = useRun();
  const editorRun = !!run.active && run.active.surface === "editor" && !run.minimised && section === "leetcode";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);
  const pageName = (title || "Current page").slice(0, 160);
  const enabled = !!overview?.llm_enabled;
  useKeyboardFit(panel, open);

  useEffect(() => { if (open && editorRun) setPageCoach(false); }, [open, editorRun, setPageCoach]);
  useEffect(() => { document.body.classList.toggle("page-coach-open", open); return () => document.body.classList.remove("page-coach-open"); }, [open]);
  useEffect(() => { if (open) { setError(enabled ? "" : "AI coaching is unavailable. Check the coach configuration in Settings."); document.getElementById("page-coach-input")?.focus(); } }, [open, enabled]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay")) { e.preventDefault(); e.stopImmediatePropagation(); setPageCoach(false); document.getElementById("btn-page-coach")?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [open, setPageCoach]);

  const send = async (message: string) => {
    if (pending || editorRun) return;
    const state = snapshotPage(pageName, section === "system-design" ? "system-design" : "leetcode");
    const history = turns.filter((t) => !t.streaming).slice(-8).map(({ role, text, page }) => ({ role, text: text.slice(0, 2000), page }));
    const me: Turn = { id: nextId(), role: "me", text: message, page: state.page };
    const reply: Turn = { id: nextId(), role: "coach", text: "", page: state.page, streaming: true };
    const ctrl = new AbortController();
    abort.current = ctrl;
    setTurns((t) => [...t, me]); setPending(true); setError("");
    const put = (patch: Partial<Turn>) => setTurns((t) => t.map((x) => (x.id === reply.id ? { ...x, ...patch } : x)));
    let text = "";
    try {
      await streamApi("/coach/page-chat", { message, ...state, history }, (e: Any) => {
        if (abort.current !== ctrl) return;
        if (e.type === "text") { const first = !text; text += e.text; if (first) setTurns((t) => [...t, { ...reply, text }]); else put({ text }); }
        else if (e.type === "done") { if (e.reply != null) text = e.reply; setModel(e.model || ""); }
      }, ctrl.signal);
      if (abort.current !== ctrl) return;
      setTurns((t) => (t.some((x) => x.id === reply.id) ? t.map((x) => (x.id === reply.id ? { ...x, text: text.trim(), streaming: false } : x)) : [...t, { ...reply, text: text.trim(), streaming: false }]));
    } catch (e) {
      if (abort.current !== ctrl) return;
      setTurns((t) => t.filter((x) => x.id !== reply.id && x.id !== me.id));   // the message goes back in the box
      setError((e as Error).message);
      throw e;
    } finally {
      if (abort.current === ctrl) { abort.current = null; setPending(false); }
    }
  };
  const clear = () => { abort.current?.abort(); abort.current = null; setPending(false); setTurns([]); setError(""); document.getElementById("page-coach-input")?.focus(); };

  const messages = useMemo<ChatMessage[]>(() => turns.map((t) => ({ id: t.id, role: t.role === "me" ? "user" : "assistant", text: t.text, streaming: t.streaming })), [turns]);
  if (!open) return null;
  return (
    // Page shortcuts (Quickfire's answer keys) listen on document: typing in the coach stops there, after the composer saw it.
    <aside ref={panel} id="page-coach" className="page-coach" aria-label="AI page coach" onKeyDown={(e) => e.nativeEvent.stopImmediatePropagation()}>
      <div className="coach-head"><span className="coach-title">Coach</span><span id="page-coach-model" className="coach-model-name">{model || overview?.llm_model || "AI"}</span>
        <button id="page-coach-clear" className="button is-ghost is-small" type="button" title="Clear this chat" onClick={clear}>New chat</button>
        <button id="page-coach-close" className="panel-toggle" type="button" aria-label="Close AI coach" onClick={() => setPageCoach(false)}>&#x203A;</button></div>
      <p id="page-coach-context" className="page-coach-context">Current page: {pageName}</p>
      <Chat className="page-coach-thread" messages={messages} running={pending} onSend={send} inputId="page-coach-input" disabled={!enabled}
        placeholder="Ask about this question or your mistake…" label="Message the AI coach" typingLabel="Coach is typing"
        empty={<p className="page-coach-empty">Ask about the question, your answer, or the feedback on this page. The coach receives a short page snapshot with each message.</p>}
        status={error ? <p id="page-coach-error" className="page-coach-error" role="status">{error}</p> : null} />
    </aside>
  );
}
