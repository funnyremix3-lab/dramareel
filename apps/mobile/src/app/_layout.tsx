import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initAds } from '@/features/ads/ads';
import { useAuth } from '@/features/auth/auth-store';
import { registerForPush } from '@/features/notifications/push';
import { initAnalytics } from '@/lib/analytics';
import { configureApiClient } from '@/lib/api/client';
import { config } from '@/lib/config';
import { currentLanguage, restoreLanguage } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { colors } from '@/ui/theme';

if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn, environment: config.variant, tracesSampleRate: 0.1, sendDefaultPii: false });
}
configureApiClient({ locale: currentLanguage });
void SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, primary: colors.accent } };

function RootLayout() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const authStatus = useAuth((s) => s.status);

  useEffect(() => {
    void (async () => {
      await Promise.all([restoreLanguage(), useAuth.getState().init()]);
      setReady(true);
      await SplashScreen.hideAsync();
      void initAds();
      void initAnalytics();
    })();
  }, []);

  // Anything user-specific (locks, likes, wallet) changes with the signed-in user.
  useEffect(() => {
    if (!ready) return;
    queryClient.removeQueries({ queryKey: ['me'] });
    void queryClient.invalidateQueries();
    if (authStatus === 'signedIn') void registerForPush();
  }, [authStatus, ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="watch/[dramaId]" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="drama/[id]" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen name="category/[slug]" options={{ title: t('home.categories') }} />
        <Stack.Screen name="search" options={{ title: t('home.search') }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: t('profile.signIn') }} />
        <Stack.Screen name="wallet" options={{ title: t('wallet.title') }} />
        <Stack.Screen name="vip" options={{ title: t('vip.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
        <Stack.Screen name="licenses" options={{ title: t('settings.licenses') }} />
      </Stack>
    </ThemeProvider>
  );
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootLayout />
    </QueryClientProvider>
  );
}

export default config.sentryDsn ? Sentry.wrap(Root) : Root;
