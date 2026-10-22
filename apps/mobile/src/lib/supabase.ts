import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { config, supabaseConfigured } from './config';
import { secureStorage } from './secure-storage';

/** Supabase is used for authentication only; all data goes through our API. */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground (Supabase guidance for React Native).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
