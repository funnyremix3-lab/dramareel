import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import worker, { Env } from '../src/index';
import { signPlaybackToken, decodeSigningKey } from '../src/playback-token';

const KEY_B64 = Buffer.alloc(32, 9).toString('base64');
const ASSET = '3cbce07b-af4b-498c-a492-1d6d77e16072';

/** Minimal in-memory stand-ins for R2 and the Cache API. */
function fakeBucket(files: Record<string, string>) {
  return {
    async get(key: string) {
      if (!(key in files)) return null;
      const data = new TextEncoder().encode(files[key]);
      return {
        size: data.length,
        httpEtag: '"etag"',
        range: undefined,
        body: new Blob([data]).stream(),
        writeHttpMetadata: () => undefined,
      };
    },
  } as unknown as R2Bucket;
}

const store = new Map<string, Response>();
(globalThis as unknown as { caches: unknown }).caches = {
  default: {
    match: async (req: Request) => store.get(req.url)?.clone(),
    put: async (req: Request, res: Response) => void store.set(req.url, res),
  },
};

const ctx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => undefined } as unknown as ExecutionContext;

let env: Env;
beforeEach(() => {
  store.clear();
  env = {
    PLAYBACK_SIGNING_KEY: KEY_B64,
    ALLOWED_ORIGINS: 'https://admin.example.com',
    MEDIA: fakeBucket({
      [`processed/${ASSET}/master.m3u8`]: '#EXTM3U\n',
      [`processed/${ASSET}/720p/seg_000.ts`]: 'segment-bytes',
      [`originals/${ASSET}/source.mp4`]: 'secret original',
      'public/thumbnails/abc.jpg': 'jpeg',
    }),
  };
});

const token = (asset = ASSET, ttl = 60) =>
  signPlaybackToken(decodeSigningKey(KEY_B64), { a: asset, e: Math.floor(Date.now() / 1000) + ttl, u: 't' });
const get = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://media.example.com${path}`, { headers }), env, ctx);

describe('media worker', () => {
  it('serves playlists and segments with a valid token', async () => {
    const t = await token();
    const m = await get(`/p/${t}/${ASSET}/master.m3u8`);
    assert.equal(m.status, 200);
    assert.equal(await m.text(), '#EXTM3U\n');
    assert.equal(m.headers.get('content-type'), 'application/vnd.apple.mpegurl');
    assert.equal(m.headers.get('cache-control'), 'private, max-age=60');

    const s = await get(`/p/${t}/${ASSET}/720p/seg_000.ts`);
    assert.equal(s.status, 200);
    assert.equal(s.headers.get('content-type'), 'video/mp2t');
  });

  it('rejects expired, forged and cross-asset tokens', async () => {
    assert.equal((await get(`/p/${await token(ASSET, -1)}/${ASSET}/master.m3u8`)).status, 403);
    assert.equal((await get(`/p/x${await token()}/${ASSET}/master.m3u8`)).status, 403);
    const other = '00000000-0000-0000-0000-000000000000';
    assert.equal((await get(`/p/${await token(other)}/${ASSET}/master.m3u8`)).status, 403);
  });

  it('never exposes originals or arbitrary keys', async () => {
    const t = await token();
    const attempts = [
      `/p/${t}/${ASSET}/../../originals/${ASSET}/source.mp4`,
      `/p/${t}/${ASSET}/..%2F..%2Foriginals%2F${ASSET}%2Fsource.mp4`,
      `/originals/${ASSET}/source.mp4`,
      `/p/${t}/${ASSET}/source.mp4x`,
      '/public/../originals/x.mp4',
    ];
    for (const path of attempts) {
      const res = await get(path);
      assert.ok(res.status === 403 || res.status === 404, `${path} → ${res.status}`);
      assert.ok(!(await res.text()).includes('secret original'));
    }
  });

  it('serves public thumbnails without a token', async () => {
    const r = await get('/public/thumbnails/abc.jpg');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
  });

  it('caches verified segments under a token-free key', async () => {
    await get(`/p/${await token()}/${ASSET}/720p/seg_000.ts`);
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(store.has(`https://media-cache.internal/processed/${ASSET}/720p/seg_000.ts`));
    assert.ok(![...store.keys()].some((k) => k.includes('m3u8')), 'playlists are not cached');
  });

  it('adds CORS only for allowed origins', async () => {
    const t = await token();
    const ok = await get(`/p/${t}/${ASSET}/master.m3u8`, { origin: 'https://admin.example.com' });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://admin.example.com');
    const bad = await get(`/p/${t}/${ASSET}/master.m3u8`, { origin: 'https://evil.example' });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });

  it('rejects non-GET methods', async () => {
    const r = await worker.fetch(new Request(`https://media.example.com/public/thumbnails/abc.jpg`, { method: 'POST' }), env, ctx);
    assert.equal(r.status, 405);
  });

  it('uses a token module identical to the API one', () => {
    const here = readFileSync(join(__dirname, '..', 'src', 'playback-token.ts'), 'utf8');
    const api = readFileSync(join(__dirname, '..', '..', '..', '..', 'apps', 'api', 'src', 'media', 'playback-token.ts'), 'utf8');
    assert.equal(here, api, 'infra/cloudflare/media-worker/src/playback-token.ts must match apps/api/src/media/playback-token.ts');
  });
});
