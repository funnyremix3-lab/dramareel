"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { NewCampaign } from "@/features/ads/campaign-detail";

export default function Page() {
  return (
    <RequirePermission permission="ads:write">
      <NewCampaign />
    </RequirePermission>
  );
}
