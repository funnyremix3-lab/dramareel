"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/layout";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { VideoAsset, VideoUploadTarget } from "@/lib/types";
import { VIDEO_TYPES, formatBytes, putFile, videoContentType } from "@/lib/upload";

const MIN_BYTES = 10 * 1024;
const TERMINAL = new Set(["READY", "FAILED"]);

/** Polls an asset until it is READY or FAILED. */
export function useAssetStatus(assetId: string | null) {
  return useQuery({
    queryKey: ["video-asset", assetId],
    queryFn: ({ signal }) => api.get<VideoAsset>(`/admin/video-assets/${assetId}`, undefined, signal),
    enabled: !!assetId,
    refetchInterval: (q) => (q.state.data && TERMINAL.has(q.state.data.status) ? false : 3000),
  });
}

type Phase = "idle" | "creating" | "uploading" | "completing" | "processing";

/**
 * Episode video upload:
 * POST /admin/episodes/:id/video-assets → PUT file to the presigned URL (with progress)
 * → POST /admin/video-assets/:id/complete → poll GET /admin/video-assets/:id.
 */
export function VideoUpload({ episodeId, currentAssetId, onFinished }: { episodeId: string; currentAssetId: string | null; onFinished: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const status = useAssetStatus(phase === "processing" ? assetId : null);
  const asset = status.data;

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (asset && TERMINAL.has(asset.status)) {
      void qc.invalidateQueries({ queryKey: ["episodes"] });
      void qc.invalidateQueries({ queryKey: ["video-assets"] });
    }
  }, [asset, qc]);

  function choose(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    if (!videoContentType(f)) {
      setError("Choose an MP4, MOV, MKV or WebM video");
      return;
    }
    if (f.size < MIN_BYTES) {
      setError("The file is too small to be a video");
      return;
    }
    setFile(f);
  }

  async function start() {
    if (!file) return;
    const contentType = videoContentType(file)!;
    setError(null);
    abort.current = new AbortController();
    try {
      setPhase("creating");
      const target = await api.post<VideoUploadTarget>(`/admin/episodes/${episodeId}/video-assets`, { contentType, sizeBytes: file.size });
      setAssetId(target.assetId);
      setPhase("uploading");
      setProgress(0);
      await putFile(target.uploadUrl, file, { headers: target.headers, onProgress: setProgress, signal: abort.current.signal });
      setPhase("completing");
      await api.post(`/admin/video-assets/${target.assetId}/complete`);
      setPhase("processing");
      toast.success("Upload complete. Processing has started.");
    } catch (err) {
      setPhase("idle");
      setError(errorMessage(err));
    }
  }

  async function retry() {
    if (!assetId) return;
    try {
      await api.post(`/admin/video-assets/${assetId}/retry`);
      toast.success("Processing retried");
      await status.refetch();
    } catch (err) {
      toast.error(err);
    }
  }

  async function makeCurrent() {
    if (!assetId) return;
    try {
      await api.put(`/admin/episodes/${episodeId}/current-asset`, { assetId });
      toast.success("This video is now the episode's current video");
      await qc.invalidateQueries({ queryKey: ["episodes"] });
      onFinished();
    } catch (err) {
      toast.error(err);
    }
  }

  const busy = phase === "creating" || phase === "uploading" || phase === "completing";

  return (
    <div className="space-y-4">
      <FormError message={error} />
      {phase === "idle" && (
        <>
          <Field label="Video file" hint="MP4, MOV, MKV or WebM. It is transcoded to HLS (480p/720p/1080p up to the source height).">
            <Input type="file" accept={[...VIDEO_TYPES, ".mkv"].join(",")} className="py-1.5" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </Field>
          {file && (
            <p className="text-sm text-muted">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}
          <Button variant="primary" onClick={start} disabled={!file}>
            Upload
          </Button>
        </>
      )}

      {busy && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm">{phase === "creating" ? "Preparing upload…" : phase === "uploading" ? "Uploading to storage…" : "Verifying upload…"}</p>
          <progress className="h-2 w-full" value={phase === "uploading" ? progress : phase === "completing" ? 1 : 0} max={1} aria-label="Upload progress" />
          <p className="text-xs tabular-nums text-muted">{Math.round(progress * 100)}%</p>
          {phase === "uploading" && (
            <Button size="sm" onClick={() => abort.current?.abort()}>
              Cancel upload
            </Button>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            Processing status: <StatusBadge status={asset?.status ?? "UPLOADED"} />
            {asset && !TERMINAL.has(asset.status) && <span className="text-xs text-muted">checking every 3 s…</span>}
          </p>
          {status.isError && <FormError message={errorMessage(status.error)} />}
          {asset?.status === "FAILED" && (
            <>
              <FormError message={asset.lastError ?? "Processing failed"} />
              <Button onClick={retry}>Retry processing</Button>
            </>
          )}
          {asset?.status === "READY" && (
            <div className="flex flex-wrap gap-2">
              {currentAssetId !== asset.id && (
                <Button variant="primary" onClick={makeCurrent}>
                  Use as current video
                </Button>
              )}
              <Button onClick={onFinished}>Done</Button>
            </div>
          )}
          {asset?.status === "READY" && currentAssetId === null && (
            <p className="text-xs text-muted">An episode without a video adopts its first processed upload automatically.</p>
          )}
        </div>
      )}
    </div>
  );
}
