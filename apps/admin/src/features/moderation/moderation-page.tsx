"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { ModerationComment, Paged } from "@/lib/types";
import { useDebounced } from "../dramas/dramas-list";

export function ModerationPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [reported, setReported] = useState(true);
  const [status, setStatus] = useState("VISIBLE");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  const query = useQuery({
    queryKey: ["moderation", { reported, status, q: search, page }],
    queryFn: ({ signal }) => api.get<Paged<ModerationComment>>("/admin/moderation/comments", { reported: reported ? "true" : undefined, status, q: search, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });

  async function act(path: string, msg: string, body?: unknown) {
    await api.post(path, body);
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: ["moderation"] });
  }

  return (
    <>
      <PageHeader title="Moderation" description="Comments, sorted by report count when filtering reported ones." />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Search comment text">
          <Input
            type="search"
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
            <option value="VISIBLE">Visible</option>
            <option value="HIDDEN">Hidden</option>
            <option value="DELETED">Deleted</option>
          </Select>
        </Field>
        <Checkbox
          className="pb-2"
          label="Reported only"
          checked={reported}
          onCheckedChange={(v) => {
            setReported(v);
            setPage(1);
          }}
        />
      </div>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Comments">
            <thead>
              <tr>
                <Th>Comment</Th>
                <Th>Author</Th>
                <Th>Where</Th>
                <Th>Status</Th>
                <Th>Open reports</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={6}>The queue is empty</EmptyRow>}
              {query.data.items.map((c) => (
                <Tr key={c.id}>
                  <Td className="max-w-md">
                    <p className="whitespace-pre-wrap break-words">{c.body}</p>
                    <p className="mt-1 text-xs text-muted">{fmtDateTime(c.createdAt)}</p>
                  </Td>
                  <Td>
                    <Link href={`/users/${c.user.id}`} className="text-brand-700 hover:underline">
                      {c.user.profile?.displayName || c.user.email || c.user.id.slice(0, 8)}
                    </Link>
                    {c.user.status !== "ACTIVE" && (
                      <span className="ml-1">
                        <StatusBadge status={c.user.status} />
                      </span>
                    )}
                  </Td>
                  <Td className="text-xs">
                    <Link href={`/dramas/${c.episode.drama.id}`} className="text-brand-700 hover:underline">
                      {c.episode.drama.title}
                    </Link>{" "}
                    · ep {c.episode.number}
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                    <p className="text-xs text-muted">{c.reportCount} total reports</p>
                  </Td>
                  <Td>
                    {c.reports.length === 0 ? (
                      <span className="text-xs text-muted">None open</span>
                    ) : (
                      <ul className="space-y-2">
                        {c.reports.map((r) => (
                          <li key={r.id} className="text-xs">
                            <span className="font-semibold">{r.reason}</span>
                            {r.details && <span className="text-muted">: {r.details}</span>}
                            <div className="mt-1 flex gap-1">
                              <Button size="sm" onClick={() => act(`/admin/reports/${r.id}/resolve`, "Report actioned", { resolution: "ACTIONED" }).catch(toast.error)}>
                                Action
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => act(`/admin/reports/${r.id}/resolve`, "Report dismissed", { resolution: "DISMISSED" }).catch(toast.error)}>
                                Dismiss
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-1">
                      {c.status === "VISIBLE" && (
                        <ConfirmButton label="Hide" title="Hide this comment?" description="It disappears for viewers and its open reports are marked actioned." confirmLabel="Hide" onConfirm={() => act(`/admin/comments/${c.id}/hide`, "Comment hidden")} />
                      )}
                      {c.status !== "VISIBLE" && (
                        <ConfirmButton label="Restore" title="Restore this comment?" description="It becomes visible again." confirmLabel="Restore" onConfirm={() => act(`/admin/comments/${c.id}/restore`, "Comment restored")} />
                      )}
                      {c.status !== "DELETED" && (
                        <ConfirmButton
                          label="Delete"
                          variant="danger"
                          danger
                          title="Delete this comment?"
                          description="It is removed for viewers. Moderators can still restore it from the Deleted filter."
                          confirmLabel="Delete"
                          onConfirm={() => act(`/admin/comments/${c.id}/delete`, "Comment deleted")}
                        />
                      )}
                    </div>
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
