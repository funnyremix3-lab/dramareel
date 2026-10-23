import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SponsoredCard } from '@/features/ads/SponsoredCard';
import { ContinueCard } from '@/features/dramas/ContinueCard';
import { FeaturedCarousel, Rail } from '@/features/dramas/components';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { Icon } from '@/ui/Icon';
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
      <View style={styles.topBar}>
        <Text style={styles.brand}>
          Reel<Text style={{ color: colors.accent }}> Drama</Text>
        </Text>
      </View>
      <Pressable onPress={() => router.push('/search')} style={styles.search} accessibilityRole="search" testID="open-search">
        <Icon name="search" size={18} color={colors.textMuted} />
        <Text style={styles.searchText}>{t('home.search')}</Text>
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
          <View style={styles.sectionTitle}>
            <Icon name="play-circle" size={20} color={colors.accent} />
            <Text style={type.heading}>{t('home.continue')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {h.continueWatching.map((c) => (
              <ContinueCard key={c.drama.id} item={c} />
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
  topBar: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  brand: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  searchText: { color: colors.textMuted, fontSize: 15 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  categories: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.lg },
});
