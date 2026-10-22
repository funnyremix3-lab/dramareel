"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Callout, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { productSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { Product } from "@/lib/types";

const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    sku: product?.sku ?? "",
    kind: product?.kind ?? ("COIN_PACK" as Product["kind"]),
    title: product?.title ?? "",
    coins: s(product?.coins),
    bonusCoins: s(product?.bonusCoins ?? 0),
    periodDays: s(product?.periodDays),
    adFree: product?.adFree ?? false,
    isActive: product?.isActive ?? true,
    sortOrder: s(product?.sortOrder ?? 0),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(productSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    const d = r.data;
    const body =
      d.kind === "COIN_PACK"
        ? { sku: d.sku, kind: d.kind, title: d.title, coins: d.coins, bonusCoins: d.bonusCoins ?? 0, isActive: d.isActive, sortOrder: d.sortOrder ?? 0 }
        : { sku: d.sku, kind: d.kind, title: d.title, periodDays: d.periodDays, adFree: d.adFree, isActive: d.isActive, sortOrder: d.sortOrder ?? 0 };
    try {
      await api.put("/admin/products", body);
      toast.success("Product saved");
      await qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={product ? `Edit ${product.sku}` : "New product"} description="The SKU must match the product ID in Google Play Console exactly.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="SKU" required error={errors.sku}>
          <Input value={v.sku} disabled={!!product} className="font-mono" onChange={(e) => setV({ ...v, sku: e.target.value })} />
        </Field>
        <Field label="Kind" error={errors.kind} hint={product ? "A SKU cannot change kind." : undefined}>
          <Select value={v.kind} disabled={!!product} onChange={(e) => setV({ ...v, kind: e.target.value as Product["kind"] })}>
            <option value="COIN_PACK">Coin pack</option>
            <option value="SUBSCRIPTION">Subscription</option>
          </Select>
        </Field>
        <Field label="Title" required error={errors.title}>
          <Input value={v.title} maxLength={80} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        {v.kind === "COIN_PACK" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Coins" required error={errors.coins}>
              <Input inputMode="numeric" value={v.coins} onChange={(e) => setV({ ...v, coins: e.target.value })} />
            </Field>
            <Field label="Bonus coins" error={errors.bonusCoins}>
              <Input inputMode="numeric" value={v.bonusCoins} onChange={(e) => setV({ ...v, bonusCoins: e.target.value })} />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Period (days)" required error={errors.periodDays} hint="e.g. 30 or 365">
              <Input inputMode="numeric" value={v.periodDays} onChange={(e) => setV({ ...v, periodDays: e.target.value })} />
            </Field>
            <Checkbox label="Ad-free (VIP)" description="Subscribers see no interstitial, native or sponsored ads." checked={v.adFree} onCheckedChange={(adFree) => setV({ ...v, adFree })} />
          </>
        )}
        <Field label="Sort order" error={errors.sortOrder}>
          <Input inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
        </Field>
        <Checkbox label="Active (offered in the store)" checked={v.isActive} onCheckedChange={(isActive) => setV({ ...v, isActive })} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save product
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProductsPage() {
  const query = useQuery({ queryKey: ["products"], queryFn: ({ signal }) => api.get<Product[]>("/admin/products", undefined, signal) });
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  return (
    <>
      <PageHeader
        title="Products"
        description="Coin packs and subscription plans sold through the app stores."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            New product
          </Button>
        }
      />
      <div className="mb-4">
        <Callout tone="gray">Prices are set in Google Play Console, not here. Real-money purchases stay disabled on the API until PAYMENTS_ENABLED=true.</Callout>
      </div>
      <QueryState query={query}>
        {(rows) => (
          <Table caption="Products">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Title</Th>
                <Th>Kind</Th>
                <Th>Grants</Th>
                <Th>Status</Th>
                <Th className="text-right">Order</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={7}>No products yet</EmptyRow>}
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-xs">{p.sku}</Td>
                  <Td>{p.title}</Td>
                  <Td className="text-xs">{p.kind === "COIN_PACK" ? "Coin pack" : "Subscription"}</Td>
                  <Td className="text-xs">
                    {p.kind === "COIN_PACK" ? `${p.coins ?? 0} coins${p.bonusCoins ? ` + ${p.bonusCoins} bonus` : ""}` : `${p.periodDays} days${p.adFree ? " · ad-free" : ""}`}
                  </Td>
                  <Td>
                    <StatusBadge status={p.isActive ? "ACTIVE" : "PAUSED"} />
                  </Td>
                  <Td className="text-right tabular-nums">{p.sortOrder}</Td>
                  <Td className="text-right">
                    <Button size="sm" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryState>
      {editing !== undefined && <ProductDialog product={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
