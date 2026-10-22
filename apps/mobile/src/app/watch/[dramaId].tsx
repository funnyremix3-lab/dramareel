import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBetweenEpisodeInterstitial } from '@/features/ads/use-interstitials';
import { useAllEpisodes, useDrama } from '@/features/dramas/queries';
import { EpisodePager, EpisodePagerHandle, PagerItem } from '@/features/player/EpisodePager';
import { EpisodesSheet } from '@/features/player/EpisodesSheet';
import { errorMessage } from '@/lib/i18n';
import { invalidateEntitlements } from '@/lib/query';
import { ErrorState, LoadingState } from '@/ui/primitives';
import { colors, overlayText, spacing } from '@/ui/theme';

/** Watch a drama: vertical swipe between its episodes (BytePlus drama_player, rebuilt on our API). */
export default function WatchScreen() {
  const { dramaId, episode: episodeParam } = useLocalSearchParams<{ dramaId: string; episode?: string }>();
  const insets = useSafeAreaInsets();
  const drama = useDrama(dramaId);
  const episodes = useAllEpisodes(dramaId);
  const pager = useRef<EpisodePagerHandle>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [adShowing, setAdShowing] = useState(false);
  const maybeInterstitial = useBetweenEpisodeInterstitial();
  const lastIndex = useRef<number | null>(null);

  const list = episodes.data;
  const initialIndex = useMemo(() => {
    if (!list?.length) return 0;
    const wanted = Number(episodeParam) || drama.data?.resume?.episodeNumber || 1;
    return Math.max(0, list.findIndex((e) => e.number === wanted));
  }, [list, episodeParam, drama.data?.resume?.episodeNumber]);

  const items = useMemo<PagerItem[]>(
    () =>
      (list ?? []).map((e) => ({
        key: e.id,
        episode: e,
        dramaTitle: drama.data?.title ?? '',
        startPosition: !episodeParam && drama.data?.resume?.episodeId === e.id && !drama.data.resume.completed ? drama.data.resume.positionSeconds : undefined,
      })),
    [list, drama.data, episodeParam],
  );

  if (drama.isPending || episodes.isPending) return <LoadingState />;
  if (drama.isError || episodes.isError) {
    return <ErrorState message={errorMessage(drama.error ?? episodes.error)} onRetry={() => (drama.refetch(), episodes.refetch())} />;
  }

  const currentNumber = current ?? list![initialIndex]?.number ?? 1;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <EpisodePager
        ref={pager}
        items={items}
        initialIndex={initialIndex}
        externalPaused={adShowing}
        onActiveChange={async (index, item) => {
          setCurrent(item.episode.number);
          const moved = lastIndex.current !== null && lastIndex.current !== index;
          lastIndex.current = index;
          if (!moved) return;
          setAdShowing(true);
          try {
            await maybeInterstitial();
          } finally {
            setAdShowing(false);
          }
        }}
        onOpenEpisodes={() => setShowEpisodes(true)}
        onUnlocked={() => void invalidateEntitlements()}
      />

      <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + spacing.sm }]} accessibilityRole="button" accessibilityLabel="Back" testID="watch-back">
        <Text style={styles.chevron}>‹</Text>
        <Text style={styles.backTitle} numberOfLines={1}>
          {drama.data.title}
        </Text>
      </Pressable>

      <EpisodesSheet
        title={drama.data.title}
        episodes={list!}
        currentNumber={currentNumber}
        freeCount={drama.data.freeEpisodeCount}
        visible={showEpisodes}
        onClose={() => setShowEpisodes(false)}
        onSelect={(e) => pager.current?.scrollTo(list!.findIndex((x) => x.id === e.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: spacing.md, right: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chevron: { color: colors.text, fontSize: 34, lineHeight: 36, fontWeight: '300', ...overlayText },
  backTitle: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1, ...overlayText },
});
