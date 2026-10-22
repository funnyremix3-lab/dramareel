import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService, storageKeys } from './storage.service';

export const MAX_SUBTITLE_BYTES = 1024 * 1024;

/**
 * Subtitles: presigned upload of a WebVTT file, then `complete` verifies the object really is
 * WebVTT before a row is created — so playback never lists a missing or bogus track.
 */
@Injectable()
export class SubtitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async assertEpisodeAndLanguage(episodeId: string, language: string) {
    const [episode, lang] = await Promise.all([
      this.prisma.episode.findUnique({ where: { id: episodeId }, select: { id: true } }),
      this.prisma.language.findUnique({ where: { code: language } }),
    ]);
    if (!episode) throw notFound('Episode');
    if (!lang) throw new AppException('VALIDATION_FAILED', `Unknown language ${language}`);
  }

  list(episodeId: string) {
    return this.prisma.subtitle.findMany({ where: { episodeId }, orderBy: { languageCode: 'asc' } });
  }

  async createUpload(episodeId: string, language: string, sizeBytes: number) {
    await this.assertEpisodeAndLanguage(episodeId, language);
    if (sizeBytes < 8 || sizeBytes > MAX_SUBTITLE_BYTES) throw new AppException('VALIDATION_FAILED', 'Subtitle file must be 8 B – 1 MB');
    const key = storageKeys.subtitle(episodeId, language);
    return {
      key,
      uploadUrl: await this.storage.presignUpload(key, 'text/vtt', sizeBytes, 600),
      method: 'PUT',
      headers: { 'Content-Type': 'text/vtt' },
    };
  }

  async complete(req: Request, episodeId: string, input: { language: string; label: string; isDefault?: boolean }) {
    await this.assertEpisodeAndLanguage(episodeId, input.language);
    const key = storageKeys.subtitle(episodeId, input.language);
    const head = await this.storage.get(key, 'bytes=0-15');
    if (!head) throw new AppException('VALIDATION_FAILED', 'Subtitle file has not been uploaded');
    const start = Buffer.concat(await head.body.toArray()).toString('utf8').replace(/^﻿/, '');
    if (!start.startsWith('WEBVTT')) {
      await this.storage.delete(key).catch(() => undefined);
      throw new AppException('VALIDATION_FAILED', 'File is not WebVTT (must start with "WEBVTT")');
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.subtitle.updateMany({ where: { episodeId }, data: { isDefault: false } });
      const row = await tx.subtitle.upsert({
        where: { episodeId_languageCode: { episodeId, languageCode: input.language } },
        create: { episodeId, languageCode: input.language, storageKey: key, label: input.label, isDefault: input.isDefault ?? false },
        update: { storageKey: key, label: input.label, isDefault: input.isDefault ?? false },
      });
      await this.audit.record(req, { action: 'subtitle.upsert', entityType: 'subtitle', entityId: row.id, after: row }, tx);
      return row;
    });
  }

  async remove(req: Request, id: string) {
    const row = await this.prisma.subtitle.findUnique({ where: { id } });
    if (!row) throw notFound('Subtitle');
    await this.prisma.subtitle.delete({ where: { id } });
    await this.storage.delete(row.storageKey).catch(() => undefined);
    await this.audit.record(req, { action: 'subtitle.delete', entityType: 'subtitle', entityId: id, before: row });
  }
}
