"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { TaxonomyPage } from "@/features/taxonomy/taxonomy-page";

export default function Page() {
  return (
    <RequirePermission permission="dramas:read">
      <TaxonomyPage />
    </RequirePermission>
  );
}
