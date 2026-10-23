"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { NewImport } from "@/features/imports/new-import";

export default function Page() {
  return (
    <RequirePermission permission="media:write">
      <NewImport />
    </RequirePermission>
  );
}
