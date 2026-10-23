import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { runRewardedFlow } from '@/features/ads/ads';
import { purchase, storePrices } from '@/features/payments/purchase';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { invalidateEntitlements, qk, queryClient } from '@/lib/query';
import { Icon, type IconName } from '@/ui/Icon';
import { Button, Caption, EmptyState, ErrorState, LoadingState } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function WalletScreen() {
  const { t, i18n } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me });
  const wallet = useQuery({ queryKey: qk.wallet, queryFn: Api.wallet });
  const ads = useQuery({ queryKey: qk.adsConfig, queryFn: Api.adsConfig });
  const products = useQuery({ queryKey: qk.products, queryFn: Api.products });
  const coinPacks = products.data?.items.filter((p) => p.kind === 'COIN_PACK') ?? [];
  const prices = useQuery({
    queryKey: ['store-prices', coinPacks.map((p) => p.sku)],
    queryFn: () => storePrices({ inApp: coinPacks.map((p) => p.sku), subs: [] }),
    enabled: !!products.data?.paymentsEnabled && coinPacks.length > 0,
  });
  const history = useInfiniteQuery({
    queryKey: qk.walletHistory,
    queryFn: ({ pageParam }) => Api.walletHistory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const earn = ads.data?.placements.find((p) => p.key === 'earn_coins_rewarded');

  const refresh = async () => {
    await invalidateEntitlements();
    await queryClient.invalidateQueries({ queryKey: qk.walletHistory });
  };

  const watchAd = useMutation({
    mutationFn: () => runRewardedFlow({ placementKey: 'earn_coins_rewarded', purpose: 'COINS' }),
    onSuccess: async (r) => {
      if (r.status === 'granted') setNotice(t('wallet.credited', { count: r.claim.coins }));
      else if (r.status === 'unavailable') setNotice(t('unlock.adUnavailable'));
      else if (r.status === 'failed') setNotice(t('unlock.rewardFailed'));
      await refresh();
    },
    onError: (e) => setNotice(errorMessage(e)),
  });

  const buy = useMutation({
    mutationFn: (sku: string) => purchase(sku, 'COIN_PACK', me.data!.id),
    onSuccess: async (r) => {
      if (r.status === 'failed') setNotice(r.message);
      await refresh();
    },
  });

  if (wallet.isPending) return <LoadingState />;
  if (wallet.isError) return <ErrorState message={errorMessage(wallet.error)} onRetry={() => wallet.refetch()} />;

  return (
    <FlatList
      data={history.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(i) => i.id}
      onEndReached={() => history.hasNextPage && history.fetchNextPage()}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      ListHeaderComponent={
        <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
          <LinearGradient colors={['#3A2A00', '#1E1606', colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balance}>
            <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceCoin}>🪙</Text>
              <Text style={styles.balanceValue} testID="wallet-balance">
                {wallet.data.balance}
              </Text>
            </View>
            <Caption>{t('wallet.balanceHint')}</Caption>
          </LinearGradient>

          {earn?.enabled && earn.rewardCoins ? (
            <View>
              <Button
                testID="earn-coins"
                label={t('wallet.earn', { count: earn.rewardCoins })}
                variant="coin"
                loading={watchAd.isPending}
                disabled={earn.remainingToday === 0}
                onPress={() => watchAd.mutate()}
              />
              {earn.remainingToday !== null ? <Caption style={{ textAlign: 'center', marginTop: spacing.xs }}>{t('wallet.earnLeft', { count: earn.remainingToday })}</Caption> : null}
            </View>
          ) : null}

          <View style={styles.sectionTitle}>
            <Icon name="bag-handle" size={20} color={colors.accent} />
            <Text style={type.heading}>{t('wallet.buy')}</Text>
          </View>
          {products.data?.paymentsEnabled && coinPacks.length ? (
            coinPacks.map((p) => (
              <Button
                key={p.sku}
                variant="secondary"
                loading={buy.isPending && buy.variables === p.sku}
                disabled={buy.isPending || !me.data}
                label={`${p.coins}${p.bonusCoins ? ` + ${p.bonusCoins}` : ''} 🪙   ${prices.data?.[p.sku] ?? ''}`}
                onPress={() => buy.mutate(p.sku)}
              />
            ))
          ) : (
            <View style={styles.soon}>
              <Icon name="time-outline" size={20} color={colors.textMuted} />
              <Caption style={{ flex: 1, fontSize: 13 }}>{t('wallet.paymentsSoon')}</Caption>
            </View>
          )}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <View style={styles.sectionTitle}>
            <Icon name="receipt" size={20} color={colors.accent} />
            <Text style={type.heading}>{t('wallet.history')}</Text>
          </View>
        </View>
      }
      ListEmptyComponent={history.isPending ? <LoadingState /> : <EmptyState icon="receipt-outline" message={t('wallet.emptyHistory')} style={{ paddingVertical: spacing.xl }} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: item.amount > 0 ? 'rgba(52,199,89,0.14)' : colors.surfaceRaised }]}>
            <Icon name={TXN_ICONS[item.type] ?? 'swap-horizontal'} size={18} color={item.amount > 0 ? colors.success : colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t(`wallet.types.${item.type}`)}</Text>
            <Caption>{new Date(item.createdAt).toLocaleString(i18n.language)}</Caption>
          </View>
          <Text style={[styles.amount, { color: item.amount > 0 ? colors.success : colors.text }]}>
            {item.amount > 0 ? `+${item.amount}` : item.amount}
          </Text>
        </View>
      )}
    />
  );
}

const TXN_ICONS: Record<string, IconName> = {
  AD_REWARD: 'play-circle-outline',
  PURCHASE: 'card-outline',
  EPISODE_UNLOCK: 'lock-open-outline',
  REFUND: 'return-up-back-outline',
  REVERSAL: 'return-down-forward-outline',
  BONUS: 'gift-outline',
  ADMIN_ADJUSTMENT: 'construct-outline',
};

const styles = StyleSheet.create({
  balance: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,201,77,0.35)' },
  balanceLabel: { color: colors.coin, fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceCoin: { fontSize: 32 },
  balanceValue: { color: colors.coin, fontSize: 44, fontWeight: '900' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  soon: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notice: { color: colors.coin, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rowTitle: { color: colors.text, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '800' },
});
