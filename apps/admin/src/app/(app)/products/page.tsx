"use client";

import { RequirePermission } from "@/components/shell/app-shell";
import { ProductsPage } from "@/features/products/products-page";

export default function Page() {
  return (
    <RequirePermission permission="monetization:write">
      <ProductsPage />
    </RequirePermission>
  );
}
