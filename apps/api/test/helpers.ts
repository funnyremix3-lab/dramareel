import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mintDevToken } from '../scripts/dev-token';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export const tokenFor = (sub: string) => mintDevToken(sub, process.env.DEV_JWT_SECRET!, '10m', `${sub}@test.local`);
export const freshSub = () => `e2e-${randomUUID()}`;
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const prisma = new PrismaClient();
