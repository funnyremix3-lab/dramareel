import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration. Only PUBLIC values belong here — anything in `extra` ships inside the app.
 *   EXPO_PUBLIC_API_URL            e.g. https://api.reeldrama.example/api/v1 (dev: http://<LAN-IP>:3000/api/v1)
 *   EXPO_PUBLIC_SUPABASE_URL       https://<project>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY  Supabase anon (publishable) key
 *   EXPO_PUBLIC_DEV_LOGIN          "true" shows the seeded dev-account sign-in (never in production)
 *   EXPO_PUBLIC_SENTRY_DSN         optional crash reporting
 *   ADMOB_ANDROID_APP_ID / ADMOB_IOS_APP_ID  real AdMob app ids (defaults are Google's TEST ids)
 *   APP_VARIANT                    development | preview | production
 */
const variant = process.env.APP_VARIANT ?? 'development';
const isProduction = variant === 'production';

// Google's official sample AdMob app ids — safe for development, never earn revenue.
const TEST_ADMOB_ANDROID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_ADMOB_IOS = 'ca-app-pub-3940256099942544~1458002511';

if (isProduction && (!process.env.ADMOB_ANDROID_APP_ID || process.env.EXPO_PUBLIC_DEV_LOGIN === 'true')) {
  throw new Error('Production builds need ADMOB_ANDROID_APP_ID and must not enable EXPO_PUBLIC_DEV_LOGIN');
}

const googleServicesFile = existsSync('./google-services.json') ? './google-services.json' : undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProduction ? 'Reel Drama' : `Reel Drama (${variant})`,
  slug: 'reel-drama',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'reeldrama',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0B0F',
  ios: {
    bundleIdentifier: isProduction ? 'com.reeldrama.app' : `com.reeldrama.app.${variant}`,
    supportsTablet: false,
    icon: './assets/expo.icon',
    infoPlist: {
      NSUserTrackingUsageDescription: 'This lets us show you more relevant ads. You can still watch everything if you decline.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: isProduction ? 'com.reeldrama.app' : `com.reeldrama.app.${variant}`,
    adaptiveIcon: {
      backgroundColor: '#0B0B0F',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile,
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO'],
  },
  web: { output: 'static', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#0B0B0F', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    ['react-native-video', { enableNotificationControls: false, androidExtensions: { useExoplayerHls: true, useExoplayerDash: false, useExoplayerSmoothStreaming: false, useExoplayerRtsp: false } }],
    'expo-secure-store',
    'expo-localization',
    // Cleartext HTTP only for non-production builds (local API on the LAN); production is HTTPS-only.
    ['expo-build-properties', { android: { targetSdkVersion: 36, compileSdkVersion: 36, usesCleartextTraffic: !isProduction } }],
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? TEST_ADMOB_ANDROID,
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? TEST_ADMOB_IOS,
        delayAppMeasurementInit: true,
        userTrackingUsageDescription: 'This lets us show you more relevant ads. You can still watch everything if you decline.',
      },
    ],
    ['expo-notifications', { color: '#FF2D55' }],
    ...(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? [['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }] as [string, object]]
      : []),
  ],
  extra: {
    variant,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api/v1',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    devLogin: !isProduction && process.env.EXPO_PUBLIC_DEV_LOGIN === 'true',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://reeldrama.example/privacy',
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://reeldrama.example/terms',
  },
  experiments: { typedRoutes: true, reactCompiler: true },
});
