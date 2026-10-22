"use client";

import { useParams } from "next/navigation";
import { RequirePermission } from "@/components/shell/app-shell";
import { CampaignDetail } from "@/features/ads/campaign-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="ads:read">
      <CampaignDetail key={id} id={id} />
    </RequirePermission>
  );
}
