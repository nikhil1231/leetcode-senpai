import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MockModal } from "./MockModal";
import { ToastProvider } from "@/lib/toast";
import * as apiModule from "@/lib/api";

afterEach(() => vi.restoreAllMocks());
it("background cache invalidation does not POST another interview start", async () => {
  const api = vi.spyOn(apiModule, "api").mockResolvedValue({ id: "mock-one", started_at: Date.now() / 1000, duration_sec: 3600, problems: [] });
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><ToastProvider><MockModal onClose={vi.fn()} /></ToastProvider></QueryClientProvider>);
  await screen.findByRole("heading", { name: /Mock interview/ });
  await act(async () => { await qc.invalidateQueries(); });
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith("/mock/start", "POST");
});
