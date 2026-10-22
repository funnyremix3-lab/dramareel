/**
 * Mints a short-lived access token for a seeded dev account (local/test only).
 *   npm run dev:token -- viewer        → token for viewer@dev.local
 *   npm run dev:token -- owner 24h
 */
import { existsSync } from 'node:fs';
import { SignJWT } from 'jose';

if (existsSync('.env')) process.loadEnvFile('.env');

export async function mintDevToken(sub: string, secret: string, expiresIn = '1h', email?: string): Promise<string> {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuer('reel-drama-dev')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

if (require.main === module) {
  const who = process.argv[2] ?? 'viewer';
  const ttl = process.argv[3] ?? '1h';
  const secret = process.env.DEV_JWT_SECRET;
  if (!secret || process.env.NODE_ENV === 'production') {
    console.error('DEV_JWT_SECRET must be set and NODE_ENV must not be production');
    process.exit(1);
  }
  mintDevToken(`dev-${who}`, secret, ttl, `${who}@dev.local`).then((t) => console.log(t));
}
