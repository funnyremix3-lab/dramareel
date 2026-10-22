import { Body, Controller, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CommentStatus, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminPageQuery, paged, skipTake } from './admin-common';

class ModerationQuery extends AdminPageQuery {
  @ApiPropertyOptional({ enum: CommentStatus }) @IsOptional() @IsIn(Object.values(CommentStatus)) status?: CommentStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() reported?: boolean;
}

class ResolveReportDto {
  @ApiProperty({ enum: ['ACTIONED', 'DISMISSED'] }) @IsIn(['ACTIONED', 'DISMISSED']) resolution: 'ACTIONED' | 'DISMISSED';
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async queue(q: ModerationQuery) {
    const where: Prisma.CommentWhereInput = {
      status: q.status,
      ...(q.reported ? { reportCount: { gt: 0 } } : {}),
      ...(q.q ? { body: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: q.reported ? [{ reportCount: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          user: { select: { id: true, email: true, status: true, profile: { select: { displayName: true } } } },
          episode: { select: { number: true, drama: { select: { id: true, title: true } } } },
          reports: { where: { status: 'OPEN' }, select: { id: true, reason: true, details: true, createdAt: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  /** Changes visibility and keeps episodes.comment_count equal to VISIBLE comments. */
  async setStatus(req: Request, id: string, status: CommentStatus) {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({ where: { id } });
      if (!comment) throw notFound('Comment');
      if (comment.status === status) return comment;
      const delta = (status === 'VISIBLE' ? 1 : 0) - (comment.status === 'VISIBLE' ? 1 : 0);
      const after = await tx.comment.update({ where: { id }, data: { status, moderatedBy: req.user?.id, moderatedAt: new Date() } });
      if (delta) await tx.episode.update({ where: { id: comment.episodeId }, data: { commentCount: { increment: delta } } });
      if (status !== 'VISIBLE') {
        await tx.commentReport.updateMany({ where: { commentId: id, status: 'OPEN' }, data: { status: 'ACTIONED', resolvedBy: req.user?.id, resolvedAt: new Date() } });
      }
      await this.audit.record(req, { action: `comment.${status.toLowerCase()}`, entityType: 'comment', entityId: id, before: { status: comment.status }, after: { status } }, tx);
      return after;
    });
  }

  async resolveReport(req: Request, id: string, resolution: 'ACTIONED' | 'DISMISSED') {
    const report = await this.prisma.commentReport.findUnique({ where: { id } });
    if (!report) throw notFound('Report');
    if (report.status !== 'OPEN') throw new AppException('CONFLICT', 'Report already resolved');
    const after = await this.prisma.commentReport.update({ where: { id }, data: { status: resolution, resolvedBy: req.user?.id, resolvedAt: new Date() } });
    await this.audit.record(req, { action: 'report.resolve', entityType: 'comment_report', entityId: id, after: { resolution } });
    return after;
  }
}

const uuid = () => new ParseUUIDPipe();

@ApiTags('admin: moderation')
@ApiBearerAuth()
@Controller('admin')
export class AdminModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('moderation/comments')
  @RequirePermissions('moderation:write')
  queue(@Query() q: ModerationQuery) {
    return this.moderation.queue(q);
  }

  @Post('comments/:id/hide')
  @HttpCode(200)
  @RequirePermissions('moderation:write')
  hide(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.moderation.setStatus(req, id, 'HIDDEN');
  }

  @Post('comments/:id/restore')
  @HttpCode(200)
  @RequirePermissions('moderation:write')
  restore(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.moderation.setStatus(req, id, 'VISIBLE');
  }

  @Post('comments/:id/delete')
  @HttpCode(200)
  @RequirePermissions('moderation:write')
  remove(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.moderation.setStatus(req, id, 'DELETED');
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('moderation:write')
  resolve(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: ResolveReportDto) {
    return this.moderation.resolveReport(req, id, body.resolution);
  }
}
