"use client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { queryClient } from "./query-client";
import { api } from "./api";
import { ToastProvider } from "./toast";

// The server keeps a write counter per collection (/api/rev). Polling it is nearly free, and when it moves every
// cached read is stale, so one watcher replaces the old app's hand-rolled freshness bookkeeping.
function RevWatcher() {
  const qc = useQueryClient();
  useEffect(() => {
    let last: string | null = null;
    let stopped = false;
    const check = async () => {
      try {
        const r = await api("/rev");
        const key = JSON.stringify([r.writes, r.date, r.boot]);
        if (last !== null && key !== last) qc.invalidateQueries();
        last = key;
      } catch { /* offline or restarting: try again next time */ }
    };
    check();
    const timer = setInterval(() => { if (!stopped && document.visibilityState === "visible") check(); }, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [qc]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RevWatcher />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
