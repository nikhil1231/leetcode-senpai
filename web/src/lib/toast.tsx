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
  const queue = useRef<string[]>([]);
  const isShowing = useRef<boolean>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processNext = useCallback(() => {
    if (queue.current.length === 0) {
      isShowing.current = false;
      setMessage(null);
      return;
    }
    isShowing.current = true;
    const next = queue.current.shift()!;
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      processNext();
    }, 3500);
  }, []);

  const toast = useCallback((m: string) => {
    if (!m) return;
    if (queue.current.includes(m)) return;
    queue.current.push(m);
    if (!isShowing.current) {
      processNext();
    }
  }, [processNext]);

  useEffect(() => {
    globalToast = toast;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);

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
