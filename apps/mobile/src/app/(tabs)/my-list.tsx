import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/auth-store';
import { ContinueCard } from '@/features/dramas/ContinueCard';
import { DramaCard } from '@/features/dramas/components';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { Icon, type IconName } from '@/ui/Icon';
import { Button, Caption, EmptyState, ErrorState, LoadingState } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

const COLUMNS = 3;

export default function MyListScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const history = useQuery({ queryKey: qk.history, queryFn: () => Api.history(), enabled: signedIn });
  const favorites = useQuery({ queryKey: qk.favorites, queryFn: () => Api.favorites(), enabled: signedIn });

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.pageTitle}>{t('tabs.myList')}</Text>
    </View>
  );

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <EmptyState
          icon="bookmarks"
          title={t('myList.signInTitle')}
          message={t('myList.signIn')}
          action={<Button label={t('profile.signIn')} onPress={() => router.push('/sign-in')} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} testID="mylist-sign-in" />}
        />
      </View>
    );
  }
  if (history.isPending || favorites.isPending) return <LoadingState />;
  if (history.isError || favorites.isError) {
    return <ErrorState message={errorMessage(history.error ?? favorites.error)} onRetry={() => (history.refetch(), favorites.refetch())} />;
  }

  const inProgress = history.data.items.filter((h) => !h.completed);
  const saved = favorites.data.items;
  const cardWidth = Math.floor((width - spacing.lg * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS);
  const explore = () => router.navigate('/discover');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={
        <RefreshControl refreshing={history.isRefetching || favorites.isRefetching} onRefresh={() => void Promise.all([history.refetch(), favorites.refetch()])} tintColor={colors.text} />
      }>
      {header}

      <SectionTitle icon="play-circle" title={t('myList.continue')} count={inProgress.length} />
      {inProgress.length === 0 ? (
        <InlineEmpty icon="film-outline" message={t('myList.emptyHistory')} action={t('myList.explore')} onAction={explore} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {inProgress.map((h) => (
            <ContinueCard key={h.episodeId} item={h} />
          ))}
        </ScrollView>
      )}

      <SectionTitle icon="bookmark" title={t('myList.favorites')} count={saved.length} style={{ marginTop: spacing.xl }} />
      {saved.length === 0 ? (
        <InlineEmpty icon="bookmark-outline" message={t('myList.emptyFavorites')} action={t('myList.explore')} onAction={explore} />
      ) : (
        <View style={styles.grid}>
          {saved.map((d) => (
            <DramaCard key={d.id} drama={d} width={cardWidth} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SectionTitle({ icon, title, count, style }: { icon: IconName; title: string; count: number; style?: object }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <Icon name={icon} size={20} color={colors.accent} />
      <Text style={type.heading}>{title}</Text>
      {count > 0 ? <Text style={styles.count}>{count}</Text> : null}
    </View>
  );
}

function InlineEmpty({ icon, message, action, onAction }: { icon: IconName; message: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.inlineEmpty}>
      <Icon name={icon} size={26} color={colors.textMuted} />
      <Caption style={{ flex: 1, fontSize: 13 }}>{message}</Caption>
      <Text style={styles.inlineAction} onPress={onAction} accessibilityRole="button">
        {action}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  pageTitle: { ...type.title, fontSize: 28 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  count: { color: colors.textSecondary, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 1, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  inlineEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  inlineAction: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  hList: { paddingHorizontal: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg },
});
