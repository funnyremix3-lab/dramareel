/** Response shapes of the admin API (apps/api/src/admin/*.service.ts). Dates arrive as ISO strings. */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  locale: string;
  profile: { displayName: string | null; avatarKey: string | null };
  roles: string[];
}

export type PublishStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
export type VideoAssetStatus = "AWAITING_UPLOAD" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type EpisodeAccess = "FREE" | "PREMIUM";
export type Orientation = "PORTRAIT" | "LANDSCAPE";

export interface DramaListItem {
  id: string;
  slug: string;
  title: string;
  status: PublishStatus;
  posterUrl: string | null;
  episodeCount: number;
  publishedEpisodeCount: number;
  viewCount: number;
  isFeatured: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

export interface CastMember {
  name: string;
  role?: string;
}

export interface DramaTranslation {
  dramaId: string;
  languageCode: string;
  title: string;
  synopsis: string | null;
}

export interface Drama {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  primaryLanguageCode: string;
  posterKey: string | null;
  coverKey: string | null;
  posterUrl: string | null;
  coverUrl: string | null;
  cast: CastMember[];
  tags: string[];
  orientation: Orientation;
  maturityRating: string | null;
  status: PublishStatus;
  freeEpisodeCount: number;
  defaultUnlockCoins: number;
  isFeatured: boolean;
  trendingScore: number;
  viewCount: number;
  favoriteCount: number;
  episodeCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: DramaTranslation[];
  categories: string[];
}

export interface EpisodeListItem {
  id: string;
  number: number;
  title: string | null;
  status: PublishStatus;
  access: EpisodeAccess;
  unlockCoins: number | null;
  durationSeconds: number;
  thumbnailUrl: string | null;
  currentAsset: { id: string; status: VideoAssetStatus; durationMs: number | null } | null;
  assetCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
}

export interface VideoAsset {
  id: string;
  episodeId: string | null;
  episodeNumber: number | null;
  drama: { id: string; title: string } | null;
  status: VideoAssetStatus;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  renditions: unknown;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  readyAt: string | null;
}

export interface UploadTarget {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface VideoUploadTarget extends UploadTarget {
  assetId: string;
  expiresAt: string;
}

export interface ImageUploadTarget extends UploadTarget {
  key: string;
  publicUrl?: string | null;
}

export interface Category {
  id: string;
  slug: string;
  names: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
  _count?: { dramas: number };
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  enabled: boolean;
}

export type ImportJobStatus = "PENDING" | "RUNNING" | "READY" | "DONE" | "FAILED" | "CANCELED";

export interface ImportJob {
  id: string;
  dramaId: string | null;
  status: ImportJobStatus;
  sourceKey: string;
  sourceSizeBytes: number | null;
  title: string;
  slug: string;
  synopsis: string | null;
  primaryLanguageCode: string;
  categorySlugs: string[];
  freeEpisodeCount: number;
  defaultUnlockCoins: number;
  targetSeconds: number;
  toleranceSeconds: number;
  autoPublish: boolean;
  totalEpisodes: number | null;
  uploadedEpisodes: number;
  publishedEpisodes: number;
  step: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export interface UserListItem {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  status: UserStatus;
  balance: number;
  roles: string[];
  lastSeenAt: string | null;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  idempotencyKey: string;
  note: string | null;
  createdAt: string;
}

export interface UserDetail {
  id: string;
  authProviderId: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  locale: string;
  createdAt: string;
  lastSeenAt: string | null;
  deletionRequestedAt: string | null;
  profile: { displayName: string | null; bio?: string | null } | null;
  balance: number;
  roles: string[];
  transactions: WalletTransaction[];
  unlocks: { episodeId: string; method: string; createdAt: string; episodeNumber: number; dramaTitle: string }[];
  payments: {
    id: string;
    provider: string;
    providerTransactionId: string;
    status: string;
    priceAmountMicros: number | null;
    currency: string | null;
    createdAt: string;
    product: { sku: string };
  }[];
  subscriptions: {
    id: string;
    provider: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    autoRenew: boolean;
    product: { sku: string };
  }[];
  commentCount: number;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  _count?: { users: number };
}

export type CommentStatus = "VISIBLE" | "HIDDEN" | "DELETED";

export interface ModerationComment {
  id: string;
  body: string;
  status: CommentStatus;
  reportCount: number;
  createdAt: string;
  user: { id: string; email: string | null; status: UserStatus; profile: { displayName: string | null } | null };
  episode: { number: number; drama: { id: string; title: string } };
  reports: { id: string; reason: string; details: string | null; createdAt: string }[];
}

export type AdFormat = "REWARDED" | "INTERSTITIAL" | "NATIVE" | "SPONSORED_CARD" | "SPONSORED_VIDEO";
export type AdPlatform = "ANDROID" | "IOS";

export interface AdConfiguration {
  id: string;
  placementId: string;
  source: "ADMOB" | "DIRECT";
  platform: AdPlatform | "WEB";
  adUnitId: string | null;
  minEpisodesBetween: number | null;
  minSecondsBetween: number | null;
  maxPerUserPerDay: number | null;
  rewardCoins: number | null;
  hideForSubscribers: boolean;
  isActive: boolean;
}

export interface AdPlacement {
  id: string;
  key: string;
  name: string;
  format: AdFormat;
  description: string | null;
  isActive: boolean;
  configurations: AdConfiguration[];
}

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
export type PricingModel = "CPM" | "CPC" | "FLAT";

export interface Campaign {
  id: string;
  name: string;
  advertiserName: string;
  advertiserContact: string | null;
  status: CampaignStatus;
  startAt: string;
  endAt: string;
  pricingModel: PricingModel;
  ratePaise: number;
  totalBudgetPaise: number | null;
  dailyImpressionCap: number | null;
  perUserDailyCap: number | null;
  priority: number;
  targeting: { languages?: string[]; platforms?: AdPlatform[] };
  placementKeys: string[];
  createdAt: string;
}

export interface CampaignListItem extends Campaign {
  impressions: number;
  clicks: number;
  creatives: number;
  spentPaise: number;
}

export interface Creative {
  id: string;
  campaignId: string;
  type: "IMAGE" | "VIDEO";
  mediaKey: string;
  mediaUrl: string | null;
  headline: string | null;
  ctaText: string | null;
  destinationUrl: string;
  label: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  isActive: boolean;
  createdAt: string;
}

export interface CampaignDetail extends Campaign {
  creatives: Creative[];
}

export interface CampaignReport {
  campaignId: string;
  pricingModel: PricingModel;
  ratePaise: number;
  source: "DIRECT";
  days: { date: string; impressions: number; clicks: number; ctr: number; spendPaise: number }[];
  totals: { impressions: number; clicks: number; spendPaise: number };
}

export interface NetworkReport {
  source: "ADMOB";
  rows: {
    id: string;
    reportDate: string;
    adUnitId: string;
    impressions: number;
    clicks: number;
    estimatedEarningsMicros: number;
    currency: string;
    importedAt: string;
  }[];
}

export interface Product {
  id: string;
  sku: string;
  kind: "COIN_PACK" | "SUBSCRIPTION";
  title: string;
  coins: number | null;
  bonusCoins: number;
  periodDays: number | null;
  adFree: boolean;
  isActive: boolean;
  sortOrder: number;
}

export type NotificationStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELED";

export interface NotificationJob {
  id: string;
  title: { en: string; hi?: string };
  body: { en: string; hi?: string };
  deepLink: string | null;
  audience: { all?: boolean; userIds?: string[]; languages?: string[] };
  status: NotificationStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { email: string | null } | null;
}

export interface Overview {
  generatedAt: string;
  users: { total: number; newToday: number; dau: number; wau: number };
  engagement: { playsToday: number; rewardsGrantedToday: number };
  unlocksToday: Record<string, number>;
  coins: { issuedToday: Record<string, number>; spentOnUnlocksToday: number };
  media: Record<string, number>;
  moderation: { openReports: number };
  ads: {
    direct: { impressionsToday: number; clicksToday: number };
    network: { last7DaysImpressions: number; last7DaysEarningsMicros: number };
  };
  topDramas: { id: string; title: string; viewCount: number; favoriteCount: number; status: PublishStatus }[];
}
