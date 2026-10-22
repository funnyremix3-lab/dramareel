import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { ApiError } from '@/lib/api/client';
import { Api } from '@/lib/api/endpoints';
import type { RewardClaimStatus } from '@/lib/api/types';
import { config } from '@/lib/config';
import { REWARD_POLL_DELAYS_MS } from './policy';

let initialized: Promise<void> | null = null;
let personalised = false;
let canRequestAds = false;

/**
 * Gathers UMP consent (shows Google's form only where required by law), then starts the SDK.
 * Safe to call repeatedly; never throws — the app works without ads.
 */
export function initAds(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  initialized ??= (async () => {
    try {
      const info = await AdsConsent.gatherConsent();
      canRequestAds = info.canRequestAds;
      const choices = await AdsConsent.getUserChoices().catch(() => null);
      personalised = !!choices?.selectPersonalisedAds;
    } catch {
      // Consent service unreachable: non-personalised requests are still allowed where consent isn't required.
      canRequestAds = true;
      personalised = false;
    }
    if (!canRequestAds) return;
    await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.T, tagForChildDirectedTreatment: false });
    await mobileAds().initialize();
  })().catch(() => undefined);
  return initialized;
}

export const adsAvailable = () => canRequestAds;

const requestOptions = () => ({ requestNonPersonalizedAdsOnly: !personalised });

export type RewardOutcome = { status: 'granted'; claim: RewardClaimStatus } | { status: 'dismissed' } | { status: 'unavailable' } | { status: 'failed' };

/** Loads and shows a rewarded ad. Resolves once the ad closes. Rewards are NOT granted here. */
function showRewarded(adUnitId: string, ssv: { userId: string; customData: string }): Promise<'earned' | 'dismissed' | 'unavailable'> {
  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(adUnitId, { ...requestOptions(), serverSideVerificationOptions: ssv });
    let earned = false;
    const subs = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        ad.show().catch(() => finish('unavailable'));
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned ? 'earned' : 'dismissed')),
      ad.addAdEventListener(AdEventType.ERROR, () => finish('unavailable')),
    ];
    const timeout = setTimeout(() => finish('unavailable'), 20_000);
    let done = false;
    function finish(result: 'earned' | 'dismissed' | 'unavailable') {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      subs.forEach((unsubscribe) => unsubscribe());
      resolve(result);
    }
    ad.load();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the server to confirm the reward via AdMob SSV. */
async function waitForGrant(claimId: string): Promise<RewardClaimStatus | null> {
  for (const delay of REWARD_POLL_DELAYS_MS) {
    await sleep(delay);
    const claim = await Api.rewardClaim(claimId).catch(() => null);
    if (claim?.status === 'GRANTED') return claim;
    if (claim && (claim.status === 'REJECTED' || claim.status === 'EXPIRED')) return null;
  }
  return null;
}

/**
 * Full rewarded flow: server claim → ad with SSV options → server confirmation.
 * Development builds (Google test ads never call SSV) ask the dev-only API endpoint to simulate it.
 */
export async function runRewardedFlow(input: { placementKey: string; purpose: 'COINS' | 'EPISODE_UNLOCK'; episodeId?: string }): Promise<RewardOutcome> {
  await initAds();
  if (!canRequestAds) return { status: 'unavailable' };

  const claim = await Api.createRewardClaim(input);
  const result = await showRewarded(claim.adUnitId, claim.ssv);
  if (result !== 'earned') return { status: result };

  if (config.devLogin) {
    try {
      const { claim: granted } = await Api.devCompleteReward(claim.claimId);
      if (granted.status === 'GRANTED') return { status: 'granted', claim: granted };
    } catch (err) {
      // 403 means SSV is enabled on this server: fall through to normal polling.
      if (!(err instanceof ApiError) || err.status !== 403) throw err;
    }
  }
  const granted = await waitForGrant(claim.claimId);
  return granted ? { status: 'granted', claim: granted } : { status: 'failed' };
}

/** Preloaded between-episode interstitial; `show()` resolves when it closes (or immediately if not ready). */
export class InterstitialSlot {
  private ad: InterstitialAd | null = null;
  private loaded = false;

  constructor(private readonly adUnitId: string) {}

  preload() {
    if (!canRequestAds || this.ad) return;
    this.ad = InterstitialAd.createForAdRequest(this.adUnitId, requestOptions());
    this.ad.addAdEventListener(AdEventType.LOADED, () => (this.loaded = true));
    this.ad.addAdEventListener(AdEventType.ERROR, () => this.reset());
    this.ad.load();
  }

  get ready() {
    return this.loaded;
  }

  show(): Promise<boolean> {
    const ad = this.ad;
    if (!ad || !this.loaded) return Promise.resolve(false);
    return new Promise((resolve) => {
      const off = ad.addAdEventListener(AdEventType.CLOSED, () => {
        off();
        this.reset();
        resolve(true);
      });
      ad.show().catch(() => {
        off();
        this.reset();
        resolve(false);
      });
    });
  }

  private reset() {
    this.ad?.removeAllListeners();
    this.ad = null;
    this.loaded = false;
  }
}
