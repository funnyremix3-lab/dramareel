"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Category, Language } from "@/lib/types";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: ({ signal }) => api.get<Category[]>("/admin/categories", undefined, signal), staleTime: 5 * 60_000 });
}

export function useLanguages() {
  return useQuery({ queryKey: ["languages"], queryFn: ({ signal }) => api.get<Language[]>("/admin/languages", undefined, signal), staleTime: 5 * 60_000 });
}
