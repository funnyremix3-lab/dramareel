import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StorageService } from '../src/media/storage.service';
import { auth, createTestApp, freshSub, ledgerMatchesBalance, prisma, tokenFor } from './helpers';

type Role = 'owner' | 'content' | 'ads' | 'support' | 'viewer';

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const tokens = {} as Record<Role, string>;
  const as = (role: Role) => auth(tokens[role]);
  const stamp = Date.now();

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    await app.get(StorageService).ensureBucket();
    for (const r of ['owner', 'content', 'ads', 'support', 'viewer'] as Role[]) tokens[r] = await tokenFor(`dev-${r}`);
    // Make sure every dev account exists before permission checks.
    for (const r of Object.keys(tokens) as Role[]) await http.get('/api/v1/me').set(as(r)).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('permission matrix', () => {
    const matrix: { route: [string, string]; allowed: Role[]; body?: object }[] = [
      { route: ['get', '/api/v1/admin/dramas'], allowed: ['owner', 'content'] },
      { route: ['get', '/api/v1/admin/users'], allowed: ['owner', 'support'] },
      { route: ['get', '/api/v1/admin/moderation/comments'], allowed: ['owner', 'content', 'support'] },
      { route: ['get', '/api/v1/admin/ads/campaigns'], allowed: ['owner', 'ads'] },
      { route: ['get', '/api/v1/admin/ads/placements'], allowed: ['owner', 'ads'] },
      { route: ['get', '/api/v1/admin/overview'], allowed: ['owner', 'content', 'ads'] },
      { route: ['get', '/api/v1/admin/audit-logs'], allowed: ['owner', 'support'] },
      { route: ['get', '/api/v1/admin/roles'], allowed: ['owner'] },
      { route: ['get', '/api/v1/admin/products'], allowed: ['owner', 'content'] },
      { route: ['get', '/api/v1/admin/notifications'], allowed: ['owner', 'content'] },
      { route: ['get', '/api/v1/admin/video-assets'], allowed: ['owner', 'content'] },
    ];

    it.each(matrix)('$route.1 is allowed only for $allowed', async ({ route: [method, path], allowed }) => {
      for (const role of ['owner', 'content', 'ads', 'support', 'viewer'] as Role[]) {
        const res = await (http as unknown as Record<string, (p: string) => request.Test>)[method](path).set(as(role));
        expect({ role, status: res.status < 300 ? 'ok' : res.status }).toEqual({ role, status: allowed.includes(role) ? 'ok' : 403 });
      }
    });

    it('anonymous requests get 401', async () => {
      await http.get('/api/v1/admin/dramas').expect(401);
    });
  });

  describe('catalog workflow', () => {
    it('create → episode → publish requires a READY video → drama becomes public', async () => {
      const slug = `e2e-drama-${stamp}`;
      const drama = await http
        .post('/api/v1/admin/dramas')
        .set(as('content'))
        .send({ slug, title: 'E2E Drama', primaryLanguageCode: 'en', categorySlugs: ['romance'], cast: [{ name: 'A', role: 'B' }], freeEpisodeCount: 1 })
        .expect(201);
      expect(drama.body.status).toBe('DRAFT');
      await http.post('/api/v1/admin/dramas').set(as('content')).send({ slug, title: 'dup', primaryLanguageCode: 'en' }).expect(409);
      await http.post('/api/v1/admin/dramas').set(as('content')).send({ slug: 'Bad Slug!', title: 'x', primaryLanguageCode: 'en' }).expect(400);

      const ep = await http.post(`/api/v1/admin/dramas/${drama.body.id}/episodes`).set(as('content')).send({ title: 'Pilot' }).expect(201);
      expect(ep.body).toMatchObject({ number: 1, access: 'FREE', status: 'DRAFT' });

      // Cannot publish without video, nor publish the drama without a published episode.
      const noVideo = await http.post(`/api/v1/admin/episodes/${ep.body.id}/publish`).set(as('content')).expect(409);
      expect(noVideo.body.error.code).toBe('ASSET_NOT_READY');
      await http.post(`/api/v1/admin/dramas/${drama.body.id}/publish`).set(as('content')).expect(409);

      const asset = await prisma.videoAsset.create({ data: { episodeId: ep.body.id, originalKey: `originals/e2e-${stamp}/s.mp4`, status: 'READY', hlsMasterKey: 'x' } });
      await prisma.episode.update({ where: { id: ep.body.id }, data: { currentVideoAssetId: asset.id } });
      await http.post(`/api/v1/admin/episodes/${ep.body.id}/publish`).set(as('content')).expect(200);
      await http.post(`/api/v1/admin/dramas/${drama.body.id}/publish`).set(as('content')).expect(200);

      const pub = await http.get(`/api/v1/dramas/${drama.body.id}`).expect(200);
      expect(pub.body).toMatchObject({ title: 'E2E Drama', episodeCount: 1 });
      await http.put(`/api/v1/admin/dramas/${drama.body.id}/translations/hi`).set(as('content')).send({ title: 'ई2ई ड्रामा' }).expect(200);
      expect((await http.get(`/api/v1/dramas/${drama.body.id}`).set('Accept-Language', 'hi')).body.title).toBe('ई2ई ड्रामा');

      // Published content cannot be deleted; archive hides it.
      await http.delete(`/api/v1/admin/dramas/${drama.body.id}`).set(as('owner')).expect(409);
      await http.post(`/api/v1/admin/dramas/${drama.body.id}/archive`).set(as('content')).expect(200);
      await http.get(`/api/v1/dramas/${drama.body.id}`).expect(404);

      const audit = await prisma.auditLog.findMany({ where: { entityId: drama.body.id }, orderBy: { createdAt: 'asc' } });
      expect(audit.map((a) => a.action)).toEqual(['drama.create', 'drama.published', 'drama.translation', 'drama.archived']);
    });

    it('pricing changes need monetization rights', async () => {
      const drama = await prisma.drama.findUniqueOrThrow({ where: { slug: 'twin-sisters-revenge' } });
      const ep = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId: drama.id, number: 14 } } });
      await prisma.role.create({ data: { key: `EDITOR_${stamp}`, name: 'Editor', permissions: ['dramas:read', 'dramas:write'] } }).then((role) =>
        prisma.user.findUniqueOrThrow({ where: { authProviderId: 'dev-support' } }).then(() => role),
      );
      const editorSub = freshSub();
      const editorToken = await tokenFor(editorSub);
      const me = await http.get('/api/v1/me').set(auth(editorToken)).expect(200);
      await http.put(`/api/v1/admin/users/${me.body.id}/roles`).set(as('owner')).send({ roles: [`EDITOR_${stamp}`] }).expect(200);

      await http.patch(`/api/v1/admin/episodes/${ep.id}`).set(auth(editorToken)).send({ title: 'Renamed' }).expect(200);
      await http.patch(`/api/v1/admin/episodes/${ep.id}`).set(auth(editorToken)).send({ unlockCoins: 1 }).expect(403);
      await http.patch(`/api/v1/admin/episodes/${ep.id}`).set(as('content')).send({ unlockCoins: 45 }).expect(200);
      await http.patch(`/api/v1/admin/episodes/${ep.id}`).set(as('content')).send({ unlockCoins: null, title: 'Episode 14' }).expect(200);
    });

    it('issues poster upload URLs bound to the drama', async () => {
      const drama = await prisma.drama.findUniqueOrThrow({ where: { slug: 'my-boss-is-my-ex' } });
      const up = await http.post(`/api/v1/admin/dramas/${drama.id}/poster-upload-url`).set(as('content')).send({ contentType: 'image/webp', sizeBytes: 1000 }).expect(201);
      expect(up.body.key).toMatch(new RegExp(`^public/posters/${drama.id}-[0-9a-f]{12}\\.webp$`));
      await http.patch(`/api/v1/admin/dramas/${drama.id}`).set(as('content')).send({ posterKey: 'originals/x/source.mp4' }).expect(400);
      await http.post(`/api/v1/admin/dramas/${drama.id}/poster-upload-url`).set(as('content')).send({ contentType: 'image/gif', sizeBytes: 1000 }).expect(400);
    });
  });

  describe('users', () => {
    it('support can suspend and reinstate; suspended users are locked out', async () => {
      const sub = freshSub();
      const t = await tokenFor(sub);
      const me = await http.get('/api/v1/me').set(auth(t)).expect(200);
      await http.post(`/api/v1/admin/users/${me.body.id}/suspend`).set(as('support')).expect(200);
      await http.get('/api/v1/me').set(auth(t)).expect(403);
      await http.post(`/api/v1/admin/users/${me.body.id}/reinstate`).set(as('support')).expect(200);
      await http.get('/api/v1/me').set(auth(t)).expect(200);
      const owner = await prisma.user.findUniqueOrThrow({ where: { authProviderId: 'dev-owner' } });
      await http.post(`/api/v1/admin/users/${owner.id}/suspend`).set(as('support')).expect(403);
    });

    it('only the owner adjusts wallets; adjustments are ledgered and audited', async () => {
      const t = await tokenFor(freshSub());
      const me = await http.get('/api/v1/me').set(auth(t)).expect(200);
      await http.post(`/api/v1/admin/users/${me.body.id}/wallet-adjustments`).set(as('support')).send({ amount: 50, note: 'goodwill' }).expect(403);
      const res = await http.post(`/api/v1/admin/users/${me.body.id}/wallet-adjustments`).set(as('owner')).send({ amount: 50, note: 'goodwill' }).expect(201);
      expect(res.body.balance).toBe(50);
      await http.post(`/api/v1/admin/users/${me.body.id}/wallet-adjustments`).set(as('owner')).send({ amount: -80, note: 'too much' }).expect(409);
      expect(await ledgerMatchesBalance(me.body.id)).toBe(true);
      const detail = await http.get(`/api/v1/admin/users/${me.body.id}`).set(as('support')).expect(200);
      expect(detail.body.transactions[0]).toMatchObject({ type: 'ADMIN_ADJUSTMENT', amount: 50 });
    });

    it('cannot remove the last owner or create roles with unknown permissions', async () => {
      const owner = await prisma.user.findUniqueOrThrow({ where: { authProviderId: 'dev-owner' } });
      await http.put(`/api/v1/admin/users/${owner.id}/roles`).set(as('owner')).send({ roles: ['SUPPORT_AGENT'] }).expect(409);
      await http.put('/api/v1/admin/roles').set(as('owner')).send({ key: 'HACKER', name: 'x', permissions: ['everything'] }).expect(400);
      await http.put('/api/v1/admin/roles').set(as('owner')).send({ key: 'OWNER', name: 'Owner copy', permissions: [] }).expect(409);
    });
  });

  describe('moderation', () => {
    it('hiding a comment updates counts and closes open reports', async () => {
      const drama = await prisma.drama.findUniqueOrThrow({ where: { slug: 'midnight-at-banaras-ghat' } });
      const ep = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId: drama.id, number: 1 } } });
      const author = await tokenFor(freshSub());
      const c = await http.post(`/api/v1/episodes/${ep.id}/comments`).set(auth(author)).send({ body: 'questionable' }).expect(201);
      await http.post(`/api/v1/comments/${c.body.id}/reports`).set(auth(await tokenFor(freshSub()))).send({ reason: 'ABUSE' }).expect(201);
      const before = (await prisma.episode.findUniqueOrThrow({ where: { id: ep.id } })).commentCount;

      const queue = await http.get('/api/v1/admin/moderation/comments').query({ reported: 'true', pageSize: 100 }).set(as('support')).expect(200);
      expect(queue.body.items.some((x: { id: string }) => x.id === c.body.id)).toBe(true);

      await http.post(`/api/v1/admin/comments/${c.body.id}/hide`).set(as('support')).expect(200);
      expect((await prisma.episode.findUniqueOrThrow({ where: { id: ep.id } })).commentCount).toBe(before - 1);
      expect(await prisma.commentReport.count({ where: { commentId: c.body.id, status: 'OPEN' } })).toBe(0);
      await http.post(`/api/v1/admin/comments/${c.body.id}/restore`).set(as('support')).expect(200);
      expect((await prisma.episode.findUniqueOrThrow({ where: { id: ep.id } })).commentCount).toBe(before);
    });
  });

  describe('direct campaigns', () => {
    it('draft → creative upload → review → activate → serves → reports', async () => {
      const start = new Date(Date.now() - 3600_000).toISOString();
      const end = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const body = { name: `E2E campaign ${stamp}`, advertiserName: 'Test Advertiser', startAt: start, endAt: end, pricingModel: 'CPM', ratePaise: 20000, priority: 99, placementKeys: ['home_sponsored_card'], targeting: { languages: ['en'] } };
      await http.post('/api/v1/admin/ads/campaigns').set(as('content')).send(body).expect(403);
      await http.post('/api/v1/admin/ads/campaigns').set(as('ads')).send({ ...body, endAt: start }).expect(400);
      await http.post('/api/v1/admin/ads/campaigns').set(as('ads')).send({ ...body, placementKeys: ['between_episodes_interstitial'] }).expect(400);
      const c = await http.post('/api/v1/admin/ads/campaigns').set(as('ads')).send(body).expect(201);

      await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/activate`).set(as('ads')).expect(409); // no approved creative

      const up = await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/creative-upload-url`).set(as('ads')).send({ contentType: 'image/png', sizeBytes: 68 }).expect(201);
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b4944415478da6360000200000500017a5ea72a0000000049454e44ae426082', 'hex');
      const put = await fetch(up.body.uploadUrl, { method: 'PUT', headers: up.body.headers, body: png.subarray(0, 68) });
      expect(put.status).toBe(200);
      await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/creatives`).set(as('ads')).send({ type: 'IMAGE', mediaKey: up.body.key, destinationUrl: 'http://insecure.example' }).expect(400);
      const creative = await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/creatives`).set(as('ads')).send({ type: 'IMAGE', mediaKey: up.body.key, headline: 'Hello', destinationUrl: 'https://advertiser.example/offer' }).expect(201);
      // The campaign creator cannot approve their own creative; the owner can.
      await http.post(`/api/v1/admin/ads/creatives/${creative.body.id}/review`).set(as('ads')).send({ decision: 'APPROVED' }).expect(403);
      await http.post(`/api/v1/admin/ads/creatives/${creative.body.id}/review`).set(as('owner')).send({ decision: 'APPROVED' }).expect(200);
      await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/activate`).set(as('ads')).expect(200);

      const served = await http.get('/api/v1/ads/serve').query({ placement: 'home_sponsored_card', platform: 'ANDROID' }).set('Accept-Language', 'en').expect(200);
      expect(served.body.creative.headline).toBe('Hello');
      await http.post('/api/v1/ads/impressions').send({ serveToken: served.body.serveToken }).expect(200);

      const today = new Date().toISOString().slice(0, 10);
      const report = await http.get(`/api/v1/admin/ads/campaigns/${c.body.id}/report`).query({ from: today, to: today }).set(as('ads')).expect(200);
      expect(report.body.totals).toMatchObject({ impressions: 1, clicks: 0, spendPaise: 20 });
      expect(report.body.source).toBe('DIRECT');

      await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/complete`).set(as('ads')).expect(200);
      await http.post(`/api/v1/admin/ads/campaigns/${c.body.id}/activate`).set(as('ads')).expect(409); // completed is final
    });

    it('AdMob configuration validates ad unit ids and keeps interstitial spacing', async () => {
      await http
        .put('/api/v1/admin/ads/placements/between_episodes_interstitial/configurations')
        .set(as('ads'))
        .send({ platform: 'ANDROID', source: 'ADMOB', adUnitId: 'not-an-id' })
        .expect(400);
      await http
        .put('/api/v1/admin/ads/placements/between_episodes_interstitial/configurations')
        .set(as('ads'))
        .send({ platform: 'ANDROID', source: 'ADMOB', minEpisodesBetween: 1 })
        .expect(400);
      const ok = await http
        .put('/api/v1/admin/ads/placements/between_episodes_interstitial/configurations')
        .set(as('ads'))
        .send({ platform: 'ANDROID', source: 'ADMOB', adUnitId: 'ca-app-pub-3940256099942544/1033173712', minEpisodesBetween: 5 })
        .expect(200);
      expect(ok.body.minEpisodesBetween).toBe(5);
      await http.put('/api/v1/admin/ads/placements/between_episodes_interstitial/configurations').set(as('ads')).send({ platform: 'ANDROID', source: 'ADMOB', minEpisodesBetween: 4 }).expect(200);
    });

    it('imports network revenue separately from direct revenue', async () => {
      await http
        .post('/api/v1/admin/ads/network-reports/import')
        .set(as('ads'))
        .send({ rows: [{ date: '2026-10-20', adUnitId: 'ca-app-pub-3940256099942544/5224354917', impressions: 100, clicks: 2, estimatedEarningsMicros: 1_500_000, currency: 'INR' }] })
        .expect(200);
      const res = await http.get('/api/v1/admin/ads/network-reports').query({ from: '2026-10-20', to: '2026-10-20' }).set(as('ads')).expect(200);
      expect(res.body).toMatchObject({ source: 'ADMOB', rows: [expect.objectContaining({ impressions: 100, estimatedEarningsMicros: 1_500_000 })] });
    });
  });

  describe('operations', () => {
    it('overview and CSV exports', async () => {
      const o = await http.get('/api/v1/admin/overview').set(as('owner')).expect(200);
      expect(o.body.users.total).toBeGreaterThan(0);
      expect(o.body.topDramas.length).toBeGreaterThan(0);

      const today = new Date().toISOString().slice(0, 10);
      const csv = await http.get('/api/v1/admin/reports/wallet.csv').query({ from: today, to: today }).set(as('owner')).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.startsWith('﻿day,type,transactions,coins')).toBe(true);
      await http.get('/api/v1/admin/reports/secrets.csv').query({ from: today, to: today }).set(as('owner')).expect(404);
    });

    it('notification lifecycle', async () => {
      await http.post('/api/v1/admin/notifications').set(as('content')).send({ title: { en: 'x' }, body: { en: 'y' }, audience: { all: true, languages: ['hi'] } }).expect(400);
      const n = await http
        .post('/api/v1/admin/notifications')
        .set(as('content'))
        .send({ title: { en: 'New episode!', hi: 'नया एपिसोड!' }, body: { en: 'Watch now', hi: 'अभी देखें' }, deepLink: 'reeldrama://drama/abc', audience: { languages: ['hi'] } })
        .expect(201);
      const scheduled = await http.post(`/api/v1/admin/notifications/${n.body.id}/schedule`).set(as('content')).send({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() }).expect(200);
      expect(scheduled.body.status).toBe('SCHEDULED');
      await http.post(`/api/v1/admin/notifications/${n.body.id}/cancel`).set(as('content')).expect(200);
      await http.post(`/api/v1/admin/notifications/${n.body.id}/schedule`).set(as('content')).send({}).expect(409);
    });

    it('audit log is searchable', async () => {
      const res = await http.get('/api/v1/admin/audit-logs').query({ entityType: 'ad_campaign', pageSize: 5 }).set(as('support')).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0]).toHaveProperty('action');
    });
  });
});
