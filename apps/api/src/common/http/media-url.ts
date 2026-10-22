import { Inject, Injectable } from '@nestjs/common';
import { ENV, Env } from '../../config/env';

/** Builds public URLs for non-secret images (posters, thumbnails, avatars). Video never goes through here. */
@Injectable()
export class MediaUrlService {
  private readonly base: string;

  constructor(@Inject(ENV) env: Env) {
    this.base = env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  publicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    if (/^https?:\/\//.test(key)) return key;
    return `${this.base}/${key.replace(/^\//, '')}`;
  }
}
