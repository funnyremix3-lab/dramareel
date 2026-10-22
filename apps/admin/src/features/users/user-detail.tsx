"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { CheckboxGroup, Field, FormError, Input } from "@/components/ui/form";
import { Card, DescriptionList, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, ErrorState, QueryState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { formatMicros } from "@/lib/money";
import { validate, walletAdjustSchema, type FieldErrors } from "@/lib/schemas";
import type { Role, UserDetail as UserDetailT } from "@/lib/types";

export function WalletAdjustDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ amount: "", note: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(walletAdjustSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.post<{ balance: number }>(`/admin/users/${userId}/wallet-adjustments`, r.data);
      toast.success(`Wallet adjusted. New balance: ${fmtNumber(res.balance)} coins`);
      await qc.invalidateQueries({ queryKey: ["user", userId] });
      await qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Adjust wallet" description="Posts an ADMIN_ADJUSTMENT ledger entry. Every adjustment is audited.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Coins" required error={errors.amount} hint="Positive to credit, negative to debit (balance cannot go below 0).">
          <Input inputMode="numeric" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </Field>
        <Field label="Reason" required error={errors.note} hint="Shown in the user's ledger history and the audit log.">
          <Input value={v.note} maxLength={280} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Post adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RolesDialog({ userId, current, onClose }: { userId: string; current: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const roles = useQuery({ queryKey: ["roles"], queryFn: ({ signal }) => api.get<Role[]>("/admin/roles", undefined, signal) });
  const [selected, setSelected] = useState<string[]>(current);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      await api.put(`/admin/users/${userId}/roles`, { roles: selected });
      toast.success("Roles updated");
      await Promise.all([qc.invalidateQueries({ queryKey: ["user", userId] }), qc.invalidateQueries({ queryKey: ["users"] }), qc.invalidateQueries({ queryKey: ["me"] })]);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assign roles"
      description="Replaces the user's roles. The last owner cannot be removed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={roles.isPending || roles.isError}>
            Save roles
          </Button>
        </>
      }
    >
      <FormError message={formError} />
      {roles.isPending ? (
        <Spinner />
      ) : roles.isError ? (
        <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
      ) : (
        <CheckboxGroup
          legend="Roles"
          columns={1}
          options={roles.data.map((r) => ({ value: r.key, label: `${r.name} (${r.key})`, description: r.permissions.join(", ") }))}
          value={selected}
          onChange={setSelected}
        />
      )}
    </Dialog>
  );
}

export function UserDetail({ id }: { id: string }) {
  const query = useQuery({ queryKey: ["user", id], queryFn: ({ signal }) => api.get<UserDetailT>(`/admin/users/${id}`, undefined, signal) });
  const qc = useQueryClient();
  const toast = useToast();
  const canSuspend = usePermission("users:suspend");
  const canAdjust = usePermission("wallet:adjust");
  const canRoles = usePermission("roles:write");
  const [dialog, setDialog] = useState<"wallet" | "roles" | null>(null);

  async function setStatus(action: "suspend" | "reinstate") {
    await api.post(`/admin/users/${id}/${action}`);
    toast.success(action === "suspend" ? "User suspended" : "User reinstated");
    await Promise.all([qc.invalidateQueries({ queryKey: ["user", id] }), qc.invalidateQueries({ queryKey: ["users"] })]);
  }

  return (
    <QueryState query={query}>
      {(u) => (
        <>
          <p className="mb-2 text-sm">
            <Link href="/users" className="text-brand-700 hover:underline">
              ← Users
            </Link>
          </p>
          <PageHeader
            title={u.profile?.displayName || u.email || u.phone || u.id}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={u.status} /> <span className="font-mono text-xs">{u.id}</span>
              </span>
            }
            actions={
              <>
                {canSuspend && u.status === "ACTIVE" && (
                  <ConfirmButton
                    label="Suspend"
                    variant="danger"
                    danger
                    title="Suspend this user?"
                    description="They will be signed out of protected features until reinstated."
                    confirmLabel="Suspend"
                    onConfirm={() => setStatus("suspend")}
                  />
                )}
                {canSuspend && u.status === "SUSPENDED" && (
                  <ConfirmButton label="Reinstate" title="Reinstate this user?" description="Restores normal access." confirmLabel="Reinstate" onConfirm={() => setStatus("reinstate")} />
                )}
                {canAdjust && (
                  <Button size="sm" onClick={() => setDialog("wallet")}>
                    Adjust wallet
                  </Button>
                )}
                {canRoles && (
                  <Button size="sm" onClick={() => setDialog("roles")}>
                    Assign roles
                  </Button>
                )}
              </>
            }
          />
          <div className="space-y-6">
            <Card title="Profile">
              <DescriptionList
                items={[
                  { label: "Email", value: u.email },
                  { label: "Phone", value: u.phone },
                  { label: "Display name", value: u.profile?.displayName },
                  { label: "Locale", value: u.locale },
                  { label: "Coin balance", value: <span className="text-lg font-semibold tabular-nums">{fmtNumber(u.balance)}</span> },
                  { label: "Roles", value: u.roles.join(", ") || "viewer" },
                  { label: "Comments", value: fmtNumber(u.commentCount) },
                  { label: "Joined", value: fmtDateTime(u.createdAt) },
                  { label: "Last seen", value: fmtDateTime(u.lastSeenAt) },
                  { label: "Deletion requested", value: u.deletionRequestedAt ? fmtDateTime(u.deletionRequestedAt) : "No" },
                ]}
              />
            </Card>

            <Card title="Wallet transactions (latest 50)">
              <Table caption="Wallet transactions">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Balance after</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {u.transactions.length === 0 && <EmptyRow colSpan={5}>No transactions</EmptyRow>}
                  {u.transactions.map((t) => (
                    <Tr key={t.id}>
                      <Td className="whitespace-nowrap text-muted">{fmtDateTime(t.createdAt)}</Td>
                      <Td className="text-xs">{t.type}</Td>
                      <Td className={`text-right tabular-nums ${t.amount < 0 ? "text-red-700" : "text-green-800"}`}>
                        {t.amount > 0 ? "+" : ""}
                        {fmtNumber(t.amount)}
                      </Td>
                      <Td className="text-right tabular-nums">{fmtNumber(t.balanceAfter)}</Td>
                      <Td className="text-xs text-muted">{t.note}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Unlocks (latest 50)">
                <Table caption="Unlocks">
                  <thead>
                    <tr>
                      <Th>Drama</Th>
                      <Th>Episode</Th>
                      <Th>Method</Th>
                      <Th>When</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.unlocks.length === 0 && <EmptyRow colSpan={4}>No unlocks</EmptyRow>}
                    {u.unlocks.map((x) => (
                      <Tr key={x.episodeId}>
                        <Td>{x.dramaTitle}</Td>
                        <Td className="tabular-nums">{x.episodeNumber}</Td>
                        <Td className="text-xs">{x.method}</Td>
                        <Td className="whitespace-nowrap text-muted">{fmtDateTime(x.createdAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
              <Card title="Subscriptions">
                <Table caption="Subscriptions">
                  <thead>
                    <tr>
                      <Th>SKU</Th>
                      <Th>Status</Th>
                      <Th>Period end</Th>
                      <Th>Auto-renew</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.subscriptions.length === 0 && <EmptyRow colSpan={4}>No subscriptions</EmptyRow>}
                    {u.subscriptions.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-mono text-xs">{s.product.sku}</Td>
                        <Td>
                          <StatusBadge status={s.status} />
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDateTime(s.currentPeriodEnd)}</Td>
                        <Td>{s.autoRenew ? "Yes" : "No"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </div>

            <Card title="Payments (latest 50)">
              <Table caption="Payments">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>SKU</Th>
                    <Th>Provider</Th>
                    <Th>Order ID</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Price</Th>
                  </tr>
                </thead>
                <tbody>
                  {u.payments.length === 0 && <EmptyRow colSpan={6}>No payments</EmptyRow>}
                  {u.payments.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap text-muted">{fmtDateTime(p.createdAt)}</Td>
                      <Td className="font-mono text-xs">{p.product.sku}</Td>
                      <Td className="text-xs">{p.provider}</Td>
                      <Td className="font-mono text-xs">{p.providerTransactionId}</Td>
                      <Td>
                        <StatusBadge status={p.status} />
                      </Td>
                      <Td className="text-right tabular-nums">{p.priceAmountMicros !== null ? formatMicros(p.priceAmountMicros, p.currency ?? "INR") : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
          {dialog === "wallet" && <WalletAdjustDialog userId={u.id} onClose={() => setDialog(null)} />}
          {dialog === "roles" && <RolesDialog userId={u.id} current={u.roles} onClose={() => setDialog(null)} />}
        </>
      )}
    </QueryState>
  );
}
