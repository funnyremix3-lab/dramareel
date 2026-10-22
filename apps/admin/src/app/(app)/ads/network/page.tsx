"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { NetworkPage } from "@/features/ads/network-page";

export default function Page() {
  return (
    <RequirePermission permission="ads:read">
      <NetworkPage />
    </RequirePermission>
  );
}
