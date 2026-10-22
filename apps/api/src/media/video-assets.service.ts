import { Inject, Injectable } from '@nestjs/common';
import { Prisma, VideoAssetStatus } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, Env } from '../config/env';
import { TranscodeQueue } from '../queue/transcode-queue.service';
import { StorageService, storageKeys } from './storage.service';

/** Accepted source containers → stored extension. Codec checks happen in the transcoder via ffprobe. */
export const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
};

export const MIN_UPLOAD_BYTES = 10 * 1024;

export function validateUpload(contentType: string, sizeBytes: number, maxBytes: number): string {
  const ext = VIDEO_TYPES[contentType];
  if (!ext) {
    throw new AppException('VALIDATION_FAILED', `Unsupported video type ${contentType}`, { allowed: Object.keys(VIDEO_TYPES) });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < MIN_UPLOAD_BYTES || sizeBytes > maxBytes) {
    throw new AppException('VALIDATION_FAILED', `File size must be between ${MIN_UPLOAD_BYTES} and ${maxBytes} bytes`);
  }
  return ext;
}

@Injectable()
export class VideoAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: TranscodeQueue,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createUpload(req: Request, episodeId: string, input: { contentType: string; sizeBytes: number }) {
    const ext = validateUpload(input.contentType, input.sizeBytes, this.env.UPLOAD_MAX_BYTES);
    const episode = await this.prisma.episode.findUnique({ where: { id: episodeId }, select: { id: true } });
    if (!episode) throw notFound('Episode');

    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.videoAsset.create({
        data: {
          episodeId,
          originalKey: `pending/${crypto.randomUUID()}`,
          mimeType: input.contentType,
          sizeBytes: BigInt(input.sizeBytes),
          uploadedBy: req.user?.id,
        },
      });
      const withKey = await tx.videoAsset.update({
        where: { id: created.id },
        data: { originalKey: storageKeys.original(created.id, ext) },
      });
      await this.audit.record(req, { action: 'video_asset.create', entityType: 'video_asset', entityId: created.id, after: { episodeId } }, tx);
      return withKey;
    });

    const expiresIn = 900;
    return {
      assetId: asset.id,
      uploadUrl: await this.storage.presignUpload(asset.originalKey, input.contentType, input.sizeBytes, expiresIn),
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /** Called by the admin after the browser upload finishes; verifies the object and queues transcoding. */
  async completeUpload(req: Request, assetId: string) {
    const asset = await this.prisma.videoAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw notFound('Video asset');
    if (asset.status !== 'AWAITING_UPLOAD') throw new AppException('CONFLICT', `Asset is already ${asset.status}`);

    const object = await this.storage.head(asset.originalKey);
    if (!object) throw new AppException('VALIDATION_FAILED', 'Upload not found in storage');
    if (asset.sizeBytes !== null && BigInt(object.size) !== asset.sizeBytes) {
      throw new AppException('VALIDATION_FAILED', 'Uploaded file size does not match the declared size');
    }

    // Conditional update: only one caller wins the AWAITING_UPLOAD → UPLOADED transition.
    const { count } = await this.prisma.videoAsset.updateMany({
      where: { id: assetId, status: 'AWAITING_UPLOAD' },
      data: { status: 'UPLOADED' },
    });
    if (count === 0) throw new AppException('CONFLICT', 'Asset was already completed');

    await this.queue.enqueue(assetId);
    await this.audit.record(req, { action: 'video_asset.complete', entityType: 'video_asset', entityId: assetId });
    return this.get(assetId);
  }

  async retry(req: Request, assetId: string) {
    const { count } = await this.prisma.videoAsset.updateMany({
      where: { id: assetId, status: 'FAILED' },
      data: { status: 'UPLOADED', lastError: null, attempts: 0 },
    });
    if (count === 0) throw new AppException('CONFLICT', 'Only failed assets can be retried');
    await this.queue.enqueue(assetId);
    await this.audit.record(req, { action: 'video_asset.retry', entityType: 'video_asset', entityId: assetId });
    return this.get(assetId);
  }

  async list(filter: { status?: VideoAssetStatus; episodeId?: string }, skip: number, take: number) {
    const where: Prisma.VideoAssetWhereInput = { status: filter.status, episodeId: filter.episodeId };
    const [items, total] = await Promise.all([
      this.prisma.videoAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { episode: { select: { number: true, drama: { select: { id: true, title: true } } } } },
      }),
      this.prisma.videoAsset.count({ where }),
    ]);
    return { items: items.map(serializeAsset), total };
  }

  async get(assetId: string) {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: { episode: { select: { number: true, drama: { select: { id: true, title: true } } } } },
    });
    if (!asset) throw notFound('Video asset');
    return serializeAsset(asset);
  }

  /** Points an episode at a READY asset (e.g. to roll back to a previous encode). */
  async setCurrent(req: Request, episodeId: string, assetId: string) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.videoAsset.findUnique({ where: { id: assetId } });
      if (!asset || asset.episodeId !== episodeId) throw notFound('Video asset for this episode');
      if (asset.status !== 'READY') throw new AppException('ASSET_NOT_READY', 'Asset is not READY');
      const before = await tx.episode.findUniqueOrThrow({ where: { id: episodeId }, select: { currentVideoAssetId: true } });
      const episode = await tx.episode.update({
        where: { id: episodeId },
        data: {
          currentVideoAssetId: assetId,
          durationSeconds: Math.round((asset.durationMs ?? 0) / 1000),
          thumbnailKey: asset.thumbnailKey,
        },
      });
      await this.audit.record(
        req,
        { action: 'episode.set_current_asset', entityType: 'episode', entityId: episodeId, before, after: { currentVideoAssetId: assetId } },
        tx,
      );
      return { episodeId: episode.id, currentVideoAssetId: episode.currentVideoAssetId };
    });
  }
}

function serializeAsset(a: Prisma.VideoAssetGetPayload<{ include: { episode: { select: { number: true; drama: { select: { id: true; title: true } } } } } }>) {
  return {
    id: a.id,
    episodeId: a.episodeId,
    episodeNumber: a.episode?.number ?? null,
    drama: a.episode?.drama ?? null,
    status: a.status,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes === null ? null : Number(a.sizeBytes),
    durationMs: a.durationMs,
    width: a.width,
    height: a.height,
    renditions: a.renditions,
    attempts: a.attempts,
    lastError: a.lastError,
    createdAt: a.createdAt,
    readyAt: a.readyAt,
  };
}
