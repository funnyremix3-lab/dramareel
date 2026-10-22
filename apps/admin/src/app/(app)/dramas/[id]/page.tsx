"use client";

import { useParams } from "next/navigation";
import { RequirePermission } from "@/components/shell/app-shell";
import { DramaDetail } from "@/features/dramas/drama-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="dramas:read">
      <DramaDetail key={id} id={id} />
    </RequirePermission>
  );
}
