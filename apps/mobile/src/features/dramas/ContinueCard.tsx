import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ContinueWatchingItem } from '@/lib/api/types';
import { Icon } from '@/ui/Icon';
import { Caption } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

/** Poster tile with play badge and progress bar; opens the player at the saved episode. */
export function ContinueCard({ item }: { item: ContinueWatchingItem & { completed?: boolean } }) {
  const { t } = useTranslation();
  const progress = Math.min(100, (item.positionSeconds / Math.max(1, item.durationSeconds)) * 100);
  return (
    <Pressable
      style={styles.continueCard}
      accessibilityRole="button"
      accessibilityLabel={item.drama.title}
      onPress={() => router.push({ pathname: '/watch/[dramaId]', params: { dramaId: item.drama.id, episode: String(item.episodeNumber) } })}>
      <View style={styles.continuePoster}>
        {item.drama.posterUrl ? <Image source={item.drama.posterUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={item.drama.id} /> : null}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
        <View style={styles.playBadge}>
          <Icon name="play" size={16} color={colors.text} />
        </View>
        <Text style={styles.epBadge}>{t('common.epShort', { n: item.episodeNumber })}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
      </View>
      <Text style={styles.continueTitle} numberOfLines={1}>
        {item.drama.title}
      </Text>
      <Caption numberOfLines={1}>{t('drama.resume', { n: item.episodeNumber })}</Caption>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  continueCard: { width: 132, gap: 2 },
  continuePoster: { width: 132, height: 188, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, marginBottom: spacing.xs },
  playBadge: { position: 'absolute', top: '50%', left: '50%', marginLeft: -18, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  epBadge: { position: 'absolute', left: spacing.sm, bottom: spacing.md, color: colors.text, fontSize: 12, fontWeight: '700' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 3, backgroundColor: colors.accent },
  continueTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
