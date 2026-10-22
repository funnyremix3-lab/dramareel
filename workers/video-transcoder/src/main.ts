import { PrismaClient } from '@prisma/client';
import { UnrecoverableError, Worker } from 'bullmq';
import { loadConfig } from './config';
import { PermanentFailure, processAsset } from './process-asset';
import { Storage } from './storage';

export const TRANSCODE_QUEUE = 'video-transcode';

const config = loadConfig();
const prisma = new PrismaClient();
const storage = new Storage(config);
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));

const worker = new Worker<{ assetId: string }>(
  TRANSCODE_QUEUE,
  async (job) => {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      await processAsset({ prisma, storage, config, log }, job.data.assetId, finalAttempt);
    } catch (err) {
      // Bad media will never succeed — tell BullMQ not to retry.
      if (err instanceof PermanentFailure) throw new UnrecoverableError(err.message);
      throw err;
    }
  },
  {
    connection: { url: config.REDIS_URL, maxRetriesPerRequest: null },
    concurrency: config.TRANSCODER_CONCURRENCY,
    // Long encodes: renew the job lock well before it expires.
    lockDuration: 10 * 60 * 1000,
  },
);

worker.on('failed', (job, err) => log('job failed', { level: 'error', assetId: job?.data.assetId, attempt: job?.attemptsMade, err: err.message }));
worker.on('ready', () => log('transcoder ready', { queue: TRANSCODE_QUEUE, concurrency: config.TRANSCODER_CONCURRENCY }));

async function shutdown() {
  log('shutting down');
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
