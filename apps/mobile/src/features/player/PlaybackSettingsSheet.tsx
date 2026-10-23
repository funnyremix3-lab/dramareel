import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Pill } from '@/ui/primitives';
import { Sheet } from '@/ui/Sheet';
import { spacing, type } from '@/ui/theme';
import { Quality, qualityOptions, SPEEDS } from './logic';
import { usePlayerPrefs } from './prefs-store';

/** Quality (Auto / 480p / 720p / 1080p as available) and speed, merged from BytePlus's two selectors. */
export function PlaybackSettingsSheet({
  visible,
  onClose,
  renditions,
  current,
  subtitles = [],
}: {
  visible: boolean;
  onClose: () => void;
  renditions: { name: string; width: number; height: number }[];
  current: Quality;
  subtitles?: { language: string; label: string }[];
}) {
  const { t } = useTranslation();
  const { speed, setQuality, setSpeed, subtitles: subtitlePref, setSubtitles } = usePlayerPrefs();
  return (
    <Sheet visible={visible} onClose={onClose} heightRatio={0.45} testID="playback-settings">
      <Text style={[type.heading, styles.label]}>{t('player.quality')}</Text>
      <View style={styles.row}>
        {qualityOptions(renditions).map((o) => (
          <Pill key={String(o.value)} label={o.value === 'auto' ? t('player.auto') : o.label} active={o.value === current} onPress={() => setQuality(o.value)} />
        ))}
      </View>
      <Text style={[type.heading, styles.label]}>{t('player.speed')}</Text>
      <View style={styles.row}>
        {SPEEDS.map((s) => (
          <Pill key={s} label={`${s}x`} active={s === speed} onPress={() => setSpeed(s)} />
        ))}
      </View>
      {subtitles.length ? (
        <>
          <Text style={[type.heading, styles.label]}>{t('player.subtitles')}</Text>
          <View style={styles.row}>
            <Pill label={t('player.auto')} active={subtitlePref === 'auto'} onPress={() => setSubtitles('auto')} />
            <Pill label={t('player.off')} active={subtitlePref === 'off'} onPress={() => setSubtitles('off')} />
            {subtitles.map((s) => (
              <Pill key={s.language} label={s.label} active={subtitlePref === s.language} onPress={() => setSubtitles(s.language)} />
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
