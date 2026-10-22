import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AdCampaign, Platform, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app-exception';
import { Locale } from '../common/http/locale';
import { MediaUrlService } from '../common/http/media-url';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENTITLED_SUBSCRIPTION_STATUSES } from '../entitlements/entitlement';
import { ENV, Env } from '../config/env';
import { serveIdOf, signServeToken, verifyServeToken } from './serve-token';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

interface Targeting {
  languages?: string[];
  platforms?: Platform[];
}

/** Pure eligibility check for a campaign at a moment in time (unit-tested). */
export function campaignIsLive(c: Pick<AdCampaign, 'status' | 'startAt' | 'endAt'>, now: Date): boolean {
  return (c.status === 'ACTIVE' || c.status === 'SCHEDULED') && c.startAt <= now && now < c.endAt;
}

export function targetingMatches(targeting: unknown, ctx: { locale: Locale; platform: Platform }): boolean {
  const t = (targeting ?? {}) as Targeting;
  if (Array.isArray(t.languages) && t.languages.length && !t.languages.includes(ctx.locale)) return false;
  if (Array.isArray(t.platforms) && t.platforms.length && !t.platforms.includes(ctx.platform)) return false;
  return true;
}

/** Spend so far in paise, by pricing model. FLAT campaigns are pre-paid and never exhaust by delivery. */
export function spentPaise(c: Pick<AdCampaign, 'pricingModel' | 'ratePaise'>, impressions: number, clicks: number): bigint {
  if (c.pricingModel === 'CPM') return (BigInt(impressions) * c.ratePaise) / 1000n;
  if (c.pricingModel === 'CPC') return BigInt(clicks) * c.ratePaise;
  return 0n;
}

