import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { MediaUrlService } from '../common/http/media-url';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../media/storage.service';
import { paged, plain, skipTake } from './admin-common';
import { CategoryDto, CreateDramaDto, CreateEpisodeDto, DramaInputDto, DramaListQuery, EpisodeInputDto, LanguageDto, TranslationDto } from './catalog.dto';

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
type Tx = Prisma.TransactionClient;

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly media: MediaUrlService,
  ) {}

  // ───────── Dramas ─────────

  async listDramas(q: DramaListQuery) {
    const where: Prisma.DramaWhereInput = {
      status: q.status,
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.drama.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...skipTake(q),
        include: { _count: { select: { episodes: true } } },
      }),
      this.prisma.drama.count({ where }),
    ]);
    return paged(
      rows.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        status: d.status,
        posterUrl: this.media.publicUrl(d.posterKey),
        episodeCount: d._count.episodes,
        publishedEpisodeCount: d.episodeCount,
        viewCount: Number(d.viewCount),
        isFeatured: d.isFeatured,
        publishedAt: d.publishedAt,
        updatedAt: d.updatedAt,
      })),
      total,
      q,
    );
  }

  async getDrama(id: string) {
    const d = await this.prisma.drama.findUnique({
      where: { id },
      include: { translations: true, categories: { include: { category: true } }, seasons: { orderBy: { number: 'asc' } } },
    });
    if (!d) throw notFound('Drama');
    return plain({
      ...d,
      posterUrl: this.media.publicUrl(d.posterKey),
      coverUrl: this.media.publicUrl(d.coverKey),
      categories: d.categories.map((c) => c.category.slug),
    });
  }

  private async categoryIds(tx: Tx, slugs: string[]) {
    const rows = await tx.category.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const missing = slugs.filter((s) => !rows.some((r) => r.slug === s));
    if (missing.length) throw new AppException('VALIDATION_FAILED', `Unknown categories: ${missing.join(', ')}`);
    return rows.map((r) => r.id);
  }

  private assertImageKey(dramaId: string, key: string | undefined) {
    if (key !== undefined && !key.startsWith(`public/posters/${dramaId}-`) && !/^https:\/\//.test(key)) {
      throw new AppException('VALIDATION_FAILED', 'Image key must come from the poster upload endpoint');
    }
  }

  private dramaData(input: DramaInputDto) {
    const { categorySlugs: _c, cast, ...rest } = input;
    return { ...rest, ...(cast ? { cast: cast as unknown as Prisma.InputJsonValue } : {}) };
  }

  async createDrama(req: Request, input: CreateDramaDto) {
    // Uploaded images are keyed by drama id, so a new drama can only reference external https images.
    if ([input.posterKey, input.coverKey].some((k) => k !== undefined && !/^https:\/\//.test(k))) {
      throw new AppException('VALIDATION_FAILED', 'Upload images after creating the drama');
    }
    return this.prisma.$transaction(async (tx) => {
      const drama = await tx.drama.create({ data: { ...this.dramaData(input), status: 'DRAFT' } as Prisma.DramaUncheckedCreateInput });
      await tx.season.create({ data: { dramaId: drama.id, number: 1 } });
      if (input.categorySlugs?.length) {
        const ids = await this.categoryIds(tx, input.categorySlugs);
        await tx.dramaCategory.createMany({ data: ids.map((categoryId) => ({ dramaId: drama.id, categoryId })) });
      }
      await this.audit.record(req, { action: 'drama.create', entityType: 'drama', entityId: drama.id, after: plain(drama) }, tx);
      return plain(drama);
    });
  }

  async updateDrama(req: Request, id: string, input: DramaInputDto) {
    this.assertImageKey(id, input.posterKey);
    this.assertImageKey(id, input.coverKey);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.drama.findUnique({ where: { id } });
      if (!before) throw notFound('Drama');
      const after = await tx.drama.update({ where: { id }, data: this.dramaData(input) as Prisma.DramaUncheckedUpdateInput });
      if (input.categorySlugs) {
        const ids = await this.categoryIds(tx, input.categorySlugs);
        await tx.dramaCategory.deleteMany({ where: { dramaId: id } });
        await tx.dramaCategory.createMany({ data: ids.map((categoryId) => ({ dramaId: id, categoryId })) });
      }
      await this.audit.record(req, { action: 'drama.update', entityType: 'drama', entityId: id, before: plain(before), after: plain(after) }, tx);
      return plain(after);
    });
  }

  /** Publishing requires at least one published episode so viewers never see an empty drama. */
  async setDramaStatus(req: Request, id: string, status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') {
    return this.prisma.$transaction(async (tx) => {
      const drama = await tx.drama.findUnique({ where: { id } });
      if (!drama) throw notFound('Drama');
      if (status === 'PUBLISHED') {
        const published = await tx.episode.count({ where: { dramaId: id, status: 'PUBLISHED' } });
        if (published === 0) throw new AppException('CONFLICT', 'Publish at least one episode first');
      }
      const after = await tx.drama.update({
        where: { id },
        data: { status, publishedAt: status === 'PUBLISHED' ? (drama.publishedAt ?? new Date()) : drama.publishedAt },
      });
      await this.audit.record(req, { action: `drama.${status.toLowerCase()}`, entityType: 'drama', entityId: id, before: { status: drama.status }, after: { status } }, tx);
      return plain(after);
    });
  }

  async deleteDrama(req: Request, id: string) {
    const drama = await this.prisma.drama.findUnique({ where: { id }, include: { _count: { select: { episodes: true } } } });
    if (!drama) throw notFound('Drama');
    if (drama.status === 'PUBLISHED' || drama._count.episodes > 0) {
      throw new AppException('CONFLICT', 'Only empty, unpublished dramas can be deleted — archive it instead');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.drama.delete({ where: { id } });
      await this.audit.record(req, { action: 'drama.delete', entityType: 'drama', entityId: id, before: plain(drama) }, tx);
    });
  }

  async putTranslation(req: Request, id: string, lang: string, input: TranslationDto) {
    const language = await this.prisma.language.findUnique({ where: { code: lang } });
    if (!language) throw new AppException('VALIDATION_FAILED', `Unknown language ${lang}`);
    if (!(await this.prisma.drama.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Drama');
    const row = await this.prisma.dramaTranslation.upsert({
      where: { dramaId_languageCode: { dramaId: id, languageCode: lang } },
      create: { dramaId: id, languageCode: lang, ...input },
      update: input,
    });
    await this.audit.record(req, { action: 'drama.translation', entityType: 'drama', entityId: id, after: row });
    return row;
  }

  async posterUploadUrl(id: string, contentType: string, sizeBytes: number) {
    if (!(await this.prisma.drama.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Drama');
    const key = `public/posters/${id}-${randomBytes(6).toString('hex')}.${IMAGE_EXT[contentType]}`;
    return {
      key,
      uploadUrl: await this.storage.presignUpload(key, contentType, sizeBytes, 600),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      publicUrl: this.media.publicUrl(key),
    };
  }

  // ───────── Episodes ─────────

  async listEpisodes(dramaId: string) {
    const rows = await this.prisma.episode.findMany({
      where: { dramaId },
      orderBy: { number: 'asc' },
      include: { currentAsset: { select: { id: true, status: true, durationMs: true } }, _count: { select: { videoAssets: true } } },
    });
    return rows.map((e) =>
      plain({
        id: e.id,
        number: e.number,
        title: e.title,
        status: e.status,
        access: e.access,
        unlockCoins: e.unlockCoins,
        durationSeconds: e.durationSeconds,
        thumbnailUrl: this.media.publicUrl(e.thumbnailKey),
        currentAsset: e.currentAsset,
        assetCount: e._count.videoAssets,
        viewCount: e.viewCount,
        likeCount: e.likeCount,
        commentCount: e.commentCount,
        publishedAt: e.publishedAt,
      }),
    );
  }

  async createEpisode(req: Request, dramaId: string, input: CreateEpisodeDto) {
    return this.prisma.$transaction(async (tx) => {
      const drama = await tx.drama.findUnique({ where: { id: dramaId }, include: { seasons: { orderBy: { number: 'asc' }, take: 1 } } });
      if (!drama) throw notFound('Drama');
      const season = drama.seasons[0] ?? (await tx.season.create({ data: { dramaId, number: 1 } }));
      const last = await tx.episode.findFirst({ where: { dramaId }, orderBy: { number: 'desc' }, select: { number: true } });
      const number = input.number ?? (last?.number ?? 0) + 1;
      const episode = await tx.episode.create({
        data: {
          dramaId,
          seasonId: season.id,
          number,
          title: input.title,
          synopsis: input.synopsis,
          access: input.access ?? (number <= drama.freeEpisodeCount ? 'FREE' : 'PREMIUM'),
          unlockCoins: input.unlockCoins ?? null,
          status: 'DRAFT',
        },
      });
      await this.audit.record(req, { action: 'episode.create', entityType: 'episode', entityId: episode.id, after: plain(episode) }, tx);
      return plain(episode);
    });
  }

  async updateEpisode(req: Request, id: string, input: EpisodeInputDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.episode.findUnique({ where: { id } });
      if (!before) throw notFound('Episode');
      const after = await tx.episode.update({ where: { id }, data: input });
      await this.audit.record(req, { action: 'episode.update', entityType: 'episode', entityId: id, before: plain(before), after: plain(after) }, tx);
      return plain(after);
    });
  }

  /** Keeps dramas.episode_count equal to the number of published episodes. */
  private async refreshEpisodeCount(tx: Tx, dramaId: string) {
    const count = await tx.episode.count({ where: { dramaId, status: 'PUBLISHED' } });
    await tx.drama.update({ where: { id: dramaId }, data: { episodeCount: count } });
  }

  async setEpisodeStatus(req: Request, id: string, status: 'PUBLISHED' | 'DRAFT') {
    return this.prisma.$transaction(async (tx) => {
      const episode = await tx.episode.findUnique({ where: { id }, include: { currentAsset: { select: { status: true } } } });
      if (!episode) throw notFound('Episode');
      if (status === 'PUBLISHED' && episode.currentAsset?.status !== 'READY') {
        throw new AppException('ASSET_NOT_READY', 'Upload and process a video before publishing');
      }
      const after = await tx.episode.update({
        where: { id },
        data: { status, publishedAt: status === 'PUBLISHED' ? (episode.publishedAt ?? new Date()) : episode.publishedAt },
      });
      await this.refreshEpisodeCount(tx, episode.dramaId);
      await this.audit.record(req, { action: `episode.${status.toLowerCase()}`, entityType: 'episode', entityId: id, before: { status: episode.status }, after: { status } }, tx);
      return plain(after);
    });
  }

  async deleteEpisode(req: Request, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const episode = await tx.episode.findUnique({ where: { id } });
      if (!episode) throw notFound('Episode');
      if (episode.status === 'PUBLISHED') throw new AppException('CONFLICT', 'Unpublish the episode before deleting it');
      if ((await tx.episodeUnlock.count({ where: { episodeId: id } })) > 0) {
        throw new AppException('CONFLICT', 'Viewers have unlocked this episode; keep it unpublished instead');
      }
      await tx.episode.delete({ where: { id } });
      await this.audit.record(req, { action: 'episode.delete', entityType: 'episode', entityId: id, before: plain(episode) }, tx);
    });
  }

  // ───────── Taxonomy ─────────

  listCategories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }], include: { _count: { select: { dramas: true } } } });
  }

  async upsertCategory(req: Request, input: CategoryDto) {
    if (!input.names.en) throw new AppException('VALIDATION_FAILED', 'An English name is required');
    const row = await this.prisma.category.upsert({
      where: { slug: input.slug },
      create: { slug: input.slug, names: input.names, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true },
      update: { names: input.names, sortOrder: input.sortOrder, isActive: input.isActive },
    });
    await this.audit.record(req, { action: 'category.upsert', entityType: 'category', entityId: row.id, after: row });
    return row;
  }

  listLanguages() {
    return this.prisma.language.findMany({ orderBy: { code: 'asc' } });
  }

  async upsertLanguage(req: Request, input: LanguageDto) {
    const row = await this.prisma.language.upsert({ where: { code: input.code }, create: { ...input, enabled: input.enabled ?? true }, update: input });
    await this.audit.record(req, { action: 'language.upsert', entityType: 'language', entityId: row.code, after: row });
    return row;
  }
}
