import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuthUser, VerifiedClaims } from '../auth/auth.types';
import { AppException } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENTITLED_SUBSCRIPTION_STATUSES } from '../entitlements/entitlement';

const withRoles = { roles: { include: { role: true } } } satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof withRoles }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Maps verified token claims to our user, provisioning user + profile + wallet on first sight. */
  async resolveAuthUser(claims: VerifiedClaims): Promise<AuthUser> {
    let user = await this.prisma.user.findUnique({ where: { authProviderId: claims.sub }, include: withRoles });
    if (!user) user = await this.provision(claims);

    if (user.status === 'SUSPENDED') throw new AppException('ACCOUNT_SUSPENDED', 'This account is suspended');
    if (user.status === 'DELETED') throw new AppException('UNAUTHENTICATED', 'This account no longer exists');

    // Signing in again during the 30-day grace period cancels a deletion request. Only a token issued
    // after the request counts, so a request still in flight from the old session cannot cancel it.
    if (user.deletionRequestedAt && claims.issuedAt && claims.issuedAt * 1000 > user.deletionRequestedAt.getTime()) {
      await this.prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } });
    }

    return toAuthUser(user);
  }

  private async provision(claims: VerifiedClaims): Promise<UserWithRoles> {
    try {
      return await this.prisma.user.create({
        data: {
          authProviderId: claims.sub,
          email: claims.email?.toLowerCase(),
          phone: claims.phone,
          profile: { create: {} },
          wallet: { create: {} },
        },
        include: withRoles,
      });
    } catch (err) {
      // Two first requests racing: the other one created the row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.user.findUnique({ where: { authProviderId: claims.sub }, include: withRoles });
        if (existing) return existing;
      }
      throw err;
    }
  }

  touchLastSeen(userId: string): void {
    // Fire-and-forget; at most once per request and never blocks the response.
    this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { ...withRoles, profile: true, wallet: true },
    });
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] }, currentPeriodEnd: { gt: new Date() } },
      include: { product: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      createdAt: user.createdAt,
      profile: {
        displayName: user.profile?.displayName ?? null,
        avatarKey: user.profile?.avatarKey ?? null,
        bio: user.profile?.bio ?? null,
      },
      consents: {
        analytics: user.profile?.analyticsConsent ?? false,
        adsPersonalization: user.profile?.adsPersonalizationConsent ?? false,
        marketing: user.profile?.marketingConsent ?? false,
        push: user.profile?.pushEnabled ?? true,
      },
      roles: user.roles.map((r) => r.role.key),
      wallet: { balance: user.wallet?.balance ?? 0 },
      subscription: subscription
        ? {
            sku: subscription.product.sku,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            adFree: subscription.product.adFree,
          }
        : null,
      deletionRequestedAt: user.deletionRequestedAt,
    };
  }

  async updateProfile(userId: string, input: { displayName?: string; bio?: string; locale?: string }) {
    await this.prisma.$transaction([
      this.prisma.userProfile.update({
        where: { userId },
        data: { displayName: input.displayName, bio: input.bio },
      }),
      ...(input.locale ? [this.prisma.user.update({ where: { id: userId }, data: { locale: input.locale } })] : []),
    ]);
    return this.getMe(userId);
  }

  async updateConsents(
    userId: string,
    input: { analytics: boolean; adsPersonalization: boolean; marketing: boolean; push: boolean },
  ) {
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        analyticsConsent: input.analytics,
        adsPersonalizationConsent: input.adsPersonalization,
        marketingConsent: input.marketing,
        pushEnabled: input.push,
        consentUpdatedAt: new Date(),
      },
    });
    return this.getMe(userId);
  }

  async registerDeviceToken(userId: string, token: string, platform: 'ANDROID' | 'IOS') {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastUsedAt: new Date() },
    });
  }

  async removeDeviceToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }

  /** Starts the 30-day deletion grace period; the retention job purges PII afterwards. */
  async requestDeletion(userId: string) {
    const user: User = await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date() },
    });
    await this.prisma.deviceToken.deleteMany({ where: { userId } });
    return { deletionRequestedAt: user.deletionRequestedAt };
  }
}

function toAuthUser(user: UserWithRoles): AuthUser {
  const permissions = new Set<string>();
  for (const { role } of user.roles) role.permissions.forEach((p) => permissions.add(p));
  return {
    id: user.id,
    authProviderId: user.authProviderId,
    roles: user.roles.map((r) => r.role.key),
    permissions: [...permissions],
  };
}
