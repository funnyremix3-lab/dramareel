"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ImportJob } from "@/lib/types";

const ACTIVE = new Set(["PENDING", "RUNNING"]);

export function useImports() {
  return useQuery({
    queryKey: ["imports"],
    queryFn: ({ signal }) => api.get<{ items: ImportJob[] }>("/admin/imports", undefined, signal),
    // Refresh while anything is still running so progress bars move on their own.
    refetchInterval: (q) => (q.state.data?.items.some((j) => ACTIVE.has(j.status)) ? 4000 : false),
  });
}

export function useImportActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["imports"] });
  const cancel = useMutation({ mutationFn: (id: string) => api.post<ImportJob>(`/admin/imports/${id}/cancel`), onSuccess: invalidate });
  const retry = useMutation({ mutationFn: (id: string) => api.post<ImportJob>(`/admin/imports/${id}/retry`), onSuccess: invalidate });
  return { cancel, retry };
}
