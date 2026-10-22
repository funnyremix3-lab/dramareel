"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Field, Input } from "@/components/ui/form";
import { PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import type { Paged, UserListItem } from "@/lib/types";
import { useDebounced } from "../dramas/dramas-list";

export function UsersList() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const query = useQuery({
    queryKey: ["users", { q: search, page }],
    queryFn: ({ signal }) => api.get<Paged<UserListItem>>("/admin/users", { q: search, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Users" description="Search by email, phone, display name or user ID." />
      <div className="mb-4 max-w-md">
        <Field label="Search">
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Users">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                <Th className="text-right">Coins</Th>
                <Th>Last seen</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={6}>No users found</EmptyRow>}
              {query.data.items.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link href={`/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                      {u.displayName || u.email || u.phone || u.id}
                    </Link>
                    <p className="text-xs text-muted">{u.email ?? u.phone ?? u.id}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="text-xs">{u.roles.join(", ") || <span className="text-muted">viewer</span>}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(u.balance)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(u.lastSeenAt)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(u.createdAt)}</Td>
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
