"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { CampaignsList } from "@/features/ads/campaigns-list";

export default function Page() {
  return (
    <RequirePermission permission="ads:read">
      <CampaignsList />
    </RequirePermission>
  );
}
