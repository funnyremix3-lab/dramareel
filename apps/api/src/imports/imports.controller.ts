import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { CreateImportDto, ListImportsQuery, SourceUploadDto, UpdateImportDto } from './imports.dto';
import { ImportsService } from './imports.service';

/**
 * Bulk video import. The admin uploads one long source video and creates a job; a local import
 * runner claims it, splits it into episodes and reports progress back here.
 */
@ApiTags('admin: imports')
@ApiBearerAuth()
@Controller('admin/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('source-upload-url')
  @RequirePermissions('media:write')
  sourceUploadUrl(@Body() body: SourceUploadDto) {
    return this.imports.sourceUploadUrl(body.contentType, body.sizeBytes);
  }

  @Post()
  @RequirePermissions('media:write', 'dramas:write')
  create(@Req() req: Request, @Body() body: CreateImportDto) {
    return this.imports.create(req, body);
  }

  @Get()
  @RequirePermissions('media:write')
  list(@Query() q: ListImportsQuery) {
    return this.imports.list(q.status, q.limit);
  }

  @Get(':id')
  @RequirePermissions('media:write')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.get(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('media:write')
  cancel(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.cancel(req, id);
  }

  @Post(':id/retry')
  @RequirePermissions('media:write')
  retry(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.retry(req, id);
  }

  // Runner-facing: claim a pending job and report progress. Same media:write permission.
  @Post(':id/claim')
  @RequirePermissions('media:write', 'dramas:write')
  claim(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.claim(id);
  }

  @Patch(':id')
  @RequirePermissions('media:write', 'dramas:write')
  update(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateImportDto) {
    return this.imports.update(req, id, body);
  }
}
