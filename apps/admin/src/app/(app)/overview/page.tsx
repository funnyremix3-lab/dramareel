"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { OverviewPage } from "@/features/overview/overview-page";

export default function Page() {
  return (
    <RequirePermission permission="analytics:read">
      <OverviewPage />
    </RequirePermission>
  );
}
