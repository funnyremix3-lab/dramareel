"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout, Card, PageHeader, StatusBadge, Table, Td, Th, Tr } from "@/components/ui/layout";
import { EmptyRow, QueryState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import type { ImportJob } from "@/lib/types";
import { useImportActions, useImports } from "./queries";

function progressText(job: ImportJob): string {
  if (job.status === "DONE") return `${job.publishedEpisodes} episodes published`;
  if (job.totalEpisodes) {
    const done = job.status === "RUNNING" && job.publishedEpisodes ? job.publishedEpisodes : job.uploadedEpisodes;
    return `${done}/${job.totalEpisodes} episodes`;
  }
  return job.step ?? "Waiting for the import runner";
}

function progressPct(job: ImportJob): number {
  if (job.status === "DONE") return 100;
  if (!job.totalEpisodes) return 0;
  const done = Math.max(job.uploadedEpisodes, job.publishedEpisodes);
  return Math.min(100, Math.round((done / job.totalEpisodes) * 100));
}

function Progress({ job }: { job: ImportJob }) {
  const pct = progressPct(job);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">{progressText(job)}</p>
    </div>
  );
}

export function ImportsPage() {
  const query = useImports();
  const { cancel, retry } = useImportActions();
  const toast = useToast();

  const act = (m: typeof cancel, id: string, ok: string) =>
    m.mutate(id, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <>
      <PageHeader
        title="Import videos"
        description="Upload one long video and split it into short episodes automatically."
        actions={
          <Link href="/imports/new">
            <Button>New import</Button>
          </Link>
        }
      />

      <Callout tone="blue" title="The import runner must be running">
        Uploading creates a job. A local runner (<code>drama-importer</code>, <code>npm run import -- worker</code>) on the machine with ffmpeg
        picks it up, splits the video at speech pauses and publishes each episode as it is transcoded. Only import content you own or are licensed to distribute.
      </Callout>

      <Card className="mt-4">
        <QueryState query={query}>
          {(data) => (
            <Table>
              <thead>
                <Tr>
                  <Th>Drama</Th>
                  <Th>Status</Th>
                  <Th>Progress</Th>
                  <Th>Settings</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <EmptyRow colSpan={5}>No imports yet.</EmptyRow>
                ) : (
                  data.items.map((job) => (
                    <Tr key={job.id}>
                      <Td>
                        <div className="font-medium text-ink">
                          {job.dramaId ? (
                            <Link href={`/dramas/${job.dramaId}`} className="text-brand-700 hover:underline">
                              {job.title}
                            </Link>
                          ) : (
                            job.title
                          )}
                        </div>
                        <div className="text-xs text-muted">{job.slug}</div>
                      </Td>
                      <Td>
                        <StatusBadge status={job.status} />
                        {job.status === "FAILED" && job.lastError ? <p className="mt-1 max-w-xs text-xs text-red-700">{job.lastError}</p> : null}
                      </Td>
                      <Td>
                        <Progress job={job} />
                      </Td>
                      <Td className="text-xs text-muted">
                        ~{Math.round(job.targetSeconds)}s/ep · {job.freeEpisodeCount} free · {job.autoPublish ? "auto-publish" : "manual publish"}
                      </Td>
                      <Td className="text-right">
                        {job.status === "PENDING" || job.status === "RUNNING" ? (
                          <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => act(cancel, job.id, "Import canceled")}>
                            Cancel
                          </Button>
                        ) : job.status === "FAILED" || job.status === "CANCELED" ? (
                          <Button size="sm" variant="secondary" loading={retry.isPending} onClick={() => act(retry, job.id, "Import queued again")}>
                            Retry
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </QueryState>
      </Card>
    </>
  );
}
