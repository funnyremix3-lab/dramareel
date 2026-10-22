import { DynamicModule, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { AdminVideoController } from './admin-video.controller';
import { DevMediaController } from './dev-media.controller';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { StorageService } from './storage.service';
import { SubtitlesService } from './subtitles.service';
import { VideoAssetsService } from './video-assets.service';

@Module({})
export class MediaModule {
  static register(): DynamicModule {
    const env = loadEnv();
    return {
      module: MediaModule,
      global: true,
      controllers: [PlaybackController, AdminVideoController, ...(env.DEV_MEDIA_PROXY ? [DevMediaController] : [])],
      providers: [StorageService, PlaybackService, VideoAssetsService, SubtitlesService],
      exports: [StorageService, PlaybackService],
    };
  }
}
