"use client";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { Chat, type ChatMessage, type ChatPart, type ToolRenderer } from "@/components/chat/Chat";
import { streamApi } from "@/lib/api";

// The tutor's conversation on the shared chat. The legacy tutor (src/legacy/tutor.js) keeps the session's frame: the
// entry card, objectives and the stage beside the chat, where whiteboards, activities and designs live. This draws the
// turns, streams each reply as it is written, and hands the stored session back to the frame when it lands. Starting a
// session, a turn, and ending one (the debrief) all stream; the stored turn then replaces the preview.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type TutorChatProps = {
  session: Any;
  cast: (id: string) => { name: string; role?: string } | undefined;
  blocks: { key: string; title?: string; prompt?: string }[];
  next?: { title: string } | null;
  onSession: (s: Any) => void;       // a stored session arrived (a turn, a start, an end)
  showStage: (id: string) => void;   // bring a whiteboard, activity or design forward on the stage
  onMove: (move: Any) => void;       // carry the conversation into another lesson
  onAct: (action: "end" | "go-next" | "close" | "again") => void;
  review?: boolean;                  // an overview's check: no debrief or end-of-session card, its own prompt
};
export type TutorChatHandle = {
  send: (body: Any) => Promise<Any>;
  start: (body: Any) => Promise<Any>;
  end: () => Promise<Any>;
};

