import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorRun } from "./session";

const calls: { url: string; body: any }[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const make = (code: { v: string }) => {
  const run = new EditorRun("s1", "two-sum", Math.floor(Date.now() / 1000));
  run.lastLogged = "";
  run.getCode = () => code.v;
  return run;
};

describe("EditorRun", () => {
  it("logs only a change, as one delta", () => {
    const code = { v: "" }, run = make(code);
    run.tick();
    expect(run.queue).toHaveLength(0);
    code.v = "def f(): pass";
    run.tick();
    expect(run.queue).toHaveLength(1);
    expect(run.queue[0].k).toBe("c");   // as big as the file itself: logged as the file
    code.v = "def f(): return 1";
    run.tick();
    expect(run.queue[1]).toMatchObject({ k: "d" });
  });

  it("flushes the queue in order with an increasing sequence number", async () => {
    const code = { v: "a" }, run = make(code);
    run.tick(); await run.flush();
    code.v = "ab"; run.tick(); await run.flush();
    const logs = calls.filter((c) => c.url.endsWith("/editor/log")).map((c) => c.body.seq);
    expect(logs).toEqual([1, 2]);
    expect(run.queue).toHaveLength(0);
  });

  it("keeps unsent events in storage and restores them", () => {
    const code = { v: "x = 1" }, run = make(code);
    run.tick();
    const saved = EditorRun.restore("s1");
    expect(saved?.code).toBe("x = 1");
    expect(saved?.queue).toHaveLength(1);
    EditorRun.forget("s1");
    expect(EditorRun.restore("s1")).toBeNull();
  });

  it("does not send until a pending run has an id", async () => {
    const run = new EditorRun(null, "two-sum", Math.floor(Date.now() / 1000));
    run.getCode = () => "x"; run.tick();
    const flushed = run.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(0);
    run.adopt("s2", Math.floor(Date.now() / 1000));
    await flushed;
    expect(calls.some((c) => c.body?.session_id === "s2")).toBe(true);
  });

  it("asks twice before a submit: unrun code, unticked planned edge cases", () => {
    const code = { v: "x" }, run = make(code);
    run.tick();
    expect(run.submitDoubts(["empty input"], null)).toEqual(["You haven't run this version of the code.", "Planned edge cases not ticked: empty input."]);
    run.lastRunCode = "x"; run.checked = ["empty input"];
    expect(run.submitDoubts(["empty input"], null)).toEqual([]);
    run.submits = 1;
    expect(run.submitDoubts(["other"], null)).toEqual([]);   // only before the first submit
  });
});
