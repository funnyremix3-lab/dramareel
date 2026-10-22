import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Episode } from '@/lib/api/types';
import { Caption } from '@/ui/primitives';
import { Sheet } from '@/ui/Sheet';
import { colors, radius, spacing } from '@/ui/theme';

const lockIcon = require('@/assets/byteplus/icons/lock.png');

/** Episode grid (ported layout from BytePlus EpisodeSelectorModal): current highlighted, locks shown. */
export function EpisodeGrid({ episodes, currentNumber, onSelect }: { episodes: Episode[]; currentNumber?: number; onSelect: (e: Episode) => void }) {
  return (
    <FlatList
      data={episodes}
      keyExtractor={(e) => e.id}
      numColumns={6}
      scrollEnabled={episodes.length > 36}
      columnWrapperStyle={{ gap: spacing.sm }}
      contentContainerStyle={{ gap: spacing.sm }}
      renderItem={({ item }) => {
        const current = item.number === currentNumber;
        return (
          <Pressable
            testID={`episode-cell-${item.number}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.number}${item.locked ? ' locked' : ''}`}
            onPress={() => onSelect(item)}
            style={[styles.cell, current && styles.current]}>
            <Text style={[styles.number, current && { color: colors.text }]}>{item.number}</Text>
            {item.locked ? <Image source={lockIcon} style={styles.lock} testID={`episode-lock-${item.number}`} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

export function EpisodesSheet({
  title,
  episodes,
  currentNumber,
  freeCount,
  visible,
  onClose,
  onSelect,
}: {
  title: string;
  episodes: Episode[];
  currentNumber: number;
  freeCount: number;
  visible: boolean;
  onClose: () => void;
  onSelect: (e: Episode) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} heightRatio={0.65} testID="episodes-sheet">
      <View style={{ marginBottom: spacing.md }}>
        <Caption>
          {t('common.episodes', { count: episodes.length })} · {t('drama.freeEpisodes', { count: freeCount })}
        </Caption>
      </View>
      <EpisodeGrid episodes={episodes} currentNumber={currentNumber} onSelect={(e) => (onClose(), onSelect(e))} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: '15%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: { backgroundColor: colors.accent },
  number: { color: colors.textSecondary, fontWeight: '700' },
  lock: { position: 'absolute', top: 2, right: 2, width: 12, height: 12 },
});
