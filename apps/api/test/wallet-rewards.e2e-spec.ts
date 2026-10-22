import { generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SSV_KEY_SOURCE } from '../src/ads/admob-ssv.verifier';
import { auth, createTestApp, freshSub, grantCoins, ledgerMatchesBalance, prisma, tokenFor } from './helpers';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const KEY_ID = '1234';

describe('Wallet, unlocks and rewarded ads (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dramaId: string;
  const ep = async (n: number) => (await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId, number: n } } })).id;

  const newUser = async () => {
    const token = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
    return { token, id: me.body.id as string };
  };

  /** Signs an SSV callback with our test key, exactly as AdMob would. */
  const ssvQuery = (p: { customData: string; userId: string; transactionId: string; adUnit?: string; timestamp?: number }) => {
    const content = new URLSearchParams({
      ad_network: '5450213213286189855',
      ad_unit: p.adUnit ?? '5224354917',
      custom_data: p.customData,
      reward_amount: '1',
      reward_item: 'coins',
      timestamp: String(p.timestamp ?? Date.now()),
      transaction_id: p.transactionId,
      user_id: p.userId,
    }).toString();
    return `${content}&signature=${sign('sha256', Buffer.from(content), privateKey).toString('base64url')}&key_id=${KEY_ID}`;
  };

  beforeAll(async () => {
    app = await createTestApp((b) =>
      b.overrideProvider(SSV_KEY_SOURCE).useValue({ getKey: async (id: string) => (id === KEY_ID ? (publicKey as KeyObject) : undefined) }),
    );
    http = request(app.getHttpServer());
    dramaId = (await prisma.drama.findUniqueOrThrow({ where: { slug: 'twin-sisters-revenge' } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('coin unlocks', () => {
    it('refuses with INSUFFICIENT_COINS and charges nothing', async () => {
      const u = await newUser();
      const res = await http.post(`/api/v1/episodes/${await ep(6)}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(409);
      expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_COINS', details: { balance: 0, required: 30 } });
      expect(await prisma.episodeUnlock.count({ where: { userId: u.id } })).toBe(0);
    });

    it('charges once, unlocks, and is idempotent on repeat', async () => {
      const u = await newUser();
      await grantCoins(u.id, 100);
      const first = await http.post(`/api/v1/episodes/${await ep(6)}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(200);
      expect(first.body).toMatchObject({ unlocked: true, charged: 30, balance: 70 });
      const again = await http.post(`/api/v1/episodes/${await ep(6)}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(200);
      expect(again.body).toMatchObject({ unlocked: true, charged: 0, balance: 70 });

      await http.get(`/api/v1/episodes/${await ep(6)}/playback`).set(auth(u.token)).expect(409); // unlocked, just no video in test DB
      expect(await ledgerMatchesBalance(u.id)).toBe(true);
    });

    it('does not charge for free episodes', async () => {
      const u = await newUser();
      const res = await http.post(`/api/v1/episodes/${await ep(1)}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(200);
      expect(res.body).toMatchObject({ unlocked: true, charged: 0, reason: 'FREE' });
    });

    it('concurrent unlocks of the SAME episode charge exactly once', async () => {
      const u = await newUser();
      await grantCoins(u.id, 100);
      const id = await ep(7);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => http.post(`/api/v1/episodes/${id}/unlock`).set(auth(u.token)).send({ method: 'COINS' })),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.reduce((s, r) => s + r.body.charged, 0)).toBe(30);
      expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(70);
      expect(await ledgerMatchesBalance(u.id)).toBe(true);
    });

    it('concurrent unlocks of DIFFERENT episodes never overspend', async () => {
      const u = await newUser();
      await grantCoins(u.id, 60); // enough for exactly two
      const ids = await Promise.all([8, 9, 10, 11, 12].map(ep));
      const results = await Promise.all(ids.map((id) => http.post(`/api/v1/episodes/${id}/unlock`).set(auth(u.token)).send({ method: 'COINS' })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
      expect(await prisma.episodeUnlock.count({ where: { userId: u.id } })).toBe(2);
      expect(await ledgerMatchesBalance(u.id)).toBe(true);
    });

    it('lists wallet history newest first', async () => {
      const u = await newUser();
      await grantCoins(u.id, 50);
      await http.post(`/api/v1/episodes/${await ep(6)}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(200);
      const res = await http.get('/api/v1/wallet/transactions').set(auth(u.token)).expect(200);
      expect(res.body.items.map((t: { type: string; amount: number }) => [t.type, t.amount])).toEqual([
        ['EPISODE_UNLOCK', -30],
        ['BONUS', 50],
      ]);
    });

    it('the ledger rejects UPDATE and DELETE at the database level', async () => {
      const u = await newUser();
      await grantCoins(u.id, 5);
      await expect(prisma.walletTransaction.updateMany({ where: { userId: u.id }, data: { amount: 9999 } })).rejects.toThrow(/append-only/);
      await expect(prisma.walletTransaction.deleteMany({ where: { userId: u.id } })).rejects.toThrow(/append-only/);
    });
  });

  describe('rewarded ads (SSV)', () => {
    const claim = (token: string, body: object) => http.post('/api/v1/rewards/claims').set(auth(token)).send({ platform: 'ANDROID', ...body });

    it('grants coins only after a valid SSV callback, exactly once', async () => {
      const u = await newUser();
      const c = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      expect(c.body.adUnitId).toBe('ca-app-pub-3940256099942544/5224354917');
      expect(c.body.ssv).toEqual({ userId: u.id, customData: expect.stringMatching(/^[0-9a-f]{32}$/) });

      // The client saying "I watched it" changes nothing.
      expect((await http.get(`/api/v1/rewards/claims/${c.body.claimId}`).set(auth(u.token))).body.status).toBe('PENDING');

      const q = ssvQuery({ customData: c.body.ssv.customData, userId: u.id, transactionId: `tx-${c.body.claimId}` });
      expect((await http.get(`/api/v1/ads/admob/ssv?${q}`).expect(200)).text).toBe('GRANTED');
      expect((await http.get(`/api/v1/ads/admob/ssv?${q}`).expect(200)).text).toBe('DUPLICATE');

      const status = await http.get(`/api/v1/rewards/claims/${c.body.claimId}`).set(auth(u.token)).expect(200);
      expect(status.body).toMatchObject({ status: 'GRANTED', coins: 10, balance: 10 });
      expect(await ledgerMatchesBalance(u.id)).toBe(true);
    });

    it('unlocks the episode for an EPISODE_UNLOCK claim', async () => {
      const u = await newUser();
      const id = await ep(13);
      const c = await claim(u.token, { placementKey: 'episode_unlock_rewarded', purpose: 'EPISODE_UNLOCK', episodeId: id }).expect(201);
      await http.get(`/api/v1/ads/admob/ssv?${ssvQuery({ customData: c.body.ssv.customData, userId: u.id, transactionId: `tx-${c.body.claimId}` })}`).expect(200);
      const unlock = await prisma.episodeUnlock.findUniqueOrThrow({ where: { userId_episodeId: { userId: u.id, episodeId: id } } });
      expect(unlock).toMatchObject({ method: 'AD_REWARD', rewardClaimId: c.body.claimId });
      // Already unlocked → not eligible for another ad unlock.
      await claim(u.token, { placementKey: 'episode_unlock_rewarded', purpose: 'EPISODE_UNLOCK', episodeId: id }).expect(422);
    });

    it('rejects forged, mismatched and replayed callbacks', async () => {
      const u = await newUser();
      const c = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      const good = ssvQuery({ customData: c.body.ssv.customData, userId: u.id, transactionId: `tx-a-${c.body.claimId}` });

      await http.get(`/api/v1/ads/admob/ssv?${good.replace(`user_id=${u.id}`, 'user_id=someone')}`).expect(400); // tampered
      await http.get('/api/v1/ads/admob/ssv?user_id=x&custom_data=y').expect(400); // unsigned

      // Signed, but for another user → refused and the claim is burnt.
      const wrongUser = ssvQuery({ customData: c.body.ssv.customData, userId: 'another-user', transactionId: `tx-b-${c.body.claimId}` });
      expect((await http.get(`/api/v1/ads/admob/ssv?${wrongUser}`).expect(200)).text).toBe('REJECTED');
      expect((await http.get(`/api/v1/ads/admob/ssv?${good}`).expect(200)).text).toBe('DUPLICATE');
      expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
    });

    it('refuses wrong ad units and expired claims', async () => {
      const u = await newUser();
      const c1 = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      const wrongUnit = ssvQuery({ customData: c1.body.ssv.customData, userId: u.id, transactionId: `tx-c-${c1.body.claimId}`, adUnit: '1033173712' });
      expect((await http.get(`/api/v1/ads/admob/ssv?${wrongUnit}`)).text).toBe('REJECTED');

      const c2 = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      await prisma.rewardClaim.update({ where: { id: c2.body.claimId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const late = ssvQuery({ customData: c2.body.ssv.customData, userId: u.id, transactionId: `tx-d-${c2.body.claimId}` });
      expect((await http.get(`/api/v1/ads/admob/ssv?${late}`)).text).toBe('REJECTED');
      expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
    });

    it('enforces the per-user daily cap', async () => {
      const u = await newUser();
      for (let i = 0; i < 10; i++) await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      const res = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(422);
      expect(res.body.error.code).toBe('REWARD_NOT_ELIGIBLE');
    });

    it('rejects ineligible placements', async () => {
      const u = await newUser();
      await claim(u.token, { placementKey: 'between_episodes_interstitial', purpose: 'COINS' }).expect(422);
      await claim(u.token, { placementKey: 'nope', purpose: 'COINS' }).expect(422);
      await claim(u.token, { placementKey: 'episode_unlock_rewarded', purpose: 'EPISODE_UNLOCK' }).expect(400);
    });

    it('dev-only completion works while SSV is disabled', async () => {
      const u = await newUser();
      const c = await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      const res = await http.post(`/api/v1/dev/rewards/claims/${c.body.claimId}/complete`).set(auth(u.token)).expect(200);
      expect(res.body.claim).toMatchObject({ status: 'GRANTED', coins: 10 });
      const other = await newUser();
      await http.post(`/api/v1/dev/rewards/claims/${c.body.claimId}/complete`).set(auth(other.token)).expect(404);
    });

    it('ads config reports remaining rewarded views', async () => {
      const u = await newUser();
      await claim(u.token, { placementKey: 'earn_coins_rewarded', purpose: 'COINS' }).expect(201);
      const res = await http.get('/api/v1/ads/config').query({ platform: 'ANDROID' }).set(auth(u.token)).expect(200);
      const earn = res.body.placements.find((p: { key: string }) => p.key === 'earn_coins_rewarded');
      expect(earn).toMatchObject({ enabled: true, remainingToday: 9, rewardCoins: 10 });
      expect(res.body.adFree).toBe(false);
    });
  });
});
