import { api } from "@/lib/api";
import { diff } from "./diff";

// The run's change log (server/recording.py). Every TICK_MS the buffer is compared with what was last logged; only a
// change becomes an event, so minutes spent thinking log nothing. Unsent events live in localStorage until the server
// has them: a reload, a crash or a dropped request loses no code, and any still unsent ride along with the next Run or
// Submit, so the log always holds what led to the code being judged. A new run opens before the server has it (no
// session id) and nothing is sent until `ready`.
export const TICK_MS = 10_000;
export const FLUSH_MS = 30_000;
const STORE_PREFIX = "editor-run:v1:";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Event = Record<string, any>;
interface Inflight { seq: number; events: Event[] }
interface Saved { code: string; lastLogged: string; queue: Event[]; inflight: Inflight | null; seq: number; input: string; checked: string[]; lastRunCode: string | null; submits: number }

export class EditorRun {
  sessionId: string | null;
  slug: string;
  startedAtMs: number;
  offsetMs = 0;
  lastLogged = "";
  queue: Event[] = [];
  inflight: Inflight | null = null;
  seq = 0;
  chain: Promise<unknown> = Promise.resolve();
  input = "";
  checked: string[] = [];
  lastRunCode: string | null = null;
  submits = 0;
  finished = false;
  truncated = false;
  ready: Promise<void>;
  private settle!: { resolve: () => void; reject: (e: Error) => void };
  getCode: () => string | null = () => null;

  constructor(sessionId: string | null, slug: string, startedAtSec: number) {
    this.sessionId = sessionId; this.slug = slug; this.startedAtMs = startedAtSec * 1000;
    this.ready = sessionId ? Promise.resolve() : new Promise((resolve, reject) => { this.settle = { resolve, reject }; });
    this.ready.catch(() => {});
  }

  nowMs() { return Math.max(0, Date.now() - this.startedAtMs + this.offsetMs); }
  currentCode() { return this.getCode() ?? this.lastLogged; }

  adopt(sessionId: string, startedAtSec: number, serverNowMs?: number | null) {
    this.sessionId = sessionId; this.startedAtMs = startedAtSec * 1000;
    if (serverNowMs != null) this.offsetMs = serverNowMs - (Date.now() - this.startedAtMs);
    this.settle?.resolve();
    this.persist();
  }
  abandon() { if (!this.sessionId) this.settle?.reject(new Error("The run didn't start.")); }

  persist() {
    // A finished run's draft has no future; a pending one has no key yet (adoption writes it).
    if (this.finished || !this.sessionId) return;
    try {
      const saved: Saved = { code: this.currentCode(), lastLogged: this.lastLogged, queue: this.queue, inflight: this.inflight, seq: this.seq,
        input: this.input, checked: this.checked, lastRunCode: this.lastRunCode, submits: this.submits };
      localStorage.setItem(STORE_PREFIX + this.sessionId, JSON.stringify(saved));
    } catch { /* storage full or blocked: the server copy still stands */ }
  }
  static restore(sessionId: string): Saved | null { try { return JSON.parse(localStorage.getItem(STORE_PREFIX + sessionId) || "null"); } catch { return null; } }
  static forget(sessionId: string) { try { localStorage.removeItem(STORE_PREFIX + sessionId); } catch { /* ignore */ } }

  tick() {
    const code = this.currentCode();
    const d = diff(this.lastLogged, code);
    if (!d) return;
    // A change as big as the file itself is logged as the file.
    this.queue.push(d.s.length >= code.length && code.length ? { t: this.nowMs(), k: "c", code } : { t: this.nowMs(), k: "d", ...d });
    this.lastLogged = code;
    this.persist();
  }
  note(kind: string, extra: Event = {}) { this.queue.push({ t: this.nowMs(), k: kind, ...extra }); this.persist(); }

  // One request at a time, in order: a log flush racing a judging would let a later delta land before the run it
  // follows. None before the run has an id.
  send<T>(fn: () => Promise<T>): Promise<T> {
    const next = (this.sessionId ? this.chain : this.chain.then(() => this.ready)).then(fn);
    this.chain = next.catch(() => {});
    return next;
  }

  // Sends the batch in flight (retrying the very same one, so the server's seq check can drop a duplicate), else the
  // queue as a new batch. Returns true when the server said its log is full.
  async flushOnce(): Promise<boolean> {
    if (!this.inflight) {
      if (!this.queue.length) return false;
      this.inflight = { seq: this.seq + 1, events: this.queue.splice(0) };
      this.persist();
    }
    const res = await api("/editor/log", "POST", { session_id: this.sessionId, ...this.inflight });
    this.seq = this.inflight.seq; this.inflight = null; this.persist();
    return Boolean(res?.truncated);
  }
  flush(onTruncated?: () => void): Promise<void> {
    return this.send(async () => {
      try {
        if (await this.flushOnce()) onTruncated?.();
        if (this.queue.length) await this.flushOnce();
      } catch { /* kept in storage; the next flush retries */ }
    }).catch(() => { /* the run never started: nothing to send */ });
  }

  // A submit goes on your LeetCode record and a wrong one counts against the solve, so one made without testing gets
  // a second look: code never Run as it stands, or (before the first submit) planned edge cases left unticked.
  submitDoubts(edges: string[], runsLeft: number | null): string[] {
    const doubts: string[] = [];
    if (this.lastRunCode !== this.lastLogged && runsLeft !== 0) doubts.push("You haven't run this version of the code.");
    const open = edges.filter((c) => !this.checked.includes(c));
    if (!this.submits && open.length) doubts.push(`Planned edge cases not ticked: ${open.join(", ")}.`);
    return doubts;
  }

  // Sends any batch pending with the judging request, so the log always holds what led to the code being judged.
  async judge(kind: "run" | "submit", dataInput: string) {
    const code = this.lastLogged;
    return this.send(async () => {
      if (this.inflight) await this.flushOnce();
      if (this.queue.length) { this.inflight = { seq: this.seq + 1, events: this.queue.splice(0) }; this.persist(); }
      const res = await api(`/editor/${kind}`, "POST", {
        session_id: this.sessionId, code, data_input: dataInput, t: this.nowMs(),
        seq: this.inflight ? this.inflight.seq : null, events: this.inflight ? this.inflight.events : [],
      });
      if (this.inflight) { this.seq = this.inflight.seq; this.inflight = null; this.persist(); }
      return { res, code };
    });
  }
}
