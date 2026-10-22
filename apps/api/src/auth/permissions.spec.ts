import { hasAllPermissions, hasPermission, SYSTEM_ROLES } from './permissions';

describe('hasPermission', () => {
  it('matches exact grants', () => {
    expect(hasPermission(['dramas:write'], 'dramas:write')).toBe(true);
    expect(hasPermission(['dramas:read'], 'dramas:write')).toBe(false);
  });

  it('treats * as everything', () => {
    expect(hasPermission(['*'], 'wallet:adjust')).toBe(true);
  });

  it('supports trailing wildcards without leaking to sibling resources', () => {
    expect(hasPermission(['ads:*'], 'ads:campaigns:write')).toBe(true);
    expect(hasPermission(['ads:*'], 'adsx:write')).toBe(false);
    expect(hasPermission(['dramas:*'], 'users:read')).toBe(false);
  });

  it('denies with no grants', () => {
    expect(hasPermission([], 'dramas:read')).toBe(false);
  });
});

describe('system roles', () => {
  const can = (role: keyof typeof SYSTEM_ROLES, perm: string) => hasPermission(SYSTEM_ROLES[role].permissions, perm);

  it('only the owner can adjust wallets or manage roles', () => {
    expect(can('OWNER', 'wallet:adjust')).toBe(true);
    for (const role of ['CONTENT_MANAGER', 'ADS_MANAGER', 'SUPPORT_AGENT'] as const) {
      expect(can(role, 'wallet:adjust')).toBe(false);
      expect(can(role, 'roles:write')).toBe(false);
    }
  });

  it('ads managers cannot edit content and content managers cannot edit campaigns', () => {
    expect(can('ADS_MANAGER', 'dramas:write')).toBe(false);
    expect(can('CONTENT_MANAGER', 'ads:campaigns:write')).toBe(false);
    expect(can('ADS_MANAGER', 'ads:campaigns:write')).toBe(true);
    expect(can('CONTENT_MANAGER', 'dramas:publish')).toBe(true);
  });

  it('support agents can read users and moderate but not publish', () => {
    expect(hasAllPermissions(SYSTEM_ROLES.SUPPORT_AGENT.permissions, ['users:read', 'moderation:write'])).toBe(true);
    expect(can('SUPPORT_AGENT', 'dramas:publish')).toBe(false);
  });
});
