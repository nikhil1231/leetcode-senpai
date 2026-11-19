// Background listening: keeps the stretches where you speak, as short WAV clips, and hands each to a sink as soon
// as it closes. Nothing is kept or sent until there is speech. Silero VAD (@ricky0123/vad-web) owns the mic and
// reports a speech probability for every 32 ms frame; the Segmenter below decides where a clip starts and ends, so
// that logic is pure and tested (listen.test.ts). The module knows nothing about LeetCode: the caller supplies a clock
// and a sink.

export const RATE = 16_000;

export interface Frame { t: number; prob: number; samples: Float32Array }   // t: ms on the caller's clock, at the frame's start
export interface Clip { t0: number; t1: number; speechMs: number; samples: Float32Array }
export interface SegmentOpts {
  threshold: number;      // probability at or above which a frame is speech
  preRollMs: number;      // silence kept before the first word
  tailMs: number;         // silence kept after the last word
  joinGapMs: number;      // utterances closer than this stay in one clip; a longer silence closes it
  softCapMs: number;      // past this, the clip closes at the next pause
  pauseMs: number;        // the silence that counts as a pause for the soft cap
  hardCapMs: number;      // a clip never runs longer than this
  minSpeechMs: number;    // clips with less actual speech are dropped
}
// Constants to tune on real transcripts.
export const SEGMENT_DEFAULTS: SegmentOpts = {
  threshold: 0.5, preRollMs: 1_000, tailMs: 2_000, joinGapMs: 3_000, softCapMs: 60_000, pauseMs: 600, hardCapMs: 120_000, minSpeechMs: 500,
};

const frameMs = (f: Frame) => (f.samples.length / RATE) * 1000;

export class Segmenter {
  private pre: Frame[] = [];
  private open: Frame[] = [];
  private speechMs = 0;
  private lastSpeechEnd = 0;
  constructor(private o: SegmentOpts = SEGMENT_DEFAULTS) {}

  get isOpen() { return this.open.length > 0; }

  /** Feeds one frame; returns the clips it closed (usually none). */
  push(f: Frame): Clip[] {
    const end = f.t + frameMs(f);
    const speech = f.prob >= this.o.threshold;
    if (!this.open.length) {
      if (!speech) {
        this.pre.push(f);
        while (this.pre.length > 1 && end - this.pre[0].t > this.o.preRollMs + frameMs(f)) this.pre.shift();
        return [];
      }
      this.open = [...this.pre, f]; this.pre = [];
      this.speechMs = frameMs(f); this.lastSpeechEnd = end;
      return [];
    }
    this.open.push(f);
    if (speech) { this.speechMs += frameMs(f); this.lastSpeechEnd = end; }
    const silence = end - this.lastSpeechEnd, length = end - this.open[0].t;
    if (length >= this.o.hardCapMs || silence >= this.o.joinGapMs || (length >= this.o.softCapMs && silence >= this.o.pauseMs)) {
      const clip = this.close();
      return clip ? [clip] : [];
    }
    return [];
  }

  /** Closes whatever is open now (a submit is waiting, or the listener is pausing). */
  flush(): Clip | null { this.pre = []; return this.open.length ? this.close() : null; }

  private close(): Clip | null {
    let frames = this.open;
    const speechMs = this.speechMs;
    this.open = []; this.speechMs = 0;
    // Trim the silence after the last word to the tail.
    const keepUntil = this.lastSpeechEnd + this.o.tailMs;
    while (frames.length > 1 && frames[frames.length - 1].t >= keepUntil) frames = frames.slice(0, -1);
    if (speechMs < this.o.minSpeechMs) return null;
    const last = frames[frames.length - 1];
    const samples = new Float32Array(frames.reduce((n, f) => n + f.samples.length, 0));
    let at = 0;
    for (const f of frames) { samples.set(f.samples, at); at += f.samples.length; }
    return { t0: frames[0].t, t1: last.t + frameMs(last), speechMs, samples };
  }
}

/** 16-bit PCM mono WAV (~32 KB a second): no encoder dependency, and the transcription model takes it. */
export function encodeWav(samples: Float32Array, rate = RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Whether this browser can capture the mic at all; the toggle isn't shown otherwise. */
export const listenSupported = () =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined" && typeof WebAssembly !== "undefined";

export interface ListenerOpts {
  clock: () => number;                                          // ms; the same clock the sink's times are on
  sink: (wav: Uint8Array, t0: number, t1: number) => Promise<unknown>;
  onSpeaking?: (on: boolean) => void;
  segment?: Partial<SegmentOpts>;
}
export interface Listener {
  start: () => Promise<void>;                                   // rejects if the VAD or the mic can't start
  pause: () => Promise<void>;                                   // releases the mic, closing any open clip
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  /** Closes any open clip and waits for clips in flight, at most `ms`: a submit shouldn't wait longer. */
  settle: (ms?: number) => Promise<void>;
  readonly listening: boolean;
}

export function createListener(o: ListenerOpts): Listener {
  const seg = new Segmenter({ ...SEGMENT_DEFAULTS, ...o.segment });
  const inflight = new Set<Promise<unknown>>();
  let vad: { start: () => Promise<void>; pause: () => Promise<void>; destroy: () => Promise<void> } | null = null;
  let loading: Promise<void> | null = null;
  let speaking = false, running = false;

  const speak = (on: boolean) => { if (on !== speaking) { speaking = on; o.onSpeaking?.(on); } };
  const emit = (clip: Clip | null) => {
    if (!clip) return;
    const p = Promise.resolve().then(() => o.sink(encodeWav(clip.samples), clip.t0, clip.t1)).catch(() => {});
    inflight.add(p); void p.finally(() => inflight.delete(p));
  };
  const close = () => { emit(seg.flush()); speak(false); };

  async function load() {
    const { MicVAD } = await import("@ricky0123/vad-web");
    vad = await MicVAD.new({
      model: "v5", baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/", startOnLoad: false,
      // The VAD's own speech start/end are unused: the Segmenter decides where clips begin and end.
      onFrameProcessed: (p, frame) => {
        const t = o.clock() - (frame.length / RATE) * 1000;
        speak(p.isSpeech >= (o.segment?.threshold ?? SEGMENT_DEFAULTS.threshold));
        for (const clip of seg.push({ t, prob: p.isSpeech, samples: frame })) emit(clip);
      },
      getStream: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
      ortConfig: (ort) => { ort.env.wasm.numThreads = 1; },
    });
  }

  return {
    async start() { loading ??= load().catch((e) => { loading = null; throw e; }); await loading; await vad!.start(); running = true; },
    async pause() { running = false; close(); await vad?.pause(); },
    async resume() { if (vad && !running) { await vad.start(); running = true; } },
    async stop() { running = false; close(); await vad?.destroy().catch(() => {}); vad = null; loading = null; await this.settle(); },
    async settle(ms = 5_000) {
      close();
      if (inflight.size) await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, ms))]);
    },
    get listening() { return running; },
  };
}
