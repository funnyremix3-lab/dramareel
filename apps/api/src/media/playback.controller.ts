import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuth } from '../auth/decorators';
import { PlaybackService } from './playback.service';

@ApiTags('playback')
@ApiBearerAuth()
@Controller('episodes')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  /**
   * 200 with short-lived HLS URLs, or 403 EPISODE_LOCKED with unlock options.
   * Anonymous viewers may play free/preview episodes so the feed works before sign-in.
   */
  @Get(':id/playback')
  @OptionalAuth()
  authorize(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser | undefined) {
    return this.playback.authorize(user?.id, id);
  }
}
