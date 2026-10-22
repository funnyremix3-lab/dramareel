import { SignJWT } from 'jose';
import { AppException } from '../common/errors/app-exception';
import { loadEnv } from '../config/env';
import { DEV_TOKEN_ISSUER, TokenVerifier } from './token-verifier.service';

const DEV_SECRET = 'd'.repeat(40);
const SUPABASE_SECRET = 's'.repeat(40);
const SUPABASE_URL = 'https://example.supabase.co';

function env(overrides: Record<string, string> = {}) {
  return loadEnv({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'test', DEV_JWT_SECRET: DEV_SECRET, ...overrides });
}

function sign(secret: string, opts: { iss?: string; aud?: string; exp?: string | number; sub?: string } = {}) {
  let jwt = new SignJWT({ email: 'Viewer@Dev.Local' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.iss ?? DEV_TOKEN_ISSUER)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m');
  if (opts.sub !== '') jwt = jwt.setSubject(opts.sub ?? 'dev-viewer');
  return jwt.sign(new TextEncoder().encode(secret));
}

describe('TokenVerifier', () => {
  it('accepts a valid dev token', async () => {
    const claims = await new TokenVerifier(env()).verify(await sign(DEV_SECRET));
    expect(claims).toMatchObject({ sub: 'dev-viewer', email: 'Viewer@Dev.Local', phone: undefined });
    expect(claims.issuedAt).toEqual(expect.any(Number));
  });

  it('rejects a dev token signed with the wrong secret', async () => {
    await expect(new TokenVerifier(env()).verify(await sign('x'.repeat(40)))).rejects.toThrow(AppException);
  });

  it('rejects expired tokens', async () => {
    const expired = await sign(DEV_SECRET, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(new TokenVerifier(env()).verify(expired)).rejects.toThrow('Invalid or expired token');
  });

  it('rejects the wrong audience or issuer', async () => {
    const v = new TokenVerifier(env());
    await expect(v.verify(await sign(DEV_SECRET, { aud: 'service_role' }))).rejects.toThrow(AppException);
    await expect(v.verify(await sign(DEV_SECRET, { iss: 'someone-else' }))).rejects.toThrow(AppException);
  });

  it('rejects tokens without a subject', async () => {
    await expect(new TokenVerifier(env()).verify(await sign(DEV_SECRET, { sub: '' }))).rejects.toThrow(AppException);
  });

  it('rejects garbage', async () => {
    await expect(new TokenVerifier(env()).verify('not.a.jwt')).rejects.toThrow(AppException);
  });

  it('ignores the dev secret in production', async () => {
    const prodEnv = { ...env(), NODE_ENV: 'production' as const };
    await expect(new TokenVerifier(prodEnv).verify(await sign(DEV_SECRET))).rejects.toThrow(AppException);
  });

  it('accepts legacy Supabase HS256 tokens with the Supabase issuer', async () => {
    const v = new TokenVerifier(env({ SUPABASE_URL, SUPABASE_JWT_SECRET: SUPABASE_SECRET, DEV_JWT_SECRET: '' }));
    const token = await sign(SUPABASE_SECRET, { iss: `${SUPABASE_URL}/auth/v1`, sub: 'uuid-1' });
    await expect(v.verify(token)).resolves.toMatchObject({ sub: 'uuid-1' });
  });

  it('does not accept a dev-issuer token signed with the Supabase secret', async () => {
    const v = new TokenVerifier(env({ SUPABASE_URL, SUPABASE_JWT_SECRET: SUPABASE_SECRET, DEV_JWT_SECRET: '' }));
    await expect(v.verify(await sign(SUPABASE_SECRET))).rejects.toThrow(AppException);
  });
});

describe('loadEnv', () => {
  it('rejects a dev secret in production', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'x', NODE_ENV: 'production', DEV_JWT_SECRET: DEV_SECRET, SUPABASE_JWKS_URL: 'https://x/jwks' }),
    ).toThrow(/DEV_JWT_SECRET/);
  });

  it('requires an auth verifier in production', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', NODE_ENV: 'production' })).toThrow(/SUPABASE_JWKS_URL/);
  });

  it('rejects short dev secrets', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', DEV_JWT_SECRET: 'short' })).toThrow(/at least 32/);
  });
});
