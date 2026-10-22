"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { PlacementsPage } from "@/features/ads/placements-page";

export default function Page() {
  return (
    <RequirePermission permission="ads:read">
      <PlacementsPage />
    </RequirePermission>
  );
}