@Injectable()
export class AdsService {
  private readonly serveKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    @Inject(ENV) env: Env,
  ) {
    // Outside production a random per-process key is fine: serve tokens live for an hour.
    this.serveKey = env.ADS_SERVE_SIGNING_KEY ? Buffer.from(env.ADS_SERVE_SIGNING_KEY, 'base64') : randomBytes(32);
  }

  private async isAdFree(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] }, currentPeriodEnd: { gt: new Date() }, product: { adFree: true } },
      select: { id: true },
    });
    return !!sub;
  }

  /** Placement rules the client needs to decide when to request ads. The client SDK does the actual delivery. */
  async config(userId: string | undefined, platform: Platform) {
    const [adFree, placements] = await Promise.all([
      this.isAdFree(userId),
      this.prisma.adPlacement.findMany({
        where: { isActive: true },
        include: { configurations: { where: { platform, isActive: true } } },
        orderBy: { key: 'asc' },
      }),
    ]);

    const rewardedUsage = userId
      ? await this.prisma.rewardClaim.groupBy({
          by: ['placementId'],
          where: { userId, createdAt: { gte: startOfUtcDay() }, status: { in: ['GRANTED', 'VERIFIED', 'PENDING'] } },
          _count: true,
        })
      : [];
    const used = new Map(rewardedUsage.map((r) => [r.placementId, r._count]));

    return {
      adFree,
      placements: placements
        .filter((p) => p.configurations.length > 0)
        .map((p) => {
          const c = p.configurations[0];
          // Ad-free subscribers keep optional rewarded ads; everything else is suppressed.
          const suppressed = adFree && c.hideForSubscribers && p.format !== 'REWARDED';
          return {
            key: p.key,
            format: p.format,
            source: c.source,
            enabled: !suppressed,
            adUnitId: suppressed ? null : c.adUnitId,
            minEpisodesBetween: c.minEpisodesBetween,
            minSecondsBetween: c.minSecondsBetween,
            maxPerUserPerDay: c.maxPerUserPerDay,
            rewardCoins: c.rewardCoins,
            remainingToday:
              p.format === 'REWARDED' && c.maxPerUserPerDay ? Math.max(0, c.maxPerUserPerDay - (used.get(p.id) ?? 0)) : null,
          };
        }),
    };
  }

  /** Picks one eligible direct-campaign creative for a placement, or null. */
  async serve(placementKey: string, ctx: { userId?: string; platform: Platform; locale: Locale }) {
    if (await this.isAdFree(ctx.userId)) return null;
    const now = new Date();
    const placement = await this.prisma.adPlacement.findUnique({ where: { key: placementKey } });
    if (!placement || !placement.isActive) return null;

    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        status: { in: ['ACTIVE', 'SCHEDULED'] },
        startAt: { lte: now },
        endAt: { gt: now },
        placements: { some: { placementId: placement.id } },
        creatives: { some: { reviewStatus: 'APPROVED', isActive: true } },
      },
      include: { creatives: { where: { reviewStatus: 'APPROVED', isActive: true } } },
      orderBy: { priority: 'desc' },
    });

    const today = startOfUtcDay(now);
    const eligible: typeof campaigns = [];
    for (const c of campaigns) {
      if (!campaignIsLive(c, now) || !targetingMatches(c.targeting, ctx)) continue;
      const [todayImpressions, userToday, totals] = await Promise.all([
        c.dailyImpressionCap ? this.prisma.adImpression.count({ where: { campaignId: c.id, occurredAt: { gte: today } } }) : 0,
        c.perUserDailyCap && ctx.userId
          ? this.prisma.adImpression.count({ where: { campaignId: c.id, userId: ctx.userId, occurredAt: { gte: today } } })
          : 0,
        c.totalBudgetPaise !== null
          ? Promise.all([
              this.prisma.adImpression.count({ where: { campaignId: c.id } }),
              this.prisma.adClick.count({ where: { campaignId: c.id } }),
            ])
          : null,
      ]);
      if (c.dailyImpressionCap && todayImpressions >= c.dailyImpressionCap) continue;
      if (c.perUserDailyCap && ctx.userId && userToday >= c.perUserDailyCap) continue;
      if (totals && c.totalBudgetPaise !== null && spentPaise(c, totals[0], totals[1]) >= c.totalBudgetPaise) continue;
      eligible.push(c);
    }
    if (eligible.length === 0) return null;

    // Highest priority tier wins; rotate randomly within the tier.
    const top = eligible.filter((c) => c.priority === eligible[0].priority);
    const campaign = top[Math.floor(Math.random() * top.length)];
    const creative = campaign.creatives[Math.floor(Math.random() * campaign.creatives.length)];

    const serveToken = signServeToken(this.serveKey, {
      c: campaign.id,
      k: creative.id,
      p: placement.id,
      u: ctx.userId ?? null,
      f: ctx.platform,
      t: Math.floor(now.getTime() / 1000),
      n: randomBytes(8).toString('hex'),
    });
    return {
      serveToken,
      placementKey,
      creative: {
        type: creative.type,
        mediaUrl: this.media.publicUrl(creative.mediaKey),
        headline: creative.headline,
        ctaText: creative.ctaText,
        label: creative.label,
        advertiser: campaign.advertiserName,
      },
    };
  }

  private verify(token: string, userId?: string) {
    const claims = verifyServeToken(this.serveKey, token, Math.floor(Date.now() / 1000));
    if (!claims) throw new AppException('VALIDATION_FAILED', 'Invalid or expired serve token');
    // A signed-in serve may only be reported by the same user.
    if (claims.u && claims.u !== userId) throw new AppException('FORBIDDEN', 'Serve token belongs to another user');
    return claims;
  }

  /** Records one impression per serve; duplicates are ignored. */
  async recordImpression(token: string, userId?: string) {
    const claims = this.verify(token, userId);
    try {
      await this.prisma.adImpression.create({
        data: { campaignId: claims.c, creativeId: claims.k, placementId: claims.p, userId: claims.u, serveId: serveIdOf(token), platform: claims.f },
      });
      return { recorded: true };
    } catch (err) {
      if (isUniqueViolation(err)) return { recorded: false };
      throw err;
    }
  }

  /** Records one click per serve (only after an impression) and returns the destination. */
  async recordClick(token: string, userId?: string) {
    const claims = this.verify(token, userId);
    const serveId = serveIdOf(token);
    const [impression, creative] = await Promise.all([
      this.prisma.adImpression.findUnique({ where: { serveId } }),
      this.prisma.adCreative.findUnique({ where: { id: claims.k } }),
    ]);
    if (!creative) throw new AppException('NOT_FOUND', 'Creative not found');
    if (!impression) throw new AppException('VALIDATION_FAILED', 'Click without impression');
    try {
      await this.prisma.adClick.create({
        data: { campaignId: claims.c, creativeId: claims.k, placementId: claims.p, userId: claims.u, serveId, platform: claims.f },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return { destinationUrl: creative.destinationUrl };
  }
}
