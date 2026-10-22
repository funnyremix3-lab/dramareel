"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Card, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { categorySchema, languageSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { Category, Language } from "@/lib/types";
import { useCategories, useLanguages } from "./queries";

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    slug: category?.slug ?? "",
    nameEn: category?.names.en ?? "",
    nameHi: category?.names.hi ?? "",
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(categorySchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      // Keep names for other languages that this form does not edit.
      const names: Record<string, string> = { ...(category?.names ?? {}), en: r.data.nameEn };
      if (r.data.nameHi) names.hi = r.data.nameHi;
      else delete names.hi;
      await api.put("/admin/categories", { slug: r.data.slug, names, sortOrder: r.data.sortOrder ?? 0, isActive: r.data.isActive });
      toast.success("Category saved");
      await qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={category ? `Edit ${category.slug}` : "New category"}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Slug" required error={errors.slug} hint={category ? "The slug identifies the category and cannot be changed." : undefined}>
          <Input value={v.slug} disabled={!!category} onChange={(e) => setV({ ...v, slug: e.target.value })} />
        </Field>
        <Field label="Name (English)" required error={errors.nameEn}>
          <Input value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} />
        </Field>
        <Field label="Name (Hindi)" error={errors.nameHi}>
          <Input lang="hi" value={v.nameHi} onChange={(e) => setV({ ...v, nameHi: e.target.value })} />
        </Field>
        <Field label="Sort order" error={errors.sortOrder}>
          <Input inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
        </Field>
        <Checkbox label="Active (shown in the app)" checked={v.isActive} onCheckedChange={(isActive) => setV({ ...v, isActive })} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function LanguageDialog({ language, onClose }: { language: Language | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ code: language?.code ?? "", name: language?.name ?? "", nativeName: language?.nativeName ?? "", enabled: language?.enabled ?? true });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(languageSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      await api.put("/admin/languages", r.data);
      toast.success("Language saved");
      await qc.invalidateQueries({ queryKey: ["languages"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={language ? `Edit ${language.code}` : "New language"}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Code" required error={errors.code} hint="ISO 639-1, e.g. hi">
          <Input value={v.code} disabled={!!language} maxLength={2} onChange={(e) => setV({ ...v, code: e.target.value.toLowerCase() })} />
        </Field>
        <Field label="Name" required error={errors.name}>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Native name" required error={errors.nativeName}>
          <Input value={v.nativeName} onChange={(e) => setV({ ...v, nativeName: e.target.value })} />
        </Field>
        <Checkbox label="Enabled" checked={v.enabled} onCheckedChange={(enabled) => setV({ ...v, enabled })} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TaxonomyPage() {
  const canWrite = usePermission("dramas:write");
  const categories = useCategories();
  const languages = useLanguages();
  const [cat, setCat] = useState<Category | null | undefined>(undefined);
  const [lang, setLang] = useState<Language | null | undefined>(undefined);

  return (
    <>
      <PageHeader title="Categories & languages" description="Categories group dramas in the app; names are shown in English and Hindi." />
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card
          title="Categories"
          actions={
            canWrite && (
              <Button size="sm" variant="primary" onClick={() => setCat(null)}>
                New category
              </Button>
            )
          }
        >
          <QueryState query={categories}>
            {(rows) => (
              <Table caption="Categories">
                <thead>
                  <tr>
                    <Th>Slug</Th>
                    <Th>English</Th>
                    <Th>Hindi</Th>
                    <Th className="text-right">Order</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Dramas</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <EmptyRow colSpan={7}>No categories yet</EmptyRow>}
                  {rows.map((c) => (
                    <Tr key={c.id}>
                      <Td className="font-mono text-xs">{c.slug}</Td>
                      <Td>{c.names.en}</Td>
                      <Td lang="hi">{c.names.hi ?? <span className="text-muted">—</span>}</Td>
                      <Td className="text-right tabular-nums">{c.sortOrder}</Td>
                      <Td>
                        <StatusBadge status={c.isActive ? "ACTIVE" : "HIDDEN"} />
                      </Td>
                      <Td className="text-right tabular-nums">{c._count?.dramas ?? "—"}</Td>
                      <Td className="text-right">
                        {canWrite && (
                          <Button size="sm" onClick={() => setCat(c)}>
                            Edit
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </QueryState>
        </Card>
        <Card
          title="Languages"
          actions={
            canWrite && (
              <Button size="sm" variant="primary" onClick={() => setLang(null)}>
                New language
              </Button>
            )
          }
        >
          <QueryState query={languages}>
            {(rows) => (
              <Table caption="Languages">
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Name</Th>
                    <Th>Native</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <EmptyRow colSpan={5}>No languages yet</EmptyRow>}
                  {rows.map((l) => (
                    <Tr key={l.code}>
                      <Td className="font-mono text-xs">{l.code}</Td>
                      <Td>{l.name}</Td>
                      <Td>{l.nativeName}</Td>
                      <Td>
                        <StatusBadge status={l.enabled ? "ACTIVE" : "HIDDEN"} />
                      </Td>
                      <Td className="text-right">
                        {canWrite && (
                          <Button size="sm" onClick={() => setLang(l)}>
                            Edit
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </QueryState>
        </Card>
      </div>
      {cat !== undefined && <CategoryDialog category={cat} onClose={() => setCat(undefined)} />}
      {lang !== undefined && <LanguageDialog language={lang} onClose={() => setLang(undefined)} />}
    </>
  );
}
