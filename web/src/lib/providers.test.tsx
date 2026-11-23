import { act, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Providers } from "./providers";
import * as apiModule from "./api";

describe("LogWatcher in Providers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("surfaces fetched log warnings as toasts", async () => {
    let callCount = 0;
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path === "/rev") {
        return { writes: 1, date: "2026-11-23", boot: "test" };
      }
      if (path.startsWith("/logs/warnings")) {
        callCount++;
        if (callCount === 1) {
          // Initial cursor query
          return { boot: "first", latest_id: 10, events: [] };
        }
        // Next poll returns a new warning
        return {
          boot: "first",
          latest_id: 11,
          events: [
            {
              id: 11,
              t: 1234567,
              level: "WARNING",
              name: "server.llm",
              message: "LocalRouter failed; falling back to OpenRouter",
            },
          ],
        };
      }
      return {};
    });

    render(
      <Providers>
        <div>app content</div>
      </Providers>
    );

    // Run initial mount promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Advance 3 seconds to trigger polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    const toastEl = document.getElementById("toast")!;
    expect(toastEl.textContent).toContain("Warning: LocalRouter failed; falling back to OpenRouter");
    expect(toastEl.classList.contains("hidden")).toBe(false);
  });

  it("shows errors even when a restarted server's cursor is lower", async () => {
    const error = { id: 1, t: 1234567, level: "ERROR", name: "server.coding", message: "Examiner failed" };
    const api = vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (path === "/logs/warnings") return { boot: "first", latest_id: 100, events: [] };
      if (path === "/logs/warnings?since=100&boot=first") return { boot: "second", latest_id: 1, events: [error] };
      return {};
    });

    render(<Providers><div>app content</div></Providers>);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(document.getElementById("toast")).toHaveTextContent("Error: Examiner failed");
    expect(api).toHaveBeenCalledWith("/logs/warnings?since=100&boot=first");
  });
});
