"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/states";
import { usePermissionsContext } from "@/lib/auth";
import { homePath } from "@/lib/permissions";

/** "/" sends each user to the first page their role can open. */
export default function Home() {
  const { permissions } = usePermissionsContext();
  const router = useRouter();
  useEffect(() => {
    const target = homePath(permissions);
    if (target) router.replace(target);
  }, [permissions, router]);
  return <Spinner label="Opening dashboard…" />;
}
