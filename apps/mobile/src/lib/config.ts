import Constants from 'expo-constants';

interface Extra {
  variant: string;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  devLogin: boolean;
  sentryDsn: string;
  privacyPolicyUrl: string;
  termsUrl: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

/**
 * EXPO_PUBLIC_* values are inlined by Metro on every bundle, so they win over `extra`
 * (which is frozen into the native build). Each must be referenced literally for inlining.
 */
const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
};

/** Public, build-time configuration (see app.config.ts). Never put secrets here. */
export const config: Extra = {
  variant: extra.variant ?? 'development',
  apiUrl: (env.apiUrl || extra.apiUrl || 'http://10.0.2.2:3000/api/v1').replace(/\/$/, ''),
  supabaseUrl: env.supabaseUrl || extra.supabaseUrl || '',
  supabaseAnonKey: env.supabaseAnonKey || extra.supabaseAnonKey || '',
  // Dev login stays tied to the native build variant so a production binary can never enable it.
  devLogin: extra.devLogin ?? false,
  sentryDsn: env.sentryDsn || extra.sentryDsn || '',
  privacyPolicyUrl: env.privacyPolicyUrl || extra.privacyPolicyUrl || '',
  termsUrl: env.termsUrl || extra.termsUrl || '',
};

export const supabaseConfigured = !!(config.supabaseUrl && config.supabaseAnonKey);
