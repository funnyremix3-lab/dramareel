"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { Badge, Card, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, ErrorState, QueryState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { fmtNumber, fmtPercent, isoDay } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { creativeSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { CampaignDetail as CampaignDetailT, CampaignReport, CampaignStatus, ImageUploadTarget } from "@/lib/types";
import { IMAGE_TYPES, formatBytes, putFile } from "@/lib/upload";
import { AdsNav } from "./ads-nav";
import { CampaignForm, campaignToForm, emptyCampaignForm } from "./campaign-form";

/** Manual status transitions allowed by the API (admin-ads.service.ts TRANSITIONS). */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELED"],
  SCHEDULED: ["ACTIVE", "PAUSED", "CANCELED"],
  ACTIVE: ["PAUSED", "COMPLETED", "CANCELED"],
  PAUSED: ["ACTIVE", "COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

const ACTIONS: Record<string, { path: string; label: string; description: string; danger?: boolean }> = {
  SCHEDULED: { path: "schedule", label: "Schedule", description: "The campaign starts serving automatically at its start time. Needs an approved creative." },
  ACTIVE: { path: "activate", label: "Activate", description: "The campaign becomes eligible to serve now (within its dates). Needs an approved creative." },
  PAUSED: { path: "pause", label: "Pause", description: "Serving stops until it is activated again." },
  COMPLETED: { path: "complete", label: "Complete", description: "Marks the campaign finished. It cannot be edited or restarted afterwards." },
  CANCELED: { path: "cancel", label: "Cancel campaign", description: "Stops the campaign permanently. It cannot be edited or restarted.", danger: true },
};

const MAX_CREATIVE_BYTES = 2 * 1024 * 1024;

function CreativeUpload({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ headline: "", ctaText: "", destinationUrl: "https://", label: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validate(creativeSchema, v);
    const fileError = !file ? "Choose an image" : !(IMAGE_TYPES as readonly string[]).includes(file.type) ? "JPEG, PNG or WebP only" : file.size > MAX_CREATIVE_BYTES ? `Image is ${formatBytes(file.size)}; the limit is 2 MB` : null;
    if (!r.ok || fileError) {
      setErrors({ ...(r.ok ? {} : r.errors), ...(fileError ? { file: fileError } : {}) });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const target = await api.post<ImageUploadTarget>(`/admin/ads/campaigns/${campaignId}/creative-upload-url`, { contentType: file!.type, sizeBytes: file!.size });
      await putFile(target.uploadUrl, file!, { headers: target.headers, onProgress: setProgress });
      await api.post(`/admin/ads/campaigns/${campaignId}/creatives`, { type: "IMAGE", mediaKey: target.key, ...r.data });
      toast.success("Creative uploaded. It needs review before it can serve.");
      setFile(null);
      setInputKey((k) => k + 1);
      setProgress(null);
      setV({ headline: "", ctaText: "", destinationUrl: "https://", label: "" });
      await qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Image" required error={errors.file} hint="JPEG, PNG or WebP, up to 2 MB.">
          <Input key={inputKey} type="file" accept={IMAGE_TYPES.join(",")} className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Destination URL" required error={errors.destinationUrl} hint="Must be https://">
          <Input type="url" value={v.destinationUrl} onChange={(e) => setV({ ...v, destinationUrl: e.target.value })} />
        </Field>
        <Field label="Headline" error={errors.headline}>
          <Input value={v.headline} maxLength={90} onChange={(e) => setV({ ...v, headline: e.target.value })} />
        </Field>
        <Field label="Call to action" error={errors.ctaText} hint="e.g. Learn more">
          <Input value={v.ctaText} maxLength={30} onChange={(e) => setV({ ...v, ctaText: e.target.value })} />
        </Field>
        <Field label="Label" error={errors.label} hint='Defaults to "Sponsored". The app always shows a sponsored label.'>
          <Input value={v.label} maxLength={30} onChange={(e) => setV({ ...v, label: e.target.value })} />
        </Field>
      </div>
      {progress !== null && <progress className="h-2 w-full" value={progress} max={1} aria-label="Upload progress" />}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          Upload creative
        </Button>
      </div>
    </form>
  );
}

function CampaignReportCard({ campaignId }: { campaignId: string }) {
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [range, setRange] = useState({ from, to });
  const query = useQuery({
    queryKey: ["campaign-report", campaignId, range],
    queryFn: ({ signal }) => api.get<CampaignReport>(`/admin/ads/campaigns/${campaignId}/report`, range, signal),
  });

  return (
    <Card title="Daily delivery report (direct revenue)">
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
          <p className="mb-2 text-sm text-muted">
            {query.data.pricingModel} at {formatPaise(query.data.ratePaise)}
            {query.data.pricingModel === "CPM" ? " per 1,000 impressions" : query.data.pricingModel === "CPC" ? " per click" : " flat (not computed per day)"}
          </p>
          <Table caption="Campaign daily report">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="text-right">Impressions</Th>
                <Th className="text-right">Clicks</Th>
                <Th className="text-right">CTR</Th>
                <Th className="text-right">Spend (direct)</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.days.length === 0 && <EmptyRow colSpan={5}>No days in range</EmptyRow>}
              {query.data.days.map((d) => (
                <Tr key={d.date}>
                  <Td className="whitespace-nowrap">{d.date}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(d.impressions)}</Td>
                  <Td className="text-right tabular-nums">{fmtNumber(d.clicks)}</Td>
                  <Td className="text-right tabular-nums">{fmtPercent(d.ctr)}</Td>
                  <Td className="text-right tabular-nums">{formatPaise(d.spendPaise)}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <Td>Total</Td>
                <Td className="text-right tabular-nums">{fmtNumber(query.data.totals.impressions)}</Td>
                <Td className="text-right tabular-nums">{fmtNumber(query.data.totals.clicks)}</Td>
                <Td className="text-right tabular-nums">{query.data.totals.impressions ? fmtPercent(query.data.totals.clicks / query.data.totals.impressions) : "—"}</Td>
                <Td className="text-right tabular-nums">{formatPaise(query.data.totals.spendPaise)}</Td>
              </tr>
            </tfoot>
          </Table>
        </>
      )}
    </Card>
  );
}

export function NewCampaign() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <>
      <PageHeader title="New campaign" description="Created as a draft. Upload and approve a creative, then schedule or activate it." />
      <AdsNav />
      <Card>
        <CampaignForm
          initial={emptyCampaignForm}
          submitLabel="Create campaign"
          onSubmit={async (payload) => {
            const c = await api.post<{ id: string }>("/admin/ads/campaigns", payload);
            toast.success("Campaign created");
            await qc.invalidateQueries({ queryKey: ["campaigns"] });
            router.push(`/ads/campaigns/${c.id}`);
          }}
        />
      </Card>
    </>
  );
}

