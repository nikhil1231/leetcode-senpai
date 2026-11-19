import { create } from "zustand";
import { api } from "./api";
import { createListener, toBase64, type Listener } from "./listen";

// Background voice capture for a solve (server/recording.py `speech`). One listener lives across the planning modal and
// the editor, so it belongs here rather than to either. Clips are stamped with the wall clock; the editor says how to
// turn that into the run's clock (negative while planning, before the run existed), and a clip made before the run has
// a session id waits in memory until it has one. Only transcripts are kept server side, never audio.
const ON_KEY = "voice:on:v1", POS_KEY = "voice:pos:v1";
const BUFFER_MAX = 24;               // clips held while planning: ~12 minutes of talk
const RETRY_MS = 2_000;

export interface SpeechTarget { sessionId: string; toRunMs: (wall: number) => number }
type Status = "off" | "starting" | "listening" | "error";
export interface Pos { x: number; y: number }
interface VoiceState {
  on: boolean; status: Status; speaking: boolean; paused: boolean; error: string | null; pos: Pos | null;
  hydrate: () => void; setOn: (on: boolean) => void; setPos: (p: Pos) => void;
}
const read = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* per-browser preference only */ } };

export const useVoice = create<VoiceState>((set) => ({
  on: false, status: "off", speaking: false, paused: false, error: null, pos: null,
  hydrate: () => set({ on: read<boolean>(ON_KEY) === true, pos: read<Pos>(POS_KEY) }),
  setOn: (on) => { write(ON_KEY, on); set({ on, error: null }); },
  setPos: (pos) => { write(POS_KEY, pos); set({ pos }); },
}));
const patch = (p: Partial<VoiceState>) => useVoice.setState(p);

interface Pending { wav: Uint8Array; t0: number; t1: number }
let listener: Listener | null = null;
let starting: Promise<void> | null = null;
let target: (() => SpeechTarget | null) | null = null;
let buffer: Pending[] = [];
let retry: ReturnType<typeof setTimeout> | null = null;

/** The editor registers how to reach its run; null when it unmounts. */
export function setSpeechTarget(fn: (() => SpeechTarget | null) | null) { target = fn; if (fn) void flushBuffer(); }

async function upload(c: Pending, tgt: SpeechTarget) {
  const body = { session_id: tgt.sessionId, t: Math.round(tgt.toRunMs(c.t0)), dur: Math.max(1, Math.round(c.t1 - c.t0)), audio: toBase64(c.wav) };
  try { await api("/editor/speech", "POST", body); } catch { await api("/editor/speech", "POST", body).catch(() => {}); }   // one retry, then it's lost
}

async function flushBuffer() {
  if (retry) { clearTimeout(retry); retry = null; }
  const tgt = target?.();
  if (tgt) { const take = buffer; buffer = []; for (const c of take) await upload(c, tgt); }
  if (buffer.length) retry = setTimeout(() => void flushBuffer(), RETRY_MS);
}

async function sink(wav: Uint8Array, t0: number, t1: number) {
  const tgt = target?.();
  if (tgt) return upload({ wav, t0, t1 }, tgt);
  buffer.push({ wav, t0, t1 });
  if (buffer.length > BUFFER_MAX) buffer.shift();
  if (!retry) retry = setTimeout(() => void flushBuffer(), RETRY_MS);
}

export function discardVoiceBuffer() { buffer = []; if (retry) { clearTimeout(retry); retry = null; } }

export async function startVoice() {
  if (listener) return starting ?? undefined;
  const l = createListener({ clock: Date.now, sink, onSpeaking: (speaking) => patch({ speaking }) });
  listener = l;
  patch({ status: "starting", error: null });
  starting = l.start().then(
    () => { if (listener === l) patch({ status: "listening", paused: false }); },
    (e: unknown) => {
      if (listener === l) listener = null;
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      useVoice.getState().setOn(false);
      patch({ status: "error", speaking: false, error: denied ? "Microphone access is blocked for this site." : "Voice capture isn't available." });
    },
  ).finally(() => { starting = null; });
  return starting;
}

export async function stopVoice() {
  const l = listener; listener = null;
  patch({ status: "off", speaking: false, paused: false });
  await l?.stop();
  void flushBuffer();
}

/** Off the mic while the solve is paused or another dictation is listening, so no words are transcribed twice. */
export async function pauseVoice() { if (listener?.listening) { patch({ paused: true, speaking: false }); await listener.pause(); } }
export async function resumeVoice() { if (listener && !listener.listening) { patch({ paused: false }); await listener.resume().catch(() => {}); } }

/** A submit, give-up or end calls this first: the open clip closes and uploads, waiting no more than `ms`. */
export async function settleVoice(ms = 3_000) { if (listener) await listener.settle(ms); await Promise.race([flushBuffer(), new Promise((r) => setTimeout(r, ms))]); }
