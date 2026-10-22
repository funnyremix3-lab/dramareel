import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/auth-store';
import { purchase, storePrices } from '@/features/payments/purchase';
import { Api } from '@/lib/api/endpoints';
import { invalidateEntitlements, qk } from '@/lib/query';
import { Button, Caption } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function VipScreen() {
  const { t, i18n } = useTranslation();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [notice, setNotice] = useState<string | null>(null);
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me, enabled: signedIn });
  const products = useQuery({ queryKey: qk.products, queryFn: Api.products });
  const plans = products.data?.items.filter((p) => p.kind === 'SUBSCRIPTION') ?? [];
  const prices = useQuery({
    queryKey: ['store-prices', 'subs', plans.map((p) => p.sku)],
    queryFn: () => storePrices({ inApp: [], subs: plans.map((p) => p.sku) }),
    enabled: !!products.data?.paymentsEnabled && plans.length > 0,
  });

  const subscribe = useMutation({
    mutationFn: (sku: string) => purchase(sku, 'SUBSCRIPTION', me.data!.id),
    onSuccess: async (r) => {
      if (r.status === 'failed') setNotice(r.message);
      await invalidateEntitlements();
    },
  });

  const active = me.data?.subscription;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[type.title, { color: colors.vip }]}>👑 {t('vip.title')}</Text>
      <Text style={styles.benefits}>{t('vip.benefits')}</Text>

      {active ? (
        <View style={styles.card}>
          <Text style={type.heading}>{t('profile.vipActive', { date: new Date(active.currentPeriodEnd).toLocaleDateString(i18n.language) })}</Text>
          <Button label={t('vip.manage')} variant="ghost" onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')} />
        </View>
      ) : products.data?.paymentsEnabled && plans.length ? (
        plans.map((p) => (
          <View key={p.sku} style={styles.card}>
            <Text style={type.heading}>{p.title}</Text>
            <Caption>
              {prices.data?.[p.sku] ?? ''} {p.periodDays ? t('vip.perPeriod', { days: p.periodDays }) : ''}
            </Caption>
            <Button
              label={t('vip.subscribe')}
              loading={subscribe.isPending && subscribe.variables === p.sku}
              disabled={subscribe.isPending}
              onPress={() => (signedIn && me.data ? subscribe.mutate(p.sku) : router.push('/sign-in'))}
            />
          </View>
        ))
      ) : (
        <Caption>{t('wallet.paymentsSoon')}</Caption>
      )}
      {notice ? <Text style={{ color: colors.danger }}>{notice}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg },
  benefits: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
