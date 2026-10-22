"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { AuditPage } from "@/features/audit/audit-page";

export default function Page() {
  return (
    <RequirePermission permission="audit:read">
      <AuditPage />
    </RequirePermission>
  );
}
