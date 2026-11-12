"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { navigate } from "@/lib/navigate";
import { queryClient } from "@/lib/query-client";
import { toastGlobal } from "@/lib/toast";

// A plan block's `action` says what starting it means; this turns each kind into the app's own flow. A plain function,
// so the imperative views can call it too (window.Senpai.start).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockAction = any;

export function runBlockAction(a: BlockAction) {
  if (!a) return;
  const flow = useFlow.getState();
  const track = (section: string, view = "") => navigate(`/${section}${view ? "/" + view : ""}`);
  switch (a.type) {
    case "problem": flow.requestStart({ slug: a.slug, kind: a.kind, mode: a.mode, title: a.title, category: a.category, interview: !!a.interview }); break;
    case "application": flow.openLearning({ type: "application", id: a.id }); break;
    case "sequence": flow.openLearning({ type: "sequence", sequence: a.sequence }); break;
    case "quickfire": flow.presetQuickfire(a.topic ?? null); navigate("/leetcode/practice"); break;
    case "sd_lesson":
      if (a.tutor) flow.queueTutor({ section: "system-design", lesson: a.id });
      track("system-design", "lesson/" + a.id); break;
    case "tutor":
      flow.queueTutor({ section: a.section, lesson: a.lesson, mode: a.mode, focus: a.focus });
      track(a.section, "lesson/" + a.lesson); break;
    case "session":
      api("/senpai/session", "POST", { mode: a.mode })
        .then(() => { toastGlobal(a.mode === "interview" ? "Interview session ready" : "Session ready"); queryClient.invalidateQueries(); navigate("/leetcode/senpai"); })
        .catch((e) => toastGlobal(e.message));
      break;
    case "sd_quickfire": track("system-design", "quickfire"); break;
    case "sd_cases": track("system-design", "cases"); break;
    case "track":
      if (a.tutor && String(a.view).startsWith("lesson/")) flow.queueTutor({ section: a.track, lesson: String(a.view).slice(7) });
      track(a.track, a.view === "home" ? "" : a.view); break;
    case "teach": flow.openTeach(a.capability_id); navigate("/leetcode/senpai"); break;
  }
}

export function useStartBlock() {
  return useCallback((a: BlockAction) => runBlockAction(a), []);
}
