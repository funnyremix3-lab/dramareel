"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { usePermission } from "@/lib/auth";
import { api } from "@/lib/api";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import type { DramaListItem, Paged } from "@/lib/types";

const PAGE_SIZE = 25;

/** Debounces a value so typing in a search box does not fire a request per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DramasList() {
  const canWrite = usePermission("dramas:write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  const query = useQuery({
    queryKey: ["dramas", { q: search, status, page }],
    queryFn: ({ signal }) => api.get<Paged<DramaListItem>>("/admin/dramas", { q: search, status, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Dramas"
        description="Series, their episodes, translations and posters."
        actions={
          canWrite && (
            <Link href="/dramas/new" className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
              New drama
            </Link>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Search">
          <Input
            type="search"
            placeholder="Title or slug"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
      </div>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Dramas">
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th className="text-right">Episodes</Th>
                <Th className="text-right">Views</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={5}>{search || status ? "No dramas match these filters" : "No dramas yet"}</EmptyRow>}
              {query.data.items.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {d.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- posters come from the media CDN, not next/image
                        <img src={d.posterUrl} alt="" className="h-12 w-8 rounded object-cover" />
                      ) : (
                        <div aria-hidden className="h-12 w-8 rounded bg-subtle" />
                      )}
                      <div className="min-w-0">
                        <Link href={`/dramas/${d.id}`} className="font-medium text-brand-700 hover:underline">
                          {d.title}
                        </Link>
                        <p className="text-xs text-muted">
                          {d.slug}
                          {d.isFeatured && " · featured"}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={d.status} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {d.publishedEpisodeCount}/{d.episodeCount}
                  </Td>
                  <Td className="text-right tabular-nums">{fmtNumber(d.viewCount)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(d.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
