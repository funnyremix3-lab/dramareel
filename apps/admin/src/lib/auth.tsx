"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, apiRequest, configureApiAuth } from "./api";
import { env, supabaseConfigured } from "./env";
import { hasPermission, permissionsForRoles } from "./permissions";
import type { Me } from "./types";

export type DevAccount = "owner" | "content" | "ads" | "support" | "viewer";
export const DEV_ACCOUNTS: { account: DevAccount; label: string }[] = [
  { account: "owner", label: "Owner" },
  { account: "content", label: "Content manager" },
  { account: "ads", label: "Ads manager" },
  { account: "support", label: "Support agent" },
  { account: "viewer", label: "Viewer (no admin role)" },
];

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  token: string | null;
  source: "dev" | "supabase" | null;
}

interface AuthContextValue extends AuthState {
  signInDev: (account: DevAccount) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEV_TOKEN_KEY = "reeldrama.admin.devToken";

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  supabase ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return supabase;
}

function readDevToken(): string | null {
  try {
    const raw = window.sessionStorage.getItem(DEV_TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number };
    if (!token || Date.now() > expiresAt - 60_000) {
      window.sessionStorage.removeItem(DEV_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", token: null, source: null });
  const tokenRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const apply = useCallback((next: AuthState) => {
    tokenRef.current = next.token;
    setState(next);
  }, []);

  const signOut = useCallback(async () => {
    try {
      window.sessionStorage.removeItem(DEV_TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
    const sb = getSupabase();
    if (sb) await sb.auth.signOut().catch(() => undefined);
    apply({ status: "signedOut", token: null, source: null });
    queryClient.clear();
  }, [apply, queryClient]);

  // Every API call reads the latest token; a 401 on an authenticated call signs the user out.
  useEffect(() => {
    configureApiAuth({ getToken: () => tokenRef.current, onUnauthorized: () => void signOut() });
  }, [signOut]);

  // Restore a session after hydration (storage is browser-only), then follow Supabase changes.
  useEffect(() => {
    let active = true;
    const sb = getSupabase();
    const restore = async () => {
      const dev = readDevToken();
      if (dev) return apply({ status: "signedIn", token: dev, source: "dev" });
      if (!sb) return apply({ status: "signedOut", token: null, source: null });
      const { data } = await sb.auth.getSession();
      if (!active || tokenRef.current) return;
      const token = data.session?.access_token ?? null;
      apply(token ? { status: "signedIn", token, source: "supabase" } : { status: "signedOut", token: null, source: null });
    };
    void Promise.resolve().then(() => (active ? restore() : undefined));
    const sub = sb?.auth.onAuthStateChange((_event, session) => {
      if (!active || readDevToken()) return;
      const token = session?.access_token ?? null;
      // Token refreshes arrive here too; keep the API client on the newest access token.
      if (token) apply({ status: "signedIn", token, source: "supabase" });
      else if (tokenRef.current) apply({ status: "signedOut", token: null, source: null });
    });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [apply]);

  const signInDev = useCallback(
    async (account: DevAccount) => {
      const res = await apiRequest<{ accessToken: string; expiresIn: number }>("/dev/token", { method: "POST", body: { account }, token: null });
      try {
        window.sessionStorage.setItem(DEV_TOKEN_KEY, JSON.stringify({ token: res.accessToken, expiresAt: Date.now() + res.expiresIn * 1000 }));
      } catch {
        /* keep the token in memory only */
      }
      queryClient.clear();
      apply({ status: "signedIn", token: res.accessToken, source: "dev" });
    },
    [apply, queryClient],
  );

  const sendOtp = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    // Admins are provisioned in advance; never create accounts from the admin sign-in page.
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw new Error(error.message);
  }, []);

  const verifyOtp = useCallback(
    async (email: string, code: string) => {
      const sb = getSupabase();
      if (!sb) throw new Error("Supabase is not configured");
      const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw new Error(error.message);
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign-in did not return a session");
      queryClient.clear();
      apply({ status: "signedIn", token, source: "supabase" });
    },
    [apply, queryClient],
  );

  const value = useMemo<AuthContextValue>(() => ({ ...state, signInDev, sendOtp, verifyOtp, signOut }), [state, signInDev, sendOtp, verifyOtp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The signed-in user plus UI permissions derived from their role keys. */
export function useMe() {
  const { status, token } = useAuth();
  const query = useQuery({
    queryKey: ["me", token],
    queryFn: ({ signal }) => api.get<Me>("/me", undefined, signal),
    enabled: status === "signedIn",
    staleTime: 5 * 60_000,
  });
  const permissions = useMemo(() => permissionsForRoles(query.data?.roles ?? []), [query.data]);
  return { ...query, me: query.data, permissions };
}

/** UI permission check for the current user. */
export function usePermission(required: string): boolean {
  const { permissions } = usePermissionsContext();
  return hasPermission(permissions, required);
}

/**
 * Permissions are provided by the app shell once /me has loaded, so pages and tests can
 * read them synchronously.
 */
const PermissionsContext = createContext<{ permissions: readonly string[] }>({ permissions: [] });

export function PermissionsProvider({ permissions, children }: { permissions: readonly string[]; children: ReactNode }) {
  const value = useMemo(() => ({ permissions }), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissionsContext() {
  return useContext(PermissionsContext);
}
