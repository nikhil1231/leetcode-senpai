"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastFn = (message: string) => void;
let globalToast: ToastFn = () => {};
// For code outside the React tree (the legacy bridge).
export const toastGlobal: ToastFn = (m) => globalToast(m);
const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

// One line at the bottom of the screen for a few seconds (the #toast element of the old app).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);
  useEffect(() => { globalToast = toast; return () => { if (timer.current) clearTimeout(timer.current); }; }, [toast]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" className={`toast${message ? "" : " hidden"}`} role="status" aria-live="polite">{message}</div>
    </ToastContext.Provider>
  );
}

// A toast for a small React root that has no provider of its own: it forwards to the page's toast.
export function ToastBoundary({ children }: { children: ReactNode }) {
  return <ToastContext.Provider value={toastGlobal}>{children}</ToastContext.Provider>;
}
