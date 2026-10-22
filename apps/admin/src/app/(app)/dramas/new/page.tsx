"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { NewDrama } from "@/features/dramas/new-drama";

export default function Page() {
  return (
    <RequirePermission permission="dramas:write">
      <NewDrama />
    </RequirePermission>
  );
}
