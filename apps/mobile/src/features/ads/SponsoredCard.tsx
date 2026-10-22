import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Api } from '@/lib/api/endpoints';
import { colors, radius, spacing } from '@/ui/theme';

/**
 * Direct-campaign card. Always labelled "Sponsored"; one impression per serve, reported once the
 * card has been on screen; a tap records a click and opens the advertiser's https URL.
 */
export function SponsoredCard({ placement }: { placement: string }) {
  const { t } = useTranslation();
  const serve = useQuery({ queryKey: ['ads', 'serve', placement], queryFn: () => Api.serveSponsored(placement), staleTime: 30 * 60_000, retry: false });
  const reported = useRef<string | null>(null);
  const ad = serve.data;

  useEffect(() => {
    if (!ad || reported.current === ad.serveToken) return;
    const timer = setTimeout(() => {
      reported.current = ad.serveToken;
      Api.adImpression(ad.serveToken).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(timer);
  }, [ad]);

  if (!ad) return null;
  const open = async () => {
    try {
      const { destinationUrl } = await Api.adClick(ad.serveToken);
      if (destinationUrl.startsWith('https://')) await Linking.openURL(destinationUrl);
    } catch {
      // ignore: the card just doesn't navigate
    }
  };

  return (
    <Pressable onPress={open} style={styles.card} accessibilityRole="link" accessibilityLabel={`${t('common.sponsored')}: ${ad.creative.headline ?? ad.creative.advertiser}`} testID="sponsored-card">
      {ad.creative.mediaUrl ? <Image source={ad.creative.mediaUrl} style={styles.media} contentFit="cover" /> : null}
      <View style={styles.body}>
        <Text style={styles.label}>{t('common.sponsored')} · {ad.creative.advertiser}</Text>
        {ad.creative.headline ? <Text style={styles.headline}>{ad.creative.headline}</Text> : null}
      </View>
      {ad.creative.ctaText ? <Text style={styles.cta}>{ad.creative.ctaText}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  media: { width: 88, height: 88 },
  body: { flex: 1, padding: spacing.md, gap: 2 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  headline: { color: colors.text, fontSize: 15, fontWeight: '600' },
  cta: { color: colors.accent, fontWeight: '700', paddingHorizontal: spacing.md },
});
