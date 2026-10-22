"use client";

import { useParams } from "next/navigation";
import { RequirePermission } from "@/components/shell/app-shell";
import { UserDetail } from "@/features/users/user-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="users:read">
      <UserDetail key={id} id={id} />
    </RequirePermission>
  );
}
