import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Platform, Prisma, RewardClaim, RewardPurpose } from '@prisma/client';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, Env } from '../config/env';
import { UnlockService } from '../wallet/unlock.service';
import { WalletService } from '../wallet/wallet.service';
import { SsvParams } from './admob-ssv.verifier';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export type SsvOutcome = 'GRANTED' | 'DUPLICATE' | 'REJECTED';

/**
 * Rewarded-ad flow (docs/architecture.md §3.3):
 *   createClaim → client shows ad with custom_data = nonce → AdMob SSV callback → grant.
 * The client's "ad finished" event is never sufficient to grant anything.
 */
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly unlocks: UnlockService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createClaim(userId: string, input: { placementKey: string; purpose: RewardPurpose; episodeId?: string; platform: Platform }) {
    const placement = await this.prisma.adPlacement.findUnique({
      where: { key: input.placementKey },
      include: { configurations: { where: { platform: input.platform, source: 'ADMOB', isActive: true } } },
    });
    const config = placement?.configurations[0];
    if (!placement || !placement.isActive || placement.format !== 'REWARDED' || !config?.adUnitId) {
      throw new AppException('REWARD_NOT_ELIGIBLE', 'This reward is not available');
    }

    if (input.purpose === 'EPISODE_UNLOCK') {
      if (!input.episodeId) throw new AppException('VALIDATION_FAILED', 'episodeId is required to unlock an episode');
      await this.unlocks.assertLocked(userId, input.episodeId).catch((err: AppException) => {
        throw err.code === 'CONFLICT' ? new AppException('REWARD_NOT_ELIGIBLE', 'Episode is already unlocked') : err;
      });
    } else if (!config.rewardCoins || config.rewardCoins <= 0) {
      throw new AppException('REWARD_NOT_ELIGIBLE', 'This placement does not award coins');
    }

    if (config.maxPerUserPerDay) {
      const used = await this.prisma.rewardClaim.count({
        where: {
          userId,
          placementId: placement.id,
          createdAt: { gte: startOfUtcDay() },
          OR: [{ status: { in: ['GRANTED', 'VERIFIED'] } }, { status: 'PENDING', expiresAt: { gt: new Date() } }],
        },
      });
      if (used >= config.maxPerUserPerDay) {
        throw new AppException('REWARD_NOT_ELIGIBLE', 'Daily limit reached for this reward', { limit: config.maxPerUserPerDay });
      }
    }

    const claim = await this.prisma.rewardClaim.create({
      data: {
        userId,
        placementId: placement.id,
        purpose: input.purpose,
        episodeId: input.purpose === 'EPISODE_UNLOCK' ? input.episodeId : null,
        coins: input.purpose === 'COINS' ? config.rewardCoins! : 0,
        nonce: randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + this.env.REWARD_CLAIM_TTL_SECONDS * 1000),
      },
    });
    return {
      claimId: claim.id,
      adUnitId: config.adUnitId,
      expiresAt: claim.expiresAt,
      // Pass these to the AdMob SDK's serverSideVerificationOptions.
      ssv: { userId, customData: claim.nonce },
    };
  }

  async getClaim(userId: string, claimId: string) {
    let claim = await this.prisma.rewardClaim.findFirst({ where: { id: claimId, userId } });
    if (!claim) throw notFound('Reward claim');
    if (claim.status === 'PENDING' && claim.expiresAt <= new Date()) {
      await this.prisma.rewardClaim.updateMany({ where: { id: claimId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      claim = await this.prisma.rewardClaim.findUniqueOrThrow({ where: { id: claimId } });
    }
    return this.view(claim);
  }

  private async view(claim: RewardClaim) {
    return {
      claimId: claim.id,
      status: claim.status,
      purpose: claim.purpose,
      coins: claim.status === 'GRANTED' ? claim.coins : 0,
      episodeId: claim.episodeId,
      episodeUnlocked: claim.purpose === 'EPISODE_UNLOCK' && claim.status === 'GRANTED',
      balance: claim.status === 'GRANTED' ? await this.wallet.balance(claim.userId) : undefined,
      rejectionReason: claim.rejectionReason,
    };
  }

  /** Handles a signature-verified SSV callback. Always safe to call repeatedly. */
  async handleVerifiedCallback(params: SsvParams): Promise<SsvOutcome> {
    const claim = await this.prisma.rewardClaim.findUnique({
      where: { nonce: params.customData },
      include: { placement: { include: { configurations: { where: { source: 'ADMOB' } } } } },
    });
    if (!claim) return this.reject(null, params, 'unknown custom_data');
    if (claim.status === 'GRANTED' || claim.status === 'VERIFIED') {
      return claim.providerTransactionId === params.transactionId ? 'DUPLICATE' : this.reject(null, params, 'claim already used');
    }
    if (claim.status !== 'PENDING') return 'DUPLICATE';
    if (claim.userId !== params.userId) return this.reject(claim, params, 'user_id mismatch');
    if (claim.expiresAt <= new Date()) return this.reject(claim, params, 'claim expired');
    if (!claim.placement.configurations.some((c) => c.adUnitId && adUnitMatches(c.adUnitId, params.adUnit))) {
      return this.reject(claim, params, 'ad unit mismatch');
    }
    return this.grant(claim.id, params.transactionId, params as unknown as Prisma.InputJsonValue);
  }

  /** Grants a PENDING claim exactly once, atomically with its coins or unlock. */
  async grant(claimId: string, transactionId: string, payload: Prisma.InputJsonValue): Promise<SsvOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.rewardClaim.updateMany({
          where: { id: claimId, status: 'PENDING' },
          data: { status: 'VERIFIED', verifiedAt: new Date(), providerTransactionId: transactionId, ssvPayload: payload },
        });
        if (count === 0) return 'DUPLICATE' as const;
        const claim = await tx.rewardClaim.findUniqueOrThrow({ where: { id: claimId } });

        if (claim.purpose === 'COINS') {
          await this.wallet.post(tx, {
            userId: claim.userId,
            amount: claim.coins,
            type: 'AD_REWARD',
            idempotencyKey: `reward:${claim.id}`,
            referenceType: 'reward_claim',
            referenceId: claim.id,
          });
        } else if (claim.episodeId) {
          // If the episode got unlocked another way meanwhile, the claim is still honoured as granted.
          await tx.episodeUnlock.upsert({
            where: { userId_episodeId: { userId: claim.userId, episodeId: claim.episodeId } },
            create: { userId: claim.userId, episodeId: claim.episodeId, method: 'AD_REWARD', rewardClaimId: claim.id },
            update: {},
          });
        }
        await tx.rewardClaim.update({ where: { id: claimId }, data: { status: 'GRANTED', grantedAt: new Date() } });
        return 'GRANTED' as const;
      });
    } catch (err) {
      // transaction_id already used by another claim → replayed callback.
      if (isUniqueViolation(err)) return 'DUPLICATE';
      throw err;
    }
  }

  private async reject(claim: RewardClaim | null, params: SsvParams, reason: string): Promise<SsvOutcome> {
    this.logger.warn({ reason, transactionId: params.transactionId, adUnit: params.adUnit }, 'SSV callback rejected');
    if (claim && claim.status === 'PENDING') {
      await this.prisma.rewardClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status: 'REJECTED', rejectionReason: reason.slice(0, 120) },
      });
    }
    return 'REJECTED';
  }
}

/** AdMob sends the numeric unit id ("1234567890") while configs store "ca-app-pub-…/1234567890". */
export function adUnitMatches(configured: string, reported: string): boolean {
  if (!reported) return false;
  return configured === reported || configured.split('/').pop() === reported;
}
