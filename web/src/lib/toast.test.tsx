import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider, useToast, toastGlobal } from "./toast";

function TestComponent() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast("Message 1")}>Toast 1</button>
      <button type="button" onClick={() => toast("Message 2")}>Toast 2</button>
    </div>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows sequential toasts in queue without dropping messages", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const toastEl = document.getElementById("toast")!;
    expect(toastEl.classList.contains("hidden")).toBe(true);

    // Trigger toast 1 and toast 2 in rapid succession
    act(() => {
      screen.getByText("Toast 1").click();
      screen.getByText("Toast 2").click();
    });

    // Toast 1 should be visible first
    expect(toastEl.textContent).toBe("Message 1");
    expect(toastEl.classList.contains("hidden")).toBe(false);

    // Advance timer past first toast duration (3500ms)
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    // Toast 2 should now be visible
    expect(toastEl.textContent).toBe("Message 2");
    expect(toastEl.classList.contains("hidden")).toBe(false);

    // Advance timer past second toast
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    // Queue empty, toast hidden
    expect(toastEl.classList.contains("hidden")).toBe(true);
  });

  it("toastGlobal triggers toast outside React tree", () => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>
    );

    const toastEl = document.getElementById("toast")!;
    act(() => {
      toastGlobal("Global alert");
    });

    expect(toastEl.textContent).toBe("Global alert");
    expect(toastEl.classList.contains("hidden")).toBe(false);
  });
});
