import { QueryClient } from "@tanstack/react-query";

// One client for the whole page, so code mounted outside the main React tree (the legacy bridge) shares its cache.
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });
