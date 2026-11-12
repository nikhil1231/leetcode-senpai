"use client";
import { useFlow } from "@/lib/flow-store";
import { installBridge } from "./bridge";

// The imperative modules, in the order the old page loaded them (each one registers itself on window and may use the
// ones before it). Loaded together, once, the first time a page that needs any of them opens.
const ORDER = [
  "visualise-notes", "section-home", "sd-blocks", "sd-sims", "sd-sims-2", "sim-clock", "sd-widgets", "fund-models", "fund-sims", "dist-models", "dist-sims",
  "core-models", "core-sims", "ai-models", "ai-sims", "sd-stress", "sd-walkthrough", "sd-builder-calc", "ai-sim", "sd-sim", "sd-builder", "sd-outage", "sd-game",
  "sd-simulators", "sd-lesson", "tutor", "sd-numbers", "sd-map", "hub", "sd-redesign", "sd-ledger", "sd-papers", "sd-drills", "system-design-learning", "system-design", "tracks",
  "experience", "practical", "tutor-home", "ai-round", "nightshift-engine", "nightshift", "dictate",
];

let loading: Promise<void> | null = null;
export function loadLegacy(): Promise<void> {
  loading ||= (async () => {
    installBridge();
    for (const name of ORDER) await import(`./${name}.js`);
    // A lesson started from elsewhere (Do this next) asks the tutor to take it; hand over what was queued before it loaded.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const drain = () => { const q = useFlow.getState().tutorQueue; if (q && w.Tutor?.queue) { w.Tutor.queue(q); useFlow.getState().queueTutor(null); } };
    drain(); useFlow.subscribe(drain);
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

// Dictation (a mic button on prose textareas) is wanted on every page, so it loads on its own, early and quietly.
let dictation: Promise<void> | null = null;
export function loadDictation(): Promise<void> {
  dictation ||= (async () => { installBridge(); await import(`./${"dictate"}.js`); })().catch(() => { dictation = null; });
  return dictation;
}
