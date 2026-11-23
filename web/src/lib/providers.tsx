"use client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { queryClient } from "./query-client";
import { api } from "./api";
import { ToastProvider, useToast } from "./toast";

interface LogEvent {
  id: number;
  t: number;
  level: string;
  name: string;
  message: string;
}

interface LogBatch {
  boot: string;
  latest_id: number;
  events: LogEvent[];
}

// SSE for quick delivery, polling for buffered proxies, lost connections and server restarts.
function LogWatcher() {
  const toast = useToast();

  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let lastId = -1;
    let boot: string | undefined;
    let polling = false;

    const handleEvent = (ev: LogEvent) => {
      if (typeof ev.id === "number" && ev.id > lastId) {
        lastId = ev.id;
        const clean = (ev.message || "").split("\n")[0].trim();
        const short = clean.length > 220 ? clean.slice(0, 217) + "…" : clean;
        const prefix = ev.level === "ERROR" ? "Error" : "Warning";
        const display = short.toLowerCase().startsWith(prefix.toLowerCase()) ? short : `${prefix}: ${short}`;
        toast(display);
      }
    };

    const poll = async () => {
      if (stopped || polling || document.visibilityState !== "visible") return;
      polling = true;
      try {
        const res = await api<LogBatch>(boot === undefined ? "/logs/warnings" :
          `/logs/warnings?since=${lastId}&boot=${encodeURIComponent(boot)}`);
        if (stopped) return;
        if (res.boot !== boot || lastId === -1) {
          if (boot === undefined) lastId = res.latest_id; // Don't replay old warnings on page load.
          else {
            lastId = 0;
            for (const ev of res.events) handleEvent(ev);
          }
          boot = res.boot;
          es?.close();
          if (typeof EventSource !== "undefined") {
            es = new EventSource(`/api/logs/warnings/stream?since=${lastId}`);
            es.onmessage = (e) => {
              try { handleEvent(JSON.parse(e.data)); } catch { /* malformed event */ }
            };
          }
        } else {
          for (const ev of res.events) handleEvent(ev);
        }
      } catch {
        /* offline or server restarting */
      } finally {
        polling = false;
      }
    };

    void poll();
    const pollTimer = setInterval(poll, 3000);

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (es) es.close();
      clearInterval(pollTimer);
    };
  }, [toast]);

  return null;
}

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
        <LogWatcher />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
