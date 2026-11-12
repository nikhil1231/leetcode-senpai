import { create } from "zustand";

// Cross-cutting UI state that no single page owns: which dialog is open, the page coach, the palette.
interface UiState {
  paletteOpen: boolean;
  cookieOpen: boolean;
  quickStartOpen: boolean;
  pageCoachOpen: boolean;
  setPalette: (v: boolean) => void;
  setCookie: (v: boolean) => void;
  setQuickStart: (v: boolean) => void;
  setPageCoach: (v: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false, cookieOpen: false, quickStartOpen: false, pageCoachOpen: false,
  setPalette: (v) => set({ paletteOpen: v }),
  setCookie: (v) => set({ cookieOpen: v }),
  setQuickStart: (v) => set({ quickStartOpen: v }),
  setPageCoach: (v) => set({ pageCoachOpen: v }),
}));