export function CampaignDetail({ id }: { id: string }) {
  const canWrite = usePermission("ads:write");
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["campaign", id], queryFn: ({ signal }) => api.get<CampaignDetailT>(`/admin/ads/campaigns/${id}`, undefined, signal) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["campaign", id] }), qc.invalidateQueries({ queryKey: ["campaigns"] })]);

  async function review(creativeId: string, decision: "APPROVED" | "REJECTED") {
    await api.post(`/admin/ads/creatives/${creativeId}/review`, { decision });
    toast.success(decision === "APPROVED" ? "Creative approved" : "Creative rejected");
    await refresh();
  }

  return (
    <QueryState query={query}>
      {(c) => {
        const finished = c.status === "COMPLETED" || c.status === "CANCELED";
        return (
          <>
            <p className="mb-2 text-sm">
              <Link href="/ads/campaigns" className="text-brand-700 hover:underline">
                ← Campaigns
              </Link>
            </p>
            <PageHeader
              title={c.name}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} /> <Badge tone="blue">Direct campaign</Badge> <span>{c.advertiserName}</span>
                </span>
              }
              actions={
                canWrite &&
                CAMPAIGN_TRANSITIONS[c.status].map((to) => {
                  const a = ACTIONS[to];
                  return (
                    <ConfirmButton
                      key={to}
                      label={a.label}
                      variant={a.danger ? "danger" : to === "ACTIVE" ? "primary" : "secondary"}
                      danger={a.danger}
                      title={`${a.label}?`}
                      description={a.description}
                      confirmLabel={a.label}
                      onConfirm={async () => {
                        await api.post(`/admin/ads/campaigns/${id}/${a.path}`);
                        toast.success(`Campaign ${to.toLowerCase()}`);
                        await refresh();
                      }}
                    />
                  );
                })
              }
            />
            <div className="space-y-6">
              <Card title="Campaign settings">
                {finished && <p className="mb-3 text-sm text-muted">Finished campaigns cannot be edited.</p>}
                <CampaignForm
                  key={c.id + c.status}
                  initial={c ? campaignToForm(c) : emptyCampaignForm}
                  submitLabel="Save campaign"
                  disabled={!canWrite || finished}
                  onSubmit={async (payload) => {
                    await api.put(`/admin/ads/campaigns/${id}`, payload);
                    toast.success("Campaign saved");
                    await refresh();
                  }}
                />
              </Card>

              <Card title="Creatives">
                <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {c.creatives.length === 0 && <p className="text-sm text-muted">No creatives yet.</p>}
                  {c.creatives.map((cr) => (
                    <div key={cr.id} className="rounded-md border border-line p-3">
                      {cr.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- creative preview from the media CDN
                        <img src={cr.mediaUrl} alt={cr.headline ?? "Creative image"} className="mb-2 aspect-video w-full rounded object-cover" />
                      ) : (
                        <div className="mb-2 aspect-video w-full rounded bg-subtle" />
                      )}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={cr.reviewStatus} />
                        <Badge>{cr.label}</Badge>
                      </div>
                      {cr.headline && <p className="mt-1 text-sm font-medium">{cr.headline}</p>}
                      {cr.ctaText && <p className="text-xs text-muted">CTA: {cr.ctaText}</p>}
                      <p className="break-all text-xs text-muted">{cr.destinationUrl}</p>
                      {canWrite && cr.reviewStatus !== "APPROVED" && (
                        <div className="mt-2 flex gap-2">
                          <ConfirmButton label="Approve" variant="primary" title="Approve this creative?" description="Approved creatives can serve to viewers. Check the image, text and destination first." confirmLabel="Approve" onConfirm={() => review(cr.id, "APPROVED")} />
                          {cr.reviewStatus !== "REJECTED" && (
                            <ConfirmButton label="Reject" title="Reject this creative?" description="It will never serve." confirmLabel="Reject" onConfirm={() => review(cr.id, "REJECTED")} />
                          )}
                        </div>
                      )}
                      {canWrite && cr.reviewStatus === "APPROVED" && (
                        <div className="mt-2">
                          <ConfirmButton label="Revoke (reject)" title="Reject this approved creative?" description="It stops serving immediately." confirmLabel="Reject" onConfirm={() => review(cr.id, "REJECTED")} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {canWrite && !finished && (
                  <div className="border-t border-line pt-4">
                    <h3 className="mb-3 text-sm font-semibold">Upload a new image creative</h3>
                    <CreativeUpload campaignId={id} />
                  </div>
                )}
              </Card>

              <CampaignReportCard campaignId={id} />
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
