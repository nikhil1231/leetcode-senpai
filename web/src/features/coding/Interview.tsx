"use client";
import { useRef, useState } from "react";
import { Chat, type ChatMessage } from "@/components/chat/Chat";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { refToken, type Ref } from "./refs";
import type { Attempt, Interview } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// A spoken practice interview in the coach rail: you talk the interviewer through the code (the mic is on the box),
// press Enter for their next question or a live incident, and Finish for an informal debrief. Nothing here is scored.
export function InterviewPanel({ attempt, talk, onTalk, onAttempt, beforeTurn, files, elapsed, onOpen, disabled }: {
  attempt: Attempt; talk: Interview | undefined; onTalk: (t: Interview, revision: number) => void; onAttempt: (a: Attempt) => void;
  beforeTurn: () => Promise<void>; files: () => Record<string, string>; elapsed: () => number; onOpen: (r: Ref) => void; disabled: boolean;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const busy = useRef(false);   // a ref, not state: the chat keeps the first onSend it is given
  const turns = talk?.turns || [];
  const open = attempt.status === "open";
  const box = () => document.getElementById("cw-interview-input");

  const say = async (text: string) => {
    if (busy.current) return;
    busy.current = true; setPending(text);
    try {
      await beforeTurn();
      const r = await api<{ interview: Interview; revision: number }>(`/coding/attempts/${attempt.id}/interview`, "POST", { text, files: files() });
      onTalk(r.interview, r.revision);
      const mark = r.interview.turns.at(-1)?.refs?.[0];
      if (mark) onOpen(mark);
    } catch (e) { toast((e as Error).message); throw e; }
    finally { busy.current = false; setPending(null); (window as Any).Dictate?.resume?.(box()); }
  };
  const finish = async () => {
    const el = box();
    if (busy.current) return;
    if (el) await (window as Any).Dictate?.settle?.(el);
    busy.current = true; setFinishing(true);
    try { onAttempt((await api<{ attempt: Attempt }>(`/coding/attempts/${attempt.id}/interview/finish`, "POST", { elapsed_sec: elapsed() })).attempt); }
    catch (e) { toast((e as Error).message); }
    finally { busy.current = false; setFinishing(false); }
  };

  const messages: ChatMessage[] = [
    ...turns.map((t): ChatMessage => ({
      id: t.id, role: t.role === "you" ? "user" : "assistant", text: t.kind === "event" ? `**Live:** ${t.text}` : t.text,
      className: t.kind === "event" ? "cw-turn-event" : undefined, who: t.role === "you" ? undefined : { name: "Interviewer", key: "interviewer" },
      after: t.refs?.length ? <div className="cw-chips">{t.refs.map((r, i) => <button key={i} type="button" className="cw-chip" title={r.path} onClick={() => onOpen(r)}>{refToken({ ...r, path: r.path.split("/").pop() || r.path }).slice(1, -1)}</button>)}</div> : undefined,
    })),
    ...(pending ? [{ id: "pending", role: "user" as const, text: pending }] : []),
  ];
  const yours = turns.filter((t) => t.role === "you").length;
  return (
    <>
      {!turns.length && pending === null && (
        <div className="active-notes" onClick={(e) => e.stopPropagation()}>
          <p className="coach-empty">Talk the interviewer through this code as you would in a practical round. Use the mic or type below, then press Enter: they ask a follow-up, or tell you something that has just happened in production. Or let them open.</p>
          <p className="cw-note">Finish whenever you like for an informal debrief. Nothing here is scored, and the interviewer never gives you the answer.</p>
          {open && <button className="button is-primary is-small" type="button" disabled={disabled} onClick={() => { void say("").catch(() => {}); }}>Start the interview</button>}
        </div>
      )}
      <div className="run-chat-host" onClick={(e) => e.stopPropagation()}>
        <Chat className="run-chat" messages={messages} running={pending !== null} disabled={disabled || finishing || !open} composer={open}
          inputId="cw-interview-input" holdMic placeholder="Talk it through, then press Enter" label="What you say to the interviewer" typingLabel="The interviewer is thinking"
          onSend={say} />
      </div>
      {open && yours > 0 && <div className="coach-actions" onClick={(e) => e.stopPropagation()}>
        <button className="button is-small" type="button" disabled={finishing || pending !== null} onClick={finish}>{finishing ? "Writing the debrief…" : "Finish and debrief"}</button>
      </div>}
    </>
  );
}
