"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Stat, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, QueryState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { formatMicros } from "@/lib/money";
import type { Overview } from "@/lib/types";

const label = (k: string) => k.replace(/_/g, " ").toLowerCase();

function Breakdown({ data, empty = "None today" }: { data: Record<string, number>; empty?: string }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 rounded bg-subtle px-2 py-1">
          <dt className="capitalize text-muted">{label(k)}</dt>
          <dd className="font-medium tabular-nums">{fmtNumber(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OverviewPage() {
  const query = useQuery({ queryKey: ["overview"], queryFn: ({ signal }) => api.get<Overview>("/admin/overview", undefined, signal), refetchInterval: 60_000 });

  return (
    <>
      <PageHeader
        title="Overview"
        description={query.data ? `Today (UTC) · updated ${fmtDateTime(query.data.generatedAt)}` : "Today's activity (UTC)"}
        actions={
          <Button size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
            Refresh
          </Button>
        }
      />
      <QueryState query={query}>
        {(o) => (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Users" value={fmtNumber(o.users.total)} hint={`${fmtNumber(o.users.newToday)} new today`} />
              <Stat label="DAU / WAU" value={`${fmtNumber(o.users.dau)} / ${fmtNumber(o.users.wau)}`} hint="Seen in the last 24 h / 7 days" />
              <Stat label="Plays today" value={fmtNumber(o.engagement.playsToday)} />
              <Stat label="Rewards granted today" value={fmtNumber(o.engagement.rewardsGrantedToday)} />
            </dl>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Unlocks today by method">
                <Breakdown data={o.unlocksToday} />
              </Card>
              <Card title="Coins today">
                <p className="mb-2 text-sm">
                  Spent on unlocks: <span className="font-semibold tabular-nums">{fmtNumber(o.coins.spentOnUnlocksToday)}</span>
                </p>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Issued by type</p>
                <Breakdown data={o.coins.issuedToday} />
              </Card>
              <Card title="Video assets by status" actions={<Link className="text-xs text-brand-700 underline" href="/video-assets">Open</Link>}>
                <Breakdown data={o.media} empty="No assets yet" />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Moderation">
                <p className="text-sm">
                  Open reports: <span className="text-lg font-semibold tabular-nums">{fmtNumber(o.moderation.openReports)}</span>
                </p>
              </Card>
              {/* Direct and network ads are never summed: they are different revenue sources. */}
              <Card title="Direct campaigns (first-party)" className="border-blue-200">
                <p className="mb-2 text-xs text-muted">Counted by our API from signed serves.</p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Impressions today</dt>
                    <dd className="text-lg font-semibold tabular-nums">{fmtNumber(o.ads.direct.impressionsToday)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Clicks today</dt>
                    <dd className="text-lg font-semibold tabular-nums">{fmtNumber(o.ads.direct.clicksToday)}</dd>
                  </div>
                </dl>
              </Card>
              <Card title="AdMob network (Google)" className="border-amber-200">
                <p className="mb-2 text-xs text-muted">Imported AdMob reports, last 7 days. Estimated earnings in the report currency.</p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">Impressions</dt>
                    <dd className="text-lg font-semibold tabular-nums">{fmtNumber(o.ads.network.last7DaysImpressions)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Est. earnings</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatMicros(o.ads.network.last7DaysEarningsMicros)}</dd>
                  </div>
                </dl>
              </Card>
            </div>

            <Card title="Top dramas by views">
              <Table caption="Top dramas">
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Views</Th>
                    <Th className="text-right">Favourites</Th>
                  </tr>
                </thead>
                <tbody>
                  {o.topDramas.length === 0 && <EmptyRow colSpan={4}>No dramas yet</EmptyRow>}
                  {o.topDramas.map((d) => (
                    <Tr key={d.id}>
                      <Td>
                        <Link href={`/dramas/${d.id}`} className="font-medium text-brand-700 hover:underline">
                          {d.title}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge status={d.status} />
                      </Td>
                      <Td className="text-right tabular-nums">{fmtNumber(d.viewCount)}</Td>
                      <Td className="text-right tabular-nums">{fmtNumber(d.favoriteCount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        )}
      </QueryState>
    </>
  );
}
