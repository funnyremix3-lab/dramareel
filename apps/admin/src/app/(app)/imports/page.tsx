"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { ImportsPage } from "@/features/imports/imports-page";

export default function Page() {
  return (
    <RequirePermission permission="media:write">
      <ImportsPage />
    </RequirePermission>
  );
}
