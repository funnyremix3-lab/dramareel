import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { Locale } from '../common/http/locale';
import { CursorQuery, decodeCursor, encodeCursor, offsetPage, Page } from '../common/pagination/cursor';
import { PrismaService } from '../common/prisma/prisma.service';
import { checkComment, normalizeComment } from './comment-text';

/** Reports needed before a comment is auto-hidden pending moderator review. */
export const AUTO_HIDE_REPORTS = 3;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  private async publishedEpisode(episodeId: string) {
    const now = new Date();
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, status: 'PUBLISHED', publishedAt: { lte: now }, drama: { status: 'PUBLISHED' } },
      select: { id: true, dramaId: true, durationSeconds: true },
    });
    if (!episode) throw notFound('Episode');
    return episode;
  }

  // ───────── Watch progress ─────────

  async saveProgress(userId: string, episodeId: string, positionSeconds: number, completed?: boolean) {
    const episode = await this.publishedEpisode(episodeId);
    const position = episode.durationSeconds > 0 ? Math.min(positionSeconds, episode.durationSeconds) : positionSeconds;
    const done = completed ?? (episode.durationSeconds > 0 && position >= episode.durationSeconds - 3);

    try {
      await this.prisma.$transaction([
        this.prisma.watchHistory.create({
          data: { userId, episodeId, dramaId: episode.dramaId, positionSeconds: position, completed: done },
        }),
        // First progress report for this (user, episode) counts as one view.
        this.prisma.episode.update({ where: { id: episodeId }, data: { viewCount: { increment: 1 } } }),
        this.prisma.drama.update({ where: { id: episode.dramaId }, data: { viewCount: { increment: 1 } } }),
      ]);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await this.prisma.watchHistory.update({
        where: { userId_episodeId: { userId, episodeId } },
        data: { positionSeconds: position, completed: done },
      });
    }
    return { positionSeconds: position, completed: done };
  }

  history(userId: string, query: CursorQuery, locale: Locale) {
    return offsetPage(query, async (skip, take) => {
      const rows = await this.prisma.watchHistory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: {
          positionSeconds: true,
          completed: true,
          updatedAt: true,
          episode: {
            select: {
              id: true,
              number: true,
              durationSeconds: true,
              drama: { select: { id: true } },
            },
          },
        },
      });
      const summaries = await this.catalog.summariesByIds(rows.map((r) => r.episode.drama.id), locale);
      return rows
        .filter((r) => summaries.has(r.episode.drama.id))
        .map((r) => ({
          drama: summaries.get(r.episode.drama.id)!,
          episodeId: r.episode.id,
          episodeNumber: r.episode.number,
          durationSeconds: r.episode.durationSeconds,
          positionSeconds: r.positionSeconds,
          completed: r.completed,
          updatedAt: r.updatedAt,
        }));
    });
  }

  async removeHistory(userId: string, episodeId: string) {
    await this.prisma.watchHistory.deleteMany({ where: { userId, episodeId } });
  }

  // ───────── Likes & favourites (idempotent, counters change only on real transitions) ─────────

  async like(userId: string, episodeId: string) {
    await this.publishedEpisode(episodeId);
    try {
      await this.prisma.$transaction([
        this.prisma.like.create({ data: { userId, episodeId } }),
        this.prisma.episode.update({ where: { id: episodeId }, data: { likeCount: { increment: 1 } } }),
      ]);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return this.likeState(userId, episodeId);
  }

  async unlike(userId: string, episodeId: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.like.deleteMany({ where: { userId, episodeId } });
      if (count) await tx.episode.update({ where: { id: episodeId }, data: { likeCount: { decrement: 1 } } });
    });
    return this.likeState(userId, episodeId);
  }

  private async likeState(userId: string, episodeId: string) {
    const [liked, episode] = await Promise.all([
      this.prisma.like.findUnique({ where: { userId_episodeId: { userId, episodeId } } }),
      this.prisma.episode.findUnique({ where: { id: episodeId }, select: { likeCount: true } }),
    ]);
    return { liked: !!liked, likeCount: episode?.likeCount ?? 0 };
  }

  async favorite(userId: string, dramaId: string) {
    const drama = await this.prisma.drama.findFirst({ where: { id: dramaId, status: 'PUBLISHED' }, select: { id: true } });
    if (!drama) throw notFound('Drama');
    try {
      await this.prisma.$transaction([
        this.prisma.favorite.create({ data: { userId, dramaId } }),
        this.prisma.drama.update({ where: { id: dramaId }, data: { favoriteCount: { increment: 1 } } }),
      ]);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return { favorite: true };
  }

  async unfavorite(userId: string, dramaId: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.favorite.deleteMany({ where: { userId, dramaId } });
      if (count) await tx.drama.update({ where: { id: dramaId }, data: { favoriteCount: { decrement: 1 } } });
    });
    return { favorite: false };
  }

  favorites(userId: string, query: CursorQuery, locale: Locale) {
    return offsetPage(query, async (skip, take) => {
      const rows = await this.prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: { dramaId: true },
      });
      const summaries = await this.catalog.summariesByIds(rows.map((r) => r.dramaId), locale);
      return rows.filter((r) => summaries.has(r.dramaId)).map((r) => summaries.get(r.dramaId)!);
    });
  }

  // ───────── Comments ─────────

  async listComments(episodeId: string, viewerId: string | undefined, query: CursorQuery) {
    await this.publishedEpisode(episodeId);
    const blocked = viewerId
      ? (await this.prisma.userBlock.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } })).map((b) => b.blockedId)
      : [];

    const before = decodeCursor(query.cursor, { t: 'number', id: 'string' });
    const rows = await this.prisma.comment.findMany({
      where: {
        episodeId,
        status: 'VISIBLE',
        ...(blocked.length ? { userId: { notIn: blocked } } : {}),
        ...(before
          ? { OR: [{ createdAt: { lt: new Date(before.t) } }, { createdAt: new Date(before.t), id: { lt: before.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        body: true,
        parentId: true,
        createdAt: true,
        userId: true,
        user: { select: { profile: { select: { displayName: true, avatarKey: true } } } },
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const result: Page<unknown> = {
      items: page.map((c) => ({
        id: c.id,
        body: c.body,
        parentId: c.parentId,
        createdAt: c.createdAt,
        author: {
          id: c.userId,
          displayName: c.user.profile?.displayName ?? 'Viewer',
          avatarKey: c.user.profile?.avatarKey ?? null,
        },
        isMine: c.userId === viewerId,
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: last.id }) : null,
    };
    return result;
  }

  async createComment(userId: string, episodeId: string, rawBody: string, parentId?: string) {
    await this.publishedEpisode(episodeId);
    const body = normalizeComment(rawBody);
    const rejection = checkComment(body);
    if (rejection === 'EMPTY') throw new AppException('VALIDATION_FAILED', 'Comment is empty');
    if (rejection === 'LINK') throw new AppException('VALIDATION_FAILED', 'Links are not allowed in comments');
    if (rejection === 'PROFANITY') throw new AppException('VALIDATION_FAILED', 'Please keep comments respectful');

    if (parentId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: parentId, episodeId, status: 'VISIBLE' } });
      if (!parent) throw notFound('Parent comment');
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({ data: { userId, episodeId, body, parentId } }),
      this.prisma.episode.update({ where: { id: episodeId }, data: { commentCount: { increment: 1 } } }),
    ]);
    return { id: comment.id, body: comment.body, parentId: comment.parentId, createdAt: comment.createdAt };
  }

  async deleteComment(userId: string, commentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({ where: { id: commentId } });
      if (!comment || comment.userId !== userId) throw notFound('Comment');
      if (comment.status === 'DELETED') return;
      await tx.comment.update({ where: { id: commentId }, data: { status: 'DELETED' } });
      if (comment.status === 'VISIBLE') {
        await tx.episode.update({ where: { id: comment.episodeId }, data: { commentCount: { decrement: 1 } } });
      }
    });
  }

  async reportComment(userId: string, commentId: string, reason: string, details?: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.status === 'DELETED') throw notFound('Comment');
    if (comment.userId === userId) throw new AppException('VALIDATION_FAILED', 'You cannot report your own comment');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentReport.create({ data: { commentId, reporterId: userId, reason, details } });
        const updated = await tx.comment.update({ where: { id: commentId }, data: { reportCount: { increment: 1 } } });
        if (updated.status === 'VISIBLE' && updated.reportCount >= AUTO_HIDE_REPORTS) {
          await tx.comment.update({ where: { id: commentId }, data: { status: 'HIDDEN' } });
          await tx.episode.update({ where: { id: comment.episodeId }, data: { commentCount: { decrement: 1 } } });
        }
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // already reported by this user — idempotent
    }
    return { reported: true };
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new AppException('VALIDATION_FAILED', 'You cannot block yourself');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw notFound('User');
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
    return { blocked: true };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { blocked: false };
  }
}
