import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ImportJob, ImportJobStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../media/storage.service';
import { CreateImportDto, IMPORT_SOURCE_TYPES, UpdateImportDto } from './imports.dto';

/** Where a long import source is uploaded; private, deleted once the job is done. */
const sourceKey = (id: string, ext: string) => `imports/${id}/source.${ext}`;

function serialize(job: ImportJob) {
  return {
    ...job,
    sourceSizeBytes: job.sourceSizeBytes === null ? null : Number(job.sourceSizeBytes),
  };
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Presigned PUT for the long source video. The returned key goes back in POST /admin/imports. */
  async sourceUploadUrl(contentType: string, sizeBytes: number) {
    const ext = IMPORT_SOURCE_TYPES[contentType];
    if (!ext) throw new AppException('VALIDATION_FAILED', 'Unsupported video type');
    const key = sourceKey(randomUUID(), ext);
    const expiresIn = 6 * 60 * 60; // large files upload slowly
    return {
      sourceKey: key,
      uploadUrl: await this.storage.presignUpload(key, contentType, sizeBytes, expiresIn),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async create(req: Request, dto: CreateImportDto) {
    if (!/^imports\/[0-9a-f-]+\/source\.[a-z0-9]+$/.test(dto.sourceKey)) throw new AppException('VALIDATION_FAILED', 'Invalid sourceKey');
    if (await this.prisma.drama.findUnique({ where: { slug: dto.slug }, select: { id: true } })) {
      throw new AppException('VALIDATION_FAILED', 'A drama with this slug already exists');
    }
    // The drama is created later by the runner, so also guard against a second import claiming the slug.
    if (await this.prisma.importJob.findFirst({ where: { slug: dto.slug, status: { in: ['PENDING', 'RUNNING', 'READY'] } }, select: { id: true } })) {
      throw new AppException('VALIDATION_FAILED', 'An import for this slug is already in progress');
    }
    const job = await this.prisma.importJob.create({
      data: {
        sourceKey: dto.sourceKey,
        sourceSizeBytes: dto.sourceSizeBytes ? BigInt(dto.sourceSizeBytes) : null,
        title: dto.title,
        slug: dto.slug,
        synopsis: dto.synopsis ?? null,
        primaryLanguageCode: dto.primaryLanguageCode ?? 'en',
        categorySlugs: dto.categorySlugs ?? [],
        freeEpisodeCount: dto.freeEpisodeCount ?? 10,
        defaultUnlockCoins: dto.defaultUnlockCoins ?? 30,
        targetSeconds: dto.targetSeconds ?? 90,
        toleranceSeconds: dto.toleranceSeconds ?? 20,
        autoPublish: dto.autoPublish ?? true,
        createdBy: req.user?.id ?? null,
      },
    });
    await this.audit.record(req, { action: 'import.create', entityType: 'import_job', entityId: job.id, after: { slug: job.slug } });
    return serialize(job);
  }

  async list(status: ImportJobStatus | undefined, limit: number) {
    const jobs = await this.prisma.importJob.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { items: jobs.map(serialize) };
  }

  async get(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new AppException('NOT_FOUND', 'Import job not found');
    return serialize(job);
  }

  async cancel(req: Request, id: string) {
    const job = await this.get(id);
    if (job.status === 'DONE') throw new AppException('VALIDATION_FAILED', 'This import has already finished');
    await this.prisma.importJob.update({ where: { id }, data: { status: 'CANCELED', finishedAt: new Date() } });
    await this.audit.record(req, { action: 'import.cancel', entityType: 'import_job', entityId: id });
    return this.get(id);
  }

  async retry(req: Request, id: string) {
    const job = await this.get(id);
    if (job.status !== 'FAILED' && job.status !== 'CANCELED') throw new AppException('VALIDATION_FAILED', 'Only a failed or canceled import can be retried');
    await this.prisma.importJob.update({ where: { id }, data: { status: 'PENDING', lastError: null, claimedAt: null, finishedAt: null } });
    await this.audit.record(req, { action: 'import.retry', entityType: 'import_job', entityId: id });
    return this.get(id);
  }

  /** Atomically claims a PENDING job for the runner and hands back a presigned download for the source. */
  async claim(id: string) {
    const claimed = await this.prisma.importJob.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'RUNNING', claimedAt: new Date(), step: 'Preparing' } });
    if (claimed.count === 0) {
      const job = await this.prisma.importJob.findUnique({ where: { id }, select: { status: true } });
      throw new AppException('VALIDATION_FAILED', `Import job is ${job?.status ?? 'missing'}, not PENDING`);
    }
    const job = await this.get(id);
    return { job, sourceUrl: await this.storage.presignDownload(job.sourceKey, 6 * 60 * 60) };
  }

  async update(req: Request, id: string, dto: UpdateImportDto) {
    const existing = await this.get(id);
    if (existing.status === 'CANCELED') throw new AppException('VALIDATION_FAILED', 'This import was canceled');
    const data: Prisma.ImportJobUpdateInput = {
      step: dto.step ?? undefined,
      totalEpisodes: dto.totalEpisodes ?? undefined,
      uploadedEpisodes: dto.uploadedEpisodes ?? undefined,
      publishedEpisodes: dto.publishedEpisodes ?? undefined,
      lastError: dto.lastError ?? undefined,
    };
    if (dto.dramaId) data.drama = { connect: { id: dto.dramaId } };
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'DONE' || dto.status === 'FAILED') data.finishedAt = new Date();
    }
    await this.prisma.importJob.update({ where: { id }, data });
    return this.get(id);
  }
}
