import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth-store';
import { ApiError } from '@/lib/api/client';
import { config, supabaseConfigured } from '@/lib/config';
import { errorMessage } from '@/lib/i18n';
import { Button, Caption, Title } from '@/ui/primitives';
import { colors, radius, spacing, type } from '@/ui/theme';

const DEV_ACCOUNTS = ['viewer', 'owner', 'content', 'ads', 'support'] as const;
// Supabase rejects a new email OTP for the same address within 60 seconds by default.
const RESEND_COOLDOWN_MS = 60_000;

/** Passwordless email sign-in (Supabase OTP). Dev builds also offer seeded test accounts. */
export default function SignInScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailForm = useForm({ resolver: zodResolver(z.object({ email: z.email(t('auth.invalidEmail')) })), defaultValues: { email: '' } });
  // Supabase email OTP length is a project setting (6–10 digits); accept any of them.
  const codeForm = useForm({ resolver: zodResolver(z.object({ code: z.string().regex(/^\d{6,10}$/, t('auth.invalidCode')) })), defaultValues: { code: '' } });
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resendAt <= now) return;
    const id = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(id);
  }, [resendAt, now]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const sendCode = (email: string) =>
    run(async () => {
      await auth.sendEmailCode(email);
      setSentTo(email);
      codeForm.reset({ code: '' });
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
      setNow(Date.now());
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      // API errors have translated messages; Supabase auth errors carry their own readable message.
      setError(err instanceof ApiError ? errorMessage(err) : err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Title style={type.title}>{t('auth.title')}</Title>
      <Caption>{t('auth.subtitle')}</Caption>

      {supabaseConfigured ? (
        sentTo ? (
          <View style={styles.form}>
            <Caption>{t('auth.codeSent', { email: sentTo })}</Caption>
            <Controller
              control={codeForm.control}
              name="code"
              render={({ field, fieldState }) => (
                <>
                  <TextInput
                    testID="otp-input"
                    style={styles.input}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={10}
                    placeholder={t('auth.code')}
                    placeholderTextColor={colors.textMuted}
                    value={field.value}
                    onChangeText={(v) => field.onChange(v.replace(/\D/g, ''))}
                    autoFocus
                  />
                  {fieldState.error ? <Text style={styles.error}>{fieldState.error.message}</Text> : null}
                </>
              )}
            />
            <Button label={t('auth.verify')} loading={busy} onPress={() => void codeForm.handleSubmit(({ code }) => run(async () => (await auth.verifyEmailCode(sentTo, code), finish())))()} />
            <View style={styles.devRow}>
              <Button
                testID="resend-code"
                variant="ghost"
                label={resendIn > 0 ? t('auth.resendIn', { count: resendIn }) : t('auth.resend')}
                disabled={busy || resendIn > 0}
                onPress={() => void sendCode(sentTo)}
              />
              <Button
                testID="change-email"
                variant="ghost"
                label={t('auth.changeEmail')}
                disabled={busy}
                onPress={() => {
                  setSentTo(null);
                  setError(null);
                  codeForm.reset({ code: '' });
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <Controller
              control={emailForm.control}
              name="email"
              render={({ field, fieldState }) => (
                <>
                  <TextInput testID="email-input" style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder={t('auth.email')} placeholderTextColor={colors.textMuted} value={field.value} onChangeText={field.onChange} />
                  {fieldState.error ? <Text style={styles.error}>{fieldState.error.message}</Text> : null}
                </>
              )}
            />
            <Button label={t('auth.sendCode')} loading={busy} onPress={() => void emailForm.handleSubmit(({ email }) => sendCode(email.trim().toLowerCase()))()} />
          </View>
        )
      ) : (
        <Caption style={{ color: colors.coin }}>{t('auth.notConfigured')}</Caption>
      )}

      {config.devLogin ? (
        <View style={styles.form}>
          <Text style={type.heading}>{t('auth.devTitle')}</Text>
          <View style={styles.devRow}>
            {DEV_ACCOUNTS.map((a) => (
              <Button key={a} testID={`dev-login-${a}`} label={a} variant="secondary" disabled={busy} onPress={() => run(async () => (await auth.signInDev(a), finish()))} />
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="sign-in-error">
          {error}
        </Text>
      ) : null}

      <Text style={styles.terms} onPress={() => config.termsUrl && Linking.openURL(config.termsUrl)}>
        {t('auth.terms')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg },
  form: { gap: spacing.md, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16 },
  error: { color: colors.danger },
  devRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  terms: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
});
