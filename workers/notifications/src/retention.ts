import { PrismaClient } from '@prisma/client';

export const DELETION_GRACE_DAYS = 30;
export const EVENT_RETENTION_DAYS = 395; // ~13 months
const DAY = 86_400_000;

/**
 * Finishes account deletions whose 30-day grace period has passed (docs/database.md):
 * personal data is removed, comments are blanked, behavioural data is dropped; wallet,
 * payment and unlock records stay because financial records must be retained.
 */
export async function purgeDeletedAccounts(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: new Date(now.getTime() - DELETION_GRACE_DAYS * DAY) }, status: { not: 'DELETED' } },
    select: { id: true },
    take: 100,
  });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      // Keep episodes.comment_count equal to visible comments.
      await tx.$executeRaw`
        UPDATE episodes e SET comment_count = GREATEST(0, e.comment_count - c.n)
        FROM (SELECT episode_id, COUNT(*)::int AS n FROM comments WHERE user_id = ${id}::uuid AND status = 'VISIBLE' GROUP BY episode_id) c
        WHERE e.id = c.episode_id`;
      await tx.comment.updateMany({ where: { userId: id }, data: { status: 'DELETED', body: '[deleted]' } });
      await tx.deviceToken.deleteMany({ where: { userId: id } });
      await tx.watchHistory.deleteMany({ where: { userId: id } });
      await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] } });
      await tx.analyticsEvent.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userProfile.updateMany({
        where: { userId: id },
        data: { displayName: null, avatarKey: null, bio: null, analyticsConsent: false, adsPersonalizationConsent: false, marketingConsent: false, pushEnabled: false },
      });
      await tx.user.update({
        where: { id },
        data: { status: 'DELETED', email: null, phone: null, authProviderId: `deleted:${id}`, deletedAt: now, lastSeenAt: null },
      });
      await tx.auditLog.create({ data: { action: 'user.purged', entityType: 'user', entityId: id } });
    });
  }
  return due.length;
}

/** Drops analytics and first-party ad delivery rows older than the retention window. */
export async function pruneOldEvents(prisma: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY);
  const [events, impressions, clicks] = await prisma.$transaction([
    prisma.analyticsEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
    prisma.adImpression.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
    prisma.adClick.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
  ]);
  return { events: events.count, impressions: impressions.count, clicks: clicks.count };
}
