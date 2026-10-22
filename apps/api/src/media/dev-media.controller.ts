import { Controller, Get, Headers, Inject, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { ENV, Env } from '../config/env';
import { CONTENT_TYPES, decodeSigningKey, isServableMediaPath, verifyPlaybackToken } from './playback-token';
import { StorageService, storageKeys } from './storage.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_FILE = /^(posters|avatars|creatives|thumbnails)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

/**
 * LOCAL DEVELOPMENT ONLY — mirrors the Cloudflare media worker so the app can play HLS from
 * local object storage. Registered only when DEV_MEDIA_PROXY=true (rejected in production).
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('dev-media')
export class DevMediaController {
  private readonly key?: Uint8Array;

  constructor(
    private readonly storage: StorageService,
    @Inject(ENV) env: Env,
  ) {
    if (env.PLAYBACK_SIGNING_KEY) this.key = decodeSigningKey(env.PLAYBACK_SIGNING_KEY);
  }

  @Get('p/:token/:assetId/*path')
  async playback(
    @Param('token') token: string,
    @Param('assetId') assetId: string,
    @Param('path') pathParam: string | string[],
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
    if (!this.key || !UUID.test(assetId) || !isServableMediaPath(path)) return void res.sendStatus(404);
    const claims = await verifyPlaybackToken(this.key, token, assetId, Math.floor(Date.now() / 1000));
    if (!claims) return void res.sendStatus(403);
    await this.stream(storageKeys.processed(assetId, path), path, range, res, 'private, max-age=60');
  }

  @Get('public/*path')
  async publicFile(@Param('path') pathParam: string | string[], @Res() res: Response) {
    const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;
    if (!PUBLIC_FILE.test(path)) return void res.sendStatus(404);
    await this.stream(`public/${path}`, path, undefined, res, 'public, max-age=86400');
  }

  private async stream(key: string, path: string, range: string | undefined, res: Response, cache: string) {
    const object = await this.storage.get(key, range);
    if (!object) return void res.sendStatus(404);
    const ext = path.slice(path.lastIndexOf('.') + 1);
    res.status(object.contentRange ? 206 : 200);
    res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? object.contentType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', cache);
    res.setHeader('Accept-Ranges', 'bytes');
    if (object.contentLength !== undefined) res.setHeader('Content-Length', String(object.contentLength));
    if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
    object.body.pipe(res);
  }
}
