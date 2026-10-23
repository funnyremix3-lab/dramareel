import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/auth-store';
import { Api } from '@/lib/api/endpoints';
import { config } from '@/lib/config';
import { currentLanguage, LANGUAGES, setLanguage } from '@/lib/i18n';
import { qk } from '@/lib/query';
import { Icon } from '@/ui/Icon';
import { Button, Caption, ListGroup, ListRow } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

/** Name shown for an account: profile name, else the part of the email before "@". */
function displayNameFor(profileName: string | null | undefined, email: string | null | undefined): string {
  return profileName?.trim() || email?.split('@')[0] || '';
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status, email, signOut } = useAuth();
  const signedIn = status === 'signedIn';
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me, enabled: signedIn });
  const name = displayNameFor(me.data?.profile.displayName, me.data?.email ?? email);
  const subscription = me.data?.subscription;
  const language = LANGUAGES.find((l) => l.code === currentLanguage());

  const chooseLanguage = () =>
    Alert.alert(t('profile.language'), undefined, [
      ...LANGUAGES.map((l) => ({
        text: l.label,
        onPress: () => {
          void setLanguage(l.code);
          if (signedIn) Api.updateProfile({ locale: l.code }).catch(() => undefined);
        },
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);

  const confirmSignOut = () =>
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <LinearGradient colors={['rgba(255,45,85,0.35)', 'rgba(255,45,85,0.08)', colors.background]} style={{ paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
        <View style={styles.header}>
          <LinearGradient colors={[colors.accent, '#FF8A5C']} style={styles.avatarRing}>
            <View style={styles.avatar}>
              {signedIn ? <Text style={styles.avatarText}>{(name || '?').slice(0, 1).toUpperCase()}</Text> : <Icon name="person" size={30} color={colors.textSecondary} />}
            </View>
          </LinearGradient>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1} testID="profile-name">
              {signedIn ? name : t('profile.welcome')}
            </Text>
            <Caption numberOfLines={1}>{signedIn ? (me.data?.email ?? email ?? '') : t('profile.signInHint')}</Caption>
          </View>
        </View>
        {!signedIn ? (
          <Button label={t('profile.signIn')} onPress={() => router.push('/sign-in')} style={{ marginTop: spacing.lg }} testID="profile-sign-in" />
        ) : null}
      </LinearGradient>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.xl }}>
        {signedIn ? (
          <View style={styles.cards}>
            <Pressable style={styles.card} onPress={() => router.push('/wallet')} testID="open-wallet">
              <View style={styles.cardTop}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(255,201,77,0.15)' }]}>
                  <Text style={{ fontSize: 16 }}>🪙</Text>
                </View>
                <Caption>{t('profile.wallet')}</Caption>
              </View>
              <Text style={[styles.cardValue, { color: colors.coin }]}>{me.data?.wallet.balance ?? '–'}</Text>
              <Text style={styles.cardLink}>{t('profile.getCoins')}</Text>
            </Pressable>
            <Pressable style={styles.card} onPress={() => router.push('/vip')} testID="open-vip">
              <View style={styles.cardTop}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(245,196,81,0.15)' }]}>
                  <Icon name="diamond" size={18} color={colors.vip} />
                </View>
                <Caption>{t('profile.vip')}</Caption>
              </View>
              <Text style={[styles.cardValue, { color: colors.vip, fontSize: subscription ? 15 : 20 }]} numberOfLines={2}>
                {subscription
                  ? t('profile.vipActive', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(i18n.language) })
                  : t('profile.vipInactive')}
              </Text>
              <Text style={styles.cardLink}>{subscription ? t('profile.vipManage') : t('profile.joinVip')}</Text>
            </Pressable>
          </View>
        ) : null}

        {signedIn ? (
          <ListGroup title={t('profile.sections.library')}>
            <ListRow icon="time-outline" label={t('profile.history')} onPress={() => router.navigate('/my-list')} testID="open-history" />
            <ListRow icon="wallet-outline" label={t('wallet.title')} onPress={() => router.push('/wallet')} />
          </ListGroup>
        ) : null}

        <ListGroup title={t('profile.sections.preferences')}>
          <ListRow icon="language-outline" label={t('profile.language')} value={language?.label} onPress={chooseLanguage} testID="open-language" />
          <ListRow icon="settings-outline" label={t('profile.settings')} onPress={() => router.push('/settings')} testID="open-settings" />
        </ListGroup>

        <ListGroup title={t('profile.sections.about')}>
          {config.termsUrl ? <ListRow icon="document-text-outline" label={t('settings.terms')} onPress={() => void Linking.openURL(config.termsUrl)} /> : null}
          {config.privacyPolicyUrl ? <ListRow icon="shield-checkmark-outline" label={t('settings.privacyPolicy')} onPress={() => void Linking.openURL(config.privacyPolicyUrl)} /> : null}
          <ListRow icon="code-slash-outline" label={t('settings.licenses')} onPress={() => router.push('/licenses')} />
        </ListGroup>

        {signedIn ? (
          <ListGroup>
            <ListRow icon="log-out-outline" label={t('profile.signOut')} onPress={confirmSignOut} danger testID="sign-out" />
          </ListGroup>
        ) : null}

        <Caption style={{ textAlign: 'center' }}>{t('settings.version', { version: Constants.expoConfig?.version ?? '' })}</Caption>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarRing: { width: 72, height: 72, borderRadius: 36, padding: 3 },
  avatar: { flex: 1, borderRadius: 33, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontSize: 28, fontWeight: '800' },
  name: { ...type.title, fontSize: 22 },
  cards: { flexDirection: 'row', gap: spacing.md },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 24, fontWeight: '800' },
  cardLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});
