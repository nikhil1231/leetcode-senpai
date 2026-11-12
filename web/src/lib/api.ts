// The one way the browser talks to the FastAPI server (proxied under /api by next.config.ts). Auth happens at the
// edge (Cloudflare Access) or not at all (local mode), so there is no token to carry: a 401 means the edge session
// lapsed and only a full page load can follow it back through sign-in; a 403 is the allow-list turning us away.

import { noteWrite } from "./usage";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type AuthFailureHandler = (status: 401 | 403) => void;
let onAuthFailure: AuthFailureHandler = (status) => {
  if (status === 401 && typeof window !== "undefined") window.location.reload();
};
export const setAuthFailureHandler = (fn: AuthFailureHandler) => { onAuthFailure = fn; };

export function apiErrorMessage(detail: unknown): string {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(apiErrorMessage).filter(Boolean).join("; ");
  if (typeof detail === "object") {
    const d = detail as { msg?: string; loc?: string | string[]; message?: string };
    if (d.msg) {
      const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc;
      return loc ? `${loc}: ${d.msg}` : d.msg;
    }
    if (d.message) return d.message;
    return JSON.stringify(detail);
  }
  return String(detail);
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function request(path: string, method: Method = "GET", body?: unknown, signal?: AbortSignal, accept?: string): Promise<Response> {
  // X-Requested-With makes the Access edge answer an expired session with a same-origin 401 rather than a
  // cross-origin 302 that fetch follows and then cannot read.
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
  if (accept) headers.Accept = accept;
  if (method !== "GET" && typeof window !== "undefined") noteWrite("/api" + path);
  const res = await fetch("/api" + path, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 || res.status === 403) {
    onAuthFailure(res.status);
    throw new ApiError("auth", res.status);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(apiErrorMessage(payload.detail) || res.statusText, res.status);
  }
  return res;
}

// `any` by default: the server's shapes are many and loosely typed; callers narrow with a type argument where it pays.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  return (await request(path, method, body)).json();
}

// Server-sent events: each `data:` line is one JSON object with a `type` (server/chat_stream.py). Returns the
// complete events in `buffer` and the unfinished rest.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEvents(buffer: string): { events: any[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks.flatMap((b) => b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()))
    .flatMap((d) => { try { return [JSON.parse(d)]; } catch { return []; } });
  return { events, rest };
}

// POST and read the reply as it streams; onEvent sees each event in order. Errors before the stream starts throw like
// `api`; a stream that ends without a `done` event throws, so a dropped connection is never taken for a finished reply.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function streamApi(path: string, body: unknown, onEvent: (event: any) => void, signal?: AbortSignal): Promise<void> {
  const res = await request(path, "POST", body, signal, "text/event-stream");
  if (!(res.headers.get("content-type") || "").includes("text/event-stream")) {   // an older server: one JSON reply
    onEvent({ type: "done", ...(await res.json()) });
    return;
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "", finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseEvents(buffer + value);
    buffer = parsed.rest;
    for (const e of parsed.events) {
      if (e.type === "error") throw new ApiError(e.message || "The reply stopped.", e.status || 502);
      if (e.type === "done") finished = true;
      onEvent(e);
    }
  }
  if (!finished) throw new ApiError("The connection dropped before the reply finished. Try again.", 0);
}
