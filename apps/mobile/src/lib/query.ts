import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      // Never retry client errors (locked, not found, validation); retry network/5xx twice.
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Central query keys so invalidation stays consistent. */
export const qk = {
  home: ['home'] as const,
  feed: ['feed'] as const,
  categories: ['categories'] as const,
  dramas: (filter: object) => ['dramas', filter] as const,
  search: (q: string) => ['search', q] as const,
  drama: (id: string) => ['drama', id] as const,
  episodes: (dramaId: string) => ['episodes', dramaId] as const,
  playback: (episodeId: string) => ['playback', episodeId] as const,
  comments: (episodeId: string) => ['comments', episodeId] as const,
  me: ['me'] as const,
  wallet: ['wallet'] as const,
  walletHistory: ['wallet', 'history'] as const,
  favorites: ['favorites'] as const,
  history: ['history'] as const,
  adsConfig: ['ads', 'config'] as const,
  products: ['products'] as const,
};

/** After anything that changes what a user may watch (unlock, reward, purchase, sign-in/out). */
export function invalidateEntitlements() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['episodes'] }),
    queryClient.invalidateQueries({ queryKey: ['playback'] }),
    queryClient.invalidateQueries({ queryKey: qk.wallet }),
    queryClient.invalidateQueries({ queryKey: qk.me }),
    queryClient.invalidateQueries({ queryKey: qk.feed }),
    queryClient.invalidateQueries({ queryKey: qk.adsConfig }),
  ]);
}
