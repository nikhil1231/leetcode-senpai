"use client";
import { useEffect, useRef, type ReactNode } from "react";

// The overlay + card every dialog shares. Escape and a click on the backdrop close it unless `locked`.
export function Modal({ open, onClose, title, subtitle, children, locked = false, className = "", cardClassName = "" }: {
  open: boolean; onClose?: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode;
  locked?: boolean; className?: string; cardClassName?: string;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose?.(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);
  useEffect(() => { if (open) card.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className={`overlay ${className}`} onMouseDown={(e) => { if (!locked && e.target === e.currentTarget) onClose?.(); }}>
      <div className={`overlay-card box ${cardClassName}`} role="dialog" aria-modal="true" tabIndex={-1} ref={card}>
        {(title || onClose) && (
          <div className="modal-titlebar">
            <div>
              {title && <h2 className="modal-title">{title}</h2>}
              {subtitle && <p className="small">{subtitle}</p>}
            </div>
            {onClose && !locked && (
              <button className="button is-ghost is-small icon-button" type="button" aria-label="Close" title="Close" onClick={onClose}>&times;</button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
