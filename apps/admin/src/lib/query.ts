"use client";

import { QueryClient, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "./api";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (4xx) will not fix themselves on retry.
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

/**
 * Mutation with toast feedback and cache invalidation. Errors are toasted and re-thrown to
 * callers using mutateAsync, so forms can show them inline too.
 */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string | ((data: TData) => string); invalidate?: QueryKey[]; onSuccess?: (data: TData, vars: TVars) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      opts.onSuccess?.(data, vars);
    },
    onError: (err) => {
      if (!opts.silentError) toast.error(err);
    },
  });
}
