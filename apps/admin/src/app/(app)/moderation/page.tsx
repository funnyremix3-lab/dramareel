"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { ModerationPage } from "@/features/moderation/moderation-page";

export default function Page() {
  return (
    <RequirePermission permission="moderation:write">
      <ModerationPage />
    </RequirePermission>
  );
}
