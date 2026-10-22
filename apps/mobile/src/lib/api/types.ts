/** Response shapes of the Reel Drama API (docs/api.md). Keep in sync with apps/api. */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DramaSummary {
  id: string;
  slug: string;
  title: string;
  posterUrl: string | null;
  coverUrl: string | null;
  tags: string[];
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  episodeCount: number;
  freeEpisodeCount: number;
  viewCount: number;
  favoriteCount: number;
  isNew: boolean;
}

export interface DramaDetail extends DramaSummary {
  synopsis: string | null;
  cast: { name: string; role?: string }[];
  maturityRating: string | null;
  categories: { slug: string; name: string }[];
  isFavorite: boolean;
  resume: { episodeId: string; episodeNumber: number; positionSeconds: number; completed: boolean } | null;
}

export interface Episode {
  id: string;
  number: number;
  title: string | null;
  durationSeconds: number;
  thumbnailUrl: string | null;
  access: 'FREE' | 'PREMIUM';
  locked: boolean;
  unlockCoins: number | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

export interface ContinueWatchingItem {
  drama: DramaSummary;
  episodeId: string;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface Home {
  featured: DramaSummary[];
  trending: DramaSummary[];
  new: DramaSummary[];
  recommended: DramaSummary[];
  continueWatching: ContinueWatchingItem[];
}

export interface FeedItem {
  drama: DramaSummary;
  episode: Episode;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
}

export interface Playback {
  episodeId: string;
  dramaId: string;
  manifestUrl: string;
  renditions: { name: string; width: number; height: number; bandwidth: number }[];
  subtitles: { language: string; label: string; isDefault: boolean; url: string }[];
  thumbnailUrl: string | null;
  durationSeconds: number;
  expiresAt: string;
  resumePositionSeconds: number;
  accessReason: string;
}

export interface UnlockOptions {
  coins: number;
  rewardedAd: { placementKey: string };
  subscription: boolean;
}

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  locale: string;
  profile: { displayName: string | null; avatarKey: string | null; bio: string | null };
  consents: { analytics: boolean; adsPersonalization: boolean; marketing: boolean; push: boolean };
  roles: string[];
  wallet: { balance: number };
  subscription: { sku: string; status: string; currentPeriodEnd: string; adFree: boolean } | null;
  deletionRequestedAt: string | null;
}

export interface Comment {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: { id: string; displayName: string; avatarKey: string | null };
  isMine: boolean;
}

export interface WalletTxn {
  id: string;
  type: 'AD_REWARD' | 'PURCHASE' | 'EPISODE_UNLOCK' | 'REFUND' | 'REVERSAL' | 'BONUS' | 'ADMIN_ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

export interface UnlockResult {
  unlocked: boolean;
  charged: number;
  reason: string;
  balance: number;
}

export interface RewardClaim {
  claimId: string;
  adUnitId: string;
  expiresAt: string;
  ssv: { userId: string; customData: string };
}

export interface RewardClaimStatus {
  claimId: string;
  status: 'PENDING' | 'VERIFIED' | 'GRANTED' | 'REJECTED' | 'EXPIRED';
  purpose: 'COINS' | 'EPISODE_UNLOCK';
  coins: number;
  episodeId: string | null;
  episodeUnlocked: boolean;
  balance?: number;
}

export interface AdPlacementConfig {
  key: string;
  format: 'REWARDED' | 'INTERSTITIAL' | 'NATIVE' | 'SPONSORED_CARD' | 'SPONSORED_VIDEO';
  source: 'ADMOB' | 'DIRECT';
  enabled: boolean;
  adUnitId: string | null;
  minEpisodesBetween: number | null;
  minSecondsBetween: number | null;
  maxPerUserPerDay: number | null;
  rewardCoins: number | null;
  remainingToday: number | null;
}

export interface AdsConfig {
  adFree: boolean;
  placements: AdPlacementConfig[];
}

export interface SponsoredServe {
  serveToken: string;
  placementKey: string;
  creative: { type: 'IMAGE' | 'VIDEO'; mediaUrl: string | null; headline: string | null; ctaText: string | null; label: string; advertiser: string };
}

export interface Product {
  sku: string;
  kind: 'COIN_PACK' | 'SUBSCRIPTION';
  title: string;
  coins: number | null;
  bonusCoins: number;
  periodDays: number | null;
  adFree: boolean;
}
