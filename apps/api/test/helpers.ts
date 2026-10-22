import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mintDevToken } from '../scripts/dev-token';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';

/** Boots the real app; `customize` can override providers (fake Google APIs, env tweaks). */
export async function createTestApp(customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export const tokenFor = (sub: string) => mintDevToken(sub, process.env.DEV_JWT_SECRET!, '10m', `${sub}@test.local`);
export const freshSub = () => `e2e-${randomUUID()}`;
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const prisma = new PrismaClient();

/** Credits coins through the ledger so balance and ledger stay consistent. */
export async function grantCoins(userId: string, coins: number) {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.userWallet.update({ where: { userId }, data: { balance: { increment: coins }, version: { increment: 1 } } });
    await tx.walletTransaction.create({
      data: { userId, type: 'BONUS', amount: coins, balanceAfter: wallet.balance, idempotencyKey: `test:${randomUUID()}` },
    });
  });
}

export async function ledgerMatchesBalance(userId: string) {
  const [wallet, sum] = await Promise.all([
    prisma.userWallet.findUniqueOrThrow({ where: { userId } }),
    prisma.walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);
  return wallet.balance === (sum._sum.amount ?? 0);
}