const rid = () => "k" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const plain = (t: string) => String(t || "").replace(/[*`]/g, "").slice(0, 48);
const MARKERS: [RegExp, (m: RegExpMatchArray) => ChatPart][] = [
  [/^activity\s+(b\d+)$/i, (m) => ({ tool: "pending", args: { text: "Bringing in an activity…", key: m[1] } })],
  [/^play\s+(r\d+)$/i, () => ({ tool: "pending", args: { text: "Finding something to play…" } })],
  [/^(move|next)\s+([a-z-]+)\s*\/\s*([a-z0-9-]+)/i, () => ({ tool: "pending", args: { text: "Suggesting where to go next…" } })],
  [/^note\s+/i, () => ({ tool: "noted", args: {} })],
];
const WIDGET: Record<string, string> = { diagram: "Drawing on the whiteboard…", mermaid: "Drawing on the whiteboard…", design: "Setting up the simulator…" };

// The parts a stored tutor turn brings: cards that open its stage items, links, and a move. Ids match tutor.js's stage.
export function turnParts(turn: Any, at: number, blocks: TutorChatProps["blocks"]): ChatPart[] {
  const parts: ChatPart[] = [];
  (turn.boards || []).forEach((d: Any, i: number) => parts.push({ tool: "stage", args: { id: `wb${at}-${i}`, label: `Whiteboard: ${d.title || "sketch"}` } }));
  (turn.designs || []).forEach((d: Any, i: number) => parts.push({ tool: "stage", args: { id: `ds${at}-${i}`, label: `Simulator: ${d.title}` } }));
  if (turn.show_block) {
    const b = blocks.find((x) => x.key === turn.show_block);
    parts.push({ tool: "stage", args: { id: `ac${at}`, label: `Activity: ${plain(b?.title || b?.prompt || "try it")}` } });
  }
  if (turn.links?.length) parts.push({ tool: "links", args: { links: turn.links } });
  if (turn.move) parts.push({ tool: "move", args: turn.move });
  const r = turn.recorded || {};
  const seen = (r.evidence || 0) + (r.misconceptions || 0) + (r.resolved || 0);
  if (seen) parts.push({ tool: "recorded", args: { n: seen } });
  return parts;
}

export function turnsToMessages(session: Any, cast: TutorChatProps["cast"], blocks: TutorChatProps["blocks"], review = false): ChatMessage[] {
  return (session?.turns || []).map((t: Any, i: number): ChatMessage | null => {
    const id = `t${i}`;
    if (t.role === "learner") return { id, role: "user", text: t.text };
    if (t.role === "block") return { id, role: "note", text: t.correct ? "You got the activity right." : "You missed the activity." };
    if (review && t.debrief) return null;
    if (t.role === "run") return { id, role: "note", text: `You ran the design in the simulator: ${Number(t.availability || 0).toFixed(2)}% availability.` };
    const who = t.debrief ? { name: "Tutor", role: "Debrief" } : t.speaker === "tutor" ? { name: "Tutor" } : (cast(t.speaker) || { name: t.speaker });
    return { id, role: "assistant", text: t.say || "", who: { ...who, key: t.speaker }, parts: turnParts(t, i, blocks), className: t.debrief ? "tu-debrief" : "" };
  }).filter((m: ChatMessage | null): m is ChatMessage => m !== null);
}

type Preview = { text: string; parts: ChatPart[]; mine?: string; speaker: string };

function TutorChatView({ props, handle }: { props: TutorChatProps; handle: Ref<TutorChatHandle> }) {
  const { session, cast, blocks } = props;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Any>(null);
  const live = useRef(props);
  live.current = props;
  const box = () => document.querySelector<HTMLTextAreaElement>(".tu-convo .ch-input");

  const lastSpeaker = () => { const turns = live.current.session?.turns || []; for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "tutor") return turns[i].speaker; return "tutor"; };
  const run = async (path: string, body: Any, mine: string | undefined, speaker: string) => {
    setBusy(true); setError("");
    setPreview({ text: "", parts: [], mine, speaker });
    let shown = { text: "", parts: [] as ChatPart[] };
    try {
      let stored: Any = null;
      await streamApi(path, body, (e: Any) => {
        if (e.type === "text") shown = { ...shown, text: shown.text + e.text };
        else if (e.type === "reset") shown = { text: "", parts: [] };
        else if (e.type === "widget") shown = { ...shown, parts: [...shown.parts, { tool: "pending", args: { text: WIDGET[e.kind] || "One moment…" } }] };
        else if (e.type === "marker") { const hit = MARKERS.find(([re]) => re.test(e.text)); if (hit) shown = { ...shown, parts: [...shown.parts, hit[1](e.text.match(hit[0])!)] }; }
        else if (e.type === "done") stored = e.session ?? e;
        if (e.type !== "done") setPreview({ ...shown, mine, speaker });
      });
      setPreview(null);
      if (stored) {
        live.current.onSession(stored);
        if (stored.error) setError(stored.error); else pending.current = null;
      }
      return stored;
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
      (window as Any).Dictate?.resume?.(box());   // the mic, if it was on, comes back on with the reply
    }
  };
  const turn = (body: Any, retry = false) => {
    if (!retry) pending.current = { ...body, key: rid() };
    return run(`/tutor/sessions/${live.current.session.id}/turns`, pending.current, retry ? undefined : body.text, lastSpeaker());
  };
  useImperativeHandle(handle, () => ({
    send: (body) => turn(body),
    start: (body) => run("/tutor/sessions", body, undefined, ({ explain: "jo", critique: "marcus", "war-room": "priya", interview: "marcus", cv: "marcus" } as Any)[body.mode] || "tutor"),
    end: () => run(`/tutor/sessions/${live.current.session.id}/end`, {}, undefined, "tutor"),
  }));

  const messages = useMemo(() => {
    const out = turnsToMessages(session, cast, blocks, props.review);
    if (preview?.mine) out.push({ id: "mine", role: "user", text: preview.mine });
    if (preview) {
      const who = preview.speaker === "tutor" ? { name: "Tutor" } : (cast(preview.speaker) || { name: preview.speaker });
      out.push({ id: "preview", role: "assistant", text: preview.text, parts: preview.parts, streaming: true, who: { ...who, key: preview.speaker } });
    }
    return out;
  }, [session, cast, blocks, preview, props.review]);

  const tools = useMemo<Record<string, ToolRenderer>>(() => ({
    stage: (a) => <button type="button" className="tu-chip" data-stage-chip={String(a.id)} onClick={() => {
      live.current.showStage(String(a.id));
      if (window.matchMedia?.("(max-width: 1000px)").matches) document.querySelector(".tu-stage")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }}><span aria-hidden="true">▸</span> {String(a.label)}</button>,
    links: (a) => <div className="tu-links">{(a.links as Any[]).map((l, i) => <a key={i} className={`tu-link is-${l.kind}`} href={l.href}><span>{({ game: "Play in Ripple Ops", design: "Worked design", internals: "Simulator" } as Any)[l.kind] || "Open"}</span><b>{l.title} →</b></a>)}</div>,
    move: (a) => <div className="tu-move"><button type="button" className="button is-primary" onClick={() => live.current.onMove(a)}>Carry on in {String(a.title)} →</button></div>,
    pending: (a) => <div className="ch-card is-pending">{String(a.text)}</div>,
    noted: () => <span className="ch-chip">Noted</span>,
    recorded: (a) => <span className="ch-chip" title="What this turn showed went into your knowledge model">Recorded {Number(a.n)} {Number(a.n) === 1 ? "thing" : "things"} you showed</span>,
  }), []);

  const ended = session?.status === "ended";
  const act = (a: TutorChatProps["onAct"] extends (x: infer X) => void ? X : never) => () => live.current.onAct(a);
  const status = error ? (
    <p className="tu-status is-error" role="status">{error}{pending.current && !busy && <button type="button" className="button" onClick={() => { turn(null, true).catch(() => {}); }}>Try again</button>}</p>
  ) : ended && !busy && !props.review ? (
    <div className="tu-wrap"><b>Session ended.</b> {session.progress.demonstrated} of {session.progress.total} objectives shown. What you showed is now in your knowledge model.
      <div className="sd-actions">
        {session.debrief_due ? <button type="button" className="button is-primary" onClick={act("end")}>Write the debrief</button>
          : props.next ? <button type="button" className="button is-primary" onClick={act("go-next")}>Next: {props.next.title} →</button> : null}
        <button type="button" className={`button${!session.debrief_due && !props.next ? " is-primary" : ""}`} onClick={act("close")}>Back to the lesson</button>
        <button type="button" className="button" onClick={act("again")}>Another session</button>
      </div></div>
  ) : null;

  return (
    <Chat className="tu-thread" messages={messages} running={busy} tools={tools} status={status} composer={!ended}
      disabled={!session?.id}
      placeholder={props.review ? "Answer in your own words. It's fine to say you don't know." : "Answer, ask, or think out loud…"} label={props.review ? "Your answer" : "Your reply"} typingLabel="The tutor is thinking"
      onSend={async (text) => { await (window as Any).Dictate?.hold?.(box()); await turn({ text }); }} />
  );
}

// Mounted by tutor.js (through the bridge): update() redraws with the frame's latest state; unmount() before the frame
// replaces its markup.
export function mountTutorChat(el: HTMLElement, props: TutorChatProps) {
  const root = createRoot(el);
  const ref: { current: TutorChatHandle | null } = { current: null };
  let ready: () => void;
  const mounted = new Promise<void>((r) => { ready = r; });
  function Host({ p }: { p: TutorChatProps }) {
    useEffect(() => { ready(); }, []);
    return <TutorChatView props={p} handle={ref} />;
  }
  const render = (p: TutorChatProps) => root.render(<Host p={p} />);
  render(props);
  const call = <K extends keyof TutorChatHandle>(k: K) => async (...args: Parameters<TutorChatHandle[K]>) => { await mounted; return (ref.current![k] as Any)(...args); };
  return { update: render, unmount: () => root.unmount(), send: call("send"), start: call("start"), end: call("end") };
}
