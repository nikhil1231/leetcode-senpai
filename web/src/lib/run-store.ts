import { create } from "zustand";

// The run in progress: the server's view of it (/session/active) plus what only the browser knows (clock bases, a
// minimised run, a hint on its way). One run at a time; a minimised one comes back rather than being replaced.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Active = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorPayload = any;

interface RunState {
  active: Active | null;
  editor: EditorPayload | null;
  clockBase: { elapsed: number; wall: number } | null;
  minimised: boolean;
  coachPending: { text?: string; t?: number } | null;
  nudge: string | null;
  nudgeShown: { hint?: boolean; solution?: boolean };
  setActive: (active: Active | null, editor?: EditorPayload | null) => void;
  patchActive: (patch: Partial<Active>) => void;
  setMinimised: (v: boolean) => void;
  setCoachPending: (p: RunState["coachPending"]) => void;
  setNudge: (kind: "hint" | "solution" | null, text?: string) => void;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export const useRun = create<RunState>((set, get) => ({
  active: null, editor: null, clockBase: null, minimised: false, coachPending: null, nudge: null, nudgeShown: {},
  setActive: (active, editor = null) => {
    const prev = get().active;
    const sameRun = !!active && !!prev && prev.session_id === active.session_id;
    set({
      active, editor: active ? editor ?? (sameRun ? get().editor : null) : null,
      clockBase: active ? { elapsed: active.elapsed_sec || 0, wall: nowSec() } : null,
      minimised: active ? get().minimised : false,
      nudge: active && sameRun ? get().nudge : null, nudgeShown: active && sameRun ? get().nudgeShown : {},
    });
  },
  patchActive: (patch) => { const a = get().active; if (a) set({ active: { ...a, ...patch } }); },
  setMinimised: (minimised) => set({ minimised: minimised && !!get().active }),
  setCoachPending: (coachPending) => set({ coachPending }),
  setNudge: (kind, text) => set((s) => (kind ? { nudge: text ?? null, nudgeShown: { ...s.nudgeShown, [kind]: true } } : { nudge: null })),
}));

// The run clock as shown: the plan's minutes plus the run's own time, frozen while paused.
export function elapsedNow(active: Active | null, base: { elapsed: number; wall: number } | null): number {
  if (!active) return 0;
  const baseElapsed = base?.elapsed ?? active.elapsed_sec ?? 0;
  if (active.is_paused) return baseElapsed;
  return baseElapsed + Math.max(0, nowSec() - (base?.wall ?? nowSec()));
}
export const clockNow = (active: Active | null, base: { elapsed: number; wall: number } | null) => (active?.plan_sec || 0) + elapsedNow(active, base);
