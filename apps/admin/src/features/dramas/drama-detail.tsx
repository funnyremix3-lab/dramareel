"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmButton } from "@/components/ui/dialog";
import { Card, PageHeader, StatusBadge } from "@/components/ui/layout";
import { QueryState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { usePermission } from "@/lib/auth";
import type { Drama } from "@/lib/types";
import { DramaForm, dramaToForm } from "./drama-form";
import { EpisodesPanel } from "./episodes-panel";
import { PosterUpload } from "./poster-upload";
import { TranslationEditor } from "./translation-editor";

type Tab = "details" | "episodes" | "translation" | "poster";

export function useDrama(id: string) {
  return useQuery({ queryKey: ["drama", id], queryFn: ({ signal }) => api.get<Drama>(`/admin/dramas/${id}`, undefined, signal) });
}

export function DramaDetail({ id }: { id: string }) {
  const query = useDrama(id);
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const canWrite = usePermission("dramas:write");
  const canPublish = usePermission("dramas:publish");
  const [tab, setTab] = useState<Tab>("details");

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["drama", id] }), qc.invalidateQueries({ queryKey: ["dramas"] })]);
  };

  async function setStatus(action: "publish" | "unpublish" | "archive", done: string) {
    await api.post(`/admin/dramas/${id}/${action}`);
    toast.success(done);
    await refresh();
  }

  return (
    <QueryState query={query}>
      {(d) => (
        <>
          <p className="mb-2 text-sm">
            <Link href="/dramas" className="text-brand-700 hover:underline">
              ← Dramas
            </Link>
          </p>
          <PageHeader
            title={d.title}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={d.status} /> <span>{d.slug}</span> <span>· {d.episodeCount} published episodes</span>
              </span>
            }
            actions={
              <>
                {canPublish && d.status !== "PUBLISHED" && (
                  <ConfirmButton
                    label="Publish"
                    variant="primary"
                    title="Publish this drama?"
                    description="It becomes visible to viewers. At least one episode must already be published."
                    confirmLabel="Publish"
                    onConfirm={() => setStatus("publish", "Drama published")}
                  />
                )}
                {canPublish && d.status === "PUBLISHED" && (
                  <ConfirmButton
                    label="Unpublish"
                    title="Unpublish this drama?"
                    description="It moves back to draft and disappears from the app."
                    confirmLabel="Unpublish"
                    onConfirm={() => setStatus("unpublish", "Drama unpublished")}
                  />
                )}
                {canPublish && d.status !== "ARCHIVED" && (
                  <ConfirmButton
                    label="Archive"
                    title="Archive this drama?"
                    description="Archived dramas are hidden from viewers but keep their episodes, unlocks and history."
                    confirmLabel="Archive"
                    onConfirm={() => setStatus("archive", "Drama archived")}
                  />
                )}
                {canWrite && (
                  <ConfirmButton
                    label="Delete"
                    variant="danger"
                    danger
                    title="Delete this drama permanently?"
                    description="Only empty, unpublished dramas can be deleted. Archive it instead if it has episodes."
                    confirmLabel="Delete"
                    onConfirm={async () => {
                      await api.delete(`/admin/dramas/${id}`);
                      toast.success("Drama deleted");
                      await qc.invalidateQueries({ queryKey: ["dramas"] });
                      router.replace("/dramas");
                    }}
                  />
                )}
              </>
            }
          />
          <Tabs
            label="Drama sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "details", label: "Details" },
              { value: "episodes", label: "Episodes" },
              { value: "translation", label: "Hindi translation" },
              { value: "poster", label: "Poster" },
            ]}
          >
            {tab === "details" && (
              <Card>
                {canWrite ? (
                  <DramaForm
                    key={d.updatedAt}
                    initial={dramaToForm(d)}
                    isCreate={false}
                    submitLabel="Save changes"
                    onSubmit={async (payload) => {
                      await api.patch(`/admin/dramas/${id}`, payload);
                      toast.success("Drama saved");
                      await refresh();
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted">You can view this drama but not edit it (needs dramas:write).</p>
                )}
              </Card>
            )}
            {tab === "episodes" && <EpisodesPanel drama={d} />}
            {tab === "translation" && <TranslationEditor drama={d} lang="hi" />}
            {tab === "poster" && <PosterUpload drama={d} onChanged={refresh} />}
          </Tabs>
        </>
      )}
    </QueryState>
  );
}
