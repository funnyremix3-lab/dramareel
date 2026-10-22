import { Global, Injectable, Module } from '@nestjs/common';
import { EpisodeAccess } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessReason, ENTITLED_SUBSCRIPTION_STATUSES, evaluateAccess } from './entitlement';

interface EpisodeFacts {
  id: string;
  number: number;
  access: EpisodeAccess;
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActiveSubscription(userId: string, now = new Date()): Promise<boolean> {
    const count = await this.prisma.subscription.count({
      where: { userId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] }, currentPeriodEnd: { gt: now } },
    });
    return count > 0;
  }

  /** Batch evaluation. Anonymous users only get free episodes. At most two queries. */
  async evaluate(
    userId: string | undefined,
    items: Array<{ episode: EpisodeFacts; drama: { freeEpisodeCount: number } }>,
  ): Promise<Map<string, { allowed: boolean; reason: AccessReason }>> {
    const now = new Date();
    let subscribed = false;
    const unlocks = new Map<string, { expiresAt: Date | null }>();

    const needsLookup = items.some(
      ({ episode, drama }) => episode.access !== 'FREE' && episode.number > drama.freeEpisodeCount,
    );
    if (userId && needsLookup) {
      const [sub, rows] = await Promise.all([
        this.hasActiveSubscription(userId, now),
        this.prisma.episodeUnlock.findMany({
          where: { userId, episodeId: { in: items.map((i) => i.episode.id) } },
          select: { episodeId: true, expiresAt: true },
        }),
      ]);
      subscribed = sub;
      rows.forEach((r) => unlocks.set(r.episodeId, { expiresAt: r.expiresAt }));
    }

    const result = new Map<string, { allowed: boolean; reason: AccessReason }>();
    for (const { episode, drama } of items) {
      result.set(
        episode.id,
        evaluateAccess({
          episode,
          drama,
          hasActiveSubscription: subscribed,
          unlock: unlocks.get(episode.id) ?? null,
          now,
        }),
      );
    }
    return result;
  }
}

@Global()
@Module({ providers: [EntitlementsService], exports: [EntitlementsService] })
export class EntitlementsModule {}
