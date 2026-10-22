/**
 * Reel Drama media edge.
 *   GET /p/{token}/{assetId}/{file}  → processed/{assetId}/{file} after token verification
 *   GET /public/{kind}/{file}        → public/{kind}/{file} (posters, thumbnails, avatars, creatives)
 * Originals (originals/…) and anything else are never routable.
 */
import { CONTENT_TYPES, decodeSigningKey, isServableMediaPath, verifyPlaybackToken } from './playback-token';

export interface Env {
  MEDIA: R2Bucket;
  PLAYBACK_SIGNING_KEY: string;
  ALLOWED_ORIGINS?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_FILE = /^(posters|avatars|creatives|thumbnails)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed');
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    const playback = url.pathname.match(/^\/p\/([^/]+)\/([^/]+)\/(.+)$/);
    if (playback) {
      const [, token, assetId, path] = playback;
      if (!UUID.test(assetId) || !isServableMediaPath(path)) return text(404, 'Not found', cors);
      const claims = await verifyPlaybackToken(decodeSigningKey(env.PLAYBACK_SIGNING_KEY), token, assetId, Math.floor(Date.now() / 1000));
      if (!claims) return text(403, 'Forbidden', cors);
      return serve(request, env, ctx, `processed/${assetId}/${path}`, path, cors, true);
    }

    const pub = url.pathname.match(/^\/public\/(.+)$/);
    if (pub && PUBLIC_FILE.test(pub[1])) {
      return serve(request, env, ctx, `public/${pub[1]}`, pub[1], cors, false);
    }

    return text(404, 'Not found', cors);
  },
};

async function serve(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string,
  path: string,
  cors: Record<string, string>,
  tokenised: boolean,
): Promise<Response> {
  const ext = path.slice(path.lastIndexOf('.') + 1);
  const isPlaylist = ext === 'm3u8';
  const range = request.headers.get('range');

  // Tokens differ per viewer, so cache segments under a token-free key — but only after verification.
  const cacheKey = new Request(`https://media-cache.internal/${key}`);
  const cache = (caches as unknown as { default: Cache }).default;
  if (!range) {
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, cors);
  }

  const object = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
  if (!object) return text(404, 'Not found', cors);

  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', CONTENT_TYPES[ext] ?? headers.get('Content-Type') ?? 'application/octet-stream');
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  // Browsers/players may cache playlists briefly; segments and images are immutable per encode.
  headers.set('Cache-Control', isPlaylist ? 'private, max-age=60' : tokenised ? 'private, max-age=86400' : 'public, max-age=86400');

  const body = 'body' in object ? (object as R2ObjectBody).body : null;
  let status = 200;
  if (range && object.range && 'offset' in object.range) {
    const start = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - start;
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    status = 206;
  } else {
    headers.set('Content-Length', String(object.size));
  }

  const response = new Response(request.method === 'HEAD' ? null : body, { status, headers });
  if (status === 200 && request.method === 'GET' && !isPlaylist) {
    const cacheable = response.clone();
    const cacheHeaders = new Headers(cacheable.headers);
    cacheHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    ctx.waitUntil(cache.put(cacheKey, new Response(cacheable.body, { status: 200, headers: cacheHeaders })));
  }
  return response;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function withHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function text(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...headers } });
}
