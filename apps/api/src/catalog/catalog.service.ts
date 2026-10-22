import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { notFound } from '../common/errors/app-exception';
import { Locale, localized } from '../common/http/locale';
import { MediaUrlService } from '../common/http/media-url';
import { CursorQuery, decodeCursor, encodeCursor, offsetPage, Page } from '../common/pagination/cursor';
import { PrismaService } from '../common/prisma/prisma.service';
import { unlockPrice } from '../entitlements/entitlement';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DramaSort, ListDramasQuery, SearchDramasQuery } from './catalog.dto';

const NEW_RELEASE_DAYS = 14;

const summarySelect = (locale: Locale) =>
  ({
    id: true,
    slug: true,
    title: true,
    posterKey: true,
    coverKey: true,
    tags: true,
    orientation: true,
    episodeCount: true,
    viewCount: true,
    favoriteCount: true,
    freeEpisodeCount: true,
    publishedAt: true,
    translations: { where: { languageCode: locale }, select: { title: true, synopsis: true } },
  }) satisfies Prisma.DramaSelect;

type SummaryRow = Prisma.DramaGetPayload<{ select: ReturnType<typeof summarySelect> }>;

const ORDER_BY: Record<DramaSort, Prisma.DramaOrderByWithRelationInput[]> = {
  trending: [{ trendingScore: 'desc' }, { id: 'asc' }],
  new: [{ publishedAt: 'desc' }, { id: 'asc' }],
  popular: [{ viewCount: 'desc' }, { id: 'asc' }],
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private published(): Prisma.DramaWhereInput {
    return { status: 'PUBLISHED', publishedAt: { lte: new Date() } };
  }

  private publishedEpisode(): Prisma.EpisodeWhereInput {
    return { status: 'PUBLISHED', publishedAt: { lte: new Date() } };
  }

  toSummary(row: SummaryRow) {
    const t = row.translations[0];
    const isNew = !!row.publishedAt && Date.now() - row.publishedAt.getTime() < NEW_RELEASE_DAYS * 86_400_000;
    return {
      id: row.id,
      slug: row.slug,
      title: t?.title ?? row.title,
      posterUrl: this.media.publicUrl(row.posterKey),
      coverUrl: this.media.publicUrl(row.coverKey ?? row.posterKey),
      tags: row.tags,
      orientation: row.orientation,
      episodeCount: row.episodeCount,
      freeEpisodeCount: row.freeEpisodeCount,
      viewCount: Number(row.viewCount),
      favoriteCount: row.favoriteCount,
      isNew,
    };
  }

  /** Published drama summaries keyed by id (unpublished ids are simply absent). */
  async summariesByIds(ids: string[], locale: Locale) {
    if (ids.length === 0) return new Map<string, ReturnType<CatalogService['toSummary']>>();
    const rows = await this.prisma.drama.findMany({
      where: { id: { in: [...new Set(ids)] }, ...this.published() },
      select: summarySelect(locale),
    });
    return new Map(rows.map((r) => [r.id, this.toSummary(r)]));
  }

  private async likedSet(userId: string | undefined, episodeIds: string[]): Promise<Set<string>> {
    if (!userId || episodeIds.length === 0) return new Set();
    const rows = await this.prisma.like.findMany({
      where: { userId, episodeId: { in: episodeIds } },
      select: { episodeId: true },
    });
    return new Set(rows.map((r) => r.episodeId));
  }

  async listCategories(locale: Locale) {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return rows.map((c) => ({ id: c.id, slug: c.slug, name: localized(c.names, locale) }));
  }

  listDramas(query: ListDramasQuery, locale: Locale) {
    const where: Prisma.DramaWhereInput = {
      ...this.published(),
      ...(query.category ? { categories: { some: { category: { slug: query.category, isActive: true } } } } : {}),
    };
    return offsetPage(query, async (skip, take) => {
      const rows = await this.prisma.drama.findMany({
        where,
        orderBy: ORDER_BY[query.sort],
        skip,
        take,
        select: summarySelect(locale),
      });
      return rows.map((r) => this.toSummary(r));
    });
  }

  searchDramas(query: SearchDramasQuery, locale: Locale) {
    const where: Prisma.DramaWhereInput = {
      ...this.published(),
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } },
        { tags: { has: query.q.toLowerCase() } },
      ],
    };
    return offsetPage(query, async (skip, take) => {
      const rows = await this.prisma.drama.findMany({
        where,
        orderBy: ORDER_BY.popular,
        skip,
        take,
        select: summarySelect(locale),
      });
      return rows.map((r) => this.toSummary(r));
    });
  }

  async getDrama(dramaId: string, userId: string | undefined, locale: Locale) {
    const drama = await this.prisma.drama.findFirst({
      where: { id: dramaId, ...this.published() },
      select: {
        ...summarySelect(locale),
        synopsis: true,
        cast: true,
        maturityRating: true,
        defaultUnlockCoins: true,
        categories: { select: { category: { select: { slug: true, names: true, isActive: true } } } },
      },
    });
    if (!drama) throw notFound('Drama');

    const [favorite, lastWatched] = userId
      ? await Promise.all([
          this.prisma.favorite.findUnique({ where: { userId_dramaId: { userId, dramaId } } }),
          this.prisma.watchHistory.findFirst({
            where: { userId, dramaId },
            orderBy: { updatedAt: 'desc' },
            select: { episodeId: true, positionSeconds: true, completed: true, episode: { select: { number: true } } },
          }),
        ])
      : [null, null];

    return {
      ...this.toSummary(drama),
      synopsis: drama.translations[0]?.synopsis ?? drama.synopsis,
      cast: Array.isArray(drama.cast) ? drama.cast : [],
      maturityRating: drama.maturityRating,
      categories: drama.categories
        .filter((c) => c.category.isActive)
        .map((c) => ({ slug: c.category.slug, name: localized(c.category.names, locale) })),
      isFavorite: !!favorite,
      resume: lastWatched
        ? {
            episodeId: lastWatched.episodeId,
            episodeNumber: lastWatched.episode.number,
            positionSeconds: lastWatched.positionSeconds,
            completed: lastWatched.completed,
          }
        : null,
    };
  }

  /** Episodes ordered by number, keyset-paginated, each with a per-user `locked` flag. */
  async listEpisodes(dramaId: string, userId: string | undefined, query: CursorQuery) {
    const drama = await this.prisma.drama.findFirst({
      where: { id: dramaId, ...this.published() },
      select: { id: true, freeEpisodeCount: true, defaultUnlockCoins: true },
    });
    if (!drama) throw notFound('Drama');

    const after = decodeCursor(query.cursor, { n: 'number' })?.n ?? 0;
    const rows = await this.prisma.episode.findMany({
      where: { dramaId, ...this.publishedEpisode(), number: { gt: after } },
      orderBy: { number: 'asc' },
      take: query.limit + 1,
      select: {
        id: true,
        number: true,
        title: true,
        durationSeconds: true,
        thumbnailKey: true,
        access: true,
        unlockCoins: true,
        likeCount: true,
        commentCount: true,
      },
    });
    const page = rows.slice(0, query.limit);
    const [access, liked] = await Promise.all([
      this.entitlements.evaluate(
        userId,
        page.map((episode) => ({ episode, drama })),
      ),
      this.likedSet(userId, page.map((e) => e.id)),
    ]);

    const result: Page<ReturnType<typeof mapEpisode>> = {
      items: page.map((e) => mapEpisode(e, access.get(e.id)!.allowed, unlockPrice(e, drama), this.media, liked.has(e.id))),
      nextCursor: rows.length > query.limit ? encodeCursor({ n: page[page.length - 1].number }) : null,
    };
    return result;
  }

  async home(userId: string | undefined, locale: Locale) {
    const select = summarySelect(locale);
    const where = this.published();
    const [featured, trending, fresh, recommended, history] = await Promise.all([
      this.prisma.drama.findMany({ where: { ...where, isFeatured: true }, orderBy: ORDER_BY.trending, take: 8, select }),
      this.prisma.drama.findMany({ where, orderBy: ORDER_BY.trending, take: 10, select }),
      this.prisma.drama.findMany({ where, orderBy: ORDER_BY.new, take: 10, select }),
      this.prisma.drama.findMany({ where, orderBy: [{ favoriteCount: 'desc' }, { id: 'asc' }], take: 10, select }),
      userId ? this.continueWatching(userId, locale) : Promise.resolve([]),
    ]);
    return {
      featured: featured.map((r) => this.toSummary(r)),
      trending: trending.map((r) => this.toSummary(r)),
      new: fresh.map((r) => this.toSummary(r)),
      recommended: recommended.map((r) => this.toSummary(r)),
      continueWatching: history,
    };
  }

  /** Latest watched episode per drama, newest first. */
  async continueWatching(userId: string, locale: Locale, limit = 10) {
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId, completed: false },
      orderBy: { updatedAt: 'desc' },
      take: limit * 4,
      select: {
        positionSeconds: true,
        updatedAt: true,
        episode: { select: { id: true, number: true, durationSeconds: true, drama: { select: summarySelect(locale) } } },
      },
    });
    const seen = new Set<string>();
    const items = [];
    for (const row of rows) {
      const drama = row.episode.drama;
      if (seen.has(drama.id)) continue;
      seen.add(drama.id);
      items.push({
        drama: this.toSummary(drama),
        episodeId: row.episode.id,
        episodeNumber: row.episode.number,
        positionSeconds: row.positionSeconds,
        durationSeconds: row.episode.durationSeconds,
        updatedAt: row.updatedAt,
      });
      if (items.length === limit) break;
    }
    return items;
  }

  /** Vertical home feed: one entry per drama with the episode to start from. */
  feed(userId: string | undefined, query: CursorQuery, locale: Locale) {
    return offsetPage(query, async (skip, take) => {
      const dramas = await this.prisma.drama.findMany({
        where: this.published(),
        orderBy: ORDER_BY.trending,
        skip,
        take,
        select: { ...summarySelect(locale), defaultUnlockCoins: true },
      });
      if (dramas.length === 0) return [];

      const firstEpisodes = await this.prisma.episode.findMany({
        where: { dramaId: { in: dramas.map((d) => d.id) }, number: 1, ...this.publishedEpisode() },
        select: {
          id: true,
          dramaId: true,
          number: true,
          title: true,
          durationSeconds: true,
          thumbnailKey: true,
          access: true,
          unlockCoins: true,
          likeCount: true,
          commentCount: true,
        },
      });
      const byDrama = new Map(firstEpisodes.map((e) => [e.dramaId, e]));
      const withEpisode = dramas.filter((d) => byDrama.has(d.id));
      const [access, liked] = await Promise.all([
        this.entitlements.evaluate(
          userId,
          withEpisode.map((drama) => ({ episode: byDrama.get(drama.id)!, drama })),
        ),
        this.likedSet(userId, firstEpisodes.map((e) => e.id)),
      ]);

      return withEpisode.map((d) => {
        const e = byDrama.get(d.id)!;
        return {
          drama: this.toSummary(d),
          episode: mapEpisode(e, access.get(e.id)!.allowed, unlockPrice(e, d), this.media, liked.has(e.id)),
        };
      });
    });
  }
}

function mapEpisode(
  e: {
    id: string;
    number: number;
    title: string | null;
    durationSeconds: number;
    thumbnailKey: string | null;
    access: string;
    unlockCoins: number | null;
    likeCount: number;
    commentCount: number;
  },
  allowed: boolean,
  price: number,
  media: MediaUrlService,
  liked: boolean,
) {
  return {
    id: e.id,
    number: e.number,
    title: e.title,
    durationSeconds: e.durationSeconds,
    thumbnailUrl: media.publicUrl(e.thumbnailKey),
    access: e.access,
    locked: !allowed,
    unlockCoins: allowed ? null : price,
    likeCount: e.likeCount,
    commentCount: e.commentCount,
    liked,
  };
}
