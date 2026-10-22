import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { DramaSummary } from '@/lib/api/types';
import { Caption } from '@/ui/primitives';
import { colors, compactNumber, overlayText, radius, spacing, type } from '@/ui/theme';

const fireIcon = require('@/assets/byteplus/icons/fire.png');

export const openDrama = (id: string) => router.push({ pathname: '/drama/[id]', params: { id } });

/** Poster tile (BytePlus DramaCover, simplified): poster, NEW badge, rank, title, views. */
export function DramaCard({ drama, width = 112, rank }: { drama: DramaSummary; width?: number; rank?: number }) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable onPress={() => openDrama(drama.id)} style={{ width }} accessibilityRole="button" accessibilityLabel={drama.title} testID={`drama-card-${drama.slug}`}>
      <View style={[styles.poster, { width, height: width * 1.42 }]}>
        {drama.posterUrl ? <Image source={drama.posterUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={drama.id} /> : null}
        {drama.isNew ? <Text style={styles.newBadge}>{t('common.new')}</Text> : null}
        {rank ? <Text style={styles.rank}>{rank}</Text> : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.posterShade} />
        <View style={styles.views}>
          <Image source={fireIcon} style={{ width: 12, height: 12 }} />
          <Text style={styles.viewsText}>{compactNumber(drama.viewCount, i18n.language)}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {drama.title}
      </Text>
      <Caption>{t('common.episodes', { count: drama.episodeCount })}</Caption>
    </Pressable>
  );
}

export function Rail({ title, dramas, ranked, onSeeAll }: { title: string; dramas: DramaSummary[]; ranked?: boolean; onSeeAll?: () => void }) {
  const { t } = useTranslation();
  if (dramas.length === 0) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.railHeader}>
        <Text style={type.heading}>{title}</Text>
        {onSeeAll ? (
          <Text style={styles.seeAll} onPress={onSeeAll}>
            {t('common.seeAll')}
          </Text>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={dramas}
        keyExtractor={(d) => d.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        renderItem={({ item, index }) => <DramaCard drama={item} rank={ranked ? index + 1 : undefined} />}
      />
    </View>
  );
}

/** Auto-advancing featured carousel (replaces BytePlus's reanimated-carousel dependency). */
export function FeaturedCarousel({ dramas }: { dramas: DramaSummary[] }) {
  const { width } = useWindowDimensions();
  const itemWidth = width - spacing.lg * 2;
  const list = useRef<FlatList<DramaSummary>>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (dramas.length < 2) return;
    const timer = setInterval(() => {
      const next = (index + 1) % dramas.length;
      list.current?.scrollToOffset({ offset: next * (itemWidth + spacing.md), animated: true });
      setIndex(next);
    }, 5000);
    return () => clearInterval(timer);
  }, [index, dramas.length, itemWidth]);

  if (dramas.length === 0) return null;
  return (
    <View>
      <FlatList
        ref={list}
        horizontal
        data={dramas}
        keyExtractor={(d) => d.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (itemWidth + spacing.md)))}
        renderItem={({ item }) => (
          <Pressable onPress={() => openDrama(item.id)} style={[styles.featured, { width: itemWidth }]} testID={`featured-${item.slug}`}>
            {item.coverUrl ? <Image source={item.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
      <View style={styles.dots}>
        {dramas.map((d, i) => (
          <View key={d.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

/** Two-column grid for category, search and favourites lists. */
export function DramaGrid({ dramas, onEndReached, header, empty }: { dramas: DramaSummary[]; onEndReached?: () => void; header?: React.ReactElement; empty?: React.ReactElement }) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.lg * 2 - spacing.md * 2) / 3;
  return (
    <FlatList
      data={dramas}
      keyExtractor={(d) => d.id}
      numColumns={3}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => <DramaCard drama={item} width={cardWidth} />}
    />
  );
}

const styles = StyleSheet.create({
  poster: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  posterShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 },
  newBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.accent, color: colors.text, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  rank: { position: 'absolute', top: 2, right: 6, color: colors.text, fontSize: 28, fontWeight: '900', ...overlayText },
  views: { position: 'absolute', left: 6, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { color: colors.text, fontSize: 11, fontWeight: '600', ...overlayText },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  rail: { marginTop: spacing.xl },
  railHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  seeAll: { color: colors.textSecondary },
  featured: { height: 200, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.surface },
  featuredTitle: { color: colors.text, fontSize: 20, fontWeight: '800', padding: spacing.lg, ...overlayText },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.text, width: 14 },
});
