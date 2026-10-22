"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, NoAccess, Spinner } from "@/components/ui/states";
import { PermissionsProvider, useAuth, useMe, usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { SYSTEM_ROLES, isSystemRole, visibleNav } from "@/lib/permissions";
import { SidebarNav } from "./sidebar-nav";

function UserMenu({ email, roles, onSignOut }: { email: string; roles: string[]; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex max-w-[16rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{email}</span>
          <span aria-hidden className="text-muted">
            ▾
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-md border border-line bg-surface p-1 shadow-lg">
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted">
            Signed in as <span className="font-medium text-ink">{email}</span>
            <span className="mt-1 block">Roles: {roles.map((r) => (isSystemRole(r) ? SYSTEM_ROLES[r].name : r)).join(", ") || "none"}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={onSignOut}
            className="cursor-pointer rounded px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-subtle"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Auth guard + layout for every signed-in page. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, signOut, source } = useAuth();
  const { me, permissions, isPending, isError, error, refetch } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  const doSignOut = () => {
    void signOut().then(() => router.replace("/login"));
  };

  if (status !== "signedIn") return <Spinner label="Checking your session…" />;
  if (isPending) return <Spinner label="Loading your account…" />;
  if (isError || !me) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorState error={error} onRetry={() => void refetch()} />
        <Button className="mt-4" onClick={doSignOut}>
          Sign out
        </Button>
      </main>
    );
  }

  if (visibleNav(permissions).length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <NoAccess title="No admin access">
          <p>
            {me.email ?? "This account"} has no admin role{me.roles.length ? ` this dashboard recognises (roles: ${me.roles.join(", ")})` : ""}. Ask an owner to assign one.
          </p>
          <Button className="mt-4" onClick={doSignOut}>
            Sign out
          </Button>
        </NoAccess>
      </main>
    );
  }

  return (
    <PermissionsProvider permissions={permissions}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-line bg-surface p-3 transition-transform lg:static lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
          aria-label="Sidebar"
        >
          <div className="mb-4 px-3 py-2">
            <p className="text-base font-bold text-brand-600">Reel Drama</p>
            <p className="text-xs text-muted">Admin{source === "dev" ? " · dev login" : ""}</p>
          </div>
          <SidebarNav permissions={permissions} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </aside>
        {menuOpen && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" aria-hidden onClick={() => setMenuOpen(false)} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur">
            <Button variant="ghost" className="lg:hidden" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </Button>
            <p className="hidden truncate text-xs text-muted sm:block">API: {env.apiUrl}</p>
            <UserMenu email={me.email ?? me.phone ?? me.id} roles={me.roles} onSignOut={doSignOut} />
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </PermissionsProvider>
  );
}

/** Page-level permission gate; the API enforces the same permission. */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const allowed = usePermission(permission);
  if (!allowed) return <NoAccess>This page needs the {permission} permission.</NoAccess>;
  return <>{children}</>;
}
