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
          return { latest_id: 10, events: [] };
        }
        // Next poll returns a new warning
        return {
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
});
