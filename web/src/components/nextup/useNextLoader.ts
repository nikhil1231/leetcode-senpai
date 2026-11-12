"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Next } from "./NextUp";

// A fresh read of the "do this next" recommendation, for things that act on it rather than show it.
export function useNextLoader() {
  const qc = useQueryClient();
  return useCallback(() => qc.fetchQuery<Next>({ queryKey: ["api", "/senpai/next"], queryFn: () => api("/senpai/next"), staleTime: 0 }).catch(() => null), [qc]);
}
