"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { NotificationsPage } from "@/features/notifications/notifications-page";

export default function Page() {
  return (
    <RequirePermission permission="notifications:write">
      <NotificationsPage />
    </RequirePermission>
  );
}
