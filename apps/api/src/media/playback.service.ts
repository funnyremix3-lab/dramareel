import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, Env } from '../config/env';
import { unlockPrice } from '../entitlements/entitlement';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { decodeSigningKey, signPlaybackToken } from './playback-token';
import { StorageService } from './storage.service';

export interface Rendition {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistKey?: string;
}

@Injectable()
export class PlaybackService {
  private readonly signingKey?: Uint8Array;
  private readonly mediaBase: string;
  private readonly ttl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly storage: StorageService,
    @Inject(ENV) env: Env,
  ) {
    if (env.PLAYBACK_SIGNING_KEY) this.signingKey = decodeSigningKey(env.PLAYBACK_SIGNING_KEY);
    this.mediaBase = env.MEDIA_BASE_URL.replace(/\/$/, '');
    this.ttl = env.PLAYBACK_TOKEN_TTL_SECONDS;
  }

  /** Authorises playback of one episode for one user and returns short-lived URLs. */
  async authorize(userId: string | undefined, episodeId: string) {
    const now = new Date();
    const episode = await this.prisma.episode.findFirst({
      where: {
        id: episodeId,
        status: 'PUBLISHED',
        publishedAt: { lte: now },
        drama: { status: 'PUBLISHED', publishedAt: { lte: now } },
      },
      include: {
        drama: { select: { id: true, freeEpisodeCount: true, defaultUnlockCoins: true } },
        currentAsset: true,
        subtitles: true,
      },
    });
    if (!episode) throw notFound('Episode');

    const access = (await this.entitlements.evaluate(userId, [{ episode, drama: episode.drama }])).get(episode.id)!;
    if (!access.allowed) {
      throw new AppException('EPISODE_LOCKED', 'This episode is locked', {
        episodeId: episode.id,
        unlockOptions: {
          coins: unlockPrice(episode, episode.drama),
          rewardedAd: { placementKey: 'episode_unlock_rewarded' },
          subscription: true,
        },
      });
    }

    const asset = episode.currentAsset;
    if (!asset || asset.status !== 'READY' || !asset.hlsMasterKey) {
      throw new AppException('ASSET_NOT_READY', 'This episode is not available yet');
    }
    if (!this.signingKey) throw new AppException('INTERNAL', 'Playback signing is not configured');

    const expiresAt = Math.floor(now.getTime() / 1000) + this.ttl;
    const token = await signPlaybackToken(this.signingKey, {
      a: asset.id,
      e: expiresAt,
      u: userId ? createHash('sha256').update(userId).digest('hex').slice(0, 10) : 'anon',
    });
    const base = `${this.mediaBase}/p/${token}/${asset.id}`;
    const masterFile = asset.hlsMasterKey.slice(`processed/${asset.id}/`.length);

    const [history, subtitles] = await Promise.all([
      userId ? this.prisma.watchHistory.findUnique({ where: { userId_episodeId: { userId, episodeId } } }) : null,
      Promise.all(
        episode.subtitles.map(async (s) => ({
          language: s.languageCode,
          label: s.label,
          isDefault: s.isDefault,
          url: await this.storage.presignDownload(s.storageKey, this.ttl),
        })),
      ),
    ]);

    const renditions = (Array.isArray(asset.renditions) ? (asset.renditions as unknown as Rendition[]) : []).map(
      ({ name, width, height, bandwidth }) => ({ name, width, height, bandwidth }),
    );

    return {
      episodeId: episode.id,
      dramaId: episode.dramaId,
      manifestUrl: `${base}/${masterFile}`,
      renditions,
      subtitles,
      thumbnailUrl: asset.thumbnailKey ? `${base}/${asset.thumbnailKey.slice(`processed/${asset.id}/`.length)}` : null,
      durationSeconds: Math.round((asset.durationMs ?? 0) / 1000) || episode.durationSeconds,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      resumePositionSeconds: history && !history.completed ? history.positionSeconds : 0,
      accessReason: access.reason,
    };
  }
}
