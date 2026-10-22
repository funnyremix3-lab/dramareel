/**
 * Path-scoped playback tokens. Uses only Web Crypto + btoa/atob so the exact same file runs in
 * Node (API) and in the Cloudflare media worker (infra/cloudflare/media-worker/src/playback-token.ts
 * must stay byte-identical — a test enforces this).
 *
 * URL shape: {MEDIA_BASE_URL}/p/{token}/{assetId}/{file}
 * HLS players resolve segment URIs relative to the manifest, so the token in the path
 * automatically covers every playlist and segment of that asset.
 */

export interface PlaybackClaims {
  /** Video asset id the token grants. */
  a: string;
  /** Expiry, unix seconds. */
  e: number;
  /** Short opaque user tag for log correlation (not an identifier). */
  u: string;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeSigningKey(base64Key: string): Uint8Array {
  return fromBase64Url(base64Key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

function hmacKey(secret: Uint8Array) {
  return crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signPlaybackToken(secret: Uint8Array, claims: PlaybackClaims): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the claims when the token is authentic, unexpired and scoped to `assetId`; otherwise null. */
export async function verifyPlaybackToken(
  secret: Uint8Array,
  token: string,
  assetId: string,
  nowSeconds: number,
): Promise<PlaybackClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 512) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(parts[1]), encoder.encode(parts[0]));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as PlaybackClaims;
    if (typeof claims.a !== 'string' || typeof claims.e !== 'number') return null;
    if (claims.a !== assetId || claims.e <= nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}

const MEDIA_FILE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(m3u8|ts|m4s|mp4|aac|vtt|jpg|webp)$/;

/** Only HLS/thumbnail files directly under the asset's processed folder are servable. */
export function isServableMediaPath(path: string): boolean {
  return path.length <= 200 && MEDIA_FILE.test(path) && !path.includes('..');
}

export const CONTENT_TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  aac: 'audio/aac',
  vtt: 'text/vtt',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};
