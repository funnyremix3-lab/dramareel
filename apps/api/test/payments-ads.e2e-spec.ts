import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ENV, loadEnv } from '../src/config/env';
import { GOOGLE_PLAY_API, GooglePlayApi, PlayProductPurchase, PlaySubscriptionPurchase } from '../src/payments/google-play.client';
import { RTDN_AUTH } from '../src/payments/rtdn-auth';
import { auth, createTestApp, freshSub, ledgerMatchesBalance, prisma, tokenFor } from './helpers';

/** In-memory Google Play: tests register purchases by token. */
class FakePlay implements GooglePlayApi {
  products = new Map<string, PlayProductPurchase>();
  subs = new Map<string, PlaySubscriptionPurchase>();
  consumed: string[] = [];
  acknowledged: string[] = [];
  async getProductPurchase(_sku: string, token: string) {
    const p = this.products.get(token);
    if (!p) throw Object.assign(new Error('not found'), { status: 404 });
    return p;
  }
  async consumeProduct(_sku: string, token: string) {
    this.consumed.push(token);
  }
  async getSubscription(token: string) {
    const s = this.subs.get(token);
    if (!s) throw new Error('not found');
    return s;
  }
  async acknowledgeSubscription(_sku: string, token: string) {
    this.acknowledged.push(token);
  }
}

const rtdnBody = (message: object) => ({ message: { data: Buffer.from(JSON.stringify(message)).toString('base64'), messageId: '1' } });

