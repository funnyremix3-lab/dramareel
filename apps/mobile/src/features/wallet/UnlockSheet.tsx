import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/lib/api/client';
import { Api } from '@/lib/api/endpoints';
import type { Episode } from '@/lib/api/types';
import { errorMessage } from '@/lib/i18n';
import { invalidateEntitlements, qk } from '@/lib/query';
import { Button, Caption } from '@/ui/primitives';
import { Sheet } from '@/ui/Sheet';
import { colors, spacing } from '@/ui/theme';
import { runRewardedFlow } from '../ads/ads';
import { useAuth } from '../auth/auth-store';

const lockAdIcon = require('@/assets/byteplus/icons/lock_ad.png');
const lockCoinIcon = require('@/assets/byteplus/icons/lock_bt.png');

/** Three ways to unlock a locked episode: coins, a rewarded ad, or VIP. All verified by the server. */
export function UnlockSheet({
  episode,
  visible,
  onClose,
  onUnlocked,
}: {
  episode: Episode;
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const { t } = useTranslation();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [message, setMessage] = useState<string | null>(null);
  const wallet = useQuery({ queryKey: qk.wallet, queryFn: Api.wallet, enabled: visible && signedIn });
  const adsConfig = useQuery({ queryKey: qk.adsConfig, queryFn: Api.adsConfig, enabled: visible });
  const rewarded = adsConfig.data?.placements.find((p) => p.key === 'episode_unlock_rewarded');
  const price = episode.unlockCoins ?? 0;
  const balance = wallet.data?.balance ?? 0;

  const done = async () => {
    await invalidateEntitlements();
    setMessage(null);
    onUnlocked();
  };

  const coins = useMutation({
    mutationFn: () => Api.unlockWithCoins(episode.id),
    onSuccess: done,
    onError: (err) => setMessage(errorMessage(err)),
  });

  const ad = useMutation({
    mutationFn: () => runRewardedFlow({ placementKey: 'episode_unlock_rewarded', purpose: 'EPISODE_UNLOCK', episodeId: episode.id }),
    onMutate: () => setMessage(null),
    onSuccess: async (outcome) => {
      if (outcome.status === 'granted') return done();
      if (outcome.status === 'unavailable') setMessage(t('unlock.adUnavailable'));
      if (outcome.status === 'failed') setMessage(t('unlock.rewardFailed'));
    },
    onError: (err) => setMessage(err instanceof ApiError ? errorMessage(err) : t('unlock.adUnavailable')),
  });

  const requireSignIn = (fn: () => void) => () => {
    if (!signedIn) {
      onClose();
      router.push('/sign-in');
      return;
    }
    fn();
  };

  const busy = coins.isPending || ad.isPending;
  const insufficient = signedIn && wallet.isSuccess && balance < price;

  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onClose} title={t('unlock.title', { n: episode.number })} heightRatio={0.7} testID="unlock-sheet">
      <Caption style={{ marginBottom: spacing.lg }}>{t('unlock.subtitle')}</Caption>

      <View style={styles.option}>
        <Image source={lockCoinIcon} style={styles.icon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Button
            testID="unlock-coins"
            label={insufficient ? t('unlock.notEnough') : t('unlock.withCoins', { count: price })}
            variant="coin"
            loading={coins.isPending}
            disabled={busy || insufficient}
            onPress={requireSignIn(() => coins.mutate())}
          />
          {signedIn ? <Caption style={styles.hint}>{t('unlock.balance', { count: balance })}</Caption> : null}
          {insufficient ? (
            <Text style={styles.link} onPress={() => (onClose(), router.push('/wallet'))}>
              {t('unlock.getCoins')}
            </Text>
          ) : null}
        </View>
      </View>

      {rewarded?.enabled && rewarded.adUnitId && rewarded.remainingToday !== 0 ? (
        <View style={styles.option}>
          <Image source={lockAdIcon} style={styles.icon} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Button testID="unlock-ad" label={ad.isPending ? t('unlock.verifying') : t('unlock.watchAd')} variant="secondary" loading={ad.isPending} disabled={busy} onPress={requireSignIn(() => ad.mutate())} />
          </View>
        </View>
      ) : null}

      <Button
        testID="unlock-vip"
        label={t('unlock.vip')}
        variant="ghost"
        disabled={busy}
        onPress={() => {
          onClose();
          router.push('/vip');
        }}
        style={{ marginTop: spacing.sm }}
      />

      {message ? (
        <Text style={styles.message} testID="unlock-message">
          {message}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  icon: { width: 36, height: 36 },
  hint: { marginTop: spacing.xs, textAlign: 'center' },
  link: { color: colors.coin, textAlign: 'center', marginTop: spacing.xs, fontWeight: '600' },
  message: { color: colors.danger, textAlign: 'center', marginTop: spacing.md },
});
