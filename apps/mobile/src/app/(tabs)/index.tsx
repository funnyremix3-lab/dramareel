import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EpisodePager, PagerItem } from '@/features/player/EpisodePager';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { invalidateEntitlements, qk } from '@/lib/query';
import { EmptyState, ErrorState, LoadingState } from '@/ui/primitives';

/** "For You": full-screen vertical feed, one drama per page starting at episode 1. */
export default function ForYouScreen() {
  const { t } = useTranslation();
  const feed = useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => Api.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = useMemo<PagerItem[]>(
    () =>
      (feed.data?.pages.flatMap((p) => p.items) ?? []).map((f) => ({
        key: `${f.drama.id}:${f.episode.id}`,
        episode: f.episode,
        dramaTitle: f.drama.title,
        onWatchFull: () => router.push({ pathname: '/watch/[dramaId]', params: { dramaId: f.drama.id, episode: String(f.episode.number + 1) } }),
      })),
    [feed.data],
  );

  if (feed.isPending) return <LoadingState />;
  if (feed.isError) return <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />;
  if (items.length === 0) return <EmptyState message={t('common.error')} />;

  return (
    <EpisodePager
      items={items}
      autoAdvance
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onUnlocked={() => void invalidateEntitlements()}
    />
  );
}
