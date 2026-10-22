"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CheckboxGroup, Field, FormError, Input } from "@/components/ui/form";
import { Badge, PageHeader, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { ASSIGNABLE_PERMISSIONS } from "@/lib/permissions";
import { roleSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { Role } from "@/lib/types";

const PERMISSION_HELP: Record<string, string> = {
  "dramas:*": "All drama permissions",
  "dramas:read": "View dramas, episodes, categories",
  "dramas:write": "Create and edit dramas, episodes, taxonomy",
  "dramas:publish": "Publish, unpublish, archive",
  "media:write": "Upload and manage videos",
  "monetization:write": "Prices, free episodes, products",
  "moderation:write": "Hide/restore comments, resolve reports",
  "users:read": "Search and view users",
  "users:suspend": "Suspend and reinstate users",
  "wallet:adjust": "Manual coin adjustments",
  "roles:write": "Manage roles and assign them",
  "ads:*": "All ads permissions",
  "ads:read": "View placements, campaigns, reports",
  "ads:write": "Edit ad configuration and campaigns",
  "analytics:read": "Overview and CSV reports",
  "notifications:write": "Create and schedule push notifications",
  "audit:read": "View the audit log",
};

function RoleDialog({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ key: role?.key ?? "", name: role?.name ?? "", permissions: role?.permissions ?? [] });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(roleSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      await api.put("/admin/roles", r.data);
      toast.success("Role saved");
      await qc.invalidateQueries({ queryKey: ["roles"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={role ? `Edit ${role.key}` : "New custom role"} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key" required error={errors.key} hint="e.g. REGIONAL_EDITOR">
            <Input value={v.key} disabled={!!role} onChange={(e) => setV({ ...v, key: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Name" required error={errors.name}>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
        </div>
        <CheckboxGroup
          legend="Permissions"
          options={ASSIGNABLE_PERMISSIONS.map((p) => ({ value: p, label: <span className="font-mono text-xs">{p}</span>, description: PERMISSION_HELP[p] }))}
          value={v.permissions}
          onChange={(permissions) => setV({ ...v, permissions })}
          error={errors.permissions}
          hint="Custom roles cannot hold * (owner only). The dashboard hides pages for custom roles; the API still honours them."
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save role
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RolesPage() {
  const query = useQuery({ queryKey: ["roles"], queryFn: ({ signal }) => api.get<Role[]>("/admin/roles", undefined, signal) });
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);

  return (
    <>
      <PageHeader
        title="Roles"
        description="System roles are fixed. Custom roles combine individual permissions."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            New role
          </Button>
        }
      />
      <QueryState query={query}>
        {(roles) => (
          <Table caption="Roles">
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Permissions</Th>
                <Th className="text-right">Users</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 && <EmptyRow colSpan={4}>No roles</EmptyRow>}
              {roles.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <p className="font-medium">{r.name}</p>
                    <p className="font-mono text-xs text-muted">{r.key}</p>
                    {r.isSystem && <Badge tone="blue">system</Badge>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.permissions.map((p) => (
                        <code key={p} className="rounded bg-subtle px-1.5 py-0.5 text-xs">
                          {p}
                        </code>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{r._count?.users ?? "—"}</Td>
                  <Td className="text-right">
                    {!r.isSystem && (
                      <Button size="sm" onClick={() => setEditing(r)}>
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
      {editing !== undefined && <RoleDialog role={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
