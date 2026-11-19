"use client";
import { useEffect, useRef, useState } from "react";
import { listenSupported } from "@/lib/listen";
import { useOverview } from "@/lib/queries";
import { useRun } from "@/lib/run-store";
import { useToast } from "@/lib/toast";
import { discardVoiceBuffer, pauseVoice, resumeVoice, startVoice, stopVoice, useVoice, type Pos } from "@/lib/voice";

// The mic for background voice capture (lib/voice.ts): a round button you can drag anywhere, shown only while a solve is
// being planned or run, and only where the browser can capture audio and the coach can transcribe. One instance is
// mounted by FlowHost above both the planning modal and the editor, so the listener and the button's place carry across.
const SIZE = 48, MARGIN = 12, LEAVE_MS = 3_000, DRAG_PX = 4;
const clamp = (p: Pos): Pos => ({
  x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - SIZE - MARGIN)),
  y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - SIZE - MARGIN)),
});

export function VoiceFab({ planning }: { planning: boolean }) {
  const toast = useToast();
  const llm = useOverview().data?.llm_enabled ?? false;
  const active = useRun((s) => s.active);
  const { on, status, speaking, paused, error, pos } = useVoice();
  const [supported, setSupported] = useState(false);
  const [, bump] = useState(0);
  const drag = useRef<{ dx: number; dy: number; x0: number; y0: number; moved: boolean } | null>(null);
  const solving = !!active && active.surface === "editor";
  const visible = supported && llm && (planning || solving);

  useEffect(() => { useVoice.getState().hydrate(); setSupported(listenSupported()); }, []);
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  // Listening follows the button and where you are. Leaving the solve stops it only after a moment: the planning modal
  // closes a beat before the run exists, and the mic shouldn't flicker off between them.
  useEffect(() => {
    if (visible && on) { void startVoice(); return; }
    const t = setTimeout(() => { void stopVoice(); if (!visible) discardVoiceBuffer(); }, visible ? 0 : LEAVE_MS);
    return () => clearTimeout(t);
  }, [visible, on]);
  useEffect(() => () => { void stopVoice(); discardVoiceBuffer(); }, []);

  // Off while the timer is paused, and while dictation (which hears the same words) is listening.
  const [dictating, setDictating] = useState(false);
  useEffect(() => {
    const f = () => setDictating(!!(window as unknown as { Dictate?: { isListening?: () => boolean } }).Dictate?.isListening?.());
    window.addEventListener("dictate-state", f); return () => window.removeEventListener("dictate-state", f);
  }, []);
  const hold = dictating || !!active?.is_paused;
  useEffect(() => { void (hold ? pauseVoice() : resumeVoice()); }, [hold, status]);

  useEffect(() => { if (error) toast(error); }, [error, toast]);

  if (!visible) return null;
  const place = pos ? clamp(pos) : null;
  const style = place ? { left: place.x, top: place.y } : undefined;
  const state = status === "error" ? "error" : !on ? "off" : status === "starting" ? "starting" : hold || paused ? "held" : speaking ? "speaking" : "listening";
  const label = { off: "Voice capture is off. Turn it on to record what you say while you solve.", starting: "Starting the microphone…",
    held: dictating ? "Voice capture is paused while you dictate." : "Voice capture is paused with the timer.",
    speaking: "Hearing you. Click to turn voice capture off.", listening: "Listening for speech. Click to turn voice capture off.",
    error: "Voice capture isn't available. Click to try again." }[state];

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_PX) return;
    d.moved = true;
    useVoice.setState({ pos: clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }) });
  };
  const onPointerUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.moved) { const p = useVoice.getState().pos; if (p) useVoice.getState().setPos(p); return; }
    useVoice.getState().setOn(status === "error" ? true : !on);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); useVoice.getState().setOn(status === "error" ? true : !on); }
  };

  return (
    <button type="button" id="voice-fab" className={`voice-fab is-${state}`} style={style} aria-pressed={on && status !== "error"} aria-label={label} title={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }} onKeyDown={onKeyDown} onClick={(e) => e.preventDefault()}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
        {state === "off" && <path d="M4 4l16 16" />}
      </svg>
      {state === "speaking" && <span className="voice-dot" />}
    </button>
  );
}
