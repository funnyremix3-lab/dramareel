"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { api } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import type { CampaignListItem, Paged } from "@/lib/types";
import { useDebounced } from "../dramas/dramas-list";
import { AdsNav } from "./ads-nav";

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELED"] as const;

export function CampaignsList() {
  const canWrite = usePermission("ads:write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const query = useQuery({
    queryKey: ["campaigns", { q: search, status, page }],
    queryFn: ({ signal }) => api.get<Paged<CampaignListItem>>("/admin/ads/campaigns", { q: search, status, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Ads"
        description="Direct campaigns are sold by us and billed from our own impression/click counts (direct revenue)."
        actions={
          canWrite && (
            <Link href="/ads/campaigns/new" className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
              New campaign
            </Link>
          )
        }
      />
      <AdsNav />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Search">
          <Input
            type="search"
            placeholder="Campaign or advertiser"
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
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
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
          <Table caption="Direct campaigns">
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th>Dates</Th>
                <Th>Pricing</Th>
                <Th className="text-right">Impr. / clicks</Th>
                <Th className="text-right">Direct spend</Th>
                <Th className="text-right">Creatives</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={7}>No campaigns</EmptyRow>}
              {query.data.items.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/ads/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted">{c.advertiserName}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {fmtDate(c.startAt)} – {fmtDate(c.endAt)}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {c.pricingModel} · {formatPaise(c.ratePaise)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {fmtNumber(c.impressions)} / {fmtNumber(c.clicks)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatPaise(c.spentPaise)}
                    {c.totalBudgetPaise !== null && <p className="text-xs text-muted">of {formatPaise(c.totalBudgetPaise)}</p>}
                  </Td>
                  <Td className="text-right tabular-nums">{c.creatives}</Td>
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
