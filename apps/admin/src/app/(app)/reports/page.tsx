"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { ReportsPage } from "@/features/reports/reports-page";

export default function Page() {
  return (
    <RequirePermission permission="analytics:read">
      <ReportsPage />
    </RequirePermission>
  );
}