describe('Payments (e2e, fake Google Play)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const play = new FakePlay();

  const newUser = async () => {
    const token = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
    return { token, id: me.body.id as string };
  };

  beforeAll(async () => {
    await prisma.product.updateMany({ where: { sku: { in: ['coins_100', 'coins_500', 'vip_monthly'] } }, data: { isActive: true } });
    app = await createTestApp((b) =>
      b
        .overrideProvider(ENV)
        .useValue({ ...loadEnv(), PAYMENTS_ENABLED: true })
        .overrideProvider(GOOGLE_PLAY_API)
        .useValue(play)
        .overrideProvider(RTDN_AUTH)
        .useValue({ verify: async (h?: string) => h === 'Bearer good' }),
    );
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await prisma.product.updateMany({ data: { isActive: false } });
    await app.close();
    await prisma.$disconnect();
  });

  it('lists active products', async () => {
    const res = await http.get('/api/v1/products').expect(200);
    expect(res.body.paymentsEnabled).toBe(true);
    expect(res.body.items.map((p: { sku: string }) => p.sku)).toEqual(['coins_100', 'coins_500', 'vip_monthly']);
  });

  it('fulfils a coin pack once, consumes it, and binds it to the buyer', async () => {
    const u = await newUser();
    const token = `tok-${u.id}`;
    play.products.set(token, { orderId: `GPA.${u.id}`, purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: u.id });

    const first = await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_500', purchaseToken: token }).expect(200);
    expect(first.body).toMatchObject({ status: 'FULFILLED', balance: 550 });
    const again = await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_500', purchaseToken: token }).expect(200);
    expect(again.body.balance).toBe(550);
    expect(play.consumed).toContain(token);
    expect(await ledgerMatchesBalance(u.id)).toBe(true);

    // Same token presented by someone else.
    const thief = await newUser();
    await http.post('/api/v1/payments/google-play/verify').set(auth(thief.token)).send({ sku: 'coins_500', purchaseToken: token }).expect(409);
  });

  it('concurrent verification of one purchase credits once', async () => {
    const u = await newUser();
    const token = `tok-c-${u.id}`;
    play.products.set(token, { orderId: `GPA.c.${u.id}`, purchaseState: 0, obfuscatedExternalAccountId: u.id });
    await Promise.all(
      Array.from({ length: 5 }, () => http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_100', purchaseToken: token })),
    );
    expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(100);
    expect(await ledgerMatchesBalance(u.id)).toBe(true);
  });

  it('refuses purchases made for another account, pending or cancelled purchases', async () => {
    const u = await newUser();
    play.products.set('tok-other-account', { orderId: 'GPA.other', purchaseState: 0, obfuscatedExternalAccountId: 'someone-else' });
    await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_100', purchaseToken: 'tok-other-account' }).expect(422);
    play.products.set('tok-pending-1234', { orderId: 'GPA.pending', purchaseState: 2 });
    const pending = await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_100', purchaseToken: 'tok-pending-1234' }).expect(200);
    expect(pending.body.status).toBe('PENDING');
    play.products.set('tok-cancelled-1234', { orderId: 'GPA.cancel', purchaseState: 1 });
    await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_100', purchaseToken: 'tok-cancelled-1234' }).expect(422);
    expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
  });

  it('refund (voided purchase) reverses coins but never below zero', async () => {
    const u = await newUser();
    const token = `tok-r-${u.id}`;
    play.products.set(token, { orderId: `GPA.r.${u.id}`, purchaseState: 0, obfuscatedExternalAccountId: u.id });
    await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'coins_100', purchaseToken: token }).expect(200);
    // User spends 60 of the 100 coins on two episodes.
    const drama = await prisma.drama.findUniqueOrThrow({ where: { slug: 'last-raja-of-devgarh' } });
    for (const n of [6, 7]) {
      const e = await prisma.episode.findUniqueOrThrow({ where: { dramaId_number: { dramaId: drama.id, number: n } } });
      await http.post(`/api/v1/episodes/${e.id}/unlock`).set(auth(u.token)).send({ method: 'COINS' }).expect(200);
    }

    await http.post('/api/v1/payments/google-play/rtdn').set('Authorization', 'Bearer bad').send(rtdnBody({})).expect(401);
    const voided = rtdnBody({ packageName: 'com.reeldrama.app', voidedPurchaseNotification: { purchaseToken: token, orderId: `GPA.r.${u.id}`, productType: 2 } });
    expect((await http.post('/api/v1/payments/google-play/rtdn').set('Authorization', 'Bearer good').send(voided).expect(200)).text).toBe('coin pack refunded');
    expect((await http.post('/api/v1/payments/google-play/rtdn').set('Authorization', 'Bearer good').send(voided).expect(200)).text).toBe('already voided');

    expect((await prisma.userWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
    expect(await ledgerMatchesBalance(u.id)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.refunded', entityType: 'payment' }, orderBy: { createdAt: 'desc' } });
    expect(audit.after).toMatchObject({ coinsReversed: 40, shortfall: 60 });
  });

  it('subscription: verify grants access; RTDN cancel keeps access until period end; expiry/revoke removes it', async () => {
    const u = await newUser();
    const token = `sub-${u.id}`;
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    play.subs.set(token, {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      latestOrderId: `GPA.s.${u.id}`,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: u.id },
      lineItems: [{ productId: 'vip_monthly', expiryTime: future, autoRenewingPlan: { autoRenewEnabled: true } }],
    });
    const res = await http.post('/api/v1/payments/google-play/verify').set(auth(u.token)).send({ sku: 'vip_monthly', purchaseToken: token }).expect(200);
    expect(res.body.subscription).toMatchObject({ status: 'ACTIVE', autoRenew: true });
    expect(play.acknowledged).toContain(token);

    const drama = await prisma.drama.findUniqueOrThrow({ where: { slug: 'last-raja-of-devgarh' } });
    const locked = async () =>
      (await http.get(`/api/v1/dramas/${drama.id}/episodes`).query({ limit: 10 }).set(auth(u.token))).body.items.filter((e: { locked: boolean }) => e.locked).length;
    expect(await locked()).toBe(0);
    expect((await http.get('/api/v1/ads/config').query({ platform: 'ANDROID' }).set(auth(u.token))).body.adFree).toBe(true);

    play.subs.set(token, { ...play.subs.get(token)!, subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: 'vip_monthly', expiryTime: future, autoRenewingPlan: { autoRenewEnabled: false } }] });
    const notify = rtdnBody({ packageName: 'com.reeldrama.app', subscriptionNotification: { notificationType: 3, purchaseToken: token, subscriptionId: 'vip_monthly' } });
    await http.post('/api/v1/payments/google-play/rtdn').set('Authorization', 'Bearer good').send(notify).expect(200);
    expect((await http.get('/api/v1/me/subscription').set(auth(u.token))).body).toMatchObject({ status: 'CANCELED', autoRenew: false });
    expect(await locked()).toBe(0);

    play.subs.set(token, { ...play.subs.get(token)!, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', lineItems: [{ productId: 'vip_monthly', expiryTime: new Date(Date.now() - 1000).toISOString() }] });
    await http.post('/api/v1/payments/google-play/rtdn').set('Authorization', 'Bearer good').send(notify).expect(200);
    expect(await locked()).toBeGreaterThan(0);
  });

  it('is switched off by PAYMENTS_ENABLED=false', async () => {
    const off = await createTestApp((b) => b.overrideProvider(ENV).useValue({ ...loadEnv(), PAYMENTS_ENABLED: false }).overrideProvider(GOOGLE_PLAY_API).useValue(play));
    const u = await tokenFor(freshSub());
    const res = await request(off.getHttpServer()).post('/api/v1/payments/google-play/verify').set(auth(u)).send({ sku: 'coins_100', purchaseToken: 'whatever-token' }).expect(503);
    expect(res.body.error.code).toBe('PAYMENTS_DISABLED');
    await off.close();
  });
});

