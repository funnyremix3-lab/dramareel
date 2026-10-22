"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { DramasList } from "@/features/dramas/dramas-list";

export default function Page() {
  return (
    <RequirePermission permission="dramas:read">
      <DramasList />
    </RequirePermission>
  );
}
