import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, createTestApp, freshSub, prisma, tokenFor } from './helpers';

describe('Auth & /me (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('health endpoints are public', async () => {
    await http.get('/api/v1/health/live').expect(200, { status: 'ok' });
    await http.get('/api/v1/health/ready').expect(200, { status: 'ok' });
  });

  it('rejects requests without a token with the standard error shape', async () => {
    const res = await http.get('/api/v1/me').expect(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });

  it('rejects malformed and forged tokens', async () => {
    await http.get('/api/v1/me').set('Authorization', 'Token abc').expect(401);
    await http.get('/api/v1/me').set(auth('a.b.c')).expect(401);
  });

  it('provisions user, profile and an empty wallet on first sign-in, exactly once', async () => {
    const sub = freshSub();
    const token = await tokenFor(sub);
    const [a, b] = await Promise.all([
      http.get('/api/v1/me').set(auth(token)),
      http.get('/api/v1/me').set(auth(token)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.id).toBe(b.body.id);
    expect(a.body.wallet).toEqual({ balance: 0 });
    expect(a.body.roles).toEqual([]);
    expect(await prisma.user.count({ where: { authProviderId: sub } })).toBe(1);
  });

  it('blocks suspended accounts', async () => {
    const sub = freshSub();
    const token = await tokenFor(sub);
    const me = await http.get('/api/v1/me').set(auth(token)).expect(200);
    await prisma.user.update({ where: { id: me.body.id }, data: { status: 'SUSPENDED' } });
    const res = await http.get('/api/v1/me').set(auth(token)).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('updates the profile and validates input', async () => {
    const token = await tokenFor(freshSub());
    const res = await http.patch('/api/v1/me/profile').set(auth(token)).send({ displayName: '  Meera  ', locale: 'hi' }).expect(200);
    expect(res.body.profile.displayName).toBe('Meera');
    expect(res.body.locale).toBe('hi');

    await http.patch('/api/v1/me/profile').set(auth(token)).send({ locale: 'fr' }).expect(400);
    const extra = await http.patch('/api/v1/me/profile').set(auth(token)).send({ isAdmin: true }).expect(400);
    expect(extra.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('ignores a client-supplied user id', async () => {
    const victim = await http.get('/api/v1/me').set(auth(await tokenFor(freshSub()))).expect(200);
    const attacker = await tokenFor(freshSub());
    await http.patch('/api/v1/me/profile').set(auth(attacker)).send({ userId: victim.body.id, displayName: 'x' }).expect(400);
    const after = await prisma.userProfile.findUnique({ where: { userId: victim.body.id } });
    expect(after?.displayName).toBeNull();
  });

  it('records consents and deletion requests', async () => {
    const token = await tokenFor(freshSub());
    const consents = { analytics: true, adsPersonalization: false, marketing: false, push: true };
    const res = await http.put('/api/v1/me/consents').set(auth(token)).send(consents).expect(200);
    expect(res.body.consents).toEqual(consents);

    const del = await http.delete('/api/v1/me').set(auth(token)).expect(200);
    expect(del.body.deletionRequestedAt).toEqual(expect.any(String));
  });

  it('a fresh sign-in cancels a pending deletion, but the old session cannot', async () => {
    const sub = freshSub();
    const oldToken = await tokenFor(sub);
    await http.get('/api/v1/me').set(auth(oldToken)).expect(200);
    await http.delete('/api/v1/me').set(auth(oldToken)).expect(200);

    // A late request from the same (pre-deletion) session must not undo the request.
    const stillPending = await http.get('/api/v1/me').set(auth(oldToken)).expect(200);
    expect(stillPending.body.deletionRequestedAt).toEqual(expect.any(String));

    // Signing in again later (token issued after the request) cancels it.
    const secret = new TextEncoder().encode(process.env.DEV_JWT_SECRET!);
    const { SignJWT } = await import('jose');
    const newToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuer('reel-drama-dev')
      .setAudience('authenticated')
      .setIssuedAt(Math.floor(Date.now() / 1000) + 2)
      .setExpirationTime('10m')
      .sign(secret);
    const cancelled = await http.get('/api/v1/me').set(auth(newToken)).expect(200);
    expect(cancelled.body.deletionRequestedAt).toBeNull();
  });

  it('seeded admin roles resolve to permissions', async () => {
    const res = await http.get('/api/v1/me').set(auth(await tokenFor('dev-owner'))).expect(200);
    expect(res.body.roles).toEqual(['OWNER']);
  });
});
