"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
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
      .filter((n) => visible(n) && !/password|hidden|file/.test(n.type) && !/cookie|token|secret|api.?key|password/i.test(n.id + " " + n.name) && !n.closest(".coach-chat, .sd-chat"))
      .slice(0, 16).map((n) => ({ field: n.getAttribute("aria-label") || n.labels?.[0]?.innerText || n.id || n.name, value: clip(n.value || "", 1200), ...(/checkbox|radio/.test(n.type) ? { selected: n.checked } : {}) }));
    const answers = [...root.querySelectorAll<HTMLElement>(".is-wrong, .light-option.is-correct, .sd-choice-picked, .sd-choice-correct, .sd-choice-wrong")].filter(visible).slice(0, 10)
      .map((n) => ({ answer: clip(n.innerText || "", 1200), state: n.matches(".is-wrong, .sd-choice-wrong") ? "incorrect selection" : n.matches(".is-correct, .sd-choice-correct") ? "correct answer" : "selected answer" }));
    // Put draft/selection state before prose so long lessons cannot crowd it out.
    parts.push(clip(JSON.stringify({ fields, answers }), 3500));
    parts.push(clip((root as HTMLElement).innerText || "", 8000));
  }
  return { page: pageName, section, context: clip(parts.join("\n\n"), 11980) };
}

export function PageCoach() {
  const { pageCoachOpen: open, setPageCoach } = useUi();
  const { title } = useHeadingValue();
  const { section } = useRoute();
  const overview = useOverview().data;
  const run = useRun();
  const editorRun = !!run.active && run.active.surface === "editor" && !run.minimised && section === "leetcode";
  const [turns, setTurns] = useState<{ role: "me" | "coach"; text: string; page: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [text, setText] = useState("");
  const gen = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const pageName = (title || "Current page").slice(0, 160);

  useEffect(() => { if (open && editorRun) setPageCoach(false); }, [open, editorRun, setPageCoach]);
  useEffect(() => { document.body.classList.toggle("page-coach-open", open); return () => document.body.classList.remove("page-coach-open"); }, [open]);
  useEffect(() => { if (open) { input.current?.focus(); setError(overview?.llm_enabled ? "" : "AI coaching is unavailable. Check the coach configuration in Settings."); } }, [open, overview?.llm_enabled]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [turns, pending]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay")) { e.preventDefault(); e.stopImmediatePropagation(); setPageCoach(false); document.getElementById("btn-page-coach")?.focus(); }
      else if (document.getElementById("page-coach")?.contains(e.target as Node)) e.stopImmediatePropagation();   // Quickfire shortcuts must never read typing in the coach as answers
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [open, setPageCoach]);

  const send = async () => {
    const message = text.trim();
    if (!message || pending || editorRun) return;
    const state = snapshotPage(pageName, section === "system-design" ? "system-design" : "leetcode");
    const g = gen.current, history = turns.slice(-8).map((m) => ({ ...m, text: m.text.slice(0, 2000) }));
    setTurns([...turns, { role: "me", text: message, page: state.page }]); setText(""); setPending(true); setError("");
    try {
      const r: Any = await api("/coach/page-chat", "POST", { message, ...state, history });
      if (gen.current !== g) return;
      setTurns((t) => [...t, { role: "coach", text: r.reply, page: state.page }]); setModel(r.model);
    } catch (e) { if (gen.current !== g) return; setTurns((t) => t.slice(0, -1)); setText(message); setError((e as Error).message); } finally { setPending(false); input.current?.focus(); }
  };

  if (!open) return null;
  const render = (t: string) => t.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p));
  return (
    <aside id="page-coach" className="page-coach" aria-label="AI page coach">
      <div className="coach-head"><span className="coach-title">Coach</span><span id="page-coach-model" className="coach-model-name">{model || overview?.llm_model || "AI"}</span>
        <button id="page-coach-clear" className="button is-ghost is-small" type="button" title="Clear this chat" disabled={pending} onClick={() => { gen.current++; setTurns([]); setError(""); input.current?.focus(); }}>New chat</button>
        <button id="page-coach-close" className="panel-toggle" type="button" aria-label="Close AI coach" onClick={() => setPageCoach(false)}>&#x203A;</button></div>
      <p id="page-coach-context" className="page-coach-context">Current page: {pageName}</p>
      <div id="page-coach-messages" className="page-coach-messages" role="log" aria-live="polite" ref={log}>
        {turns.length ? turns.map((m, i) => <div key={i} className={m.role === "me" ? "chat-msg is-me" : "hint-card"}><p>{render(m.text)}</p></div>)
          : <p className="page-coach-empty">Ask about the question, your answer, or the feedback on this page. The coach receives a short page snapshot with each message.</p>}
        {pending && <div className="hint-card chat-typing" aria-label="Coach is typing"><span /><span /><span /></div>}
      </div>
      <p id="page-coach-error" className="page-coach-error" role="status">{error}</p>
      <form id="page-coach-form" className="coach-chat" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea id="page-coach-input" ref={input} rows={3} maxLength={4000} placeholder="Ask about this question or your mistake…" aria-label="Message the AI coach" disabled={pending} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); void send(); } }} />
        <div className="page-coach-send"><span>Enter to send · Shift+Enter for a new line</span><button id="page-coach-send" className="button is-primary is-small" type="submit" disabled={pending}>Send</button></div>
      </form>
    </aside>
  );
}
