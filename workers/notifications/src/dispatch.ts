import { Prisma, PrismaClient } from '@prisma/client';
import type { PushSender, SendOutcome } from './fcm';

export interface Audience {
  all?: boolean;
  userIds?: string[];
  languages?: string[];
}

/** Recipients: active users who keep push on, narrowed by the job's audience. */
export function audienceWhere(audience: Audience): Prisma.DeviceTokenWhereInput {
  const user: Prisma.UserWhereInput = { status: 'ACTIVE', deletionRequestedAt: null, profile: { pushEnabled: true } };
  if (audience.userIds?.length) user.id = { in: audience.userIds };
  else if (audience.languages?.length) user.locale = { in: audience.languages };
  else if (!audience.all) user.id = { in: [] }; // malformed audience → nobody
  return { user };
}

/** Picks the user's language, falling back to English. */
export function localise(text: unknown, locale: string): string {
  const map = (text ?? {}) as Record<string, string>;
  return map[locale] || map.en || '';
}

const BATCH = 500;
const CONCURRENCY = 10;

/**
 * Sends due jobs. A job is claimed with a conditional SCHEDULED→SENDING update so two workers
 * never send the same job. Invalid device tokens are deleted.
 */
export async function dispatchDueJobs(prisma: PrismaClient, sender: PushSender, now = new Date(), log: (msg: string, extra?: object) => void = () => undefined) {
  const due = await prisma.notificationJob.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, orderBy: { scheduledAt: 'asc' }, take: 5 });
  for (const job of due) {
    const { count } = await prisma.notificationJob.updateMany({ where: { id: job.id, status: 'SCHEDULED' }, data: { status: 'SENDING' } });
    if (count === 0) continue;

    let success = 0;
    let failure = 0;
    let lastError: string | null = null;
    try {
      const where = audienceWhere(job.audience as Audience);
      let cursor: string | undefined;
      for (;;) {
        const tokens = await prisma.deviceToken.findMany({
          where,
          take: BATCH,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, token: true, user: { select: { locale: true } } },
        });
        if (tokens.length === 0) break;
        cursor = tokens[tokens.length - 1].id;

        const invalid: string[] = [];
        for (let i = 0; i < tokens.length; i += CONCURRENCY) {
          const results: SendOutcome[] = await Promise.all(
            tokens.slice(i, i + CONCURRENCY).map((t) =>
              sender
                .send({ token: t.token, title: localise(job.title, t.user.locale), body: localise(job.body, t.user.locale), deepLink: job.deepLink })
                .catch((): SendOutcome => 'failed'),
            ),
          );
          results.forEach((r, j) => {
            if (r === 'sent') success++;
            else {
              failure++;
              if (r === 'invalid') invalid.push(tokens[i + j].id);
            }
          });
        }
        if (invalid.length) await prisma.deviceToken.deleteMany({ where: { id: { in: invalid } } });
        if (tokens.length < BATCH) break;
      }
    } catch (err) {
      lastError = (err as Error).message.slice(0, 500);
    }

    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { status: lastError ? 'FAILED' : 'SENT', sentAt: new Date(), successCount: success, failureCount: failure, lastError },
    });
    log('notification job finished', { jobId: job.id, success, failure, error: lastError });
  }
  return due.length;
}
