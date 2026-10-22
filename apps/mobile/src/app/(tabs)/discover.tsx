import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SponsoredCard } from '@/features/ads/SponsoredCard';
import { FeaturedCarousel, Rail } from '@/features/dramas/components';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { ErrorState, LoadingState, Pill } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

/** Discover (BytePlus drama_channel): carousel, rails, categories, search and a sponsored slot. */
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const home = useQuery({ queryKey: qk.home, queryFn: Api.home });
  const categories = useQuery({ queryKey: qk.categories, queryFn: Api.categories, staleTime: 60 * 60_000 });

  if (home.isPending) return <LoadingState />;
  if (home.isError) return <ErrorState message={errorMessage(home.error)} onRetry={() => home.refetch()} />;
  const h = home.data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} tintColor={colors.text} />}>
      <Pressable onPress={() => router.push('/search')} style={styles.search} accessibilityRole="search" testID="open-search">
        <Text style={styles.searchText}>🔍  {t('home.search')}</Text>
      </Pressable>

      <FeaturedCarousel dramas={h.featured} />

      {categories.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {categories.data.map((c) => (
            <Pill key={c.slug} label={c.name} onPress={() => router.push({ pathname: '/category/[slug]', params: { slug: c.slug, name: c.name } })} />
          ))}
        </ScrollView>
      ) : null}

      {h.continueWatching.length ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[type.heading, { paddingHorizontal: spacing.lg, marginBottom: spacing.md }]}>{t('home.continue')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {h.continueWatching.map((c) => (
              <Pressable
                key={c.drama.id}
                style={styles.continue}
                onPress={() => router.push({ pathname: '/watch/[dramaId]', params: { dramaId: c.drama.id, episode: String(c.episodeNumber) } })}>
                <Text style={styles.continueTitle} numberOfLines={1}>
                  {c.drama.title}
                </Text>
                <Text style={styles.continueEp}>{t('drama.resume', { n: c.episodeNumber })}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, (c.positionSeconds / Math.max(1, c.durationSeconds)) * 100)}%` }]} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Rail title={t('home.trending')} dramas={h.trending} ranked onSeeAll={() => router.push({ pathname: '/category/[slug]', params: { slug: 'all', sort: 'trending', name: t('home.trending') } })} />
      <SponsoredCard placement="home_sponsored_card" />
      <Rail title={t('home.new')} dramas={h.new} onSeeAll={() => router.push({ pathname: '/category/[slug]', params: { slug: 'all', sort: 'new', name: t('home.new') } })} />
      <Rail title={t('home.recommended')} dramas={h.recommended} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  search: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  searchText: { color: colors.textMuted },
  categories: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.lg },
  continue: { width: 180, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  continueTitle: { color: colors.text, fontWeight: '700' },
  continueEp: { color: colors.textSecondary, fontSize: 12 },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
});
