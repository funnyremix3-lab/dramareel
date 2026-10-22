"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { UsersList } from "@/features/users/users-list";

export default function Page() {
  return (
    <RequirePermission permission="users:read">
      <UsersList />
    </RequirePermission>
  );
}
