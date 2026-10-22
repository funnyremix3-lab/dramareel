"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { RolesPage } from "@/features/roles/roles-page";

export default function Page() {
  return (
    <RequirePermission permission="roles:write">
      <RolesPage />
    </RequirePermission>
  );
}
