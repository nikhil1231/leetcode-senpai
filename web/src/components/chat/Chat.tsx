"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActionBarPrimitive, AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime,
  type AppendMessage, type ThreadMessageLike, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { mdHtml } from "@/lib/lesson-md";

// Every chat in the app on assistant-ui's unstyled primitives, laid out like the library's default thread (replies as
// plain text in a centred column, the learner's messages in a muted bubble, a rounded composer with a round send
// button) and styled by src/styles/chat.css over the app's tokens, so a section's colours follow. The caller owns the messages (the external-store runtime): the server stays the record, and
// this only shows it, plus a reply while it streams in. Tool parts are cards the caller draws: whiteboards, activities,
// simulator hand-overs, "go to lesson" moves, all keyed by name.
// Scrolling: when a reply starts streaming, the log scrolls once to put its top at the top of the view and then holds
// still while the text runs down the page (the latest reply is given room to reach the top). Nothing scrolls after
// that, so you can read or scroll back while it writes.

export type ChatPart = { tool: string; args?: Record<string, unknown> };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "note";   // a note: a quiet line between turns ("You got the activity right.")
  text: string;
  parts?: ChatPart[];
  who?: { name: string; role?: string; key?: string };   // key: the speaker's colour (tutor cast)
  streaming?: boolean;
  className?: string;
  after?: ReactNode;   // anything the caller shows under the message (chips, links)
  time?: string;
};
export type ToolRenderer = (args: Record<string, unknown>, message: ChatMessage) => ReactNode;

type Props = {
  messages: ChatMessage[];
  running: boolean;
  onSend?: (text: string) => void | Promise<void>;   // a rejection puts the text back in the box
  tools?: Record<string, ToolRenderer>;
  empty?: ReactNode;
  status?: ReactNode;            // under the messages: an error with "Try again", a status line
  placeholder?: string;
  label?: string;                // the input's accessible name
  inputId?: string;
  maxLength?: number;
  disabled?: boolean;            // nothing can be typed (the model is off, the session ended)
  composer?: boolean;            // false: no composer at all
  composerExtra?: ReactNode;     // more buttons beside Send
  typingLabel?: string;
  className?: string;
  autoFocus?: boolean;
  draft?: string;                // text to start the composer with (an unsent message kept across redraws)
  onDraft?: (text: string) => void;
  holdMic?: boolean;             // sending while dictating keeps the mic armed, to come back on with the reply (the caller resumes it)
};

type Ctx = { byId: Map<string, ChatMessage>; tools: Record<string, ToolRenderer>; lastId?: string };
const ChatCtx = createContext<Ctx>({ byId: new Map(), tools: {} });

const convert = (m: ChatMessage): ThreadMessageLike => {
  if (m.role === "note") return { id: m.id, role: "system", content: [{ type: "text", text: m.text }] };
  if (m.role === "user") return { id: m.id, role: "user", content: [{ type: "text", text: m.text }] };
  return {
    id: m.id, role: "assistant",
    content: [{ type: "text", text: m.text }, ...(m.parts || []).map((p, i) => ({ type: "tool-call" as const, toolCallId: `${m.id}-${i}`, toolName: p.tool, args: (p.args || {}) as never, result: true }))],
    status: m.streaming ? { type: "running" } : { type: "complete", reason: "stop" },
  };
};

// A panel fixed to a phone's screen follows the visible viewport, so the on-screen keyboard pushes the composer up rather
// than covering it (iOS keeps the layout viewport full height under the keyboard).
export function useKeyboardFit(ref: React.RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const el = ref.current;
    if (!on || !vv || !el) return;
    const fit = () => {
      const phone = window.matchMedia("(max-width: 960px)").matches;
      el.style.height = phone ? `${vv.height}px` : "";
      el.style.top = phone ? `${vv.offsetTop}px` : "";
      el.style.bottom = phone ? "auto" : "";
    };
    fit();
    vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); el.style.height = el.style.top = el.style.bottom = ""; };
  }, [ref, on]);
}

