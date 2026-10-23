import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api/client';
import { Api } from '@/lib/api/endpoints';
import type { Episode } from '@/lib/api/types';
import { errorMessage } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { Button } from '@/ui/primitives';
import { colors, compactNumber, overlayText, radius, spacing } from '@/ui/theme';
import { useRequireAuth } from '../auth/use-require-auth';
import { useProgressReporter, usePlayback } from './hooks';
import { LikeButton } from './LikeButton';
import { chooseSubtitle, effectiveQuality, formatTime, Quality, shouldPlay } from './logic';
import { usePlayerPrefs } from './prefs-store';
import { VideoSurface, VideoSurfaceHandle } from './VideoSurface';

const playIcon = require('@/assets/byteplus/player/btn_play.png');
const commentIcon = require('@/assets/byteplus/player/v_comment.png');
const seriesIcon = require('@/assets/byteplus/player/series.png');
const speedIcon = require('@/assets/byteplus/player/v_speed.png');
const lockIcon = require('@/assets/byteplus/icons/lock_video.png');

export interface EpisodeSlideProps {
  episode: Episode;
  dramaTitle: string;
  height: number;
  isActive: boolean;
  mounted: boolean;
  screenActive: boolean;
  overlayOpen: boolean;
  /** Resume position for the first episode opened. */
  startPosition?: number;
  onEnded: () => void;
  onUnlock: (episode: Episode) => void;
  onOpenComments: (episode: Episode) => void;
  onOpenEpisodes?: () => void;
  onOpenSettings: (
    renditions: { name: string; width: number; height: number }[],
    current: Quality,
    subtitles: { language: string; label: string }[],
  ) => void;
  /** Feed mode: show a button that opens the whole drama. */
  onWatchFull?: () => void;
}

