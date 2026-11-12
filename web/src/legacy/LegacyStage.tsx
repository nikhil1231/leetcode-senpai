"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadLegacy } from "./load";

// Hosts an imperative view: waits for the modules, then lets `open` draw into the element it returns. `deps` decides when
// to open again (the route changed); `onLeave` undoes whatever the view set running.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export function useLegacy() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let alive = true; loadLegacy().then(() => alive && setReady(true)).catch((e) => alive && setError(e.message || "Could not load this page.")); return () => { alive = false; }; }, []);
  return { ready, error };
}

export function LegacyMount({ open, deps, className = "", id, fallback }: { open: (el: HTMLElement) => void | (() => void) | Promise<void | (() => void)>; deps: unknown[]; className?: string; id?: string; fallback?: ReactNode }) {
  const { ready, error } = useLegacy();
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !el.current) return;
    let cleanup: void | (() => void);
    let alive = true;
    Promise.resolve(open(el.current)).then((c) => { if (!alive && typeof c === "function") c(); else cleanup = c; }).catch((e) => { if (el.current) el.current.innerHTML = `<p class="tr-error">${String(e?.message || e)}</p>`; });
    return () => { alive = false; if (typeof cleanup === "function") cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);
  // The element the view draws into has no React children: the view owns what is inside it.
  return (
    <>
      {error ? <p className="tr-error">{error}</p> : !ready ? fallback ?? <div className="tr-loading">Loading…</div> : null}
      <div ref={el} id={id} className={className} />
    </>
  );
}
export type { Any };
