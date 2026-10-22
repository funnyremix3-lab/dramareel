import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DramaGrid } from '@/features/dramas/components';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { EmptyState, ErrorState, LoadingState } from '@/ui/primitives';

/** A category ("all" = every drama) sorted by trending / new / popular. */
export default function CategoryScreen() {
  const { t } = useTranslation();
  const { slug, sort, name } = useLocalSearchParams<{ slug: string; sort?: 'trending' | 'new' | 'popular'; name?: string }>();
  const filter = { category: slug === 'all' ? undefined : slug, sort: sort ?? 'trending' };
  const list = useInfiniteQuery({
    queryKey: qk.dramas(filter),
    queryFn: ({ pageParam }) => Api.dramas({ ...filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  return (
    <>
      <Stack.Screen options={{ title: name ?? t('home.categories') }} />
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <DramaGrid
          dramas={list.data.pages.flatMap((p) => p.items)}
          onEndReached={() => list.hasNextPage && list.fetchNextPage()}
          empty={<EmptyState message={t('common.error')} />}
        />
      )}
    </>
  );
}
