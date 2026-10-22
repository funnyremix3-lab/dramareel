import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/auth-store';
import { Api } from '@/lib/api/endpoints';
import { currentLanguage, LANGUAGES, setLanguage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { Button, Caption, Pill } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status, email, signOut } = useAuth();
  const signedIn = status === 'signedIn';
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me, enabled: signedIn });

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(me.data?.profile.displayName ?? email ?? '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading} testID="profile-name">
            {signedIn ? (me.data?.profile.displayName ?? email) : t('profile.guest')}
          </Text>
          {signedIn && email ? <Caption>{email}</Caption> : null}
        </View>
      </View>

      {!signedIn ? <Button label={t('profile.signIn')} onPress={() => router.push('/sign-in')} testID="profile-sign-in" /> : null}

      {signedIn ? (
        <View style={styles.cards}>
          <Pressable style={styles.card} onPress={() => router.push('/wallet')} testID="open-wallet">
            <Caption>{t('profile.wallet')}</Caption>
            <Text style={[styles.cardValue, { color: colors.coin }]}>🪙 {me.data?.wallet.balance ?? '–'}</Text>
          </Pressable>
          <Pressable style={styles.card} onPress={() => router.push('/vip')}>
            <Caption>{t('profile.vip')}</Caption>
            <Text style={[styles.cardValue, { color: colors.vip, fontSize: 14 }]}>
              {me.data?.subscription ? t('profile.vipActive', { date: new Date(me.data.subscription.currentPeriodEnd).toLocaleDateString(i18n.language) }) : '👑'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={type.heading}>{t('profile.language')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {LANGUAGES.map((l) => (
            <Pill
              key={l.code}
              label={l.label}
              active={currentLanguage() === l.code}
              onPress={() => {
                void setLanguage(l.code);
                if (signedIn) Api.updateProfile({ locale: l.code }).catch(() => undefined);
              }}
            />
          ))}
        </View>
      </View>

      <Button label={t('profile.settings')} variant="secondary" onPress={() => router.push('/settings')} />
      {signedIn ? <Button label={t('profile.signOut')} variant="ghost" onPress={() => void signOut()} testID="sign-out" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontSize: 22, fontWeight: '800' },
  cards: { flexDirection: 'row', gap: spacing.md },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  cardValue: { fontSize: 20, fontWeight: '800' },
});
