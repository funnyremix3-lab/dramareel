"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxGroup, Field, FormError, Input, Select } from "@/components/ui/form";
import { errorMessage } from "@/lib/api";
import { paiseToRupees } from "@/lib/money";
import { campaignFormSchema, campaignPayload, isoToLocal, validate, type CampaignFormValues, type FieldErrors } from "@/lib/schemas";
import type { Campaign } from "@/lib/types";
import { usePlacements } from "./placements-page";

const SPONSORED = new Set(["SPONSORED_CARD", "SPONSORED_VIDEO"]);

export function campaignToForm(c: Campaign): CampaignFormValues {
  return {
    name: c.name,
    advertiserName: c.advertiserName,
    advertiserContact: c.advertiserContact ?? "",
    startAt: isoToLocal(c.startAt),
    endAt: isoToLocal(c.endAt),
    pricingModel: c.pricingModel,
    rateRupees: paiseToRupees(c.ratePaise),
    totalBudgetRupees: paiseToRupees(c.totalBudgetPaise),
    dailyImpressionCap: c.dailyImpressionCap === null ? "" : String(c.dailyImpressionCap),
    perUserDailyCap: c.perUserDailyCap === null ? "" : String(c.perUserDailyCap),
    priority: String(c.priority),
    languages: (c.targeting.languages ?? []).filter((l): l is "en" | "hi" => l === "en" || l === "hi"),
    platforms: c.targeting.platforms ?? [],
    placementKeys: c.placementKeys,
  };
}

export const emptyCampaignForm: CampaignFormValues = {
  name: "",
  advertiserName: "",
  advertiserContact: "",
  startAt: "",
  endAt: "",
  pricingModel: "CPM",
  rateRupees: "",
  totalBudgetRupees: "",
  dailyImpressionCap: "",
  perUserDailyCap: "3",
  priority: "0",
  languages: [],
  platforms: [],
  placementKeys: [],
};

const RATE_LABEL = { CPM: "Rate per 1,000 impressions (₹)", CPC: "Rate per click (₹)", FLAT: "Flat fee for the campaign (₹)" } as const;

export type CampaignPayload = ReturnType<typeof campaignPayload>;

export function CampaignForm({ initial, submitLabel, onSubmit, disabled }: { initial: CampaignFormValues; submitLabel: string; onSubmit: (p: CampaignPayload) => Promise<unknown>; disabled?: boolean }) {
  const placements = usePlacements();
  const [v, setV] = useState<CampaignFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CampaignFormValues>(k: K, val: CampaignFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const sponsored = (placements.data ?? []).filter((p) => SPONSORED.has(p.format));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validate(campaignFormSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(campaignPayload(r.data));
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={formError} />
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign name" required error={errors.name}>
            <Input value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Advertiser" required error={errors.advertiserName}>
            <Input value={v.advertiserName} maxLength={120} onChange={(e) => set("advertiserName", e.target.value)} />
          </Field>
          <Field label="Advertiser contact" error={errors.advertiserContact}>
            <Input value={v.advertiserContact} maxLength={200} onChange={(e) => set("advertiserContact", e.target.value)} />
          </Field>
          <Field label="Priority" error={errors.priority} hint="0–100. Higher serves first; equal priorities rotate.">
            <Input inputMode="numeric" value={v.priority} onChange={(e) => set("priority", e.target.value)} />
          </Field>
          <Field label="Starts" required error={errors.startAt} hint="Your local time">
            <Input type="datetime-local" value={v.startAt} onChange={(e) => set("startAt", e.target.value)} />
          </Field>
          <Field label="Ends" required error={errors.endAt} hint="Your local time">
            <Input type="datetime-local" value={v.endAt} onChange={(e) => set("endAt", e.target.value)} />
          </Field>
        </div>

        <fieldset className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Pricing & budget (direct revenue, in rupees; stored as paise)</legend>
          <Field label="Pricing model" error={errors.pricingModel}>
            <Select
              value={v.pricingModel}
              onChange={(e) => set("pricingModel", e.target.value as CampaignFormValues["pricingModel"])}
            >
              <option value="CPM">CPM (per 1,000 impressions)</option>
              <option value="CPC">CPC (per click)</option>
              <option value="FLAT">Flat fee</option>
            </Select>
          </Field>
          <Field label={RATE_LABEL[v.pricingModel]} required error={errors.rateRupees}>
            <Input inputMode="decimal" placeholder="e.g. 150.00" value={v.rateRupees} onChange={(e) => set("rateRupees", e.target.value)} />
          </Field>
          <Field label="Total budget (₹)" error={errors.totalBudgetRupees} hint="Empty means no budget limit.">
            <Input inputMode="decimal" value={v.totalBudgetRupees} onChange={(e) => set("totalBudgetRupees", e.target.value)} />
          </Field>
          <Field label="Daily impression cap" error={errors.dailyImpressionCap} hint="Empty means no cap.">
            <Input inputMode="numeric" value={v.dailyImpressionCap} onChange={(e) => set("dailyImpressionCap", e.target.value)} />
          </Field>
          <Field label="Per-user daily cap" error={errors.perUserDailyCap} hint="1–100, empty means no cap.">
            <Input inputMode="numeric" value={v.perUserDailyCap} onChange={(e) => set("perUserDailyCap", e.target.value)} />
          </Field>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <CheckboxGroup
            legend="Target languages"
            hint="None selected targets every language."
            options={[
              { value: "hi", label: "Hindi" },
              { value: "en", label: "English" },
            ]}
            value={v.languages}
            onChange={(x) => set("languages", x)}
          />
          <CheckboxGroup
            legend="Target platforms"
            hint="None selected targets every platform."
            options={[
              { value: "ANDROID", label: "Android" },
              { value: "IOS", label: "iOS" },
            ]}
            value={v.platforms}
            onChange={(x) => set("platforms", x)}
          />
        </div>

        {placements.isError ? (
          <FormError message={`Could not load placements: ${errorMessage(placements.error)}`} />
        ) : (
          <CheckboxGroup
            legend="Placements"
            hint={placements.isPending ? "Loading placements…" : sponsored.length === 0 ? "No sponsored placements exist." : "Direct campaigns can only use sponsored placements."}
            options={sponsored.map((p) => ({ value: p.key, label: p.name, description: `${p.key}${p.isActive ? "" : " (inactive)"}` }))}
            value={v.placementKeys}
            onChange={(x) => set("placementKeys", x)}
            error={errors.placementKeys}
          />
        )}
      </fieldset>
      {!disabled && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
