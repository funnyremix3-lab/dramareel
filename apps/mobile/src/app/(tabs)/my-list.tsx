import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/auth-store';
import { DramaCard } from '@/features/dramas/components';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { Button, Caption, EmptyState, ErrorState, LoadingState } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function MyListScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const history = useQuery({ queryKey: qk.history, queryFn: () => Api.history(), enabled: signedIn });
  const favorites = useQuery({ queryKey: qk.favorites, queryFn: () => Api.favorites(), enabled: signedIn });

  if (!signedIn) {
    return (
      <EmptyState
        message={t('myList.signIn')}
        action={<Button label={t('profile.signIn')} onPress={() => router.push('/sign-in')} style={{ marginTop: spacing.lg }} testID="mylist-sign-in" />}
      />
    );
  }
  if (history.isPending || favorites.isPending) return <LoadingState />;
  if (history.isError || favorites.isError) {
    return <ErrorState message={errorMessage(history.error ?? favorites.error)} onRetry={() => (history.refetch(), favorites.refetch())} />;
  }

  const inProgress = history.data.items.filter((h) => !h.completed);
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}>
      <Text style={[type.heading, styles.heading]}>{t('myList.continue')}</Text>
      {inProgress.length === 0 ? (
        <Caption style={styles.emptyLine}>{t('myList.emptyHistory')}</Caption>
      ) : (
        inProgress.map((h) => (
          <Pressable
            key={h.episodeId}
            style={styles.row}
            onPress={() => router.push({ pathname: '/watch/[dramaId]', params: { dramaId: h.drama.id, episode: String(h.episodeNumber) } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {h.drama.title}
              </Text>
              <Caption>{t('drama.resume', { n: h.episodeNumber })}</Caption>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, (h.positionSeconds / Math.max(1, h.durationSeconds)) * 100)}%` }]} />
              </View>
            </View>
          </Pressable>
        ))
      )}

      <Text style={[type.heading, styles.heading, { marginTop: spacing.xl }]}>{t('myList.favorites')}</Text>
      {favorites.data.items.length === 0 ? (
        <Caption style={styles.emptyLine}>{t('myList.emptyFavorites')}</Caption>
      ) : (
        <View style={styles.grid}>
          {favorites.data.items.map((d) => (
            <DramaCard key={d.id} drama={d} width={108} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  emptyLine: { paddingHorizontal: spacing.lg },
  row: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  rowTitle: { color: colors.text, fontWeight: '700' },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg },
});
