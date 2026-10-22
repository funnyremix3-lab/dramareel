import { execSync } from 'node:child_process';
import { prisma } from './helpers';

/**
 * Migration health: the migration history must reproduce schema.prisma exactly (no drift),
 * and the hand-written integrity rules from the init migration must exist.
 */
describe('Database migrations (e2e)', () => {
  const testUrl = process.env.DATABASE_URL!;
  const shadowUrl = process.env.TEST_SHADOW_DATABASE_URL ?? testUrl.replace(/\/[^/?]+(\?|$)/, '/reeldrama_shadow$1');

  beforeAll(async () => {
    const exists = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM pg_database WHERE datname = 'reeldrama_shadow'`;
    if (exists[0].n === 0) await prisma.$executeRawUnsafe('CREATE DATABASE reeldrama_shadow');
  });

  afterAll(() => prisma.$disconnect());

  it('schema.prisma has no changes missing from the migrations', () => {
    const env = { ...process.env, DATABASE_URL: testUrl, DIRECT_DATABASE_URL: testUrl };
    // --exit-code: 0 = no difference, 2 = difference found.
    const run = () =>
      execSync(
        `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${shadowUrl}" --exit-code`,
        { env, stdio: 'pipe' },
      );
    expect(run).not.toThrow();
  });

  it('the test database has every migration applied', () => {
    const out = execSync('npx prisma migrate status', { env: { ...process.env, DIRECT_DATABASE_URL: testUrl }, stdio: 'pipe' }).toString();
    expect(out).toContain('Database schema is up to date');
  });

  it('integrity rules from the init migration exist', async () => {
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname IN ('user_wallets_balance_nonneg', 'wallet_txn_amount_nonzero', 'ad_creatives_https', 'ad_campaigns_window')`;
    expect(constraints.map((c) => c.conname).sort()).toEqual(['ad_campaigns_window', 'ad_creatives_https', 'user_wallets_balance_nonneg', 'wallet_txn_amount_nonzero']);
    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_immutable' ORDER BY tgname`;
    expect(triggers.map((t) => t.tgname)).toEqual(['audit_logs_immutable', 'wallet_transactions_immutable']);
    const noRls = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`;
    expect(noRls).toEqual([]);
  });
});
