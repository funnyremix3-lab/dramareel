import { Platform } from 'react-native';
import { api } from './client';
import type {
  AdsConfig,
  Category,
  Comment,
  DramaDetail,
  DramaSummary,
  Episode,
  FeedItem,
  Home,
  ContinueWatchingItem,
  Me,
  Page,
  Playback,
  Product,
  RewardClaim,
  RewardClaimStatus,
  SponsoredServe,
  UnlockResult,
  WalletTxn,
} from './types';

const platform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

/** Thin typed wrappers — one per API endpoint used by the app. */
export const Api = {
  // catalog
  home: () => api<Home>('/home'),
  feed: (cursor?: string) => api<Page<FeedItem>>('/feed', { query: { limit: 8, cursor } }),
  categories: () => api<Category[]>('/categories', { auth: false }),
  dramas: (q: { category?: string; sort?: 'trending' | 'new' | 'popular'; cursor?: string }) =>
    api<Page<DramaSummary>>('/dramas', { query: { limit: 20, ...q }, auth: false }),
  search: (q: string, cursor?: string) => api<Page<DramaSummary>>('/dramas/search', { query: { q, limit: 20, cursor }, auth: false }),
  drama: (id: string) => api<DramaDetail>(`/dramas/${id}`),
  episodes: (dramaId: string, cursor?: string) => api<Page<Episode>>(`/dramas/${dramaId}/episodes`, { query: { limit: 50, cursor } }),

  // playback & progress
  playback: (episodeId: string) => api<Playback>(`/episodes/${episodeId}/playback`),
  progress: (episodeId: string, positionSeconds: number, completed?: boolean) =>
    api<{ positionSeconds: number; completed: boolean }>(`/episodes/${episodeId}/progress`, {
      method: 'PUT',
      body: { positionSeconds: Math.max(0, Math.floor(positionSeconds)), completed },
    }),
  history: (cursor?: string) => api<Page<ContinueWatchingItem & { completed: boolean }>>('/me/history', { query: { limit: 20, cursor } }),

  // engagement
  like: (episodeId: string, liked: boolean) =>
    api<{ liked: boolean; likeCount: number }>(`/episodes/${episodeId}/like`, { method: liked ? 'PUT' : 'DELETE' }),
  favorite: (dramaId: string, favorite: boolean) =>
    api<{ favorite: boolean }>(`/dramas/${dramaId}/favorite`, { method: favorite ? 'PUT' : 'DELETE' }),
  favorites: (cursor?: string) => api<Page<DramaSummary>>('/me/favorites', { query: { limit: 30, cursor } }),
  comments: (episodeId: string, cursor?: string) => api<Page<Comment>>(`/episodes/${episodeId}/comments`, { query: { limit: 20, cursor } }),
  postComment: (episodeId: string, body: string) => api<Comment>(`/episodes/${episodeId}/comments`, { method: 'POST', body: { body } }),
  deleteComment: (commentId: string) => api<void>(`/comments/${commentId}`, { method: 'DELETE' }),
  reportComment: (commentId: string, reason: string) => api<void>(`/comments/${commentId}/reports`, { method: 'POST', body: { reason } }),
  blockUser: (userId: string) => api<void>(`/users/${userId}/block`, { method: 'PUT' }),

  // me
  me: () => api<Me>('/me'),
  updateProfile: (input: { displayName?: string; locale?: string }) => api<Me>('/me/profile', { method: 'PATCH', body: input }),
  updateConsents: (input: Me['consents']) =>
    api<Me>('/me/consents', {
      method: 'PUT',
      body: { analytics: input.analytics, adsPersonalization: input.adsPersonalization, marketing: input.marketing, push: input.push },
    }),
  registerDeviceToken: (token: string) => api<void>('/me/device-tokens', { method: 'POST', body: { token, platform } }),
  deleteAccount: () => api<{ deletionRequestedAt: string }>('/me', { method: 'DELETE' }),

  // wallet & rewards
  wallet: () => api<{ balance: number }>('/wallet'),
  walletHistory: (cursor?: string) => api<Page<WalletTxn>>('/wallet/transactions', { query: { limit: 30, cursor } }),
  unlockWithCoins: (episodeId: string) => api<UnlockResult>(`/episodes/${episodeId}/unlock`, { method: 'POST', body: { method: 'COINS' } }),
  createRewardClaim: (input: { placementKey: string; purpose: 'COINS' | 'EPISODE_UNLOCK'; episodeId?: string }) =>
    api<RewardClaim>('/rewards/claims', { method: 'POST', body: { ...input, platform } }),
  rewardClaim: (claimId: string) => api<RewardClaimStatus>(`/rewards/claims/${claimId}`),
  devCompleteReward: (claimId: string) => api<{ claim: RewardClaimStatus }>(`/dev/rewards/claims/${claimId}/complete`, { method: 'POST' }),

  // ads
  adsConfig: () => api<AdsConfig>('/ads/config', { query: { platform } }),
  serveSponsored: (placement: string) => api<SponsoredServe | undefined>('/ads/serve', { query: { placement, platform } }),
  adImpression: (serveToken: string) => api<{ recorded: boolean }>('/ads/impressions', { method: 'POST', body: { serveToken } }),
  adClick: (serveToken: string) => api<{ destinationUrl: string }>('/ads/clicks', { method: 'POST', body: { serveToken } }),

  // store
  products: () => api<{ paymentsEnabled: boolean; items: Product[] }>('/products', { auth: false }),
  verifyGooglePlay: (sku: string, purchaseToken: string) =>
    api<{ status: string; balance?: number; subscription?: unknown }>('/payments/google-play/verify', {
      method: 'POST',
      body: { sku, purchaseToken },
      timeoutMs: 30_000,
    }),

  // dev only
  devToken: (account: string) => api<{ accessToken: string; expiresIn: number }>('/dev/token', { method: 'POST', body: { account }, auth: false }),
};
