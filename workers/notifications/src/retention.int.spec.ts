import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { pruneOldEvents, purgeDeletedAccounts } from './retention';

/** Runs against the local test database (docker compose); skipped when it isn't reachable. */
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://reeldrama:reeldrama@localhost:54329/reeldrama_test';
const prisma = new PrismaClient({ datasources: { db: { url } } });
const DAY = 86_400_000;

let reachable = true;
beforeAll(async () => {
  reachable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
});
afterAll(() => prisma.$disconnect());

it('purges personal data after the grace period but keeps financial records', async () => {
  if (!reachable) return console.warn('test database not reachable — skipped');
  const episode = await prisma.episode.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
  const make = (requestedDaysAgo: number) =>
    prisma.user.create({
      data: {
        authProviderId: `ret-${randomUUID()}`,
        email: `${randomUUID()}@example.test`,
        deletionRequestedAt: new Date(Date.now() - requestedDaysAgo * DAY),
        profile: { create: { displayName: 'Soon gone', pushEnabled: true } },
        wallet: { create: {} },
        deviceTokens: { create: { token: `t-${randomUUID()}`, platform: 'ANDROID' } },
        comments: { create: { episodeId: episode.id, body: 'my opinion' } },
      },
    });
  const expired = await make(31);
  const inGrace = await make(5);
  await prisma.walletTransaction.create({ data: { userId: expired.id, type: 'BONUS', amount: 5, balanceAfter: 5, idempotencyKey: `ret:${expired.id}` } });
  await prisma.userWallet.update({ where: { userId: expired.id }, data: { balance: 5 } });
  await prisma.episode.update({ where: { id: episode.id }, data: { commentCount: { increment: 2 } } });
  const before = (await prisma.episode.findUniqueOrThrow({ where: { id: episode.id } })).commentCount;

  expect(await purgeDeletedAccounts(prisma)).toBeGreaterThanOrEqual(1);

  const gone = await prisma.user.findUniqueOrThrow({ where: { id: expired.id }, include: { profile: true } });
  expect(gone).toMatchObject({ status: 'DELETED', email: null, authProviderId: `deleted:${expired.id}` });
  expect(gone.profile).toMatchObject({ displayName: null, pushEnabled: false });
  expect(await prisma.deviceToken.count({ where: { userId: expired.id } })).toBe(0);
  expect(await prisma.comment.findFirstOrThrow({ where: { userId: expired.id } })).toMatchObject({ status: 'DELETED', body: '[deleted]' });
  expect((await prisma.episode.findUniqueOrThrow({ where: { id: episode.id } })).commentCount).toBe(before - 1);
  // Ledger is retained.
  expect(await prisma.walletTransaction.count({ where: { userId: expired.id } })).toBe(1);

  // Still inside the grace period: untouched.
  expect(await prisma.user.findUniqueOrThrow({ where: { id: inGrace.id } })).toMatchObject({ status: 'ACTIVE', email: inGrace.email });
  expect(await purgeDeletedAccounts(prisma)).toBe(0); // idempotent
});

it('prunes analytics and ad delivery rows older than ~13 months', async () => {
  if (!reachable) return;
  const old = new Date(Date.now() - 400 * DAY);
  const fresh = new Date(Date.now() - DAY);
  const tag = randomUUID();
  await prisma.analyticsEvent.createMany({
    data: [
      { name: 'app_open', occurredAt: old, properties: { tag } },
      { name: 'app_open', occurredAt: fresh, properties: { tag } },
    ],
  });
  const result = await pruneOldEvents(prisma);
  expect(result.events).toBeGreaterThanOrEqual(1);
  const left = await prisma.analyticsEvent.findMany({ where: { properties: { equals: { tag } } } });
  expect(left.map((e) => e.occurredAt.getTime())).toEqual([fresh.getTime()]);
});
