"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActionBarPrimitive, AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime,
  type AppendMessage, type ThreadMessageLike, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
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
};

type Ctx = { byId: Map<string, ChatMessage>; tools: Record<string, ToolRenderer>; lastId?: string; roomy: boolean };
const ChatCtx = createContext<Ctx>({ byId: new Map(), tools: {}, roomy: false });

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

function AssistantText({ text }: { text: string }) { return text.trim() ? <Markdown text={text} /> : null; }

function ToolPart({ toolName, args, toolCallId }: ToolCallMessagePartProps) {
  const { byId, tools } = useContext(ChatCtx);
  const message = byId.get(toolCallId.replace(/-\d+$/, ""));
  const render = tools[toolName];
  if (!render || !message) return null;
  return <div className="ch-tool" data-tool={toolName}>{render(args as Record<string, unknown>, message)}</div>;
}

const PARTS = { Text: AssistantText, tools: { Override: ToolPart } };

function Row({ id, role }: { id: string; role: string }) {
  const { byId, lastId, roomy } = useContext(ChatCtx);
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
    <MessagePrimitive.Root className={`ch-msg is-them${m.streaming ? " is-streaming" : ""}${id === lastId ? " is-last" : ""}${id === lastId && roomy ? " has-room" : ""} ${m.className || ""}`} data-speaker={m.who?.key}>
      {who && <div className="ch-who"><b>{who.name}</b>{who.role && <small>{who.role}</small>}{m.time && <span className="ch-time">{m.time}</span>}</div>}
      <div className="ch-bubble">
        <MessagePrimitive.Parts components={PARTS} />
        {m.streaming && !m.text.trim() && <span className="ch-typing" aria-hidden="true"><span /><span /><span /></span>}
      </div>
      {m.after}
      {!m.streaming && m.text.trim() && (
        <ActionBarPrimitive.Root className="ch-actions" autohide="never">
          <ActionBarPrimitive.Copy className="ch-action" aria-label="Copy" title="Copy">
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
  const [roomy, setRoomy] = useState(false);   // the latest reply has room to scroll to the top (once one has streamed here)
  useLayoutEffect(() => {
    const el = log.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const foot = el.querySelector<HTMLElement>(".ch-footer");
    const fit = () => el.style.setProperty("--ch-room", `${Math.max(0, el.clientHeight - (foot?.offsetHeight || 0) - 40)}px`);
    const ro = new ResizeObserver(fit);
    ro.observe(el); if (foot) ro.observe(foot);
    fit();
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = log.current;
    if (!streamingId || !el) return;
    setRoomy(true);
    requestAnimationFrame(() => {
      const msg = el.querySelector<HTMLElement>(`[data-message-id="${streamingId}"]`);
      if (msg) el.scrollTo?.({ top: msg.offsetTop - 8, behavior: "smooth" });
    });
  }, [streamingId]);
  const lastId = last?.role === "assistant" ? last.id : undefined;
  const ctx = useMemo(() => ({ byId, tools: p.tools || {}, lastId, roomy }), [byId, p.tools, lastId, roomy]);
  return (
    <ChatCtx.Provider value={ctx}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className={`ch-thread ${p.className || ""}`}>
          <ThreadPrimitive.Viewport ref={log} className="ch-log" role="log" aria-live="polite" autoScroll={false} scrollToBottomOnRunStart={false}>
            {!p.messages.length && !p.running && p.empty}
            <ThreadPrimitive.Messages>{({ message }) => <Row id={message.id} role={message.role} />}</ThreadPrimitive.Messages>
            {waiting && <div className="ch-msg is-them"><div className="ch-bubble ch-typing" role="status" aria-label={p.typingLabel || "Typing"}><span /><span /><span /></div></div>}
            {p.status && <div className="ch-status">{p.status}</div>}
            <ThreadPrimitive.ViewportFooter className="ch-footer">
              <ThreadPrimitive.ScrollToBottom className="ch-scroll-down" aria-label="Scroll to the latest message" title="Scroll to the latest message">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </ThreadPrimitive.ScrollToBottom>
              {p.composer !== false && (
                <ComposerPrimitive.Root className="ch-composer">
                  <ComposerPrimitive.Input className="ch-input" id={p.inputId} data-dictate rows={1} minRows={1} maxRows={8} maxLength={p.maxLength || 4000}
                    placeholder={p.placeholder || "Message"} aria-label={p.label || p.placeholder || "Message"} autoFocus={p.autoFocus} submitMode="enter" />
                  <div className="ch-composer-actions">
                    {p.composerExtra}
                    <ComposerPrimitive.Send className="ch-send" aria-label="Send" title="Send (Enter)">
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
