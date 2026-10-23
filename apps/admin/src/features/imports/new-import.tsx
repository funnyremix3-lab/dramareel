"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout, Card, PageHeader } from "@/components/ui/layout";
import { CheckboxGroup, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useCategories, useLanguages } from "@/features/taxonomy/queries";
import { errorMessage } from "@/lib/api";
import { api } from "@/lib/api";
import { slugify } from "@/lib/schemas";
import type { ImportJob } from "@/lib/types";
import { formatBytes, putFile, videoContentType } from "@/lib/upload";

const MAX_BYTES = 8 * 1024 * 1024 * 1024;
const MIN_BYTES = 100 * 1024;

interface SourceUpload {
  sourceKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

type Phase = "idle" | "uploading" | "creating";

export function NewImport() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useCategories();
  const languages = useLanguages();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [synopsis, setSynopsis] = useState("");
  const [language, setLanguage] = useState("en");
  const [categorySlugs, setCategorySlugs] = useState<string[]>([]);
  const [targetSeconds, setTargetSeconds] = useState(90);
  const [freeEpisodeCount, setFreeEpisodeCount] = useState(10);
  const [autoPublish, setAutoPublish] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = phase !== "idle";

  function onTitle(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function choose(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    if (!videoContentType(f)) return setError("Choose an MP4, MOV, MKV or WebM video");
    if (f.size < MIN_BYTES) return setError("That file is too small to be a full video");
    if (f.size > MAX_BYTES) return setError(`The video is larger than ${formatBytes(MAX_BYTES)}`);
    setFile(f);
  }

  function validate(): string | null {
    if (!title.trim()) return "Add a title";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "The slug may use lowercase letters, digits and single hyphens";
    if (!file) return "Choose a source video";
    return null;
  }

  async function start() {
    const problem = validate();
    if (problem) return setError(problem);
    if (!file) return;
    setError(null);
    abort.current = new AbortController();
    try {
      setPhase("uploading");
      setProgress(0);
      const contentType = videoContentType(file)!;
      const presigned = await api.post<SourceUpload>("/admin/imports/source-upload-url", { contentType, sizeBytes: file.size });
      await putFile(presigned.uploadUrl, file, {
        headers: presigned.headers,
        signal: abort.current.signal,
        onProgress: setProgress,
      });

      setPhase("creating");
      await api.post<ImportJob>("/admin/imports", {
        sourceKey: presigned.sourceKey,
        sourceSizeBytes: file.size,
        title: title.trim(),
        slug,
        synopsis: synopsis.trim() || undefined,
        primaryLanguageCode: language,
        categorySlugs,
        freeEpisodeCount,
        targetSeconds,
        autoPublish,
      });
      toast.success("Import queued — the runner will start splitting shortly");
      await qc.invalidateQueries({ queryKey: ["imports"] });
      router.push("/imports");
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
    }
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/imports" className="text-brand-700 hover:underline">
          ← Imports
        </Link>
      </p>
      <PageHeader title="New import" description="Upload one long video. The runner splits it into short episodes at speech pauses." />

      <Card className="max-w-2xl space-y-4">
        <FormError message={error} />

        <Field label="Title" required>
          <Input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Drama title" disabled={busy} />
        </Field>
        <Field label="Slug" required hint="Used in the drama URL. Lowercase letters, digits and hyphens.">
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            placeholder="drama-slug"
            disabled={busy}
          />
        </Field>
        <Field label="Synopsis">
          <Textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="One or two sentences shown on the drama page." disabled={busy} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Primary language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
              {(languages.data ?? []).length === 0 ? (
                <option value="en">English</option>
              ) : (
                languages.data!.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName}
                  </option>
                ))
              )}
            </Select>
          </Field>
          <Field label="Episode length" hint="Seconds per episode">
            <Select value={String(targetSeconds)} onChange={(e) => setTargetSeconds(Number(e.target.value))} disabled={busy}>
              <option value="60">~60s</option>
              <option value="90">~90s</option>
              <option value="120">~2 min</option>
              <option value="180">~3 min</option>
            </Select>
          </Field>
          <Field label="Free episodes" hint="Unlocked for everyone">
            <Input type="number" min={0} max={1000} value={freeEpisodeCount} onChange={(e) => setFreeEpisodeCount(Number(e.target.value))} disabled={busy} />
          </Field>
        </div>

        {categories.data?.length ? (
          <CheckboxGroup
            legend="Categories"
            columns={3}
            value={categorySlugs}
            onChange={setCategorySlugs}
            options={categories.data.map((c) => ({ value: c.slug, label: c.names.en ?? c.slug }))}
          />
        ) : null}

        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} disabled={busy} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            Publish episodes automatically
            <span className="block text-xs text-muted">As each episode finishes transcoding it goes live. Turn off to review before publishing.</span>
          </span>
        </label>

        <Field label="Source video" required hint="MP4, MOV, MKV or WebM, up to 8 GB. One long video — it will be split into episodes.">
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-brand-700"
          />
        </Field>
        {file ? <p className="text-xs text-muted">{file.name} · {formatBytes(file.size)}</p> : null}

        {phase === "uploading" ? (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-xs text-muted">Uploading… {Math.round(progress * 100)}%</p>
          </div>
        ) : null}

        <Callout tone="gray">The upload goes straight to storage and may take a while for a large file. Keep this tab open until it finishes.</Callout>

        <div className="flex gap-2">
          <Button onClick={start} loading={busy} disabled={!file}>
            {phase === "creating" ? "Creating job…" : "Upload & queue import"}
          </Button>
          {busy ? (
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Card>
    </>
  );
}
