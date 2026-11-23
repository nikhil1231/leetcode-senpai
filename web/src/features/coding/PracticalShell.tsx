"use client";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CoachSidebar, coachWidth } from "@/features/editor/CoachSidebar";
import { CONSOLE_PX, STATEMENT_PCT, useLayout } from "@/features/editor/editor-store";

// The frame of a Practical Coding exercise: the same full-screen panes as a coding challenge (brief, work area,
// console, coach rail; drag handles and folds kept in the shared per-browser layout). The exercise code in
// legacy/practical.js draws into the empty slots this returns.
export interface ShellSlots { clock: HTMLElement; actions: HTMLElement; statement: HTMLElement; work: HTMLElement; console: HTMLElement; coach: HTMLElement }
interface Props { kicker: string; title: string; backLabel: string; consoleLabel: string; onBack: () => void; sink: Partial<ShellSlots> }

function Shell({ kicker, title, backLabel, consoleLabel, onBack, sink }: Props) {
  const layout = useLayout((s) => s.layout);
  const patch = useLayout((s) => s.patch);
  const pane = useRef<HTMLDivElement>(null);
  const slot = (k: keyof ShellSlots) => (el: HTMLElement | null) => { if (el) sink[k] = el; };
  useEffect(() => { useLayout.getState().hydrate(); }, []);
  useEffect(() => {
    const el = pane.current; if (!el) return;
    const w = Math.min(STATEMENT_PCT.max, Math.max(STATEMENT_PCT.min, Number(layout.pct) || STATEMENT_PCT.def));
    el.style.setProperty("--statement-w", `${w}%`);
    const ch = Number(layout.consoleH) ? Math.round(Math.max(CONSOLE_PX.min, Number(layout.consoleH))) : null;
    if (ch) el.style.setProperty("--console-h", `${ch}px`); else el.style.removeProperty("--console-h");
  }, [layout]);
  const drag = (onMove: (e: PointerEvent) => void) => (e: React.PointerEvent) => {
    e.preventDefault(); const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const up = () => { t.removeEventListener("pointermove", onMove); t.removeEventListener("pointerup", up); };
    t.addEventListener("pointermove", onMove); t.addEventListener("pointerup", up);
  };
  const consoleHeight = () => pane.current?.querySelector(".editor-console")?.getBoundingClientRect().height ?? 0;
  const setH = (h: number | null) => {
    const work = pane.current?.querySelector(".editor-work")?.getBoundingClientRect();
    if (h != null && work) h = Math.min(work.height - CONSOLE_PX.editor, Math.max(CONSOLE_PX.min, h));
    patch({ consoleH: h });
  };
  const pct = Number(layout.pct) || STATEMENT_PCT.def;
  return (
    <div className={`cwf active-run has-editor${layout.coach ? " coach-hidden" : ""}`} style={{ "--coach-w": coachWidth(layout.coachW) } as React.CSSProperties}>
      <header className="cwf-head">
        <button className="button is-ghost is-small" type="button" onClick={onBack} title="Your work is saved.">{backLabel}</button>
        <div className="cw-title"><span className="cw-kicker">{kicker}</span><h2>{title}</h2></div>
        <span className="cw-clock tr-elapsed" ref={slot("clock")} aria-label="Time on this exercise" />
        <div className="cwf-actions tr-actions" ref={slot("actions")} />
      </header>
      <div ref={pane} className={`editor-pane cwf-pane${layout.hidden ? " statement-hidden" : ""}${layout.console ? " console-folded" : ""}`}>
        <div className="editor-statement">
          <div className="pane-head">
            <div className="pane-tabs"><span className="pane-title">Brief</span></div>
            <button className="panel-toggle" type="button" aria-label="Hide the brief" title="Hide the brief" onClick={() => patch({ hidden: true })}>&#x2039;</button>
          </div>
          <div className="editor-statement-body cwf-task tr-statement" ref={slot("statement")} />
        </div>
        <button className="panel-rail" type="button" title="Show the brief" onClick={() => patch({ hidden: false })}><span>&#x203A;</span><span className="panel-rail-label">Brief</span></button>
        <div className="editor-split" role="separator" aria-orientation="vertical" aria-label="Resize the brief" tabIndex={0} title="Drag to resize · double-click to reset"
          onPointerDown={(e) => { const box = pane.current!.getBoundingClientRect(); drag((ev) => patch({ pct: Math.round((((ev.clientX - box.left) / box.width) * 100) * 10) / 10 }))(e); }}
          onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); patch({ pct: pct + (e.key === "ArrowLeft" ? -2 : 2) }); }}
          onDoubleClick={() => patch({ pct: STATEMENT_PCT.def })} />
        <div className="editor-work">
          <div className="tr-ide tr-slot-work" ref={slot("work")} />
          <div className="console-split" role="separator" aria-orientation="horizontal" aria-label="Resize the console" tabIndex={0} title="Drag to resize · double-click to reset"
            onPointerDown={(e) => { const bottom = pane.current!.querySelector(".editor-work")!.getBoundingClientRect().bottom; drag((ev) => setH(bottom - ev.clientY))(e); }}
            onKeyDown={(e) => { if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return; e.preventDefault(); setH(consoleHeight() + (e.key === "ArrowUp" ? 20 : -20)); }}
            onDoubleClick={() => setH(null)} />
          <div className="editor-console">
            <div className="console-head">
              <div className="pane-tabs"><span className="pane-title">{consoleLabel}</span></div>
              <div className="console-tools"><button className="panel-toggle" type="button" aria-label="Collapse the console" title="Collapse the console" onClick={() => patch({ console: !layout.console })}>&#x2304;</button></div>
            </div>
            <div className="console-panel tr-console" ref={slot("console")} />
          </div>
        </div>
      </div>
      <CoachSidebar><div className="tr-coach" ref={slot("coach")} /></CoachSidebar>
    </div>
  );
}

// Mounts the frame into `host` and returns the slots straight away (the render is flushed synchronously).
export function mountPracticalShell(host: Element, o: Omit<Props, "sink">) {
  const got: Partial<ShellSlots> = {};
  const root = createRoot(host);
  flushSync(() => root.render(<Shell {...o} sink={got} />));
  return { slots: got as ShellSlots, unfold: () => useLayout.getState().patch({ console: false }), unmount: () => root.unmount() };
}
