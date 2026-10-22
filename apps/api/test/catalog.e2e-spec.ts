import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, createTestApp, freshSub, prisma, tokenFor } from './helpers';

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dramaId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    dramaId = (await prisma.drama.findUniqueOrThrow({ where: { slug: 'billionaires-secret-bride' } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lists categories localised by Accept-Language', async () => {
    const hi = await http.get('/api/v1/categories').set('Accept-Language', 'hi-IN').expect(200);
    expect(hi.body.find((c: { slug: string }) => c.slug === 'romance').name).toBe('रोमांस');
    const en = await http.get('/api/v1/categories').expect(200);
    expect(en.body.find((c: { slug: string }) => c.slug === 'romance').name).toBe('Romance');
  });

  it('paginates dramas without duplicates or gaps', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await http
        .get('/api/v1/dramas')
        .query({ limit: 4, sort: 'new', ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...res.body.items.map((d: { id: string }) => d.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  it('filters by category and translates titles', async () => {
    const res = await http.get('/api/v1/dramas').query({ category: 'fantasy' }).set('Accept-Language', 'hi').expect(200);
    expect(res.body.items.map((d: { title: string }) => d.title)).toEqual(['देवगढ़ का आखिरी राजा']);
  });

  it('rejects out-of-range limits, unknown params and tampered cursors', async () => {
    await http.get('/api/v1/dramas').query({ limit: 999 }).expect(400);
    await http.get('/api/v1/dramas').query({ foo: 'bar' }).expect(400);
    await http.get('/api/v1/dramas').query({ cursor: 'garbage' }).expect(400);
    await http.get('/api/v1/dramas/search').query({ q: 'a' }).expect(400);
  });

  it('searches English and Hindi titles', async () => {
    const en = await http.get('/api/v1/dramas/search').query({ q: 'boss' }).expect(200);
    expect(en.body.items[0].slug).toBe('my-boss-is-my-ex');
    const hi = await http.get('/api/v1/dramas/search').query({ q: 'बनारस' }).expect(200);
    expect(hi.body.items[0].slug).toBe('midnight-at-banaras-ghat');
  });

  it('hides unpublished dramas', async () => {
    const draft = await prisma.drama.create({
      data: { slug: `draft-${Date.now()}`, title: 'Draft', primaryLanguageCode: 'en', status: 'DRAFT' },
    });
    await http.get(`/api/v1/dramas/${draft.id}`).expect(404);
    const list = await http.get('/api/v1/dramas').query({ limit: 50 }).expect(200);
    expect(list.body.items.some((d: { id: string }) => d.id === draft.id)).toBe(false);
    await prisma.drama.delete({ where: { id: draft.id } });
  });

  it('returns drama detail with cast, categories and translations', async () => {
    const res = await http.get(`/api/v1/dramas/${dramaId}`).set('Accept-Language', 'hi').expect(200);
    expect(res.body.title).toBe('अरबपति की गुप्त दुल्हन');
    expect(res.body.cast.length).toBeGreaterThan(0);
    expect(res.body.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(['family', 'romance']);
    expect(res.body.isFavorite).toBe(false);
  });

  describe('episode locking', () => {
    const lockedNumbers = (items: { number: number; locked: boolean }[]) => items.filter((e) => e.locked).map((e) => e.number);

    it('anonymous users see episodes after the free preview as locked, with a price', async () => {
      const res = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 8 }).expect(200);
      expect(lockedNumbers(res.body.items)).toEqual([6, 7, 8]);
      expect(res.body.items[5].unlockCoins).toBe(30);
      expect(res.body.items[0].unlockCoins).toBeNull();
    });

    it('keyset pagination continues by episode number', async () => {
      const first = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 15 }).expect(200);
      const second = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 15, cursor: first.body.nextCursor }).expect(200);
      expect(second.body.items.map((e: { number: number }) => e.number)).toEqual([16, 17, 18, 19, 20]);
      expect(second.body.nextCursor).toBeNull();
    });

    it('an unlock row unlocks exactly that episode for that user only', async () => {
      const token = await tokenFor(freshSub());
      const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
      const ep7 = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: 7 } } });
      await prisma.episodeUnlock.create({ data: { userId: me.body.id, episodeId: ep7.id, method: 'ADMIN_GRANT' } });

      const mine = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 8 }).set(auth(token)).expect(200);
      expect(lockedNumbers(mine.body.items)).toEqual([6, 8]);

      const other = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 8 }).set(auth(await tokenFor(freshSub()))).expect(200);
      expect(lockedNumbers(other.body.items)).toEqual([6, 7, 8]);
    });

    it('expired unlocks do not count', async () => {
      const token = await tokenFor(freshSub());
      const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
      const ep6 = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: 6 } } });
      await prisma.episodeUnlock.create({
        data: { userId: me.body.id, episodeId: ep6.id, method: 'PROMO', expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 6 }).set(auth(token)).expect(200);
      expect(lockedNumbers(res.body.items)).toEqual([6]);
    });

    it('an active subscription unlocks everything; an ended one does not', async () => {
      const token = await tokenFor(freshSub());
      const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
      const product = await prisma.product.findUniqueOrThrow({ where: { sku: 'vip_monthly' } });
      const sub = await prisma.subscription.create({
        data: {
          userId: me.body.id,
          productId: product.id,
          provider: 'GOOGLE_PLAY',
          providerSubscriptionId: `test-${me.body.id}`,
          status: 'ACTIVE',
          currentPeriodStart: new Date(Date.now() - 86_400_000),
          currentPeriodEnd: new Date(Date.now() + 86_400_000),
        },
      });
      const active = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 20 }).set(auth(token)).expect(200);
      expect(lockedNumbers(active.body.items)).toEqual([]);

      await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
      const ended = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 8 }).set(auth(token)).expect(200);
      expect(lockedNumbers(ended.body.items)).toEqual([6, 7, 8]);
    });
  });

  it('home returns all rails and continue-watching for signed-in users', async () => {
    const token = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
    const ep2 = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: 2 } } });
    await prisma.watchHistory.create({ data: { userId: me.body.id, episodeId: ep2.id, dramaId, positionSeconds: 42 } });

    const res = await http.get('/api/v1/home').set(auth(token)).expect(200);
    expect(res.body.featured.length).toBeGreaterThan(0);
    expect(res.body.trending).toHaveLength(6);
    expect(res.body.continueWatching).toEqual([
      expect.objectContaining({ episodeId: ep2.id, episodeNumber: 2, positionSeconds: 42 }),
    ]);

    const anon = await http.get('/api/v1/home').expect(200);
    expect(anon.body.continueWatching).toEqual([]);
  });

  it('feed returns one entry per drama starting at episode 1', async () => {
    const res = await http.get('/api/v1/feed').query({ limit: 10 }).expect(200);
    expect(res.body.items).toHaveLength(6);
    for (const item of res.body.items) {
      expect(item.episode.number).toBe(1);
      expect(item.episode.locked).toBe(false);
    }
  });
});
