"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { VideoAssetsPage } from "@/features/media/video-assets-page";

export default function Page() {
  return (
    <RequirePermission permission="media:write">
      <VideoAssetsPage />
    </RequirePermission>
  );
}
