/**
 * Public runtime configuration. NEXT_PUBLIC_* values are inlined at build time,
 * so they must be referenced literally (no dynamic process.env lookups).
 */
export const env = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1").replace(/\/+$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  devLogin: process.env.NEXT_PUBLIC_DEV_LOGIN === "true",
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
