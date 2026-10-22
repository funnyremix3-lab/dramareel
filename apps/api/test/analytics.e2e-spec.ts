import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { sanitizeProperties } from '../src/analytics/analytics.controller';
import { auth, createTestApp, freshSub, prisma, tokenFor } from './helpers';

describe('Consent-gated analytics (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const event = (name = 'episode_start', occurredAt = new Date().toISOString()) => ({ name, occurredAt, properties: { drama_id: 'abc', position: 3 } });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('drops events from signed-in users without consent', async () => {
    const t = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(t)).expect(200);
    const res = await http.post('/api/v1/events').set(auth(t)).send({ platform: 'ANDROID', events: [event()] }).expect(202);
    expect(res.body.accepted).toBe(0);
    expect(await prisma.analyticsEvent.count({ where: { userId: me.body.id } })).toBe(0);
  });

  it('stores events once the user consents', async () => {
    const t = await tokenFor(freshSub());
    const me = await http.get('/api/v1/me').set(auth(t)).expect(200);
    await http.put('/api/v1/me/consents').set(auth(t)).send({ analytics: true, adsPersonalization: false, marketing: false, push: false }).expect(200);
    const res = await http.post('/api/v1/events').set(auth(t)).send({ platform: 'ANDROID', appVersion: '0.1.0', events: [event(), event('episode_complete')] }).expect(202);
    expect(res.body.accepted).toBe(2);
    const rows = await prisma.analyticsEvent.findMany({ where: { userId: me.body.id } });
    expect(rows.map((r) => r.name).sort()).toEqual(['episode_complete', 'episode_start']);
    expect(rows[0].properties).toEqual({ drama_id: 'abc', position: 3 });
  });

  it('stores guest events without any user id', async () => {
    const before = await prisma.analyticsEvent.count({ where: { userId: null, name: 'app_open' } });
    await http.post('/api/v1/events').send({ platform: 'IOS', events: [event('app_open')] }).expect(202);
    expect(await prisma.analyticsEvent.count({ where: { userId: null, name: 'app_open' } })).toBe(before + 1);
  });

  it('rejects unknown events and drops stale timestamps', async () => {
    await http.post('/api/v1/events').send({ platform: 'ANDROID', events: [event('steal_contacts')] }).expect(400);
    const stale = await http.post('/api/v1/events').send({ platform: 'ANDROID', events: [event('app_open', '2020-01-01T00:00:00Z')] }).expect(202);
    expect(stale.body.accepted).toBe(0);
    await http.post('/api/v1/events').send({ platform: 'ANDROID', events: [] }).expect(400);
  });

  it('is exported in admin reports', async () => {
    const owner = await tokenFor('dev-owner');
    await http.get('/api/v1/me').set(auth(owner)).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    const csv = await http.get('/api/v1/admin/reports/events.csv').query({ from: today, to: today }).set(auth(owner)).expect(200);
    expect(csv.text).toContain('day,event,platform,count,users');
    expect(csv.text).toContain('app_open');
  });
});

describe('sanitizeProperties', () => {
  it('keeps short primitive properties only', () => {
    expect(
      sanitizeProperties({ ok: 'x'.repeat(300), n: 4, b: true, nested: { a: 1 }, 'Bad Key': 1, nan: Number.NaN, list: [1] }),
    ).toEqual({ ok: 'x'.repeat(200), n: 4, b: true });
  });
});
