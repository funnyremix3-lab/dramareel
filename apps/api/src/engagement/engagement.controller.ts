import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuth } from '../auth/decorators';
import { Locale, RequestLocale } from '../common/http/locale';
import { CursorQuery } from '../common/pagination/cursor';
import { CreateCommentDto, ProgressDto, ReportCommentDto } from './engagement.dto';
import { EngagementService } from './engagement.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Put('episodes/:id/progress')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  progress(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string, @Body() body: ProgressDto) {
    return this.engagement.saveProgress(user.id, id, body.positionSeconds, body.completed);
  }

  @Get('me/history')
  history(@CurrentUser() user: AuthUser, @Query() query: CursorQuery, @RequestLocale() locale: Locale) {
    return this.engagement.history(user.id, query, locale);
  }

  @Delete('me/history/:episodeId')
  @HttpCode(204)
  async removeHistory(@CurrentUser() user: AuthUser, @Param('episodeId', uuid()) episodeId: string) {
    await this.engagement.removeHistory(user.id, episodeId);
  }

  @Put('episodes/:id/like')
  like(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.like(user.id, id);
  }

  @Delete('episodes/:id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.unlike(user.id, id);
  }

  @Put('dramas/:id/favorite')
  favorite(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.favorite(user.id, id);
  }

  @Delete('dramas/:id/favorite')
  unfavorite(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.unfavorite(user.id, id);
  }

  @Get('me/favorites')
  favorites(@CurrentUser() user: AuthUser, @Query() query: CursorQuery, @RequestLocale() locale: Locale) {
    return this.engagement.favorites(user.id, query, locale);
  }

  @Get('episodes/:id/comments')
  @OptionalAuth()
  comments(@CurrentUser() user: AuthUser | undefined, @Param('id', uuid()) id: string, @Query() query: CursorQuery) {
    return this.engagement.listComments(id, user?.id, query);
  }

  @Post('episodes/:id/comments')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createComment(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string, @Body() body: CreateCommentDto) {
    return this.engagement.createComment(user.id, id, body.body, body.parentId);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async deleteComment(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    await this.engagement.deleteComment(user.id, id);
  }

  @Post('comments/:id/reports')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  report(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string, @Body() body: ReportCommentDto) {
    return this.engagement.reportComment(user.id, id, body.reason, body.details);
  }

  @Put('users/:id/block')
  block(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.block(user.id, id);
  }

  @Delete('users/:id/block')
  unblock(@CurrentUser() user: AuthUser, @Param('id', uuid()) id: string) {
    return this.engagement.unblock(user.id, id);
  }
}
