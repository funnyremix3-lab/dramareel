import { useMutation, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/auth-store';
import { guestAnalyticsConsent, setGuestAnalyticsConsent } from '@/lib/analytics';
import { Api } from '@/lib/api/endpoints';
import type { Me } from '@/lib/api/types';
import { config } from '@/lib/config';
import { currentLanguage, errorMessage, LANGUAGES, setLanguage } from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { Icon, type IconName } from '@/ui/Icon';
import { Caption, ListGroup, ListRow } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { status, signOut } = useAuth();
  const signedIn = status === 'signedIn';
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me, enabled: signedIn });
  const [guestAnalytics, setGuestAnalytics] = useState(guestAnalyticsConsent());

  const consents = useMutation({
    mutationFn: (next: Me['consents']) => Api.updateConsents(next),
    onSuccess: (data) => queryClient.setQueryData(qk.me, data),
    onError: (e) => Alert.alert(errorMessage(e)),
  });

  const deleteAccount = () =>
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount'),
        style: 'destructive',
        onPress: async () => {
          try {
            await Api.deleteAccount();
            await signOut();
            Alert.alert(t('settings.deleteRequested'));
            router.replace('/');
          } catch (e) {
            Alert.alert(errorMessage(e));
          }
        },
      },
    ]);

  const c = me.data?.consents;
  const toggle = (key: keyof Me['consents']) => (value: boolean) => c && consents.mutate({ ...c, [key]: value });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <ListGroup title={t('settings.language')}>
        {LANGUAGES.map((l) => (
          <ListRow
            key={l.code}
            icon={currentLanguage() === l.code ? 'radio-button-on' : 'radio-button-off'}
            label={l.label}
            onPress={() => void setLanguage(l.code)}
          />
        ))}
      </ListGroup>

      <ListGroup title={t('settings.privacy')}>
        {signedIn && c ? (
          [
            <ToggleRow key="a" icon="analytics-outline" label={t('settings.analytics')} value={c.analytics} onChange={toggle('analytics')} />,
            <ToggleRow key="b" icon="megaphone-outline" label={t('settings.personalizedAds')} value={c.adsPersonalization} onChange={toggle('adsPersonalization')} />,
            <ToggleRow key="c" icon="mail-outline" label={t('settings.marketing')} value={c.marketing} onChange={toggle('marketing')} />,
            <ToggleRow key="d" icon="notifications-outline" label={t('settings.push')} value={c.push} onChange={toggle('push')} />,
          ]
        ) : (
          <ToggleRow
            icon="analytics-outline"
            label={t('settings.analytics')}
            value={guestAnalytics}
            onChange={(v) => {
              setGuestAnalytics(v);
              void setGuestAnalyticsConsent(v);
            }}
          />
        )}
      </ListGroup>

      <ListGroup title={t('profile.sections.about')}>
        {config.privacyPolicyUrl ? <ListRow icon="shield-checkmark-outline" label={t('settings.privacyPolicy')} onPress={() => void Linking.openURL(config.privacyPolicyUrl)} /> : null}
        {config.termsUrl ? <ListRow icon="document-text-outline" label={t('settings.terms')} onPress={() => void Linking.openURL(config.termsUrl)} /> : null}
        <ListRow icon="code-slash-outline" label={t('settings.licenses')} onPress={() => router.push('/licenses')} />
      </ListGroup>

      {signedIn ? (
        <ListGroup>
          <ListRow icon="trash-outline" label={t('settings.deleteAccount')} onPress={deleteAccount} danger testID="delete-account" />
        </ListGroup>
      ) : null}
      <Caption style={{ textAlign: 'center' }}>{t('settings.version', { version: Constants.expoConfig?.version ?? '' })}</Caption>
    </ScrollView>
  );
}

function ToggleRow({ icon, label, value, onChange }: { icon: IconName; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={colors.text} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
});
