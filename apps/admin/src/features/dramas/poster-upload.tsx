"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/layout";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import type { Drama, ImageUploadTarget } from "@/lib/types";
import { IMAGE_TYPES, formatBytes, putFile } from "@/lib/upload";

const MAX_POSTER_BYTES = 5 * 1024 * 1024;

/** Upload a poster: presigned URL → browser PUT → PATCH posterKey. */
export function PosterUpload({ drama, onChanged }: { drama: Drama; onChanged: () => Promise<void> }) {
  const canWrite = usePermission("dramas:write");
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  function choose(f: File | null) {
    setError(null);
    setProgress(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    if (!f) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(f.type)) {
      setError("Choose a JPEG, PNG or WebP image");
      return;
    }
    if (f.size > MAX_POSTER_BYTES) {
      setError(`The poster is ${formatBytes(f.size)}; the limit is 5 MB`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const target = await api.post<ImageUploadTarget>(`/admin/dramas/${drama.id}/poster-upload-url`, { contentType: file.type, sizeBytes: file.size });
      await putFile(target.uploadUrl, file, { headers: target.headers, onProgress: setProgress });
      await api.patch(`/admin/dramas/${drama.id}`, { posterKey: target.key });
      toast.success("Poster updated");
      choose(null);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Poster">
      <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{preview ? "New poster" : "Current"}</p>
          {preview || drama.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / media CDN image
            <img src={preview ?? drama.posterUrl ?? ""} alt={`Poster for ${drama.title}`} className="aspect-[2/3] w-40 rounded-md border border-line object-cover" />
          ) : (
            <div className="flex aspect-[2/3] w-40 items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">No poster</div>
          )}
        </div>
        {canWrite ? (
          <div className="space-y-4">
            <FormError message={error} />
            <Field label="Image file" hint="JPEG, PNG or WebP, up to 5 MB. Portrait 2:3 works best.">
              <Input type="file" accept={IMAGE_TYPES.join(",")} className="py-1.5" disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
            </Field>
            {progress !== null && (
              <div>
                <progress className="h-2 w-full" value={progress} max={1} aria-label="Upload progress" />
                <p className="text-xs text-muted">{Math.round(progress * 100)}%</p>
              </div>
            )}
            <Button variant="primary" onClick={upload} disabled={!file} loading={busy}>
              Upload poster
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Changing the poster needs dramas:write.</p>
        )}
      </div>
    </Card>
  );
}
