import { create } from "zustand";

// Requests one part of the app makes of another that lives in the shell: start a problem, open a focused lesson,
// hand a lesson to the tutor, preset Quickfire. The shell-level hosts watch these and act.
export interface StartRequest {
  slug: string; kind: string; mode?: string; title?: string; category?: string;
  recallAttemptId?: string | null; gradingStatus?: string | null; interview?: boolean;
}
export interface TutorLaunch { section: string; lesson?: string; mode?: string; focus?: string }

interface FlowState {
  start: StartRequest | null;
  learning: { type: "sequence"; sequence: string } | { type: "application"; id: string } | null;
  tutorQueue: TutorLaunch | null;
  quickfireTopic: string | null;
  teach: string | null;
  sprintOpen: boolean;
  mockOpen: boolean;
  detailId: string | null;
  recall: { slug: string; title?: string; category?: string; attemptId?: string | null; gradingStatus?: string | null; kind?: string } | null;
  setSprint: (v: boolean) => void;
  setMock: (v: boolean) => void;
  openDetail: (id: string | null) => void;
  openRecall: (r: FlowState["recall"]) => void;
  annotate: Record<string, unknown> | null;
  openAnnotate: (a: Record<string, unknown> | null) => void;
  preloadEditor: (() => void) | null;
  requestStart: (r: StartRequest | null) => void;
  openLearning: (l: FlowState["learning"]) => void;
  queueTutor: (t: TutorLaunch | null) => void;
  presetQuickfire: (topic: string | null) => void;
  openTeach: (capability: string | null) => void;
}

export const useFlow = create<FlowState>((set) => ({
  annotate: null, openAnnotate: (annotate) => set({ annotate }),
  preloadEditor: null, start: null, learning: null, tutorQueue: null, quickfireTopic: null, teach: null, sprintOpen: false, mockOpen: false, detailId: null, recall: null,
  setSprint: (sprintOpen) => set({ sprintOpen }), setMock: (mockOpen) => set({ mockOpen }),
  openDetail: (detailId) => set({ detailId }), openRecall: (recall) => set({ recall }),
  requestStart: (start) => set({ start }),
  openLearning: (learning) => set({ learning }),
  queueTutor: (tutorQueue) => set({ tutorQueue }),
  presetQuickfire: (quickfireTopic) => set({ quickfireTopic }),
  openTeach: (teach) => set({ teach }),
}));
