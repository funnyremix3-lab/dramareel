import { create } from 'zustand';
import { Api } from '@/lib/api/endpoints';
import { configureApiClient } from '@/lib/api/client';
import { secureStorage } from '@/lib/secure-storage';
import { supabase } from '@/lib/supabase';

const DEV_TOKEN_KEY = 'reel.dev.session';

type Mode = 'supabase' | 'dev';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  mode: Mode | null;
  email: string | null;
  /** Restores a saved session on app start. */
  init: () => Promise<void>;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signInDev: (account: string) => Promise<void>;
  signOut: () => Promise<void>;
  accessToken: () => Promise<string | null>;
}

interface DevSession {
  token: string;
  expiresAt: number;
  email: string;
}

async function readDevSession(): Promise<DevSession | null> {
  const raw = await secureStorage.getItem(DEV_TOKEN_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as DevSession;
    return session.expiresAt > Date.now() + 60_000 ? session : null;
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  mode: null,
  email: null,

  async init() {
    const dev = await readDevSession();
    if (dev) return set({ status: 'signedIn', mode: 'dev', email: dev.email });
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      supabase.auth.onAuthStateChange((_event, session) => {
        if (get().mode === 'dev') return;
        set(session ? { status: 'signedIn', mode: 'supabase', email: session.user.email ?? null } : { status: 'signedOut', mode: null, email: null });
      });
      if (data.session) return set({ status: 'signedIn', mode: 'supabase', email: data.session.user.email ?? null });
    }
    set({ status: 'signedOut', mode: null, email: null });
  },

  async sendEmailCode(email) {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  },

  async verifyEmailCode(email, code) {
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
    set({ status: 'signedIn', mode: 'supabase', email: data.user?.email ?? email });
  },

  async signInDev(account) {
    const { accessToken, expiresIn } = await Api.devToken(account);
    const session: DevSession = { token: accessToken, expiresAt: Date.now() + expiresIn * 1000, email: `${account}@dev.local` };
    await secureStorage.setItem(DEV_TOKEN_KEY, JSON.stringify(session));
    set({ status: 'signedIn', mode: 'dev', email: session.email });
  },

  async signOut() {
    await secureStorage.removeItem(DEV_TOKEN_KEY);
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    set({ status: 'signedOut', mode: null, email: null });
  },

  async accessToken() {
    if (get().mode === 'dev') return (await readDevSession())?.token ?? null;
    if (get().mode === 'supabase' && supabase) {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    }
    return null;
  },
}));

configureApiClient({
  token: () => useAuth.getState().accessToken(),
  unauthorized: () => {
    // Token rejected (expired dev token, revoked session): drop to signed-out.
    void useAuth.getState().signOut();
  },
});

export const isSignedIn = () => useAuth.getState().status === 'signedIn';