describe('Direct ad campaigns (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let campaignId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    const placement = await prisma.adPlacement.findUniqueOrThrow({ where: { key: 'home_sponsored_card' } });
    await prisma.adCampaign.updateMany({ where: { name: { startsWith: 'e2e-' } }, data: { status: 'COMPLETED' } });
    const campaign = await prisma.adCampaign.create({
      data: {
        name: `e2e-${Date.now()}`,
        advertiserName: 'Chai Point (test)',
        status: 'ACTIVE',
        startAt: new Date(Date.now() - 3600_000),
        endAt: new Date(Date.now() + 86_400_000),
        pricingModel: 'CPM',
        ratePaise: 15000n,
        perUserDailyCap: 2,
        priority: 100,
        targeting: { languages: ['hi'] },
        placements: { create: { placementId: placement.id } },
        creatives: {
          create: { type: 'IMAGE', mediaKey: 'public/creatives/test.jpg', headline: 'Try our masala chai', ctaText: 'Order', destinationUrl: 'https://example.com/chai', reviewStatus: 'APPROVED' },
        },
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await prisma.adCampaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } });
    await app.close();
    await prisma.$disconnect();
  });

  const serve = (token?: string, lang = 'hi') => {
    const req = http.get('/api/v1/ads/serve').query({ placement: 'home_sponsored_card', platform: 'ANDROID' }).set('Accept-Language', lang);
    return token ? req.set(auth(token)) : req;
  };

  it('serves a labelled creative only to matching targeting', async () => {
    const res = await serve().expect(200);
    expect(res.body.creative).toMatchObject({ headline: 'Try our masala chai', label: 'Sponsored', advertiser: 'Chai Point (test)' });
    expect(res.body.creative.mediaUrl).toBe('https://media.test/public/creatives/test.jpg');
    await serve(undefined, 'en').expect(204);
  });

  it('dedupes impressions and clicks per serve and requires an impression before a click', async () => {
    const s = (await serve().expect(200)).body.serveToken;
    await http.post('/api/v1/ads/clicks').send({ serveToken: s }).expect(400);
    expect((await http.post('/api/v1/ads/impressions').send({ serveToken: s }).expect(200)).body).toEqual({ recorded: true });
    expect((await http.post('/api/v1/ads/impressions').send({ serveToken: s }).expect(200)).body).toEqual({ recorded: false });
    const click = await http.post('/api/v1/ads/clicks').send({ serveToken: s }).expect(200);
    expect(click.body.destinationUrl).toBe('https://example.com/chai');
    await http.post('/api/v1/ads/clicks').send({ serveToken: s }).expect(200);
    expect(await prisma.adClick.count({ where: { campaignId } })).toBe(1);
  });

  it('rejects forged serve tokens and tokens reported by another user', async () => {
    await http.post('/api/v1/ads/impressions').send({ serveToken: 'x'.repeat(40) }).expect(400);
    const owner = await tokenFor(freshSub());
    const s = (await serve(owner).expect(200)).body.serveToken;
    await http.post('/api/v1/ads/impressions').set(auth(await tokenFor(freshSub()))).send({ serveToken: s }).expect(403);
  });

  it('honours the per-user daily cap', async () => {
    const t = await tokenFor(freshSub());
    for (let i = 0; i < 2; i++) {
      const s = (await serve(t).expect(200)).body.serveToken;
      await http.post('/api/v1/ads/impressions').set(auth(t)).send({ serveToken: s }).expect(200);
    }
    await serve(t).expect(204);
  });
});
