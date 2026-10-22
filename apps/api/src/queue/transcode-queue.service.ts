import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppException } from '../common/errors/app-exception';
import { ENV, Env } from '../config/env';

export const TRANSCODE_QUEUE = 'video-transcode';

export interface TranscodeJobData {
  assetId: string;
}

/** Producer side of the transcoder queue. One job per asset (jobId = assetId) so duplicates are impossible. */
@Injectable()
export class TranscodeQueue implements OnModuleDestroy {
  private readonly queue?: Queue<TranscodeJobData>;

  constructor(@Inject(ENV) env: Env) {
    if (env.REDIS_URL) {
      this.queue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE, {
        connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });
    }
  }

  async enqueue(assetId: string): Promise<void> {
    if (!this.queue) throw new AppException('INTERNAL', 'Job queue is not configured (REDIS_URL)');
    const existing = await this.queue.getJob(assetId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') return;
      await existing.remove();
    }
    await this.queue.add('transcode', { assetId }, { jobId: assetId });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}

@Global()
@Module({ providers: [TranscodeQueue], exports: [TranscodeQueue] })
export class QueueModule {}