export function Markdown({ text }: { text: string }) {
  return <div className="ch-md sd-md" dangerouslySetInnerHTML={{ __html: mdHtml(text) }} />;
}

// A reply while it streams: each word fades in, staggered across a chunk so the text wipes on left to right instead of
// landing a line at a time. Every update redraws the Markdown, so a word's start time is kept by its index and a word
// still fading is drawn with a negative delay, carrying on where it was.
const FADE_MS = 450;
export function StreamingMarkdown({ text }: { text: string }) {
  const el = useRef<HTMLDivElement>(null);
  const births = useRef<number[]>([]);
  useLayoutEffect(() => {
    const root = el.current;
    if (!root) return;
    root.innerHTML = mdHtml(text);
    const now = performance.now(), seen = births.current;
    const nodes: Text[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) nodes.push(walk.currentNode as Text);
    const total = nodes.reduce((n, t) => n + (t.data.match(/\S+/g)?.length || 0), 0);
    if (total > seen.length) {
      const step = Math.min(28, Math.max(4, 500 / (total - seen.length)));
      let t = Math.max(now, seen[seen.length - 1] || 0);
      while (seen.length < total) { t += step; seen.push(t); }
    }
    let i = 0;
    for (const node of nodes) {
      const parts = node.data.split(/(\s+)/);
      const first = i;
      const words = parts.filter((w) => w && !/^\s+$/.test(w)).length;
      i += words;
      if (!words || now - seen[i - 1] >= FADE_MS) continue;   // every word here is already fully in
      const frag = document.createDocumentFragment();
      let k = first;
      for (const w of parts) {
        if (!w) continue;
        if (/^\s+$/.test(w) || now - seen[k] >= FADE_MS) { frag.append(w); if (!/^\s+$/.test(w)) k++; continue; }
        const span = document.createElement("span");
        span.className = "ch-fade";
        span.style.animationDelay = `${Math.round(seen[k] - now)}ms`;
        span.textContent = w;
        frag.append(span);
        k++;
      }
      node.replaceWith(frag);
    }
  }, [text]);
  return <div ref={el} className="ch-md sd-md" />;
}

function AssistantText({ text, status }: TextMessagePartProps) {
  if (!text.trim()) return null;
  return status?.type === "running" ? <StreamingMarkdown text={text} /> : <Markdown text={text} />;
}

function ToolPart({ toolName, args, toolCallId }: ToolCallMessagePartProps) {
  const { byId, tools } = useContext(ChatCtx);
  const message = byId.get(toolCallId.replace(/-\d+$/, ""));
  const render = tools[toolName];
  if (!render || !message) return null;
  return <div className="ch-tool" data-tool={toolName}>{render(args as Record<string, unknown>, message)}</div>;
}

const PARTS = { Text: AssistantText, tools: { Override: ToolPart } };

function Row({ id, role }: { id: string; role: string }) {
  const { byId, lastId } = useContext(ChatCtx);
  const m = byId.get(id);
  if (!m) return null;
  if (role === "system") return <MessagePrimitive.Root className={`ch-note ${m.className || ""}`}>{m.text}</MessagePrimitive.Root>;
  if (role === "user") return (
    <MessagePrimitive.Root className={`ch-msg is-me ${m.className || ""}`}>
      {m.time && <span className="ch-time">{m.time}</span>}<div className="ch-bubble">{m.text}</div>{m.after}
    </MessagePrimitive.Root>
  );
  const who = m.who && ((m.who.key && m.who.key !== "tutor") || m.who.role) ? m.who : null;   // the plain tutor or coach goes unnamed
  return (
    <MessagePrimitive.Root className={`ch-msg is-them${m.streaming ? " is-streaming" : ""}${id === lastId ? " is-last" : ""} ${m.className || ""}`} data-speaker={m.who?.key}>
      {who && <div className="ch-who"><b>{who.name}</b>{who.role && <small>{who.role}</small>}{m.time && <span className="ch-time">{m.time}</span>}</div>}
      <div className="ch-bubble">
        <MessagePrimitive.Parts components={PARTS} />
        {m.streaming && !m.text.trim() && <span className="ch-typing" aria-hidden="true"><span /><span /><span /></span>}
      </div>
      {m.after}
      {!m.streaming && m.text.trim() && (
        <ActionBarPrimitive.Root className="ch-actions" autohide="never">
          <ActionBarPrimitive.Copy className="ch-action" aria-label="Copy" data-tip="Copy">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="ch-icon-copy"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="ch-icon-done"><path d="m5 12 5 5L20 7" /></svg>
          </ActionBarPrimitive.Copy>
        </ActionBarPrimitive.Root>
      )}
    </MessagePrimitive.Root>
  );
}

