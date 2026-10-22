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

    /** Public base URL for posters/thumbnails (not video). */
    MEDIA_PUBLIC_BASE_URL: z.string().default('http://localhost:3000/dev-media/public'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.DEV_JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['DEV_JWT_SECRET'], message: 'must be empty in production' });
      }
      if (!env.SUPABASE_JWKS_URL && !env.SUPABASE_JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['SUPABASE_JWKS_URL'], message: 'an auth verifier is required in production' });
      }
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
