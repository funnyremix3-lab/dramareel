import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRequireAuth } from '@/features/auth/use-require-auth';
import { useAllEpisodes, useDrama } from '@/features/dramas/queries';
import { EpisodeGrid } from '@/features/player/EpisodesSheet';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { Button, Caption, ErrorState, LoadingState, Pill } from '@/ui/primitives';
import { colors, compactNumber, spacing, type } from '@/ui/theme';

/** Drama detail: cover, synopsis, cast, categories, favourite and the episode grid. */
export default function DramaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const requireAuth = useRequireAuth();
  const drama = useDrama(id);
  const episodes = useAllEpisodes(id);
  const [expanded, setExpanded] = useState(false);

  const favorite = useMutation({
    mutationFn: (next: boolean) => Api.favorite(id, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.drama(id) });
      void queryClient.invalidateQueries({ queryKey: qk.favorites });
    },
  });

  if (drama.isPending) return <LoadingState />;
  if (drama.isError) return <ErrorState message={errorMessage(drama.error)} onRetry={() => drama.refetch()} />;
  const d = drama.data;
  const watch = (episode?: number) => router.push({ pathname: '/watch/[dramaId]', params: { dramaId: id, ...(episode ? { episode: String(episode) } : {}) } });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <View style={{ width, height: width * 1.1 }}>
        {d.coverUrl ? <Image source={d.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <LinearGradient colors={['rgba(11,11,15,0.2)', colors.background]} style={StyleSheet.absoluteFill} />
        <View style={styles.hero}>
          <Text style={type.title} testID="drama-title">
            {d.title}
          </Text>
          <Caption>
            {t('common.episodes', { count: d.episodeCount })} · {t('common.views', { views: compactNumber(d.viewCount, i18n.language) })}
          </Caption>
          <View style={styles.tags}>
            {d.categories.map((c) => (
              <Pill key={c.slug} label={c.name} onPress={() => router.push({ pathname: '/category/[slug]', params: { slug: c.slug, name: c.name } })} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          testID="play-drama"
          label={d.resume && !d.resume.completed ? t('drama.resume', { n: d.resume.episodeNumber }) : t('drama.play')}
          onPress={() => watch(d.resume?.episodeNumber)}
          style={{ flex: 1 }}
        />
        <Button
          testID="toggle-favorite"
          label={d.isFavorite ? t('drama.inList') : t('drama.addToList')}
          variant="secondary"
          loading={favorite.isPending}
          onPress={() => requireAuth(() => favorite.mutate(!d.isFavorite))}
        />
      </View>

      {d.synopsis ? (
        <View style={styles.section}>
          <Text style={type.heading}>{t('drama.synopsis')}</Text>
          <Text style={styles.synopsis} numberOfLines={expanded ? undefined : 4} onPress={() => setExpanded((e) => !e)}>
            {d.synopsis}
          </Text>
        </View>
      ) : null}

      {d.cast.length ? (
        <View style={styles.section}>
          <Text style={type.heading}>{t('drama.cast')}</Text>
          <Text style={styles.synopsis}>{d.cast.map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join(' · ')}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={type.heading}>{t('drama.allEpisodes')}</Text>
        <Caption style={{ marginBottom: spacing.md }}>{t('drama.freeEpisodes', { count: d.freeEpisodeCount })}</Caption>
        {episodes.data ? (
          <EpisodeGrid episodes={episodes.data} currentNumber={d.resume?.episodeNumber} onSelect={(e) => watch(e.number)} />
        ) : episodes.isError ? (
          <ErrorState message={errorMessage(episodes.error)} onRetry={() => episodes.refetch()} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  synopsis: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
