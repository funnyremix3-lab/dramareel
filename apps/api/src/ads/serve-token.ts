import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** What a direct-campaign serve token commits to. Beacons can only reference real serves. */
export interface ServeClaims {
  c: string; // campaign id
  k: string; // creative id
  p: string; // placement id
  u: string | null; // user id, if signed in
  f: 'ANDROID' | 'IOS' | 'WEB';
  t: number; // issued at, unix seconds
  n: string; // random nonce — makes every serve unique
}

export const SERVE_TOKEN_MAX_AGE_SECONDS = 3600;

export function signServeToken(key: Buffer, claims: ServeClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyServeToken(key: Buffer, token: string, nowSeconds: number): ServeClaims | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', key).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ServeClaims;
    if (typeof claims.t !== 'number' || nowSeconds - claims.t > SERVE_TOKEN_MAX_AGE_SECONDS || claims.t > nowSeconds + 60) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Stable 64-char id stored in ad_impressions/ad_clicks.serve_id for de-duplication. */
export const serveIdOf = (token: string) => createHash('sha256').update(token).digest('hex');
