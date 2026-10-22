"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/ads", label: "Placements & AdMob" },
  { href: "/ads/campaigns", label: "Direct campaigns" },
  { href: "/ads/network", label: "AdMob network revenue" },
];

export function AdsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Ads sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {LINKS.map((l) => {
        const active = l.href === "/ads" ? pathname === "/ads" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
