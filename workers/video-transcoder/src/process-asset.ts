import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Config } from './config';
import { probeArgs, renditionArgs, run, thumbnailArgs } from './ffmpeg';
import { masterPlaylist } from './hls';
import { planRenditions } from './ladder';
import { InvalidMediaError, parseProbe } from './probe';
import { Storage } from './storage';

export interface Deps {
  prisma: PrismaClient;
  storage: Storage;
  config: Config;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

/** Thrown for problems retrying cannot fix (bad media, missing asset). */
export class PermanentFailure extends Error {}

export const processedPrefix = (assetId: string) => `processed/${assetId}/`;
export const publicThumbnailKey = (assetId: string) => `public/thumbnails/${assetId}.jpg`;

/**
 * Transcodes one uploaded asset to HLS. Idempotent: READY assets are skipped and output paths
 * are deterministic, so a retry overwrites rather than duplicates.
 */
export async function processAsset(deps: Deps, assetId: string, finalAttempt: boolean): Promise<void> {
  const { prisma, storage, config, log } = deps;
  const asset = await prisma.videoAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new PermanentFailure(`Video asset ${assetId} not found`);
  if (asset.status === 'READY') return log('asset already READY, skipping', { assetId });
  if (asset.status === 'AWAITING_UPLOAD') throw new PermanentFailure('Upload was never completed');

  await prisma.videoAsset.update({
    where: { id: assetId },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, processingStartedAt: new Date() },
  });

  const work = await mkdtemp(join(config.WORK_DIR ?? tmpdir(), `transcode-${assetId.slice(0, 8)}-`));
  try {
    const source = join(work, 'source');
    await storage.download(asset.originalKey, source);

    const info = parseProbe(JSON.parse(await run(config.FFPROBE_PATH, probeArgs(source), 120_000)));
    const plans = planRenditions(info.width, info.height);
    log('probed', { assetId, ...info, renditions: plans.map((p) => p.name) });

    const out = join(work, 'out');
    for (const plan of plans) {
      const dir = join(out, plan.name);
      await mkdir(dir, { recursive: true });
      await run(config.FFMPEG_PATH, renditionArgs({ input: source, outDir: dir, plan, hasAudio: info.hasAudio, preset: config.X264_PRESET }));
    }
    await writeFile(join(out, 'master.m3u8'), masterPlaylist(plans, info.hasAudio));

    const at = Math.min(3, info.durationMs / 3000);
    await run(config.FFMPEG_PATH, thumbnailArgs(source, join(out, 'thumb.jpg'), at, 360));
    await run(config.FFMPEG_PATH, thumbnailArgs(source, join(out, 'poster.jpg'), at, 720));

    const prefix = processedPrefix(assetId);
    await storage.deletePrefix(prefix);
    await storage.uploadDirectory(out, prefix);
    // Episode-list thumbnails must be publicly cacheable; video stays behind playback tokens.
    await storage.upload(publicThumbnailKey(assetId), join(out, 'thumb.jpg'), 'image/jpeg', 'public, max-age=31536000, immutable');

    const renditions = plans.map((p) => ({
      name: p.name,
      width: p.width,
      height: p.height,
      bandwidth: (p.maxrateKbps + (info.hasAudio ? 128 : 0)) * 1000,
      playlistKey: `${prefix}${p.name}/index.m3u8`,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.videoAsset.update({
        where: { id: assetId },
        data: {
          status: 'READY',
          hlsMasterKey: `${prefix}master.m3u8`,
          renditions,
          thumbnailKey: `${prefix}thumb.jpg`,
          previewKey: `${prefix}poster.jpg`,
          durationMs: info.durationMs,
          width: info.width,
          height: info.height,
          lastError: null,
          readyAt: new Date(),
        },
      });
      // First READY encode becomes the episode's video automatically; later ones need an explicit switch.
      if (asset.episodeId) {
        await tx.episode.updateMany({
          where: { id: asset.episodeId, currentVideoAssetId: null },
          data: {
            currentVideoAssetId: assetId,
            durationSeconds: Math.round(info.durationMs / 1000),
            thumbnailKey: publicThumbnailKey(assetId),
          },
        });
      }
    });
    log('asset READY', { assetId });
  } catch (err) {
    const permanent = err instanceof InvalidMediaError || err instanceof PermanentFailure;
    const message = (err as Error).message.slice(0, 1000);
    await prisma.videoAsset.update({
      where: { id: assetId },
      data: { lastError: message, ...(permanent || finalAttempt ? { status: 'FAILED' } : {}) },
    });
    throw permanent && !(err instanceof PermanentFailure) ? new PermanentFailure(message) : err;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
