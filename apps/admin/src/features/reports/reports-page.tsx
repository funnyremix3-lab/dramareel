"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Badge, Card, PageHeader } from "@/components/ui/layout";
import { useToast } from "@/components/ui/toast";
import { apiDownload, errorMessage } from "@/lib/api";
import { isoDay } from "@/lib/format";

export const REPORT_KINDS = [
  { kind: "plays", label: "Plays", description: "Plays and completions per drama per day." },
  { kind: "rewards", label: "Rewarded ads", description: "Reward claims by placement and status, with coins granted." },
  { kind: "wallet", label: "Wallet ledger", description: "Coin transactions per day and type." },
  { kind: "signups", label: "Sign-ups", description: "New users per day." },
  { kind: "revenue-direct", label: "Direct campaign revenue", description: "Impressions, clicks and spend (paise) per campaign per day.", tag: "Direct" },
  { kind: "revenue-network", label: "AdMob network revenue", description: "Imported AdMob rows: impressions, clicks, estimated earnings (micros).", tag: "Network" },
] as const;

/** Range must be ascending and at most 366 days (enforced by the API too). */
export function validateRange(from: string, to: string): string | null {
  if (!from || !to) return "Choose both dates";
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "Invalid date";
  if (b < a) return "The end date must be on or after the start date";
  if ((b - a) / 86_400_000 > 366) return "The range can be at most 366 days";
  return null;
}

export function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: string) {
    const rangeError = validateRange(from, to);
    if (rangeError) return setError(rangeError);
    setError(null);
    setBusy(kind);
    try {
      await apiDownload(`/admin/reports/${kind}.csv`, { from, to }, `${kind}-${from}-${to}.csv`);
      toast.success(`${kind}.csv downloaded`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Reports" description="CSV exports (UTF-8, opens in Excel). Dates are UTC days, inclusive." />
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <FormError message={error} />
        <ul className="mt-4 divide-y divide-line">
          {REPORT_KINDS.map((r) => (
            <li key={r.kind} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {r.label}
                  {"tag" in r && <Badge tone={r.tag === "Direct" ? "blue" : "yellow"}>{r.tag} revenue</Badge>}
                </p>
                <p className="text-xs text-muted">{r.description}</p>
              </div>
              <Button size="sm" onClick={() => download(r.kind)} loading={busy === r.kind} disabled={busy !== null && busy !== r.kind}>
                Download {r.kind}.csv
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
