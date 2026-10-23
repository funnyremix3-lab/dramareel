/**
 * Client-side permission model, used only to decide what the UI shows.
 * The API enforces every permission again, so nothing here is a security boundary.
 *
 * Matching rule copied from apps/api/src/auth/permissions.ts:
 * a grant matches exactly, via `*`, or via a trailing wildcard (`dramas:*`).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => {
    if (g === "*" || g === required) return true;
    if (g.endsWith(":*")) return required.startsWith(g.slice(0, -1));
    return false;
  });
}

export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((r) => hasPermission(granted, r));
}

export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((r) => hasPermission(granted, r));
}

/** Mirrors SYSTEM_ROLES in apps/api/src/auth/permissions.ts. */
export const SYSTEM_ROLES = {
  OWNER: { name: "Owner", permissions: ["*"] },
  CONTENT_MANAGER: {
    name: "Content Manager",
    permissions: ["dramas:*", "media:write", "monetization:write", "moderation:write", "analytics:read", "notifications:write"],
  },
  ADS_MANAGER: { name: "Ads Manager", permissions: ["ads:*", "analytics:read"] },
  SUPPORT_AGENT: { name: "Support Agent", permissions: ["users:read", "users:suspend", "moderation:write", "audit:read"] },
} as const satisfies Record<string, { name: string; permissions: readonly string[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

export function isSystemRole(key: string): key is SystemRoleKey {
  return Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, key);
}

/**
 * `GET /me` returns role keys, not permissions. Derive UI permissions from the system role table.
 * Custom roles add nothing here (their permissions are not exposed to the user); the API still
 * enforces whatever they grant.
 */
export function permissionsForRoles(roles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const role of roles) {
    if (isSystemRole(role)) SYSTEM_ROLES[role].permissions.forEach((p) => out.add(p));
  }
  return [...out];
}

/** Every permission string the API checks (apps/api/src/admin/admin-users.service.ts KNOWN_PERMISSIONS). */
export const KNOWN_PERMISSIONS = [
  "*",
  "dramas:*",
  "dramas:read",
  "dramas:write",
  "dramas:publish",
  "media:write",
  "monetization:write",
  "moderation:write",
  "users:read",
  "users:suspend",
  "wallet:adjust",
  "roles:write",
  "ads:*",
  "ads:read",
  "ads:write",
  "analytics:read",
  "notifications:write",
  "audit:read",
] as const;

/** Permissions a custom role may hold (the API rejects `*` on anything but OWNER). */
export const ASSIGNABLE_PERMISSIONS = KNOWN_PERMISSIONS.filter((p) => p !== "*");

export interface NavItem {
  href: string;
  label: string;
  /** The user needs this permission to see the item. */
  permission: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/overview", label: "Overview", permission: "analytics:read" },
  { href: "/dramas", label: "Dramas", permission: "dramas:read" },
  { href: "/video-assets", label: "Video processing", permission: "media:write" },
  { href: "/imports", label: "Import videos", permission: "media:write" },
  { href: "/taxonomy", label: "Categories & languages", permission: "dramas:read" },
  { href: "/users", label: "Users", permission: "users:read" },
  { href: "/roles", label: "Roles", permission: "roles:write" },
  { href: "/moderation", label: "Moderation", permission: "moderation:write" },
  { href: "/ads", label: "Ads", permission: "ads:read" },
  { href: "/products", label: "Products", permission: "monetization:write" },
  { href: "/notifications", label: "Notifications", permission: "notifications:write" },
  { href: "/reports", label: "Reports", permission: "analytics:read" },
  { href: "/audit", label: "Audit log", permission: "audit:read" },
];

export function visibleNav(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(permissions, item.permission));
}

/** Where to send a user after sign-in: the first page they can open, or null when they have none. */
export function homePath(permissions: readonly string[]): string | null {
  return visibleNav(permissions)[0]?.href ?? null;
}
