import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorMessage, ApiError, parseEvents, setAuthFailureHandler, streamApi } from "./api";

afterEach(() => vi.unstubAllGlobals());
const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("api", () => {
  it("returns the JSON of a good response and marks the request as a fetch (so the Access edge answers 401, not 302)", async () => {
    respond(200, { a: 1 });
    expect(await api("/x")).toEqual({ a: 1 });
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });
  it("turns an error body into a message and keeps the status", async () => {
    respond(409, { detail: "Slug did not match." });
    await expect(api("/x", "POST", {})).rejects.toMatchObject({ message: "Slug did not match.", status: 409 });
  });
  it("tells the auth handler about a 401 or 403 and throws", async () => {
    const seen: number[] = [];
    setAuthFailureHandler((s) => seen.push(s));
    respond(403, {});
    await expect(api("/x")).rejects.toBeInstanceOf(ApiError);
    expect(seen).toEqual([403]);
  });
  it("flattens validation errors", () => {
    expect(apiErrorMessage([{ loc: ["body", "slug"], msg: "field required" }, "other"])).toBe("body.slug: field required; other");
  });
});

describe("streamApi", () => {
  const sse = (chunks: string[], status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
    start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close(); },
  }), { status, headers: { "content-type": "text/event-stream" } })));

  it("parses complete events and keeps the unfinished rest", () => {
    expect(parseEvents('data: {"type":"text","text":"a"}\n\ndata: {"ty')).toEqual({ events: [{ type: "text", text: "a" }], rest: 'data: {"ty' });
  });
  it("hands over events split across network chunks, in order, and asks for a stream", async () => {
    sse(['data: {"type":"text","te', 'xt":"Hel"}\n\ndata: {"type":"text","text":"lo"}\n', '\ndata: {"type":"done","model":"m"}\n\n']);
    const seen: unknown[] = [];
    await streamApi("/x", {}, (e) => seen.push(e));
    expect(seen).toEqual([{ type: "text", text: "Hel" }, { type: "text", text: "lo" }, { type: "done", model: "m" }]);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers.Accept).toBe("text/event-stream");
  });
  it("throws on an error event and on a stream that stops before done", async () => {
    sse(['data: {"type":"error","status":409,"message":"Ended."}\n\n']);
    await expect(streamApi("/x", {}, () => {})).rejects.toMatchObject({ message: "Ended.", status: 409 });
    sse(['data: {"type":"text","text":"Half"}\n\n']);
    await expect(streamApi("/x", {}, () => {})).rejects.toBeInstanceOf(ApiError);
  });
  it("takes a plain JSON reply as the finished one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reply: "Hi" }), { status: 200, headers: { "content-type": "application/json" } })));
    const seen: unknown[] = [];
    await streamApi("/x", {}, (e) => seen.push(e));
    expect(seen).toEqual([{ type: "done", reply: "Hi" }]);
  });
});
