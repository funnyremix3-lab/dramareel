import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { dispatchDueJobs } from './dispatch';
import { FcmSender, LogSender, PushSender } from './fcm';
import { pruneOldEvents, purgeDeletedAccounts } from './retention';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    FCM_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),
    POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(600).default(30),
  })
  .parse(process.env);

if (config.NODE_ENV === 'production' && !config.FCM_SERVICE_ACCOUNT_JSON_PATH) {
  throw new Error('FCM_SERVICE_ACCOUNT_JSON_PATH is required in production');
}

const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));
const prisma = new PrismaClient();
const sender: PushSender = config.FCM_SERVICE_ACCOUNT_JSON_PATH ? new FcmSender(config.FCM_SERVICE_ACCOUNT_JSON_PATH) : new LogSender();

let stopping = false;
let lastRetention = 0;
const RETENTION_EVERY_MS = 60 * 60 * 1000;
let running: Promise<unknown> | null = null;

async function tick() {
  if (stopping) return;
  running = dispatchDueJobs(prisma, sender, new Date(), log)
    .catch((err: Error) => log('dispatch failed', { error: err.message }))
    .then(async () => {
      // Data retention runs hourly alongside notifications.
      if (Date.now() - lastRetention < RETENTION_EVERY_MS) return;
      lastRetention = Date.now();
      const purged = await purgeDeletedAccounts(prisma);
      const pruned = await pruneOldEvents(prisma);
      log('retention run', { purgedAccounts: purged, ...pruned });
    })
    .catch((err: Error) => log('retention failed', { error: err.message }));
  await running;
  running = null;
  if (!stopping) setTimeout(tick, config.POLL_INTERVAL_SECONDS * 1000);
}

async function shutdown() {
  stopping = true;
  await running;
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

log('notifications worker started', { sender: sender.constructor.name, pollSeconds: config.POLL_INTERVAL_SECONDS });
void tick();
