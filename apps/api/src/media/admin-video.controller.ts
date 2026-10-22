import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { VideoAssetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { MAX_SUBTITLE_BYTES, SubtitlesService } from './subtitles.service';
import { VIDEO_TYPES, VideoAssetsService } from './video-assets.service';

class CreateUploadDto {
  @ApiProperty({ enum: Object.keys(VIDEO_TYPES) })
  @IsIn(Object.keys(VIDEO_TYPES))
  contentType: string;

  @ApiProperty({ description: 'Exact file size in bytes' })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}

class SubtitleUploadDto {
  @ApiProperty({ example: 'hi' }) @IsString() @Matches(/^[a-z]{2}$/) language: string;
  @ApiProperty({ maximum: MAX_SUBTITLE_BYTES }) @IsInt() @Min(8) @Max(MAX_SUBTITLE_BYTES) sizeBytes: number;
}

class SubtitleCompleteDto {
  @ApiProperty({ example: 'hi' }) @IsString() @Matches(/^[a-z]{2}$/) language: string;
  @ApiProperty({ example: 'हिन्दी' }) @IsString() @Length(1, 40) label: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

class SetCurrentAssetDto {
  @ApiProperty() @IsUUID() assetId: string;
}

class ListAssetsQuery {
  @ApiPropertyOptional({ enum: VideoAssetStatus }) @IsOptional() @IsIn(Object.values(VideoAssetStatus)) status?: VideoAssetStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() episodeId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}

@ApiTags('admin: media')
@ApiBearerAuth()
@Controller('admin')
export class AdminVideoController {
  constructor(
    private readonly assets: VideoAssetsService,
    private readonly subtitles: SubtitlesService,
  ) {}

  @Post('episodes/:id/video-assets')
  @RequirePermissions('media:write')
  createUpload(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateUploadDto) {
    return this.assets.createUpload(req, id, body);
  }

  @Post('video-assets/:id/complete')
  @RequirePermissions('media:write')
  complete(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.completeUpload(req, id);
  }

  @Post('video-assets/:id/retry')
  @RequirePermissions('media:write')
  retry(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.retry(req, id);
  }

  @Get('video-assets')
  @RequirePermissions('media:write')
  async list(@Query() q: ListAssetsQuery) {
    const { items, total } = await this.assets.list(q, (q.page - 1) * q.pageSize, q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Get('video-assets/:id')
  @RequirePermissions('media:write')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.get(id);
  }

  @Put('episodes/:id/current-asset')
  @RequirePermissions('media:write')
  setCurrent(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: SetCurrentAssetDto) {
    return this.assets.setCurrent(req, id, body.assetId);
  }

  @Get('episodes/:id/subtitles')
  @RequirePermissions('media:write')
  listSubtitles(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.subtitles.list(id);
  }

  @Post('episodes/:id/subtitles/upload-url')
  @RequirePermissions('media:write')
  subtitleUpload(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: SubtitleUploadDto) {
    return this.subtitles.createUpload(id, body.language, body.sizeBytes);
  }

  @Post('episodes/:id/subtitles')
  @RequirePermissions('media:write')
  completeSubtitle(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: SubtitleCompleteDto) {
    return this.subtitles.complete(req, id, body);
  }

  @Delete('subtitles/:id')
  @HttpCode(204)
  @RequirePermissions('media:write')
  async deleteSubtitle(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.subtitles.remove(req, id);
  }
}
