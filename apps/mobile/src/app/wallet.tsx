import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { runRewardedFlow } from '@/features/ads/ads';
import { purchase, storePrices } from '@/features/payments/purchase';
import { Api } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/i18n';
import { invalidateEntitlements, qk, queryClient } from '@/lib/query';
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
          <View style={styles.balance}>
            <Caption>{t('wallet.balance')}</Caption>
            <Text style={styles.balanceValue} testID="wallet-balance">
              🪙 {wallet.data.balance}
            </Text>
          </View>

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

          <Text style={type.heading}>{t('wallet.buy')}</Text>
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
            <Caption>{t('wallet.paymentsSoon')}</Caption>
          )}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Text style={type.heading}>{t('wallet.history')}</Text>
        </View>
      }
      ListEmptyComponent={history.isPending ? <LoadingState /> : <EmptyState message="—" />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View>
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

const styles = StyleSheet.create({
  balance: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.xs },
  balanceValue: { color: colors.coin, fontSize: 34, fontWeight: '900' },
  notice: { color: colors.coin, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rowTitle: { color: colors.text, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '800' },
});
