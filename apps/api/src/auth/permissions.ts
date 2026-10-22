/**
 * Permission strings are `resource:action` or deeper (`ads:campaigns:write`).
 * A grant matches exactly, via `*`, or via a trailing wildcard (`dramas:*`).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => {
    if (g === '*' || g === required) return true;
    if (g.endsWith(':*')) return required.startsWith(g.slice(0, -1));
    return false;
  });
}

export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((r) => hasPermission(granted, r));
}

export const SYSTEM_ROLES = {
  OWNER: { name: 'Owner', permissions: ['*'] },
  CONTENT_MANAGER: {
    name: 'Content Manager',
    permissions: ['dramas:*', 'media:write', 'monetization:write', 'moderation:write', 'analytics:read', 'notifications:write'],
  },
  ADS_MANAGER: { name: 'Ads Manager', permissions: ['ads:*', 'analytics:read'] },
  SUPPORT_AGENT: { name: 'Support Agent', permissions: ['users:read', 'users:suspend', 'moderation:write', 'audit:read'] },
} as const;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
