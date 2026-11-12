import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorMessage, ApiError, setAuthFailureHandler } from "./api";

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
