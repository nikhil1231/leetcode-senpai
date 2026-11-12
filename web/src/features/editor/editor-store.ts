import { create } from "zustand";

// What the run header and the coach column need from the editor: the Run/Submit buttons live in the header, the
// hint marks and the code on screen are asked for by the coach.
export interface EditorApi {
  judge: (kind: "run" | "submit") => void;
  code: () => string | null;
  tick: () => void;
  flush: () => Promise<void>;
  showMarks: (marks: { line: number; text: string; note: string }[]) => number;
  clearMarks: () => void;
  discard: (sessionId: string | null) => void;
  setCanJudge: (on: boolean) => void;
}
interface EditorUi { api: EditorApi | null; canJudge: boolean; judging: boolean; runsLeft: number | null; set: (p: Partial<EditorUi>) => void }
export const useEditorUi = create<EditorUi>((set) => ({ api: null, canJudge: false, judging: false, runsLeft: null, set: (p) => set(p) }));

// The layout is a per-browser preference: how wide the statement is, whether panels are folded.
const LAYOUT_KEY = "editor-layout:v1";
export interface Layout { pct?: number; hidden?: boolean; coach?: boolean; coachW?: number | null; console?: boolean; consoleH?: number | null }
export const STATEMENT_PCT = { min: 20, max: 70, def: 42 };
export const COACH_PX = { min: 260, max: 720 };
export const CONSOLE_PX = { min: 120, editor: 150 };
const read = (): Layout => { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") || {}; } catch { return {}; } };

interface LayoutStore { layout: Layout; hydrate: () => void; patch: (p: Layout) => void }
export const useLayout = create<LayoutStore>((set, get) => ({
  layout: {},
  hydrate: () => set({ layout: read() }),
  patch: (p) => { const layout = { ...get().layout, ...p }; set({ layout }); try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignore */ } },
}));
