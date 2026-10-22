"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/layout";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { translationSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { Drama } from "@/lib/types";

const LANG_NAMES: Record<string, string> = { hi: "Hindi", en: "English" };

/** PUT /admin/dramas/:id/translations/:lang — title and synopsis in another language. */
export function TranslationEditor({ drama, lang }: { drama: Drama; lang: string }) {
  const existing = drama.translations.find((t) => t.languageCode === lang);
  const canWrite = usePermission("dramas:write");
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [synopsis, setSynopsis] = useState(existing?.synopsis ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = LANG_NAMES[lang] ?? lang;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validate(translationSchema, { title, synopsis });
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.put(`/admin/dramas/${drama.id}/translations/${lang}`, r.data.synopsis ? r.data : { title: r.data.title });
      toast.success(`${name} translation saved`);
      await qc.invalidateQueries({ queryKey: ["drama", drama.id] });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (drama.primaryLanguageCode === lang) {
    return (
      <Card>
        <p className="text-sm text-muted">This drama&apos;s primary language is already {name}; edit the title and synopsis under Details.</p>
      </Card>
    );
  }

  return (
    <Card title={`${name} translation`}>
      <form onSubmit={submit} noValidate className="space-y-4" lang={lang}>
        <FormError message={formError} />
        <p className="text-sm text-muted">
          Shown to viewers whose app language is {name}. Falls back to the primary language ({drama.primaryLanguageCode}) when empty.
        </p>
        <Field label={`Title (${name})`} required error={errors.title}>
          <Input value={title} maxLength={160} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={`Synopsis (${name})`} error={errors.synopsis}>
          <Textarea value={synopsis} maxLength={4000} rows={6} disabled={!canWrite} onChange={(e) => setSynopsis(e.target.value)} />
        </Field>
        {canWrite && (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={busy}>
              Save translation
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
