"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { mdHtml } from "@/lib/lesson-md";
import { useToast } from "@/lib/toast";
import { lineDiff } from "./linediff";
import { Diff } from "./TestPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export interface ChatMsg { id?: string; role: "user" | "assistant" | "event"; text: string; patch?: Record<string, string>; at: number; msg_id?: string }

// The AI assistant: a chat beside the code. Its patches are suggestions; nothing changes in your files until you apply one,
// and applying is recorded, because how you treat a suggestion is part of what is assessed.
export function Assistant({ attemptId, chat, setChat, files, editFiles, getFiles, onRevision, disabled }: {
  attemptId: string; chat: ChatMsg[]; setChat: (c: ChatMsg[]) => void; files: Record<string, string>; editFiles: (f: Record<string, string>) => void;
  getFiles: () => Record<string, string> | undefined; onRevision: (r: number) => void; disabled: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const send = async () => {
    const el = box.current;
    if (el) await (window as Any).Dictate?.settle?.(el);
    const message = (el?.value ?? text).trim();
    if (!message || busy) return;
    const mine: ChatMsg = { role: "user", text: message, at: Date.now() / 1000 };
    setChat([...chat, mine]); setText(""); setBusy(true);
    try {
      const r = await api(`/coding/attempts/${attemptId}/assist`, "POST", { message, files: getFiles() });
      onRevision(r.revision); setChat([...chat, mine, r.message]);
    } catch (e) { toast((e as Error).message); setText(message); setChat(chat); } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ block: "nearest" }), 50); }
  };
  const apply = async (m: ChatMsg) => {
    editFiles(m.patch || {});
    setChat([...chat, { role: "event", text: "", at: Date.now() / 1000, msg_id: m.id }]);
    try { onRevision((await api(`/coding/attempts/${attemptId}/applied`, "POST", { msg_id: m.id })).revision); } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="cw-assistant">
      <div className="cw-chat" aria-live="polite">
        {chat.length === 0 && <p className="cw-note">Ask for a diagnosis, a plan or a patch, the way you would a colleague. It is usually right, and sometimes it isn&apos;t. You can&apos;t ask it to run the tests; the Run tests button does that.</p>}
        {chat.map((m, i) => m.role === "event" ? <p key={i} className="cw-event">You applied a patch to your code.</p> : (
          <div key={m.id ?? i} className={`cw-msg is-${m.role}`}>
            <b>{m.role === "user" ? "You" : "Assistant"}</b>
            <div className="cw-md" dangerouslySetInnerHTML={{ __html: mdHtml(m.text) }} />
            {m.patch && Object.keys(m.patch).length > 0 && (
              <div className="cw-patch">
                <button type="button" className="button is-small" onClick={() => setOpen(open === m.id ? null : (m.id ?? null))}>{open === m.id ? "Hide patch" : `Review patch (${Object.keys(m.patch).join(", ")})`}</button>
                {!disabled && <button type="button" className="button is-small" onClick={() => apply(m)}>Apply to my code</button>}
                {open === m.id && Object.entries(m.patch).map(([p, code]) => <div key={p}><span className="cw-path">{p}</span><Diff text={lineDiff(files[p] ?? "", code)} empty="Same as your file." /></div>)}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="cw-note">The assistant is thinking…</p>}
        <div ref={end} />
      </div>
      {!disabled && (
        <div className="cw-chat-input">
          <textarea ref={box} className="textarea" data-dictate rows={2} placeholder="Ask the assistant…" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          <button className="button is-small is-primary" type="button" disabled={busy || !text.trim()} onClick={send}>Send</button>
        </div>
      )}
    </div>
  );
}
