import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/auth-store';
import { purchase, storePrices } from '@/features/payments/purchase';
import { Api } from '@/lib/api/endpoints';
import { invalidateEntitlements, qk } from '@/lib/query';
import { Icon, type IconName } from '@/ui/Icon';
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
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <LinearGradient colors={['rgba(245,196,81,0.28)', 'rgba(245,196,81,0.06)', colors.surface]} style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="diamond" size={34} color={colors.vip} />
        </View>
        <Text style={styles.heroTitle}>{t('vip.title')}</Text>
        <Text style={styles.heroSubtitle}>{t('vip.tagline')}</Text>
      </LinearGradient>

      <View style={styles.benefitList}>
        {BENEFITS.map((b) => (
          <View key={b.key} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Icon name={b.icon} size={20} color={colors.vip} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>{t(`vip.benefit.${b.key}.title`)}</Text>
              <Caption>{t(`vip.benefit.${b.key}.body`)}</Caption>
            </View>
          </View>
        ))}
      </View>

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
        <View style={styles.soon}>
          <Icon name="time-outline" size={22} color={colors.vip} />
          <View style={{ flex: 1 }}>
            <Text style={styles.benefitTitle}>{t('vip.soonTitle')}</Text>
            <Caption>{t('vip.soonBody')}</Caption>
          </View>
        </View>
      )}
      {notice ? <Text style={{ color: colors.danger }}>{notice}</Text> : null}
    </ScrollView>
  );
}

const BENEFITS: { key: string; icon: IconName }[] = [
  { key: 'unlock', icon: 'lock-open' },
  { key: 'noAds', icon: 'ban' },
  { key: 'early', icon: 'sparkles' },
];

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,196,81,0.35)' },
  heroIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(245,196,81,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  heroTitle: { color: colors.vip, fontSize: 26, fontWeight: '900' },
  heroSubtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  benefitList: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,196,81,0.12)', alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  soon: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(245,196,81,0.25)', borderStyle: 'dashed' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
