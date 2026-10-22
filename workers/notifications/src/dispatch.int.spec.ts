import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { dispatchDueJobs } from './dispatch';
import { PushMessage, PushSender, SendOutcome } from './fcm';

/** Runs against the local test database (docker compose); skipped when it isn't reachable. */
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://reeldrama:reeldrama@localhost:54329/reeldrama_test';
const prisma = new PrismaClient({ datasources: { db: { url } } });

class FakeSender implements PushSender {
  sent: PushMessage[] = [];
  async send(m: PushMessage): Promise<SendOutcome> {
    this.sent.push(m);
    return m.token.startsWith('dead-') ? 'invalid' : 'sent';
  }
}

let reachable = true;
beforeAll(async () => {
  reachable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
});
afterAll(() => prisma.$disconnect());

async function user(locale: string, opts: { push?: boolean; status?: 'ACTIVE' | 'SUSPENDED'; token?: string } = {}) {
  return prisma.user.create({
    data: {
      authProviderId: `notif-${randomUUID()}`,
      locale,
      status: opts.status ?? 'ACTIVE',
      profile: { create: { pushEnabled: opts.push ?? true } },
      deviceTokens: { create: { token: opts.token ?? `tok-${randomUUID()}`, platform: 'ANDROID' } },
    },
  });
}

it('sends localised messages to the Hindi audience only, drops invalid tokens, and never double-sends', async () => {
  if (!reachable) return console.warn('test database not reachable — skipped');
  const tag = randomUUID();
  const hi = await user('hi');
  const hiDead = await user('hi', { token: `dead-${tag}` });
  const hiOptedOut = await user('hi', { push: false });
  const hiSuspended = await user('hi', { status: 'SUSPENDED' });
  const en = await user('en');

  // Only our job should be due; park any other due jobs from earlier runs.
  await prisma.notificationJob.updateMany({ where: { status: 'SCHEDULED' }, data: { status: 'CANCELED' } });
  const job = await prisma.notificationJob.create({
    data: {
      title: { en: 'New episode', hi: 'नया एपिसोड' },
      body: { en: 'Watch now', hi: 'अभी देखें' },
      deepLink: 'reeldrama://drama/x',
      audience: { languages: ['hi'] },
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() - 1000),
    },
  });

  const sender = new FakeSender();
  const [a, b] = await Promise.all([dispatchDueJobs(prisma, sender), dispatchDueJobs(prisma, sender)]);
  expect(a + b).toBeGreaterThanOrEqual(1);

  const recipients = new Set(sender.sent.map((m) => m.token));
  const tokenOf = async (u: { id: string }) => (await prisma.deviceToken.findFirst({ where: { userId: u.id } }))?.token;
  expect(recipients.has((await tokenOf(hi))!)).toBe(true);
  expect(recipients.has(`dead-${tag}`)).toBe(true);
  expect(recipients.has((await tokenOf(hiOptedOut))!)).toBe(false);
  expect(recipients.has((await tokenOf(hiSuspended))!)).toBe(false);
  expect(recipients.has((await tokenOf(en))!)).toBe(false);
  expect(sender.sent.filter((m) => m.token === (sender.sent[0].token)).length).toBe(1); // no duplicates
  expect(sender.sent.every((m) => m.title === 'नया एपिसोड')).toBe(true);

  const done = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
  expect(done).toMatchObject({ status: 'SENT', failureCount: 1 });
  expect(done.successCount).toBeGreaterThanOrEqual(1);
  expect(await prisma.deviceToken.count({ where: { userId: hiDead.id } })).toBe(0);
});
