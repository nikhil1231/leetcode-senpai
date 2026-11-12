"use client";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "./api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useApi<T = any>(path: string | null, options: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: ["api", path], queryFn: () => api<T>(path as string), enabled: path !== null, ...options });
}
