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

/** Public, build-time configuration (see app.config.ts). Never put secrets here. */
export const config: Extra = {
  variant: extra.variant ?? 'development',
  apiUrl: (extra.apiUrl ?? 'http://10.0.2.2:3000/api/v1').replace(/\/$/, ''),
  supabaseUrl: extra.supabaseUrl ?? '',
  supabaseAnonKey: extra.supabaseAnonKey ?? '',
  devLogin: extra.devLogin ?? false,
  sentryDsn: extra.sentryDsn ?? '',
  privacyPolicyUrl: extra.privacyPolicyUrl ?? '',
  termsUrl: extra.termsUrl ?? '',
};

export const supabaseConfigured = !!(config.supabaseUrl && config.supabaseAnonKey);
