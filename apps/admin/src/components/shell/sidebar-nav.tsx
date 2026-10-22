import { clsx } from "clsx";
import Link from "next/link";
import { visibleNav } from "@/lib/permissions";

/** Sidebar links filtered by the user's UI permissions. */
export function SidebarNav({ permissions, pathname, onNavigate }: { permissions: readonly string[]; pathname: string; onNavigate?: () => void }) {
  const items = visibleNav(permissions);
  return (
    <nav aria-label="Main">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
                  active ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-subtle",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
