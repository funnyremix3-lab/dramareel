"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { CheckboxGroup, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Callout, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { localToIso, notificationPayload, notificationSchema, validate, type FieldErrors } from "@/lib/schemas";
import type { NotificationJob, Paged } from "@/lib/types";

type Audience = "all" | "languages" | "userIds";

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    titleEn: "",
    titleHi: "",
    bodyEn: "",
    bodyHi: "",
    deepLink: "",
    audience: "all" as Audience,
    languages: [] as ("en" | "hi")[],
    userIds: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validate(notificationSchema, v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      await api.post("/admin/notifications", notificationPayload(r.data));
      toast.success("Notification saved as a draft. Schedule it to send.");
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New push notification" wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)" required error={errors.titleEn}>
            <Input value={v.titleEn} maxLength={120} onChange={(e) => setV({ ...v, titleEn: e.target.value })} />
          </Field>
          <Field label="Title (Hindi)" error={errors.titleHi} hint="Optional; English is used when empty.">
            <Input lang="hi" value={v.titleHi} maxLength={120} onChange={(e) => setV({ ...v, titleHi: e.target.value })} />
          </Field>
          <Field label="Body (English)" required error={errors.bodyEn}>
            <Textarea rows={3} value={v.bodyEn} maxLength={120} onChange={(e) => setV({ ...v, bodyEn: e.target.value })} />
          </Field>
          <Field label="Body (Hindi)" error={errors.bodyHi}>
            <Textarea lang="hi" rows={3} value={v.bodyHi} maxLength={120} onChange={(e) => setV({ ...v, bodyHi: e.target.value })} />
          </Field>
        </div>
        <Field label="Deep link" error={errors.deepLink} hint="Optional, e.g. reeldrama://drama/<id>">
          <Input value={v.deepLink} className="font-mono" placeholder="reeldrama://" onChange={(e) => setV({ ...v, deepLink: e.target.value })} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Audience</legend>
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["all", "Everyone"],
                ["languages", "By app language"],
                ["userIds", "Specific users"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="audience" value={value} checked={v.audience === value} onChange={() => setV({ ...v, audience: value })} className="accent-brand-600" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {v.audience === "languages" && (
          <CheckboxGroup
            legend="Languages"
            options={[
              { value: "hi", label: "Hindi" },
              { value: "en", label: "English" },
            ]}
            value={v.languages}
            onChange={(languages) => setV({ ...v, languages })}
            error={errors.languages}
          />
        )}
        {v.audience === "userIds" && (
          <Field label="User IDs" error={errors.userIds} hint="UUIDs separated by commas or new lines, up to 1000.">
            <Textarea rows={4} className="font-mono text-xs" value={v.userIds} onChange={(e) => setV({ ...v, userIds: e.target.value })} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save draft
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScheduleDialog({ job, onClose }: { job: NotificationJob; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (when && new Date(when).getTime() < Date.now() - 60_000) return setError("Choose a time in the future, or leave it empty to send now");
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/notifications/${job.id}/schedule`, when ? { scheduledAt: localToIso(when) } : {});
      toast.success(when ? "Notification scheduled" : "Notification queued to send now");
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Schedule notification" description={job.title.en}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={error} />
        <Field label="Send at" hint="Your local time. Leave empty to send as soon as the worker picks it up.">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {when ? "Schedule" : "Send now"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function audienceLabel(a: NotificationJob["audience"]): string {
  if (a.all) return "Everyone";
  if (a.languages?.length) return `Language: ${a.languages.join(", ")}`;
  if (a.userIds?.length) return `${a.userIds.length} user(s)`;
  return "—";
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [scheduling, setScheduling] = useState<NotificationJob | null>(null);
  const query = useQuery({
    queryKey: ["notifications", { page }],
    queryFn: ({ signal }) => api.get<Paged<NotificationJob>>("/admin/notifications", { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Push notifications sent through FCM by the notifications worker."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New notification
          </Button>
        }
      />
      <div className="mb-4">
        <Callout tone="gray">Notifications are created as drafts. Scheduling hands them to the notifications worker; delivery needs that worker running.</Callout>
      </div>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Table caption="Notifications">
            <thead>
              <tr>
                <Th>Message</Th>
                <Th>Audience</Th>
                <Th>Status</Th>
                <Th>Scheduled / sent</Th>
                <Th className="text-right">Delivered</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.length === 0 && <EmptyRow colSpan={6}>No notifications yet</EmptyRow>}
              {query.data.items.map((n) => (
                <Tr key={n.id}>
                  <Td className="max-w-sm">
                    <p className="font-medium">{n.title.en}</p>
                    <p className="text-xs text-muted">{n.body.en}</p>
                    {n.title.hi && (
                      <p lang="hi" className="mt-1 text-xs">
                        {n.title.hi}
                      </p>
                    )}
                    {n.deepLink && <p className="font-mono text-xs text-muted">{n.deepLink}</p>}
                  </Td>
                  <Td className="text-xs">{audienceLabel(n.audience)}</Td>
                  <Td>
                    <StatusBadge status={n.status} />
                    {n.lastError && <p className="mt-1 text-xs text-red-700">{n.lastError}</p>}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {n.scheduledAt && <p>Scheduled {fmtDateTime(n.scheduledAt)}</p>}
                    {n.sentAt && <p>Sent {fmtDateTime(n.sentAt)}</p>}
                    {!n.scheduledAt && !n.sentAt && <span className="text-muted">Created {fmtDateTime(n.createdAt)}</span>}
                  </Td>
                  <Td className="text-right text-xs tabular-nums">
                    {n.successCount} ok / {n.failureCount} failed
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {(n.status === "DRAFT" || n.status === "SCHEDULED") && (
                        <>
                          <Button size="sm" onClick={() => setScheduling(n)}>
                            {n.status === "DRAFT" ? "Schedule" : "Reschedule"}
                          </Button>
                          <ConfirmButton
                            label="Cancel"
                            title="Cancel this notification?"
                            description="It will not be sent. This cannot be undone."
                            confirmLabel="Cancel notification"
                            danger
                            onConfirm={async () => {
                              await api.post(`/admin/notifications/${n.id}/cancel`);
                              toast.success("Notification canceled");
                              await qc.invalidateQueries({ queryKey: ["notifications"] });
                            }}
                          />
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {scheduling && <ScheduleDialog job={scheduling} onClose={() => setScheduling(null)} />}
    </>
  );
}
