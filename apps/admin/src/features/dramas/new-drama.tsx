"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/layout";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { emptyDramaForm } from "@/lib/schemas";
import type { Drama } from "@/lib/types";
import { DramaForm } from "./drama-form";

export function NewDrama() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dramas" className="text-brand-700 hover:underline">
          ← Dramas
        </Link>
      </p>
      <PageHeader title="New drama" description="Created as a draft. Add episodes, a poster and a Hindi translation after saving." />
      <Card>
        <DramaForm
          initial={emptyDramaForm}
          isCreate
          submitLabel="Create drama"
          onSubmit={async (payload) => {
            const created = await api.post<Drama>("/admin/dramas", payload);
            toast.success("Drama created");
            await qc.invalidateQueries({ queryKey: ["dramas"] });
            router.push(`/dramas/${created.id}`);
          }}
        />
      </Card>
    </>
  );
}
