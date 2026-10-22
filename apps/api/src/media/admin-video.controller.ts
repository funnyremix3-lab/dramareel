import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { VideoAssetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
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
  constructor(private readonly assets: VideoAssetsService) {}

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
}
