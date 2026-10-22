import type { AdPlacementConfig } from '@/lib/api/types';

export interface InterstitialState {
  transitionsSinceLast: number;
  lastShownAt: number | null;
  shownToday: number;
}

/**
 * Between-episode interstitial rule: never on every transition. Requires both the episode gap
 * and the time gap configured on the server, and respects the daily cap.
 */
export function canShowInterstitial(placement: AdPlacementConfig | undefined, state: InterstitialState, now: number): boolean {
  if (!placement || !placement.enabled || !placement.adUnitId) return false;
  const minEpisodes = Math.max(placement.minEpisodesBetween ?? 4, 2);
  if (state.transitionsSinceLast < minEpisodes) return false;
  if (placement.minSecondsBetween && state.lastShownAt !== null && now - state.lastShownAt < placement.minSecondsBetween * 1000) {
    return false;
  }
  if (placement.maxPerUserPerDay !== null && state.shownToday >= placement.maxPerUserPerDay) return false;
  return true;
}

/** Poll schedule while waiting for the server to confirm a rewarded ad (≈12 s total). */
export const REWARD_POLL_DELAYS_MS = [700, 1000, 1500, 2000, 3000, 4000];
