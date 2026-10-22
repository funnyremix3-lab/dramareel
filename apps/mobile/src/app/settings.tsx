import { useMutation, useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/auth-store';
import { Api } from '@/lib/api/endpoints';
import type { Me } from '@/lib/api/types';
import { config } from '@/lib/config';
import { currentLanguage, errorMessage, LANGUAGES, setLanguage } from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { Button, Caption, Pill } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { status, signOut } = useAuth();
  const signedIn = status === 'signedIn';
  const me = useQuery({ queryKey: qk.me, queryFn: Api.me, enabled: signedIn });

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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={type.heading}>{t('settings.language')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {LANGUAGES.map((l) => (
          <Pill key={l.code} label={l.label} active={currentLanguage() === l.code} onPress={() => void setLanguage(l.code)} />
        ))}
      </View>

      {signedIn && c ? (
        <View style={styles.card}>
          <Text style={type.heading}>{t('settings.privacy')}</Text>
          <Row label={t('settings.analytics')} value={c.analytics} onChange={toggle('analytics')} />
          <Row label={t('settings.personalizedAds')} value={c.adsPersonalization} onChange={toggle('adsPersonalization')} />
          <Row label={t('settings.marketing')} value={c.marketing} onChange={toggle('marketing')} />
          <Row label={t('settings.push')} value={c.push} onChange={toggle('push')} />
        </View>
      ) : null}

      <Button label={t('settings.privacyPolicy')} variant="ghost" onPress={() => Linking.openURL(config.privacyPolicyUrl)} />
      <Button label={t('settings.terms')} variant="ghost" onPress={() => Linking.openURL(config.termsUrl)} />
      <Button label={t('settings.licenses')} variant="ghost" onPress={() => router.push('/licenses')} />
      {signedIn ? <Button label={t('settings.deleteAccount')} variant="ghost" onPress={deleteAccount} testID="delete-account" /> : null}
      <Caption style={{ textAlign: 'center' }}>{t('settings.version', { version: Constants.expoConfig?.version ?? '' })}</Caption>
    </ScrollView>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: colors.text, fontSize: 15, flex: 1 },
});
