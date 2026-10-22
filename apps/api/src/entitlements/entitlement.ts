import { EpisodeAccess, SubscriptionStatus } from '@prisma/client';

export type AccessReason = 'FREE' | 'FREE_PREVIEW' | 'SUBSCRIPTION' | 'UNLOCKED' | 'LOCKED';

export interface EntitlementInput {
  episode: { number: number; access: EpisodeAccess };
  drama: { freeEpisodeCount: number };
  /** True when the user has an ACTIVE / IN_GRACE_PERIOD subscription that has not ended. */
  hasActiveSubscription: boolean;
  /** The user's unlock row for this episode, if any. */
  unlock: { expiresAt: Date | null } | null;
  now: Date;
}

/**
 * The single source of truth for "may this user play this episode" (docs/architecture.md §3.5).
 * Pure function: callers load the facts, this decides.
 */
export function evaluateAccess(input: EntitlementInput): { allowed: boolean; reason: AccessReason } {
  if (input.episode.access === 'FREE') return { allowed: true, reason: 'FREE' };
  if (input.episode.number <= input.drama.freeEpisodeCount) return { allowed: true, reason: 'FREE_PREVIEW' };
  if (input.hasActiveSubscription) return { allowed: true, reason: 'SUBSCRIPTION' };
  if (input.unlock && (input.unlock.expiresAt === null || input.unlock.expiresAt > input.now)) {
    return { allowed: true, reason: 'UNLOCKED' };
  }
  return { allowed: false, reason: 'LOCKED' };
}

export function unlockPrice(episode: { unlockCoins: number | null }, drama: { defaultUnlockCoins: number }): number {
  return episode.unlockCoins ?? drama.defaultUnlockCoins;
}

/**
 * Subscription states that still grant access while `current_period_end` is in the future.
 * CANCELED means auto-renew is off — the user keeps what they paid for until the period ends.
 */
export const ENTITLED_SUBSCRIPTION_STATUSES = ['ACTIVE', 'IN_GRACE_PERIOD', 'CANCELED'] as const satisfies readonly SubscriptionStatus[];
