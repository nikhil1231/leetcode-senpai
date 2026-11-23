"use client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
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

// Watcher that streams and polls backend log warnings/errors and surfaces them as toasts.
function LogWatcher() {
  const toast = useToast();
  const lastIdRef = useRef<number>(-1);

  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const handleEvent = (ev: LogEvent) => {
      if (typeof ev.id === "number" && ev.id > lastIdRef.current) {
        lastIdRef.current = ev.id;
        const clean = (ev.message || "").split("\n")[0].trim();
        const short = clean.length > 220 ? clean.slice(0, 217) + "…" : clean;
        const prefix = ev.level === "ERROR" ? "Error" : "Warning";
        const display = short.toLowerCase().startsWith(prefix.toLowerCase()) ? short : `${prefix}: ${short}`;
        toast(display);
      }
    };

    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        if (lastIdRef.current === -1) {
          const res = await api<{ latest_id: number; events: LogEvent[] }>("/logs/warnings");
          lastIdRef.current = res.latest_id || 0;
          return;
        }
        const res = await api<{ latest_id: number; events: LogEvent[] }>(
          `/logs/warnings?since=${lastIdRef.current}`
        );
        for (const ev of res.events || []) {
          handleEvent(ev);
        }
        if (res.latest_id && res.latest_id > lastIdRef.current) {
          lastIdRef.current = res.latest_id;
        }
      } catch {
        /* offline or server restarting */
      }
    };

    const start = async () => {
      try {
        const init = await api<{ latest_id: number }>("/logs/warnings");
        if (lastIdRef.current === -1) {
          lastIdRef.current = init.latest_id || 0;
        }
      } catch {
        lastIdRef.current = 0;
      }
      if (stopped) return;

      if (typeof EventSource !== "undefined") {
        try {
          es = new EventSource(`/api/logs/warnings/stream?since=${lastIdRef.current}`);
          es.onmessage = (e) => {
            try {
              const data = JSON.parse(e.data);
              handleEvent(data);
            } catch {}
          };
          es.onerror = () => {
            if (!pollTimer && !stopped) {
              pollTimer = setInterval(poll, 3000);
            }
          };
        } catch {}
      }

      if (!pollTimer && !stopped) {
        pollTimer = setInterval(poll, 3000);
      }
    };

    start();

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (es) es.close();
      if (pollTimer) clearInterval(pollTimer);
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
