import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StorageService } from '../src/media/storage.service';
import { auth, createTestApp, freshSub, prisma, tokenFor } from './helpers';

describe('Media: playback authorization & uploads (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dramaId: string;
  const episodeId = async (n: number) =>
    (await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: n } } })).id;

  /** Gives an episode a READY asset (no files needed to test authorization). */
  async function readyAsset(n: number) {
    const id = await episodeId(n);
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id } });
    if (episode.currentVideoAssetId) return episode.currentVideoAssetId;
    const asset = await prisma.videoAsset.create({
      data: {
        episodeId: id,
        originalKey: `originals/test-${id}/source.mp4`,
        status: 'READY',
        renditions: [{ name: '720p', width: 720, height: 1280, bandwidth: 2_800_000, playlistKey: 'x' }],
        durationMs: 20_000,
      },
    });
    await prisma.videoAsset.update({ where: { id: asset.id }, data: { hlsMasterKey: `processed/${asset.id}/master.m3u8` } });
    await prisma.episode.update({ where: { id }, data: { currentVideoAssetId: asset.id } });
    return asset.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    await app.get(StorageService).ensureBucket();
    dramaId = (await prisma.drama.findUniqueOrThrow({ where: { slug: 'return-of-the-disowned-heir' } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /episodes/:id/playback', () => {
    it('requires sign-in', async () => {
      await http.get(`/api/v1/episodes/${await episodeId(1)}/playback`).expect(401);
    });

    it('returns tokenised HLS URLs for a free episode', async () => {
      const assetId = await readyAsset(1);
      const res = await http.get(`/api/v1/episodes/${await episodeId(1)}/playback`).set(auth(await tokenFor(freshSub()))).expect(200);
      expect(res.body.manifestUrl).toMatch(new RegExp(`^https://media\\.test/p/[\\w-]+\\.[\\w-]+/${assetId}/master\\.m3u8$`));
      expect(res.body.renditions).toEqual([{ name: '720p', width: 720, height: 1280, bandwidth: 2_800_000 }]);
      expect(res.body.renditions[0].playlistKey).toBeUndefined();
      expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(res.body.accessReason).toBe('FREE');
    });

    it('refuses locked episodes with unlock options and never leaks a URL', async () => {
      await readyAsset(9);
      const res = await http.get(`/api/v1/episodes/${await episodeId(9)}/playback`).set(auth(await tokenFor(freshSub()))).expect(403);
      expect(res.body.error.code).toBe('EPISODE_LOCKED');
      expect(res.body.error.details.unlockOptions).toEqual({ coins: 30, rewardedAd: { placementKey: 'episode_unlock_rewarded' }, subscription: true });
      expect(JSON.stringify(res.body)).not.toContain('m3u8');
    });

    it('allows a locked episode once the user has an unlock', async () => {
      await readyAsset(10);
      const token = await tokenFor(freshSub());
      const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
      await prisma.episodeUnlock.create({ data: { userId: me.body.id, episodeId: await episodeId(10), method: 'ADMIN_GRANT' } });
      const res = await http.get(`/api/v1/episodes/${await episodeId(10)}/playback`).set(auth(token)).expect(200);
      expect(res.body.accessReason).toBe('UNLOCKED');
    });

    it('reports ASSET_NOT_READY when there is no ready video', async () => {
      const res = await http.get(`/api/v1/episodes/${await episodeId(3)}/playback`).set(auth(await tokenFor(freshSub()))).expect(409);
      expect(res.body.error.code).toBe('ASSET_NOT_READY');
    });

    it('includes the resume position from watch history', async () => {
      await readyAsset(2);
      const token = await tokenFor(freshSub());
      await http.put(`/api/v1/episodes/${await episodeId(2)}/progress`).set(auth(token)).send({ positionSeconds: 7 }).expect(200);
      const res = await http.get(`/api/v1/episodes/${await episodeId(2)}/playback`).set(auth(token)).expect(200);
      expect(res.body.resumePositionSeconds).toBe(7);
    });
  });

  describe('dev media proxy', () => {
    it('serves a stored file only with a valid token for that asset', async () => {
      const assetId = await readyAsset(1);
      await app.get(StorageService).put(`processed/${assetId}/master.m3u8`, Buffer.from('#EXTM3U\n'), 'application/vnd.apple.mpegurl');
      const res = await http.get(`/api/v1/episodes/${await episodeId(1)}/playback`).set(auth(await tokenFor(freshSub()))).expect(200);
      const path = new URL(res.body.manifestUrl).pathname; // /p/{token}/{asset}/master.m3u8

      const ok = await http.get(`/dev-media${path}`).expect(200);
      expect(ok.text).toBe('#EXTM3U\n');
      expect(ok.headers['content-type']).toContain('mpegurl');

      await http.get(`/dev-media${path.replace('/p/', '/p/x')}`).expect(403);
      await http.get(`/dev-media${path.replace(assetId, '00000000-0000-0000-0000-000000000000')}`).expect(403);
      await http.get(`/dev-media${path.replace('master.m3u8', '..%2F..%2Foriginals%2Fsource.mp4')}`).expect(404);
    });
  });

  describe('admin uploads', () => {
    const upload = (token: string, epId: string, body: object) =>
      http.post(`/api/v1/admin/episodes/${epId}/video-assets`).set(auth(token)).send(body);

    it('enforces media:write permission per role', async () => {
      const epId = await episodeId(4);
      const body = { contentType: 'video/mp4', sizeBytes: 20_000 };
      await upload(await tokenFor(freshSub()), epId, body).expect(403);
      await upload(await tokenFor('dev-ads'), epId, body).expect(403);
      await upload(await tokenFor('dev-support'), epId, body).expect(403);
      await upload(await tokenFor('dev-content'), epId, body).expect(201);
      await upload(await tokenFor('dev-owner'), epId, body).expect(201);
    });

    it('validates type and size', async () => {
      const owner = await tokenFor('dev-owner');
      const epId = await episodeId(4);
      await upload(owner, epId, { contentType: 'image/png', sizeBytes: 20_000 }).expect(400);
      await upload(owner, epId, { contentType: 'video/mp4', sizeBytes: 10 }).expect(400);
      await upload(owner, '00000000-0000-0000-0000-000000000000', { contentType: 'video/mp4', sizeBytes: 20_000 }).expect(404);
    });

    it('presigned upload → complete → queued; completion is single-use and size-checked', async () => {
      const owner = await tokenFor('dev-owner');
      const bytes = Buffer.alloc(20_000, 1);
      const created = await upload(owner, await episodeId(4), { contentType: 'video/mp4', sizeBytes: bytes.length }).expect(201);

      // Not uploaded yet
      await http.post(`/api/v1/admin/video-assets/${created.body.assetId}/complete`).set(auth(owner)).expect(400);

      const put = await fetch(created.body.uploadUrl, { method: 'PUT', headers: created.body.headers, body: bytes });
      expect(put.status).toBe(200);

      const done = await http.post(`/api/v1/admin/video-assets/${created.body.assetId}/complete`).set(auth(owner)).expect(201);
      expect(done.body.status).toBe('UPLOADED');
      await http.post(`/api/v1/admin/video-assets/${created.body.assetId}/complete`).set(auth(owner)).expect(409);

      const audit = await prisma.auditLog.findMany({ where: { entityId: created.body.assetId } });
      expect(audit.map((a) => a.action).sort()).toEqual(['video_asset.complete', 'video_asset.create']);

      await http.post(`/api/v1/admin/video-assets/${created.body.assetId}/retry`).set(auth(owner)).expect(409);
    });

    it('rejects an upload whose size differs from the declared size', async () => {
      const owner = await tokenFor('dev-owner');
      const created = await upload(owner, await episodeId(4), { contentType: 'video/mp4', sizeBytes: 30_000 }).expect(201);
      const put = await fetch(created.body.uploadUrl, { method: 'PUT', headers: created.body.headers, body: Buffer.alloc(20_000) });
      // The presigned URL signs Content-Length, so storage itself should refuse; if it does not, completion must.
      if (put.status === 200) {
        await http.post(`/api/v1/admin/video-assets/${created.body.assetId}/complete`).set(auth(owner)).expect(400);
      } else {
        expect(put.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
