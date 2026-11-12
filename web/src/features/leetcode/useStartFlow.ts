"use client";
import { useCallback } from "react";
import { useFlow } from "@/lib/flow-store";

// Start a problem the way every list does: a recall opens the recall modal, anything else the predict-then-run flow.
export function useStartFlow() {
  const requestStart = useFlow((s) => s.requestStart);
  return useCallback((slug: string, kind = "adhoc", mode = "", title?: string, category?: string, recallAttemptId?: string | null, gradingStatus?: string | null) =>
    requestStart({ slug, kind, mode, title, category, recallAttemptId, gradingStatus }), [requestStart]);
}
