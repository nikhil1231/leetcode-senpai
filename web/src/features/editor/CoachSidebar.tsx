"use client";
import { useRef, type ReactNode } from "react";
import { COACH_PX, useLayout } from "./editor-store";

export function coachWidth(width?: number | null) {
  return width ? `${Math.round(Math.min(COACH_PX.max, Math.max(COACH_PX.min, width)))}px` : undefined;
}

// The live editors share the same coach rail, resizing and per-browser fold preference.
export function CoachSidebar({ model, children }: { model?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const layout = useLayout((s) => s.layout);
  const patch = useLayout((s) => s.patch);
  const drag = (e: React.PointerEvent) => {
    e.preventDefault(); const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const right = ref.current!.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => patch({ coachW: right - ev.clientX });
    const up = () => { t.removeEventListener("pointermove", move); t.removeEventListener("pointerup", up); t.removeEventListener("pointercancel", up); };
    t.addEventListener("pointermove", move); t.addEventListener("pointerup", up); t.addEventListener("pointercancel", up);
  };
  return <aside ref={ref} id="run-coach" className="run-coach" aria-label="Coach" onClick={(e) => {
    if (layout.coach || (e.target as HTMLElement).closest("#btn-coach-toggle")) patch({ coach: !layout.coach });
  }}>
    <div className="editor-split coach-split" role="separator" aria-orientation="vertical" aria-label="Resize the coach" tabIndex={0} title="Drag to resize · double-click to reset"
      onClick={(e) => e.stopPropagation()} onPointerDown={drag} onDoubleClick={() => patch({ coachW: null })}
      onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); patch({ coachW: ref.current!.getBoundingClientRect().width + (e.key === "ArrowLeft" ? 20 : -20) }); }} />
    <div className="coach-head"><span className="coach-title">Coach</span><span className="coach-model-name">{model}</span>
      <button id="btn-coach-toggle" className="panel-toggle" type="button" aria-label={layout.coach ? "Show the coach" : "Hide the coach"} title={layout.coach ? "Show the coach" : "Hide the coach"}>&#x203A;</button></div>
    {children}
  </aside>;
}
