"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import type { Paged, VideoAsset } from "@/lib/types";
import { formatBytes } from "@/lib/upload";

const STATUSES = ["AWAITING_UPLOAD", "UPLOADED", "PROCESSING", "READY", "FAILED"] as const;
const ACTIVE = new Set(["UPLOADED", "PROCESSING"]);

export function VideoAssetsPage() {
  const [status, setStatus] = useState<string>("FAILED");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const toast = useToast();
  const [retrying, setRetrying] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["video-assets", { status, page }],
    queryFn: ({ signal }) => api.get<Paged<VideoAsset>>("/admin/video-assets", { status, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((a) => ACTIVE.has(a.status)) ? 5000 : false),
  });

  async function retry(id: string) {
    setRetrying(id);
    try {
      await api.post(`/admin/video-assets/${id}/retry`);
      toast.success("Processing retried");
      await qc.invalidateQueries({ queryKey: ["video-assets"] });
    } catch (err) {
      toast.error(err);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Video processing"
        description="Uploads and their transcoding status. Failed jobs are retried 3 times automatically before landing here."
        actions={
          <Button size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
            Refresh
          </Button>
        }
      />
      <div className="mb-4 max-w-xs">
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Video assets">
            <thead>
              <tr>
                <Th>Drama / episode</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Size</Th>
                <Th>Duration</Th>
                <Th>Created</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={7}>No assets with this status</EmptyRow>}
              {query.data.items.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    {a.drama ? (
                      <Link href={`/dramas/${a.drama.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.drama.title}
                      </Link>
                    ) : (
                      <span className="text-muted">Unassigned</span>
                    )}
                    {a.episodeNumber !== null && <span className="text-muted"> · ep {a.episodeNumber}</span>}
                    <p className="font-mono text-xs text-muted">{a.id}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                    {a.lastError && <p className="mt-1 max-w-sm text-xs text-red-700">{a.lastError}</p>}
                  </Td>
                  <Td className="tabular-nums">{a.attempts}</Td>
                  <Td>{formatBytes(a.sizeBytes)}</Td>
                  <Td>{fmtDuration(a.durationMs ? a.durationMs / 1000 : null)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(a.createdAt)}</Td>
                  <Td className="text-right">
                    {a.status === "FAILED" && (
                      <Button size="sm" onClick={() => retry(a.id)} loading={retrying === a.id}>
                        Retry
                      </Button>
                    )}
                  </Td>
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
