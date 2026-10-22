import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, createTestApp, freshSub, prisma, tokenFor } from './helpers';

describe('Engagement (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dramaId: string;
  let ep1: string;

  const newUser = async () => {
    const token = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
    return { token, id: me.body.id as string };
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    dramaId = (await prisma.drama.findUniqueOrThrow({ where: { slug: 'my-boss-is-my-ex' } })).id;
    ep1 = (await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: 1 } } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('progress & history', () => {
    it('upserts progress and counts one view per user per episode', async () => {
      const u = await newUser();
      const before = await prisma.episode.findUniqueOrThrow({ where: { id: ep1 } });
      await http.put(`/api/v1/episodes/${ep1}/progress`).set(auth(u.token)).send({ positionSeconds: 10 }).expect(200);
      await http.put(`/api/v1/episodes/${ep1}/progress`).set(auth(u.token)).send({ positionSeconds: 30 }).expect(200);
      const after = await prisma.episode.findUniqueOrThrow({ where: { id: ep1 } });
      expect(Number(after.viewCount - before.viewCount)).toBe(1);

      const history = await http.get('/api/v1/me/history').set(auth(u.token)).expect(200);
      expect(history.body.items).toEqual([expect.objectContaining({ episodeId: ep1, positionSeconds: 30 })]);

      await http.delete(`/api/v1/me/history/${ep1}`).set(auth(u.token)).expect(204);
      expect((await http.get('/api/v1/me/history').set(auth(u.token))).body.items).toEqual([]);
    });

    it('clamps position to the episode duration and marks completion', async () => {
      const u = await newUser();
      const episode = await prisma.episode.findUniqueOrThrow({ where: { id: ep1 } });
      const res = await http.put(`/api/v1/episodes/${ep1}/progress`).set(auth(u.token)).send({ positionSeconds: 99_999 }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const done = await http.put(`/api/v1/episodes/${ep1}/progress`).set(auth(u.token)).send({ positionSeconds: 5000 }).expect(200);
      expect(done.body).toEqual({ positionSeconds: episode.durationSeconds, completed: true });
    });
  });

  describe('likes & favourites', () => {
    it('likes are idempotent and counters only move on real changes', async () => {
      const u = await newUser();
      const start = (await prisma.episode.findUniqueOrThrow({ where: { id: ep1 } })).likeCount;
      await http.put(`/api/v1/episodes/${ep1}/like`).set(auth(u.token)).expect(200);
      const second = await http.put(`/api/v1/episodes/${ep1}/like`).set(auth(u.token)).expect(200);
      expect(second.body).toEqual({ liked: true, likeCount: start + 1 });

      const list = await http.get(`/api/v1/dramas/${dramaId}/episodes`).query({ limit: 1 }).set(auth(u.token)).expect(200);
      expect(list.body.items[0].liked).toBe(true);

      await http.delete(`/api/v1/episodes/${ep1}/like`).set(auth(u.token)).expect(200);
      const gone = await http.delete(`/api/v1/episodes/${ep1}/like`).set(auth(u.token)).expect(200);
      expect(gone.body).toEqual({ liked: false, likeCount: start });
    });

    it('favourites show up in my list and on drama detail', async () => {
      const u = await newUser();
      await http.put(`/api/v1/dramas/${dramaId}/favorite`).set(auth(u.token)).expect(200);
      await http.put(`/api/v1/dramas/${dramaId}/favorite`).set(auth(u.token)).expect(200);
      const favs = await http.get('/api/v1/me/favorites').set(auth(u.token)).expect(200);
      expect(favs.body.items.map((d: { id: string }) => d.id)).toEqual([dramaId]);
      const detail = await http.get(`/api/v1/dramas/${dramaId}`).set(auth(u.token)).expect(200);
      expect(detail.body.isFavorite).toBe(true);
      await http.delete(`/api/v1/dramas/${dramaId}/favorite`).set(auth(u.token)).expect(200);
      expect((await http.get('/api/v1/me/favorites').set(auth(u.token))).body.items).toEqual([]);
    });
  });

  describe('comments, reports & blocks', () => {
    it('creates, lists (newest first) and deletes own comments', async () => {
      const u = await newUser();
      const a = await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: 'first!' }).expect(201);
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: '  second​  ' }).expect(201);
      const list = await http.get(`/api/v1/episodes/${ep1}/comments`).query({ limit: 2 }).set(auth(u.token)).expect(200);
      expect(list.body.items.map((c: { body: string }) => c.body)).toEqual(['second', 'first!']);
      expect(list.body.items[0].isMine).toBe(true);

      const other = await newUser();
      await http.delete(`/api/v1/comments/${a.body.id}`).set(auth(other.token)).expect(404);
      await http.delete(`/api/v1/comments/${a.body.id}`).set(auth(u.token)).expect(204);
    });

    it('rejects links, abuse and empty bodies', async () => {
      const u = await newUser();
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: 'free at https://x.example' }).expect(400);
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: 'chutiya' }).expect(400);
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: '   ' }).expect(400);
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(u.token)).send({ body: 'x'.repeat(501) }).expect(400);
    });

    it('auto-hides a comment after three distinct reports; duplicate reports do not count', async () => {
      const author = await newUser();
      const c = await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(author.token)).send({ body: 'spam spam' }).expect(201);
      await http.post(`/api/v1/comments/${c.body.id}/reports`).set(auth(author.token)).send({ reason: 'SPAM' }).expect(400);

      const r1 = await newUser();
      await http.post(`/api/v1/comments/${c.body.id}/reports`).set(auth(r1.token)).send({ reason: 'SPAM' }).expect(201);
      await http.post(`/api/v1/comments/${c.body.id}/reports`).set(auth(r1.token)).send({ reason: 'SPAM' }).expect(201);
      expect((await prisma.comment.findUniqueOrThrow({ where: { id: c.body.id } })).status).toBe('VISIBLE');

      for (const r of [await newUser(), await newUser()]) {
        await http.post(`/api/v1/comments/${c.body.id}/reports`).set(auth(r.token)).send({ reason: 'ABUSE' }).expect(201);
      }
      const hidden = await prisma.comment.findUniqueOrThrow({ where: { id: c.body.id } });
      expect(hidden.status).toBe('HIDDEN');
      expect(hidden.reportCount).toBe(3);
      const list = await http.get(`/api/v1/episodes/${ep1}/comments`).query({ limit: 50 }).expect(200);
      expect(list.body.items.some((x: { id: string }) => x.id === c.body.id)).toBe(false);
    });

    it('blocking a user hides their comments from me only', async () => {
      const troll = await newUser();
      const me = await newUser();
      const c = await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(troll.token)).send({ body: 'hello from troll' }).expect(201);
      await http.put(`/api/v1/users/${troll.id}/block`).set(auth(me.token)).expect(200);
      await http.put(`/api/v1/users/${me.id}/block`).set(auth(me.token)).expect(400);

      const mine = await http.get(`/api/v1/episodes/${ep1}/comments`).query({ limit: 50 }).set(auth(me.token)).expect(200);
      expect(mine.body.items.some((x: { id: string }) => x.id === c.body.id)).toBe(false);
      const anon = await http.get(`/api/v1/episodes/${ep1}/comments`).query({ limit: 50 }).expect(200);
      expect(anon.body.items.some((x: { id: string }) => x.id === c.body.id)).toBe(true);

      await http.delete(`/api/v1/users/${troll.id}/block`).set(auth(me.token)).expect(200);
    });

    it('rate-limits comments per user, not per IP', async () => {
      const spammer = await newUser();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(spammer.token)).send({ body: `msg ${i}` })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
      expect(statuses[10]).toBe(429);

      // Same IP, different user: unaffected.
      const neighbour = await newUser();
      await http.post(`/api/v1/episodes/${ep1}/comments`).set(auth(neighbour.token)).send({ body: 'hi' }).expect(201);
    });

    it('paginates comments with a stable cursor', async () => {
      const u = await newUser();
      const ep2 = (await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: 2 } } })).id;
      for (let i = 0; i < 5; i++) {
        await http.post(`/api/v1/episodes/${ep2}/comments`).set(auth(u.token)).send({ body: `c${i}` }).expect(201);
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: request.Response = await http.get(`/api/v1/episodes/${ep2}/comments`).query({ limit: 2, ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((x: { body: string }) => x.body));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen.filter((b) => /^c\d$/.test(b)).slice(0, 5)).toEqual(['c4', 'c3', 'c2', 'c1', 'c0']);
    });
  });
});
