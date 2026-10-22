import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SWAGGER_ENABLED: bool.default(false),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: optionalString,

    SUPABASE_URL: optionalString,
    SUPABASE_JWKS_URL: optionalString,
    /** Legacy Supabase projects sign access tokens with HS256 and this secret. */
    SUPABASE_JWT_SECRET: optionalString,
    /** Local/test token issuer. Rejected in production. */
    DEV_JWT_SECRET: optionalString,

    /** Base URL for public images; keys already start with `public/` (posters, thumbnails). Never video. */
    MEDIA_PUBLIC_BASE_URL: z.string().default('http://localhost:3000/dev-media'),

    /** S3-compatible storage: Cloudflare R2 in production, SeaweedFS locally. */
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().default('reel-drama-dev'),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: bool.default(true),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),

    /** Base URL of the media edge (Cloudflare Worker) — playback URLs are `${MEDIA_BASE_URL}/p/{token}/{assetId}/master.m3u8`. */
    MEDIA_BASE_URL: z.string().default('http://localhost:3000/dev-media'),
    PLAYBACK_SIGNING_KEY: optionalString,
    PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(21_600),
    /** Serve /dev-media from the API (local development only). */
    DEV_MEDIA_PROXY: bool.default(false),

    /** Rewarded ads grant only via AdMob server-side verification when true (required in production). */
    ADMOB_SSV_ENABLED: bool.default(false),
    ADMOB_SSV_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(6 * 3600),
    REWARD_CLAIM_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800),
    /** Signs direct-campaign serve tokens (impression/click beacons). 32+ bytes base64. */
    ADS_SERVE_SIGNING_KEY: optionalString,

    /** Real-money purchases stay off until store verification and compliance are done. */
    PAYMENTS_ENABLED: bool.default(false),
    GOOGLE_PLAY_PACKAGE_NAME: z.string().default('com.reeldrama.app'),
    /** Path to the Play Developer API service-account JSON (never commit it). */
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH: optionalString,
    /** Pub/Sub push subscription settings for Real-time Developer Notifications. */
    GOOGLE_RTDN_AUDIENCE: optionalString,
    GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.DEV_JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['DEV_JWT_SECRET'], message: 'must be empty in production' });
      }
      if (!env.SUPABASE_JWKS_URL && !env.SUPABASE_JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['SUPABASE_JWKS_URL'], message: 'an auth verifier is required in production' });
      }
      if (env.DEV_MEDIA_PROXY) {
        ctx.addIssue({ code: 'custom', path: ['DEV_MEDIA_PROXY'], message: 'must be false in production' });
      }
      if (!env.PLAYBACK_SIGNING_KEY) {
        ctx.addIssue({ code: 'custom', path: ['PLAYBACK_SIGNING_KEY'], message: 'is required in production' });
      }
      if (!env.ADMOB_SSV_ENABLED) {
        ctx.addIssue({ code: 'custom', path: ['ADMOB_SSV_ENABLED'], message: 'must be true in production (rewards need server-side verification)' });
      }
      if (!env.ADS_SERVE_SIGNING_KEY) {
        ctx.addIssue({ code: 'custom', path: ['ADS_SERVE_SIGNING_KEY'], message: 'is required in production' });
      }
      if (env.PAYMENTS_ENABLED && (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH || !env.GOOGLE_RTDN_AUDIENCE)) {
        ctx.addIssue({ code: 'custom', path: ['PAYMENTS_ENABLED'], message: 'needs GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH and GOOGLE_RTDN_AUDIENCE' });
      }
    }
    if (env.PLAYBACK_SIGNING_KEY && Buffer.from(env.PLAYBACK_SIGNING_KEY, 'base64').length < 32) {
      ctx.addIssue({ code: 'custom', path: ['PLAYBACK_SIGNING_KEY'], message: 'must be at least 32 bytes, base64-encoded' });
    }
    if (env.DEV_JWT_SECRET && env.DEV_JWT_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['DEV_JWT_SECRET'], message: 'must be at least 32 characters' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
