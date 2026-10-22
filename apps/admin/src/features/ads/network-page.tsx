"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Badge, Callout, Card, PageHeader, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { parseAdmobCsv, type ParseResult } from "@/lib/admob-csv";
import { usePermission } from "@/lib/auth";
import { fmtNumber, isoDay } from "@/lib/format";
import { formatMicros } from "@/lib/money";
import type { NetworkReport } from "@/lib/types";
import { AdsNav } from "./ads-nav";

const SAMPLE = `Date,Ad unit ID,Impressions,Clicks,Estimated earnings (USD)
2026-10-20,ca-app-pub-1234567890123456/1234567890,1520,14,3.25`;

function ImportCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importRows() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ imported: number }>("/admin/ads/network-reports/import", { rows: parsed.rows });
      toast.success(`Imported ${res.imported} AdMob rows`);
      setText("");
      setParsed(null);
      await qc.invalidateQueries({ queryKey: ["network-report"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Import AdMob report (CSV)">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          In AdMob, open Reports, group by Date and Ad unit, export as CSV and paste it here. Rows for the same date and ad unit replace the earlier import.
        </p>
        <Field label="CSV" hint={<>Columns: Date, Ad unit ID, Impressions, Clicks, Estimated earnings (optionally Currency).</>}>
          <Textarea
            value={text}
            rows={8}
            className="font-mono text-xs"
            placeholder={SAMPLE}
            onChange={(e) => {
              setText(e.target.value);
              setParsed(null);
            }}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Default currency" hint="Used when the CSV does not say.">
            <Input value={currency} maxLength={3} className="w-24 uppercase" onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </Field>
          <Button onClick={() => setParsed(parseAdmobCsv(text, currency || "USD"))} disabled={!text.trim()}>
            Preview
          </Button>
          <Button variant="primary" onClick={importRows} disabled={!parsed || parsed.rows.length === 0 || parsed.errors.length > 0} loading={busy}>
            Import {parsed?.rows.length ? `${parsed.rows.length} rows` : ""}
          </Button>
        </div>
        <FormError message={error} />
        {parsed && parsed.errors.length > 0 && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p className="font-medium">Fix these lines before importing:</p>
            <ul className="mt-1 list-disc pl-5">
              {parsed.errors.slice(0, 20).map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  {e.line > 0 ? `Line ${e.line}: ` : ""}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {parsed && parsed.rows.length > 0 && (
          <Table caption="Import preview">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Ad unit</Th>
                <Th className="text-right">Impressions</Th>
                <Th className="text-right">Clicks</Th>
                <Th className="text-right">Est. earnings</Th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 50).map((r, i) => (
                <Tr key={i}>
                  <Td>{r.date}</Td>
                  <Td className="font-mono text-xs">{r.adUnitId}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(r.impressions)}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(r.clicks)}</Td>
                  <Td className="text-right tabular-nums">{formatMicros(r.estimatedEarningsMicros, r.currency)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {parsed && parsed.rows.length > 50 && <p className="text-xs text-muted">Showing the first 50 of {parsed.rows.length} rows.</p>}
      </div>
    </Card>
  );
}

function ReportCard() {
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [range, setRange] = useState({ from, to });
  const query = useQuery({ queryKey: ["network-report", range], queryFn: ({ signal }) => api.get<NetworkReport>("/admin/ads/network-reports", range, signal) });

  // Totals per currency; AdMob earnings are never mixed with direct campaign revenue (paise).
  const totals = useMemo(() => {
    const t = new Map<string, { impressions: number; clicks: number; micros: number }>();
    for (const r of query.data?.rows ?? []) {
      const cur = t.get(r.currency) ?? { impressions: 0, clicks: 0, micros: 0 };
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      cur.micros += r.estimatedEarningsMicros;
      t.set(r.currency, cur);
    }
    return [...t.entries()];
  }, [query.data]);

  return (
    <Card title={<span className="flex items-center gap-2">AdMob network report <Badge tone="yellow">Network revenue</Badge></span>}>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to });
        }}
      >
        <Field label="From">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="submit">Show</Button>
      </form>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {totals.length > 0 && (
            <dl className="mb-4 flex flex-wrap gap-3">
              {totals.map(([currency, t]) => (
                <div key={currency} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <dt className="text-xs text-amber-900">AdMob est. earnings ({currency})</dt>
                  <dd className="text-lg font-semibold tabular-nums">{formatMicros(t.micros, currency)}</dd>
                  <dd className="text-xs text-muted">
                    {fmtNumber(t.impressions)} impressions · {fmtNumber(t.clicks)} clicks
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Table caption="AdMob network report">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Ad unit</Th>
                <Th className="text-right">Impressions</Th>
                <Th className="text-right">Clicks</Th>
                <Th className="text-right">Est. earnings</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.length === 0 && <EmptyRow colSpan={5}>No imported AdMob data in this range</EmptyRow>}
              {query.data.rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{r.reportDate.slice(0, 10)}</Td>
                  <Td className="font-mono text-xs">{r.adUnitId}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(r.impressions)}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(r.clicks)}</Td>
                  <Td className="text-right tabular-nums">{formatMicros(r.estimatedEarningsMicros, r.currency)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Card>
  );
}

export function NetworkPage() {
  const canWrite = usePermission("ads:write");
  return (
    <>
      <PageHeader title="Ads" description="Revenue reported by Google AdMob. Kept separate from direct-campaign revenue." />
      <AdsNav />
      <div className="space-y-6">
        <Callout tone="gray">AdMob figures are Google&apos;s estimates in the report currency. Direct campaign revenue (rupees, from our own counts) is on each campaign&apos;s report.</Callout>
        {canWrite && <ImportCard />}
        <ReportCard />
      </div>
    </>
  );
}
