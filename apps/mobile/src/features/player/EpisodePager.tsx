import { usePreventScreenCapture } from 'expo-screen-capture';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FlatList, ListViewToken, View } from 'react-native';
import type { Episode } from '@/lib/api/types';
import { config } from '@/lib/config';
import { CommentsSheet } from '../comments/CommentsSheet';
import { UnlockSheet } from '../wallet/UnlockSheet';
import { EpisodeSlide } from './EpisodeSlide';
import { useScreenActive } from './hooks';
import { Quality, shouldMountPlayer } from './logic';
import { PlaybackSettingsSheet } from './PlaybackSettingsSheet';

// Screen-capture blocking (FLAG_SECURE) only in production: dev/preview builds need screenshots for testing.
const usePreventCapture = config.variant === 'production' ? usePreventScreenCapture : () => undefined;

export interface PagerItem {
  key: string;
  episode: Episode;
  dramaTitle: string;
  startPosition?: number;
  onWatchFull?: () => void;
}

/**
 * Vertical, full-screen, one-item-per-page list of episodes. At most three players are mounted
 * (previous, current, next); only the visible one plays, and only while the screen is focused.
 */
export interface EpisodePagerHandle {
  scrollTo: (index: number) => void;
}

export const EpisodePager = forwardRef<
  EpisodePagerHandle,
  {
    items: PagerItem[];
    initialIndex?: number;
    onActiveChange?: (index: number, item: PagerItem) => void;
    onOpenEpisodes?: () => void;
    onEndReached?: () => void;
    onUnlocked?: (episode: Episode) => void;
    autoAdvance?: boolean;
    /** Pauses everything, e.g. while an interstitial ad is on screen. */
    externalPaused?: boolean;
  }
>(function EpisodePager({ items, initialIndex = 0, onActiveChange, onOpenEpisodes, onEndReached, onUnlocked, autoAdvance = true, externalPaused = false }, ref) {
  usePreventCapture(); // Android FLAG_SECURE / iOS capture blocking while watching (production)
  // Pages must match the pager's own height (tab bars/insets make it shorter than the window).
  const [height, setHeight] = useState(0);
  const list = useRef<FlatList<PagerItem>>(null);
  const screenActive = useScreenActive();
  const [active, setActive] = useState(initialIndex);
  const [comments, setComments] = useState<Episode | null>(null);
  const [unlock, setUnlock] = useState<Episode | null>(null);
  const [settings, setSettings] = useState<{
    renditions: { name: string; width: number; height: number }[];
    current: Quality;
    subtitles: { language: string; label: string }[];
  } | null>(null);
  const overlayOpen = !!(comments || unlock || settings);

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActive(first.index);
      onActiveChangeRef.current?.(first.index, first.item as PagerItem);
    }
  }).current;

  const scrollTo = useCallback((index: number) => {
    if (index >= 0 && index < items.length) list.current?.scrollToIndex({ index, animated: true });
  }, [items.length]);
  useImperativeHandle(ref, () => ({ scrollTo: (index) => list.current?.scrollToIndex({ index, animated: false }) }), []);

  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: height, offset: height * index, index }), [height]);
  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 80 }), []);

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      testID="episode-pager"
      onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 ? (
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(i) => i.key}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        initialScrollIndex={Math.min(initialIndex, Math.max(0, items.length - 1))}
        getItemLayout={getItemLayout}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        onEndReached={onEndReached}
        onEndReachedThreshold={2}
        renderItem={({ item, index }) => (
          <EpisodeSlide
            episode={item.episode}
            dramaTitle={item.dramaTitle}
            height={height}
            isActive={index === active}
            mounted={shouldMountPlayer(index, active)}
            screenActive={screenActive}
            overlayOpen={overlayOpen || externalPaused}
            startPosition={item.startPosition}
            onEnded={() => autoAdvance && scrollTo(index + 1)}
            onUnlock={setUnlock}
            onOpenComments={setComments}
            onOpenEpisodes={onOpenEpisodes}
            onOpenSettings={(renditions, current, subtitles) => setSettings({ renditions, current, subtitles })}
            onWatchFull={item.onWatchFull}
          />
        )}
      />
      ) : null}

      {comments ? <CommentsSheet episodeId={comments.id} visible onClose={() => setComments(null)} /> : null}
      {unlock ? (
        <UnlockSheet
          episode={unlock}
          visible
          onClose={() => setUnlock(null)}
          onUnlocked={() => {
            const e = unlock;
            setUnlock(null);
            onUnlocked?.(e);
          }}
        />
      ) : null}
      {settings ? <PlaybackSettingsSheet visible renditions={settings.renditions} current={settings.current} subtitles={settings.subtitles} onClose={() => setSettings(null)} /> : null}
    </View>
  );
});
