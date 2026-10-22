"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxGroup, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/layout";
import { errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { dramaFormSchema, dramaPayload, slugify, validate, type DramaFormValues, type FieldErrors } from "@/lib/schemas";
import type { Drama } from "@/lib/types";
import { useCategories, useLanguages } from "../taxonomy/queries";

export function dramaToForm(d: Drama): DramaFormValues {
  return {
    title: d.title,
    slug: d.slug,
    synopsis: d.synopsis ?? "",
    primaryLanguageCode: d.primaryLanguageCode,
    categorySlugs: d.categories,
    cast: (d.cast ?? []).map((c) => ({ name: c.name, role: c.role ?? "" })),
    tags: d.tags.join(", "),
    orientation: d.orientation,
    maturityRating: d.maturityRating ?? "",
    isFeatured: d.isFeatured,
    trendingScore: String(d.trendingScore ?? 0),
    freeEpisodeCount: String(d.freeEpisodeCount),
    defaultUnlockCoins: String(d.defaultUnlockCoins),
  };
}

export type DramaPayload = ReturnType<typeof dramaPayload>;

/** Create/edit form. Pricing fields render only for users with monetization:write. */
export function DramaForm({
  initial,
  isCreate,
  submitLabel,
  onSubmit,
}: {
  initial: DramaFormValues;
  isCreate: boolean;
  submitLabel: string;
  onSubmit: (payload: DramaPayload) => Promise<unknown>;
}) {
  const canPrice = usePermission("monetization:write");
  const categories = useCategories();
  const languages = useLanguages();
  const [values, setValues] = useState<DramaFormValues>(initial);
  const [slugTouched, setSlugTouched] = useState(!isCreate);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof DramaFormValues>(key: K, v: DramaFormValues[K]) => setValues((prev) => ({ ...prev, [key]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = validate(dramaFormSchema, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(dramaPayload(result.data, canPrice));
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const languageOptions = languages.data ?? [];

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required error={errors.title}>
          <Input
            value={values.title}
            maxLength={160}
            onChange={(e) => {
              const title = e.target.value;
              setValues((prev) => ({ ...prev, title, slug: slugTouched ? prev.slug : slugify(title) }));
            }}
          />
        </Field>
        <Field label="Slug" required error={errors.slug} hint="Used in links; lowercase letters, digits and hyphens.">
          <Input
            value={values.slug}
            maxLength={120}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
        </Field>
      </div>

      <Field label="Synopsis" error={errors.synopsis}>
        <Textarea value={values.synopsis} maxLength={4000} rows={5} onChange={(e) => set("synopsis", e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Primary language" required error={errors.primaryLanguageCode}>
          <Select value={values.primaryLanguageCode} onChange={(e) => set("primaryLanguageCode", e.target.value)}>
            {languageOptions.length === 0 && <option value={values.primaryLanguageCode}>{values.primaryLanguageCode}</option>}
            {languageOptions.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Orientation" error={errors.orientation}>
          <Select value={values.orientation} onChange={(e) => set("orientation", e.target.value as DramaFormValues["orientation"])}>
            <option value="PORTRAIT">Portrait (vertical)</option>
            <option value="LANDSCAPE">Landscape</option>
          </Select>
        </Field>
        <Field label="Maturity rating" error={errors.maturityRating} hint="e.g. U, UA 13+, A">
          <Input value={values.maturityRating} maxLength={10} onChange={(e) => set("maturityRating", e.target.value)} />
        </Field>
      </div>

      {categories.isError ? (
        <FormError message={`Could not load categories: ${errorMessage(categories.error)}`} />
      ) : (
        <CheckboxGroup
          legend="Categories"
          columns={3}
          hint={categories.isPending ? "Loading categories…" : categories.data?.length === 0 ? "No categories yet. Create them under Categories & languages." : undefined}
          options={(categories.data ?? []).map((c) => ({ value: c.slug, label: c.names.en ?? c.slug, description: c.isActive ? undefined : "inactive" }))}
          value={values.categorySlugs}
          onChange={(v) => set("categorySlugs", v)}
          error={errors.categorySlugs}
        />
      )}

      <Field label="Tags" error={errors.tags} hint="Comma separated, up to 20.">
        <Input value={values.tags} onChange={(e) => set("tags", e.target.value)} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Cast</legend>
        {values.cast.length === 0 && <p className="text-xs text-muted">No cast members.</p>}
        {values.cast.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label={`Cast ${i + 1} name`} error={errors[`cast.${i}.name`]}>
              <Input value={c.name} maxLength={80} onChange={(e) => set("cast", values.cast.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </Field>
            <Field label={`Cast ${i + 1} role`} error={errors[`cast.${i}.role`]}>
              <Input value={c.role} maxLength={80} onChange={(e) => set("cast", values.cast.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
            </Field>
            <Button variant="ghost" size="sm" aria-label={`Remove cast member ${i + 1}`} onClick={() => set("cast", values.cast.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        {errors.cast && <p className="text-xs text-red-700">{errors.cast}</p>}
        <Button size="sm" onClick={() => set("cast", [...values.cast, { name: "", role: "" }])} disabled={values.cast.length >= 30}>
          Add cast member
        </Button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Trending score" error={errors.trendingScore} hint="Higher ranks earlier in the trending rail (0–1,000,000).">
          <Input inputMode="decimal" value={values.trendingScore} onChange={(e) => set("trendingScore", e.target.value)} />
        </Field>
        <div className="pt-6">
          <Checkbox label="Featured on home" checked={values.isFeatured} onCheckedChange={(v) => set("isFeatured", v)} />
        </div>
      </div>

      {canPrice ? (
        <fieldset className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-ink">Pricing (monetization)</legend>
          <Field label="Free episodes" error={errors.freeEpisodeCount} hint="Episodes numbered up to this are free.">
            <Input inputMode="numeric" value={values.freeEpisodeCount} onChange={(e) => set("freeEpisodeCount", e.target.value)} />
          </Field>
          <Field label="Default unlock price (coins)" error={errors.defaultUnlockCoins}>
            <Input inputMode="numeric" value={values.defaultUnlockCoins} onChange={(e) => set("defaultUnlockCoins", e.target.value)} />
          </Field>
        </fieldset>
      ) : (
        <Callout tone="gray">Pricing (free episodes and unlock price) needs the monetization:write permission.</Callout>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
