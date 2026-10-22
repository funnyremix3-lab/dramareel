import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { SYSTEM_ROLES } from '../auth/permissions';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { AdminPageQuery, paged, plain, skipTake } from './admin-common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every permission string the API checks. Custom roles may only grant these. */
export const KNOWN_PERMISSIONS = [
  '*',
  'dramas:*',
  'dramas:read',
  'dramas:write',
  'dramas:publish',
  'media:write',
  'monetization:write',
  'moderation:write',
  'users:read',
  'users:suspend',
  'wallet:adjust',
  'roles:write',
  'ads:*',
  'ads:read',
  'ads:write',
  'analytics:read',
  'notifications:write',
  'audit:read',
] as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletService,
  ) {}

  async list(q: AdminPageQuery) {
    const where: Prisma.UserWhereInput = q.q
      ? {
          OR: [
            { email: { contains: q.q.toLowerCase() } },
            { phone: { contains: q.q } },
            ...(UUID.test(q.q) ? [{ id: q.q }] : []),
            { profile: { displayName: { contains: q.q, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { profile: { select: { displayName: true } }, wallet: { select: { balance: true } }, roles: { include: { role: { select: { key: true } } } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        displayName: u.profile?.displayName ?? null,
        status: u.status,
        balance: u.wallet?.balance ?? 0,
        roles: u.roles.map((r) => r.role.key),
        lastSeenAt: u.lastSeenAt,
        createdAt: u.createdAt,
      })),
      total,
      q,
    );
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, wallet: true, roles: { include: { role: true } } },
    });
    if (!user) throw notFound('User');
    const [transactions, unlocks, payments, subscriptions, comments] = await Promise.all([
      this.prisma.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.episodeUnlock.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { episode: { select: { number: true, drama: { select: { title: true } } } } },
      }),
      this.prisma.paymentTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { product: { select: { sku: true } } } }),
      this.prisma.subscription.findMany({ where: { userId: id }, orderBy: { currentPeriodEnd: 'desc' }, include: { product: { select: { sku: true } } } }),
      this.prisma.comment.count({ where: { userId: id } }),
    ]);
    return plain({
      id: user.id,
      authProviderId: user.authProviderId,
      email: user.email,
      phone: user.phone,
      status: user.status,
      locale: user.locale,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      deletionRequestedAt: user.deletionRequestedAt,
      profile: user.profile,
      balance: user.wallet?.balance ?? 0,
      roles: user.roles.map((r) => r.role.key),
      transactions,
      unlocks: unlocks.map((u) => ({ episodeId: u.episodeId, method: u.method, createdAt: u.createdAt, episodeNumber: u.episode.number, dramaTitle: u.episode.drama.title })),
      payments: payments.map(({ verificationPayload: _v, purchaseToken: _t, ...p }) => p),
      subscriptions: subscriptions.map(({ providerSubscriptionId: _s, ...s }) => s),
      commentCount: comments,
    });
  }

  async setStatus(req: Request, id: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (req.user?.id === id) throw new AppException('VALIDATION_FAILED', 'You cannot change your own status');
    const before = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!before) throw notFound('User');
    if (before.status === 'DELETED') throw new AppException('CONFLICT', 'User is deleted');
    if (before.roles.some((r) => r.role.key === 'OWNER') && !req.user?.roles.includes('OWNER')) {
      throw new AppException('FORBIDDEN', 'Only an owner can suspend an owner');
    }
    const after = await this.prisma.user.update({ where: { id }, data: { status } });
    await this.audit.record(req, { action: `user.${status === 'SUSPENDED' ? 'suspend' : 'reinstate'}`, entityType: 'user', entityId: id, before: { status: before.status }, after: { status } });
    return { id, status: after.status };
  }

  /** Manual coin correction (support goodwill, fixing mistakes). Always audited and ledgered. */
  async adjustWallet(req: Request, id: string, amount: number, note: string) {
    if (!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw notFound('User');
    return this.prisma.$transaction(async (tx) => {
      const log = await this.audit.record(req, { action: 'wallet.adjust', entityType: 'user', entityId: id, after: { amount, note } }, tx);
      const result = await this.wallet.post(tx, {
        userId: id,
        amount,
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: `admin:${log.id}`,
        referenceType: 'audit_log',
        referenceId: log.id,
        actorId: req.user?.id,
        note,
      });
      return { balance: result.transaction?.balanceAfter, transactionId: result.transaction?.id };
    });
  }

  async setRoles(req: Request, id: string, roleKeys: string[]) {
    const roles = await this.prisma.role.findMany({ where: { key: { in: roleKeys } } });
    if (roles.length !== new Set(roleKeys).size) throw new AppException('VALIDATION_FAILED', 'Unknown role');
    const user = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!user) throw notFound('User');
    const before = user.roles.map((r) => r.role.key);
    // Never remove the last owner — the platform would become unmanageable.
    if (before.includes('OWNER') && !roleKeys.includes('OWNER')) {
      const owners = await this.prisma.userRole.count({ where: { role: { key: 'OWNER' } } });
      if (owners <= 1) throw new AppException('CONFLICT', 'Cannot remove the last owner');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, grantedBy: req.user?.id })) });
      await this.audit.record(req, { action: 'user.roles', entityType: 'user', entityId: id, before, after: roleKeys }, tx);
    });
    return { id, roles: roleKeys };
  }

  listRoles() {
    return this.prisma.role.findMany({ orderBy: [{ isSystem: 'desc' }, { key: 'asc' }], include: { _count: { select: { users: true } } } });
  }

  async upsertRole(req: Request, input: { key: string; name: string; permissions: string[] }) {
    if (input.key in SYSTEM_ROLES) throw new AppException('CONFLICT', 'System roles cannot be edited');
    const unknown = input.permissions.filter((p) => !(KNOWN_PERMISSIONS as readonly string[]).includes(p));
    if (unknown.length) throw new AppException('VALIDATION_FAILED', `Unknown permissions: ${unknown.join(', ')}`);
    if (input.permissions.includes('*')) throw new AppException('VALIDATION_FAILED', 'Only the OWNER role may hold *');
    const row = await this.prisma.role.upsert({
      where: { key: input.key },
      create: { key: input.key, name: input.name, permissions: input.permissions },
      update: { name: input.name, permissions: input.permissions },
    });
    await this.audit.record(req, { action: 'role.upsert', entityType: 'role', entityId: row.id, after: row });
    return row;
  }
}
