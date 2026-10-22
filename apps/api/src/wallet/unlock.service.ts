import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { unlockPrice } from '../entitlements/entitlement';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { WalletService } from './wallet.service';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

@Injectable()
export class UnlockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Loads a published episode with the facts the entitlement rule needs. */
  async publishedEpisode(episodeId: string) {
    const now = new Date();
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, status: 'PUBLISHED', publishedAt: { lte: now }, drama: { status: 'PUBLISHED', publishedAt: { lte: now } } },
      include: { drama: { select: { id: true, freeEpisodeCount: true, defaultUnlockCoins: true } } },
    });
    if (!episode) throw notFound('Episode');
    return episode;
  }

  async isAccessible(userId: string, episode: Awaited<ReturnType<UnlockService['publishedEpisode']>>) {
    return (await this.entitlements.evaluate(userId, [{ episode, drama: episode.drama }])).get(episode.id)!;
  }

  /**
   * Spends coins to unlock one episode permanently. Idempotent: a second call (or a race)
   * never charges twice — the ledger key and the (user, episode) unique constraint both guard it.
   */
  async unlockWithCoins(userId: string, episodeId: string) {
    const episode = await this.publishedEpisode(episodeId);
    const access = await this.isAccessible(userId, episode);
    if (access.allowed) {
      return { unlocked: true, charged: 0, reason: access.reason, balance: await this.wallet.balance(userId) };
    }

    const price = unlockPrice(episode, episode.drama);
    try {
      return await this.prisma.$transaction(async (tx) => {
        let walletTransactionId: string | undefined;
        if (price > 0) {
          const result = await this.wallet.post(tx, {
            userId,
            amount: -price,
            type: 'EPISODE_UNLOCK',
            idempotencyKey: `unlock:${userId}:${episodeId}`,
            referenceType: 'episode',
            referenceId: episodeId,
          });
          walletTransactionId = result.transaction?.id;
          if (!result.applied) {
            // Ledger says we already charged for this episode; ensure the unlock row exists.
            await tx.episodeUnlock.upsert({
              where: { userId_episodeId: { userId, episodeId } },
              create: { userId, episodeId, method: 'COINS', walletTransactionId },
              update: {},
            });
            return { unlocked: true, charged: 0, reason: 'UNLOCKED' as const, balance: await this.balanceIn(tx, userId) };
          }
        }
        await tx.episodeUnlock.create({ data: { userId, episodeId, method: 'COINS', walletTransactionId } });
        return { unlocked: true, charged: price, reason: 'UNLOCKED' as const, balance: await this.balanceIn(tx, userId) };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Unlocked concurrently by another path (e.g. rewarded ad) — the whole tx rolled back, nothing charged.
        return { unlocked: true, charged: 0, reason: 'UNLOCKED' as const, balance: await this.wallet.balance(userId) };
      }
      if (err instanceof AppException) throw err;
      throw err;
    }
  }

  private async balanceIn(tx: Prisma.TransactionClient, userId: string) {
    return (await tx.userWallet.findUniqueOrThrow({ where: { userId } })).balance;
  }

  /** Throws EPISODE_LOCKED if the user cannot watch; used by flows that need a locked episode. */
  async assertLocked(userId: string, episodeId: string) {
    const episode = await this.publishedEpisode(episodeId);
    const access = await this.isAccessible(userId, episode);
    if (access.allowed) throw new AppException('CONFLICT', 'Episode is already unlocked');
    return episode;
  }
}
