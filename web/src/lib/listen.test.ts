import { describe, expect, it } from "vitest";
import { encodeWav, RATE, Segmenter, SEGMENT_DEFAULTS, toBase64, type Clip } from "./listen";

const FRAME = 512, MS = (FRAME / RATE) * 1000;   // 32 ms
const frame = (t: number, prob: number) => ({ t, prob, samples: new Float32Array(FRAME).fill(prob >= 0.5 ? 0.5 : 0) });

// Feeds `plan` ("s" speech, "." silence, one char per frame group of `step` ms) and returns every clip with the stream end.
function run(plan: [string, number][], opts = SEGMENT_DEFAULTS, flush = true) {
  const seg = new Segmenter(opts);
  const clips: Clip[] = [];
  let t = 0;
  for (const [kind, ms] of plan) for (let n = Math.round(ms / MS); n > 0; n--, t += MS) clips.push(...seg.push(frame(t, kind === "s" ? 0.9 : 0.05)));
  if (flush) { const c = seg.flush(); if (c) clips.push(c); }
  return { clips, end: t };
}
const len = (c: Clip) => c.t1 - c.t0;
const near = (a: number, b: number, tol = 2 * MS) => Math.abs(a - b) <= tol;

describe("Segmenter", () => {
  it("uploads nothing for silence or noise, however long", () => {
    expect(run([[".", 600_000]]).clips).toEqual([]);
  });
  it("keeps about a second before the first word and two seconds after the last", () => {
    const { clips } = run([[".", 10_000], ["s", 3_000], [".", 10_000]]);
    expect(clips).toHaveLength(1);
    expect(near(clips[0].t0, 9_000)).toBe(true);        // speech starts at 10 s
    expect(near(clips[0].t1, 15_000)).toBe(true);       // speech ends at 13 s, plus the 2 s tail
    expect(near(clips[0].speechMs, 3_000)).toBe(true);
  });
  it("joins utterances under 3 s apart and splits them at 3 s or more", () => {
    const joined = run([["s", 2_000], [".", 2_500], ["s", 2_000], [".", 5_000]]);
    expect(joined.clips).toHaveLength(1);
    expect(near(len(joined.clips[0]), 2_000 + 2_500 + 2_000 + 2_000)).toBe(true);
    const split = run([["s", 2_000], [".", 4_000], ["s", 2_000], [".", 5_000]]);
    expect(split.clips).toHaveLength(2);
    expect(split.clips[0].t1).toBeLessThanOrEqual(split.clips[1].t0 + 1);
  });
  it("closes the clip as soon as the silence is long enough, not at the end of the stream", () => {
    const { clips } = run([["s", 2_000], [".", 20_000]], SEGMENT_DEFAULTS, false);
    expect(clips).toHaveLength(1);
  });
  it("drops a blip with under half a second of speech", () => {
    expect(run([[".", 2_000], ["s", 300], [".", 5_000]]).clips).toEqual([]);
    expect(run([[".", 2_000], ["s", 700], [".", 5_000]]).clips).toHaveLength(1);
  });
  it("past 60 s closes at the next pause, and 120 s is a hard cut", () => {
    // Talking with a 0.7 s breath every 10 s: the first breath after 60 s closes the clip.
    const talk: [string, number][] = [];
    for (let i = 0; i < 9; i++) talk.push(["s", 10_000], [".", 700]);
    const soft = run(talk);
    expect(near(len(soft.clips[0]), 61_400, 3_000)).toBe(true);
    const hard = run([["s", 130_000]]);
    expect(hard.clips.length).toBeGreaterThanOrEqual(2);
    expect(hard.clips.every((c) => len(c) <= 120_000 + MS)).toBe(true);
  });
  it("flush closes an open clip now and is a no-op when nothing is open", () => {
    const seg = new Segmenter();
    expect(seg.flush()).toBeNull();
    for (let i = 0; i < 40; i++) seg.push(frame(i * MS, 0.9));
    expect(seg.isOpen).toBe(true);
    expect(seg.flush()?.samples.length).toBe(40 * FRAME);
    expect(seg.isOpen).toBe(false);
  });
  it("hands back every sample of the frames it kept", () => {
    const { clips } = run([["s", 1_000], [".", 5_000]]);
    expect(clips[0].samples.length).toBe(Math.round(len(clips[0]) / MS) * FRAME);
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit mono 16 kHz header and clipped little-endian samples", () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 2, 0.5]));
    const v = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.length).toBe(44 + 10);
    expect(v.getUint32(4, true)).toBe(wav.length - 8);
    expect([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, 1, 16_000, 16]);
    expect(v.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 32767, 16384]);
  });
  it("is about 2 MB a minute", () => {
    expect(encodeWav(new Float32Array(RATE * 60)).length).toBe(44 + RATE * 60 * 2);
  });
});

describe("toBase64", () => {
  it("round-trips a buffer larger than one chunk", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
    expect(Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0))).toEqual(bytes);
  });
});
