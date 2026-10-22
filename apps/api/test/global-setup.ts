import { execSync } from 'node:child_process';

/**
 * Applies migrations and the idempotent dev seed to the dedicated test database.
 * Non-destructive: tests create their own users and clean up rows they add, so no reset is needed.
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://reeldrama:reeldrama@localhost:54329/reeldrama_test';
  if (!/test/.test(new URL(url).pathname)) {
    throw new Error(`Refusing to use a database whose name does not contain "test": ${url}`);
  }
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });
}
