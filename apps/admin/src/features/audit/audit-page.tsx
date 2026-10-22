"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Fragment, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { PageHeader, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AuditLog, Paged } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY = { q: "", actorId: "", entityType: "", entityId: "", from: "", to: "" };

export function AuditPage() {
  const [form, setForm] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["audit", filters, page],
    queryFn: ({ signal }) =>
      api.get<Paged<AuditLog>>(
        "/admin/audit-logs",
        {
          ...filters,
          // Dates are inclusive whole days in UTC.
          from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
          to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
          page,
          pageSize: 50,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  function apply(e: FormEvent) {
    e.preventDefault();
    if (form.actorId && !UUID.test(form.actorId.trim())) return setError("Actor ID must be a user UUID");
    setError(null);
    setPage(1);
    setFilters({ ...form, actorId: form.actorId.trim(), entityId: form.entityId.trim() });
  }

  return (
    <>
      <PageHeader title="Audit log" description="Every admin write and wallet adjustment, newest first." />
      <form onSubmit={apply} className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
        <Field label="Action contains">
          <Input value={form.q} placeholder="e.g. drama.publish" onChange={(e) => setForm({ ...form, q: e.target.value })} />
        </Field>
        <Field label="Entity type">
          <Input value={form.entityType} placeholder="e.g. drama" onChange={(e) => setForm({ ...form, entityType: e.target.value })} />
        </Field>
        <Field label="Entity ID">
          <Input value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} />
        </Field>
        <Field label="Actor (user ID)">
          <Input value={form.actorId} onChange={(e) => setForm({ ...form, actorId: e.target.value })} />
        </Field>
        <Field label="From">
          <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </Field>
        <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          <Button
            onClick={() => {
              setForm(EMPTY);
              setFilters(EMPTY);
              setPage(1);
              setError(null);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
      <FormError message={error} />
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Audit log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Request</Th>
                <Th>
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={6}>No entries match</EmptyRow>}
              {query.data.items.map((l) => (
                <Fragment key={l.id}>
                  <Tr>
                    <Td className="whitespace-nowrap text-muted">{fmtDateTime(l.createdAt)}</Td>
                    <Td className="text-xs">{l.actor?.email ?? l.actorId ?? "system"}</Td>
                    <Td className="font-mono text-xs">{l.action}</Td>
                    <Td className="text-xs">
                      {l.entityType}
                      {l.entityId && <span className="block font-mono text-muted">{l.entityId}</span>}
                    </Td>
                    <Td className="font-mono text-xs text-muted">{l.requestId ?? "—"}</Td>
                    <Td className="text-right">
                      {(l.before !== null || l.after !== null) && (
                        <Button size="sm" variant="ghost" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)}>
                          {open === l.id ? "Hide" : "Changes"}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                  {open === l.id && (
                    <tr>
                      <td colSpan={6} className="bg-subtle px-3 py-2">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted">Before</p>
                            <pre className="max-h-72 overflow-auto rounded bg-surface p-2 text-xs">{JSON.stringify(l.before, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted">After</p>
                            <pre className="max-h-72 overflow-auto rounded bg-surface p-2 text-xs">{JSON.stringify(l.after, null, 2)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
