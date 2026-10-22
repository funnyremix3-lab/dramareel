"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Card, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import { fmtDateTime, fmtDuration, fmtNumber } from "@/lib/format";
import { episodeFormSchema, episodePayload, validate, type EpisodeFormValues, type FieldErrors } from "@/lib/schemas";
import type { Drama, EpisodeListItem, Paged, VideoAsset } from "@/lib/types";
import { formatBytes } from "@/lib/upload";
import { VideoUpload } from "../media/video-upload";

const PROCESSING = new Set(["AWAITING_UPLOAD", "UPLOADED", "PROCESSING"]);

function EpisodeFormDialog({
  drama,
  episode,
  open,
  onOpenChange,
}: {
  drama: Drama;
  episode: EpisodeListItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const canPrice = usePermission("monetization:write");
  const qc = useQueryClient();
  const toast = useToast();
  const isCreate = episode === null;
  const [values, setValues] = useState<EpisodeFormValues>(() => ({
    number: "",
    title: episode?.title ?? "",
    synopsis: "",
    access: isCreate ? "" : (episode?.access ?? ""),
    unlockCoins: episode?.unlockCoins === null || episode?.unlockCoins === undefined ? "" : String(episode.unlockCoins),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [synopsisTouched, setSynopsisTouched] = useState(false);
  const set = <K extends keyof EpisodeFormValues>(k: K, v: EpisodeFormValues[K]) => setValues((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validate(episodeFormSchema, values);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { synopsis, ...rest } = episodePayload(r.data, canPrice, isCreate);
      const body = isCreate || synopsisTouched ? { ...rest, synopsis } : rest;
      if (isCreate) await api.post(`/admin/dramas/${drama.id}/episodes`, body);
      else await api.patch(`/admin/episodes/${episode.id}`, body);
      toast.success(isCreate ? "Episode created" : "Episode saved");
      await qc.invalidateQueries({ queryKey: ["episodes", drama.id] });
      onOpenChange(false);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isCreate ? "New episode" : `Edit episode ${episode.number}`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        {isCreate && (
          <Field label="Episode number" error={errors.number} hint="Leave empty for the next number.">
            <Input inputMode="numeric" value={values.number} onChange={(e) => set("number", e.target.value)} />
          </Field>
        )}
        <Field label="Title" error={errors.title}>
          <Input value={values.title} maxLength={160} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field
          label="Synopsis"
          error={errors.synopsis}
          hint={isCreate ? undefined : "The episode list does not return the current synopsis, so it only changes if you type here."}
        >
          <Textarea
            value={values.synopsis}
            maxLength={2000}
            rows={3}
            onChange={(e) => {
              setSynopsisTouched(true);
              set("synopsis", e.target.value);
            }}
          />
        </Field>
        {canPrice ? (
          <fieldset className="grid gap-4 rounded-md border border-line p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Access (monetization)</legend>
            <Field label="Access" error={errors.access}>
              <Select value={values.access} onChange={(e) => set("access", e.target.value as EpisodeFormValues["access"])}>
                {isCreate && <option value="">Automatic (free if number ≤ {drama.freeEpisodeCount})</option>}
                <option value="FREE">Free</option>
                <option value="PREMIUM">Premium</option>
              </Select>
            </Field>
            <Field label="Unlock price (coins)" error={errors.unlockCoins} hint={`Empty uses the drama default (${drama.defaultUnlockCoins}).`}>
              <Input inputMode="numeric" value={values.unlockCoins} onChange={(e) => set("unlockCoins", e.target.value)} />
            </Field>
          </fieldset>
        ) : (
          <p className="text-xs text-muted">Access and unlock price need monetization:write.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {isCreate ? "Create episode" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** All uploads for an episode, with retry and "set current" (rollback). */
function EpisodeAssets({ episode }: { episode: EpisodeListItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["video-assets", { episodeId: episode.id }],
    queryFn: ({ signal }) => api.get<Paged<VideoAsset>>("/admin/video-assets", { episodeId: episode.id, pageSize: 50 }, signal),
    refetchInterval: (q) => (q.state.data?.items.some((a) => PROCESSING.has(a.status)) ? 4000 : false),
  });

  async function act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      await Promise.all([qc.invalidateQueries({ queryKey: ["video-assets"] }), qc.invalidateQueries({ queryKey: ["episodes"] })]);
    } catch (err) {
      toast.error(err);
    }
  }

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <Table caption="Video assets">
      <thead>
        <tr>
          <Th>Status</Th>
          <Th>Size</Th>
          <Th>Resolution</Th>
          <Th>Created</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {query.data.items.length === 0 && <EmptyRow colSpan={5}>No uploads yet</EmptyRow>}
        {query.data.items.map((a) => (
          <Tr key={a.id}>
            <Td>
              <StatusBadge status={a.status} />
              {episode.currentAsset?.id === a.id && <span className="ml-1 text-xs font-medium text-green-800">current</span>}
              {a.lastError && <p className="mt-1 max-w-xs text-xs text-red-700">{a.lastError}</p>}
            </Td>
            <Td>{formatBytes(a.sizeBytes)}</Td>
            <Td>{a.width && a.height ? `${a.width}×${a.height}` : "—"}</Td>
            <Td className="whitespace-nowrap text-muted">{fmtDateTime(a.createdAt)}</Td>
            <Td className="space-x-1 whitespace-nowrap text-right">
              {a.status === "FAILED" && (
                <Button size="sm" onClick={() => act(() => api.post(`/admin/video-assets/${a.id}/retry`), "Processing retried")}>
                  Retry
                </Button>
              )}
              {a.status === "READY" && episode.currentAsset?.id !== a.id && (
                <Button size="sm" onClick={() => act(() => api.put(`/admin/episodes/${episode.id}/current-asset`, { assetId: a.id }), "Current video changed")}>
                  Set current
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export function EpisodesPanel({ drama }: { drama: Drama }) {
  const qc = useQueryClient();
  const toast = useToast();
  const canWrite = usePermission("dramas:write");
  const canPublish = usePermission("dramas:publish");
  const canMedia = usePermission("media:write");
  const [editing, setEditing] = useState<EpisodeListItem | null | undefined>(undefined);
  const [uploadFor, setUploadFor] = useState<EpisodeListItem | null>(null);
  const [assetsFor, setAssetsFor] = useState<EpisodeListItem | null>(null);

  const query = useQuery({
    queryKey: ["episodes", drama.id],
    queryFn: ({ signal }) => api.get<EpisodeListItem[]>(`/admin/dramas/${drama.id}/episodes`, undefined, signal),
    // Keep the video status column fresh while anything is still processing.
    refetchInterval: (q) => (q.state.data?.some((e) => e.currentAsset && PROCESSING.has(e.currentAsset.status)) ? 5000 : false),
  });

  async function act(fn: () => Promise<unknown>, msg: string) {
    await fn();
    toast.success(msg);
    await Promise.all([qc.invalidateQueries({ queryKey: ["episodes", drama.id] }), qc.invalidateQueries({ queryKey: ["drama", drama.id] })]);
  }

  return (
    <Card
      title="Episodes"
      actions={
        canWrite && (
          <Button size="sm" variant="primary" onClick={() => setEditing(null)}>
            New episode
          </Button>
        )
      }
    >
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table caption="Episodes">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Access</Th>
              <Th>Video</Th>
              <Th className="text-right">Duration</Th>
              <Th className="text-right">Views</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {query.data.length === 0 && <EmptyRow colSpan={8}>No episodes yet</EmptyRow>}
            {query.data.map((e) => (
              <Tr key={e.id}>
                <Td className="tabular-nums">{e.number}</Td>
                <Td>{e.title || <span className="text-muted">Untitled</span>}</Td>
                <Td>
                  <StatusBadge status={e.status} />
                </Td>
                <Td>
                  {e.access === "FREE" || e.number <= drama.freeEpisodeCount ? "Free" : `Premium · ${e.unlockCoins ?? drama.defaultUnlockCoins} coins`}
                </Td>
                <Td>
                  <StatusBadge status={e.currentAsset?.status ?? null} />
                  {e.assetCount > 1 && <span className="ml-1 text-xs text-muted">({e.assetCount} uploads)</span>}
                </Td>
                <Td className="text-right tabular-nums">{fmtDuration(e.durationSeconds)}</Td>
                <Td className="text-right tabular-nums">{fmtNumber(e.viewCount)}</Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-1">
                    {canWrite && (
                      <Button size="sm" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                    )}
                    {canMedia && (
                      <Button size="sm" onClick={() => setUploadFor(e)}>
                        Upload video
                      </Button>
                    )}
                    {canMedia && e.assetCount > 0 && (
                      <Button size="sm" onClick={() => setAssetsFor(e)}>
                        Videos
                      </Button>
                    )}
                    {canPublish && e.status !== "PUBLISHED" && (
                      <ConfirmButton
                        label="Publish"
                        title={`Publish episode ${e.number}?`}
                        description="Viewers can watch it once published. Its current video must be READY."
                        confirmLabel="Publish"
                        disabled={e.currentAsset?.status !== "READY"}
                        onConfirm={() => act(() => api.post(`/admin/episodes/${e.id}/publish`), `Episode ${e.number} published`)}
                      />
                    )}
                    {canPublish && e.status === "PUBLISHED" && (
                      <ConfirmButton
                        label="Unpublish"
                        title={`Unpublish episode ${e.number}?`}
                        description="It disappears from the app until published again."
                        confirmLabel="Unpublish"
                        onConfirm={() => act(() => api.post(`/admin/episodes/${e.id}/unpublish`), `Episode ${e.number} unpublished`)}
                      />
                    )}
                    {canWrite && e.status !== "PUBLISHED" && (
                      <ConfirmButton
                        label="Delete"
                        variant="danger"
                        danger
                        title={`Delete episode ${e.number}?`}
                        description="This cannot be undone. Episodes that viewers have unlocked cannot be deleted."
                        confirmLabel="Delete"
                        onConfirm={() => act(() => api.delete(`/admin/episodes/${e.id}`), `Episode ${e.number} deleted`)}
                      />
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing !== undefined && (
        <EpisodeFormDialog key={editing?.id ?? "new"} drama={drama} episode={editing} open onOpenChange={(o) => !o && setEditing(undefined)} />
      )}
      <Dialog open={uploadFor !== null} onOpenChange={(o) => !o && setUploadFor(null)} title={uploadFor ? `Upload video · episode ${uploadFor.number}` : "Upload video"} wide>
        {uploadFor && <VideoUpload key={uploadFor.id} episodeId={uploadFor.id} currentAssetId={uploadFor.currentAsset?.id ?? null} onFinished={() => setUploadFor(null)} />}
      </Dialog>
      <Dialog open={assetsFor !== null} onOpenChange={(o) => !o && setAssetsFor(null)} title={assetsFor ? `Videos · episode ${assetsFor.number}` : "Videos"} wide>
        {assetsFor && <EpisodeAssets episode={query.data?.find((x) => x.id === assetsFor.id) ?? assetsFor} />}
      </Dialog>
    </Card>
  );
}