export const EpisodeSlide = memo(function EpisodeSlide(props: EpisodeSlideProps) {
  const { episode, isActive, mounted, height } = props;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const { quality: preferredQuality, speed, subtitles: subtitlePref } = usePlayerPrefs();

  const playback = usePlayback(episode.id, mounted && !episode.locked);
  const surface = useRef<VideoSurfaceHandle>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(episode.durationSeconds);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [like, setLike] = useState({ liked: episode.liked, count: episode.likeCount });
  const progress = useProgressReporter(episode.id);
  const started = useRef(false);

  // Adopt fresh server like state when the episode data changes (derived during render).
  const [likeSource, setLikeSource] = useState({ liked: episode.liked, count: episode.likeCount });
  if (likeSource.liked !== episode.liked || likeSource.count !== episode.likeCount) {
    setLikeSource({ liked: episode.liked, count: episode.likeCount });
    setLike({ liked: episode.liked, count: episode.likeCount });
  }
  // Leaving a slide resets its pause state so returning to it plays again.
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) setUserPaused(false);
  }
  useEffect(() => {
    if (!isActive) progress.flush();
  }, [isActive, progress]);

  // `screenActive` already combines navigation focus and app foreground state.
  const playing = shouldPlay({ isActive, screenFocused: props.screenActive, appActive: true, userPaused, overlayOpen: props.overlayOpen });
  useEffect(() => {
    if (!playing && isActive) progress.flush();
  }, [playing, isActive, progress]);

  const onPlayerError = useCallback(
    (message: string) => {
      // First failure is usually an expired playback token: fetch fresh URLs and remount once.
      if (attempt === 0) {
        setAttempt(1);
        void queryClient.invalidateQueries({ queryKey: ['playback', episode.id] });
        return;
      }
      setPlayerError(message);
    },
    [attempt, episode.id],
  );

  const toggleLike = (next: boolean) =>
    requireAuth(() => {
      setLike((l) => ({ liked: next, count: Math.max(0, l.count + (next ? 1 : -1)) }));
      Api.like(episode.id, next)
        .then((r) => setLike({ liked: r.liked, count: r.likeCount }))
        .catch(() => setLike((l) => ({ liked: !next, count: Math.max(0, l.count + (next ? -1 : 1)) })));
    });

  const seekFromTouch = (e: GestureResponderEvent, width: number) => {
    if (!duration) return;
    const target = Math.max(0, Math.min(duration, (e.nativeEvent.locationX / width) * duration));
    surface.current?.seek(target);
    setPosition(target);
  };
  const [barWidth, setBarWidth] = useState(1);

  const apiError = playback.error instanceof ApiError ? playback.error : null;
  const locked = episode.locked || apiError?.code === 'EPISODE_LOCKED';
  const data = playback.data;
  const quality = data ? effectiveQuality(preferredQuality, data.renditions) : 'auto';
  const subtitleLanguage = data ? chooseSubtitle(data.subtitles, subtitlePref, i18n.language) : null;

  return (
    <View style={{ height, backgroundColor: '#000' }} testID={`slide-${episode.number}`}>
      {episode.thumbnailUrl ? <Image source={episode.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}

      {mounted && data && !locked && !playerError ? (
        <VideoSurface
          key={`${data.manifestUrl}:${attempt}`}
          ref={surface}
          testID={`video-${episode.number}`}
          uri={data.manifestUrl}
          startPosition={props.startPosition ?? (data.resumePositionSeconds > 3 ? data.resumePositionSeconds : 0)}
          paused={!playing}
          rate={speed}
          quality={quality}
          fill="cover"
          subtitles={data.subtitles}
          subtitleLanguage={subtitleLanguage}
          onReady={(info) => {
            setBuffering(false);
            if (info.duration) setDuration(info.duration);
          }}
          onBuffering={setBuffering}
          onProgress={(pos) => {
            if (!started.current && pos > 0) {
              started.current = true;
              track('episode_start', { episode_id: episode.id, number: episode.number });
            }
            setPosition(pos);
            progress.onProgress(pos);
          }}
          onEnd={() => {
            progress.onEnd();
            track('episode_complete', { episode_id: episode.id, number: episode.number });
            if (isActive) props.onEnded();
          }}
          onError={onPlayerError}
        />
      ) : null}

      {/* Tap anywhere to pause / resume */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setUserPaused((p) => !p)} accessibilityRole="button" accessibilityLabel={userPaused ? 'Play' : 'Pause'} testID="tap-to-pause">
        {userPaused && !locked ? <Image source={playIcon} style={styles.centerIcon} testID="paused-indicator" /> : null}
      </Pressable>

      {/* States */}
      {locked ? (
        <View style={styles.center} testID="locked-state">
          <Image source={lockIcon} style={{ width: 56, height: 56 }} contentFit="contain" />
          <Text style={styles.stateTitle}>{t('unlock.title', { n: episode.number })}</Text>
          <Button testID="open-unlock" label={episode.unlockCoins ? t('unlock.withCoins', { count: episode.unlockCoins }) : t('unlock.subtitle')} onPress={() => props.onUnlock(episode)} style={{ marginTop: spacing.lg }} />
        </View>
      ) : apiError?.code === 'ASSET_NOT_READY' ? (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>{t('player.notReady')}</Text>
        </View>
      ) : playerError || (playback.isError && !locked) ? (
        <View style={styles.center} testID="player-error">
          <Text style={styles.stateTitle}>{playback.isError ? errorMessage(playback.error) : t('player.loadError')}</Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            style={{ marginTop: spacing.lg }}
            onPress={() => {
              setPlayerError(null);
              setAttempt(0);
              void playback.refetch();
            }}
          />
        </View>
      ) : isActive && (playback.isPending || buffering) ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" testID="buffering" />
        </View>
      ) : null}

      {/* Bottom gradient + info */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomShade} pointerEvents="none" />
      <View style={[styles.info, { bottom: insets.bottom + 28 }]} pointerEvents="box-none">
        <Text style={styles.title} numberOfLines={1}>
          {props.dramaTitle}
        </Text>
        <Text style={styles.episodeLabel}>{t('common.episodeN', { n: episode.number })}</Text>
        {props.onWatchFull ? (
          <Pressable onPress={props.onWatchFull} style={styles.watchFull} testID="watch-full">
            <Text style={styles.watchFullText}>▶ {t('player.watchFull')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Side actions */}
      <View style={[styles.actions, { bottom: insets.bottom + 110 }]}>
        <LikeButton liked={like.liked} count={compactNumber(like.count, i18n.language)} onToggle={toggleLike} label={t('player.like')} />
        <ActionButton icon={commentIcon} label={compactNumber(episode.commentCount, i18n.language)} a11y={t('player.comments')} onPress={() => props.onOpenComments(episode)} testID="open-comments" />
        {props.onOpenEpisodes ? <ActionButton icon={seriesIcon} label={t('player.episodes')} a11y={t('player.episodes')} onPress={props.onOpenEpisodes} testID="open-episodes" /> : null}
        {data ? <ActionButton icon={speedIcon} label={`${speed}x`} a11y={t('player.speed')} onPress={() => props.onOpenSettings(data.renditions, quality, data.subtitles)} testID="open-settings" /> : null}
      </View>

      {/* Progress bar (tap to seek) */}
      {!locked && duration > 0 ? (
        <View style={[styles.progressWrap, { bottom: insets.bottom + 6 }]}>
          <Text style={styles.time}>{formatTime(position)}</Text>
          <Pressable style={styles.progressTouch} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} onPress={(e) => seekFromTouch(e, barWidth)} testID="progress-bar">
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, (position / duration) * 100)}%` }]} />
            </View>
          </Pressable>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      ) : null}
    </View>
  );
});

function ActionButton({ icon, label, a11y, onPress, testID }: { icon: number; label: string; a11y: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={a11y} testID={testID}>
      <Image source={icon} style={{ width: 36, height: 36 }} contentFit="contain" />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centerIcon: { position: 'absolute', alignSelf: 'center', top: '45%', width: 64, height: 64, opacity: 0.9 },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: spacing.md, ...overlayText },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  info: { position: 'absolute', left: spacing.lg, right: 90 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', ...overlayText },
  episodeLabel: { color: colors.textSecondary, marginTop: 2, ...overlayText },
  watchFull: { marginTop: spacing.md, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  watchFullText: { color: colors.text, fontWeight: '700' },
  actions: { position: 'absolute', right: spacing.md, alignItems: 'center', gap: spacing.lg },
  action: { alignItems: 'center', gap: 2 },
  actionLabel: { color: colors.text, fontSize: 12, ...overlayText },
  progressWrap: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTouch: { flex: 1, paddingVertical: 10 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.text },
  time: { color: colors.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'], ...overlayText },
});