export function Chat(p: Props) {
  const byId = useMemo(() => new Map(p.messages.map((m) => [m.id, m])), [p.messages]);
  const restore = useRef<(text: string) => void>(() => {});
  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages: p.messages,
    convertMessage: convert,
    isRunning: p.running,
    isDisabled: p.disabled,
    onNew: async (m: AppendMessage) => {
      const text = m.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
      if (!text) return;
      try { await p.onSend?.(text); } catch { restore.current(text); }
    },
  });
  restore.current = (text) => { if (!runtime.thread.composer.getState().text) runtime.thread.composer.setText(text); };
  const onDraft = useRef(p.onDraft);
  onDraft.current = p.onDraft;
  useEffect(() => {
    const composer = runtime.thread.composer;
    if (p.draft && !composer.getState().text) composer.setText(p.draft);
    return composer.subscribe(() => onDraft.current?.(composer.getState().text));
  }, [runtime]);   // eslint-disable-line react-hooks/exhaustive-deps
  const log = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, []);   // a chat opens on its latest message
  const last = p.messages[p.messages.length - 1];
  const waiting = p.running && !(last?.role === "assistant" && last.streaming);
  const streamingId = last?.role === "assistant" && last.streaming ? last.id : null;
  const [anchorId, setAnchorId] = useState<string | null>(null);   // the message pinned to the top of the view for this exchange
  const lastId = [...p.messages].reverse().find((m) => m.role === "assistant")?.id;
  // Room under the pinned message is a spacer after the messages, sized so it can reach the top of the view. It is the
  // log's own space, so it never collapses when the reply finishes or grows.
  const spacer = useRef<HTMLDivElement>(null);
  const fit = () => {
    const el = log.current, sp = spacer.current;
    if (!el || !sp) return;
    const anchor = anchorId ? el.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`) : null;
    sp.style.height = "0px";
    if (!anchor) return;
    const foot = el.querySelector<HTMLElement>(".ch-footer");
    sp.style.height = `${Math.max(0, el.clientHeight - (foot?.offsetHeight || 0) - 8 - (sp.offsetTop - anchor.offsetTop))}px`;
  };
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const el = log.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const foot = el.querySelector<HTMLElement>(".ch-footer");
    if (foot) ro.observe(foot);
    return () => ro.disconnect();
  });   // eslint-disable-line react-hooks/exhaustive-deps
  // Pin: scroll once, eased, to put a message at the top. Nothing scrolls after that (the reply writes down the page
  // under it, and overflowing is the reader's to scroll); touching the log cancels it.
  const anim = useRef(0);
  const pin = (id: string) => {
    const el = log.current;
    if (!el) return;
    cancelAnimationFrame(anim.current);
    const from = el.scrollTop, t0 = performance.now(), ms = 520;
    const stop = () => cancelAnimationFrame(anim.current);
    ["wheel", "touchstart", "keydown"].forEach((ev) => el.addEventListener(ev, stop, { once: true, passive: true }));
    const step = (now: number) => {
      const msg = el.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (!msg) return;
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // cubic ease in-out
      el.scrollTop = from + (Math.max(0, msg.offsetTop - 8) - from) * e;
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  // A new message from the learner while a reply is coming pins it; a reply that starts with no learner message
  // just before it (the opening question) pins itself.
  const lastUserId = [...p.messages].reverse().find((m) => m.role === "user")?.id;
  const seenUser = useRef(lastUserId), seenStream = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (lastUserId === seenUser.current) return;
    seenUser.current = lastUserId;
    if (lastUserId && p.running) { setAnchorId(lastUserId); pin(lastUserId); }
  }, [lastUserId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!streamingId || streamingId === seenStream.current) return;
    seenStream.current = streamingId;
    const i = p.messages.findIndex((m) => m.id === streamingId);
    const before = p.messages.slice(0, i).reverse().find((m) => m.role !== "note");
    if (before?.role === "user" && before.id === lastUserId) { setAnchorId(before.id); pin(before.id); }
    else { setAnchorId(streamingId); pin(streamingId); }
  }, [streamingId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ byId, tools: p.tools || {}, lastId }), [byId, p.tools, lastId]);
  // Send (or Enter) while dictating waits for the accurate transcript, then sends what the box then holds.
  const sendSettled = (e: React.SyntheticEvent) => {
    const input = (e.currentTarget as HTMLElement).querySelector("textarea");
    const D = typeof window !== "undefined" ? (window as unknown as { Dictate?: { settle?: (f: Element) => Promise<void> | null; hold?: (f: Element) => Promise<void> | null } }).Dictate : undefined;
    const wait = input && (p.holdMic ? D?.hold : D?.settle)?.call(D, input);
    if (!wait) return;
    e.preventDefault(); e.stopPropagation();
    wait.then(() => setTimeout(() => runtime.thread.composer.send(), 0));
  };
  return (
    <ChatCtx.Provider value={ctx}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className={`ch-thread ${p.className || ""}`}>
          <ThreadPrimitive.Viewport ref={log} className="ch-log" role="log" aria-live="polite" autoScroll={false} scrollToBottomOnRunStart={false} scrollToBottomOnInitialize={false}>
            {!p.messages.length && !p.running && p.empty}
            <ThreadPrimitive.Messages>{({ message }) => <Row id={message.id} role={message.role} />}</ThreadPrimitive.Messages>
            {waiting && <div className="ch-msg is-them"><div className="ch-bubble ch-typing" role="status" aria-label={p.typingLabel || "Typing"}><span /><span /><span /></div></div>}
            {p.status && <div className="ch-status">{p.status}</div>}
            <div ref={spacer} className="ch-spacer" aria-hidden="true" />
            <ThreadPrimitive.ViewportFooter className="ch-footer">
              <ThreadPrimitive.ScrollToBottom className="ch-scroll-down" aria-label="Scroll to the latest message" title="Scroll to the latest message">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </ThreadPrimitive.ScrollToBottom>
              {p.composer !== false && (
                <ComposerPrimitive.Root className="ch-composer"
                  onKeyDownCapture={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) sendSettled(e); }}
                  onClickCapture={(e) => { if ((e.target as HTMLElement).closest(".ch-send")) sendSettled(e); }}>
                  <ComposerPrimitive.Input className="ch-input" id={p.inputId} data-dictate rows={1} minRows={1} maxRows={8} maxLength={p.maxLength || 4000}
                    placeholder={p.placeholder || "Message"} aria-label={p.label || p.placeholder || "Message"} autoFocus={p.autoFocus} submitMode="enter" />
                  <div className="ch-composer-actions">
                    {p.composerExtra}
                    <ComposerPrimitive.Send className="ch-send" aria-label="Send" data-tip="Send (Enter)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                    </ComposerPrimitive.Send>
                  </div>
                </ComposerPrimitive.Root>
              )}
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </ChatCtx.Provider>
  );
}
