import { Body, Controller, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import type { Request, Response } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminPageQuery, paged, plain, skipTake, toCsv } from './admin-common';
import { ProductDto, ReportRangeQuery } from './ads.dto';

const DAY = 86_400_000;
const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

class AuditQuery extends AdminPageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

class Localised {
  @ApiProperty() @IsString() @MaxLength(120) en: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) hi?: string;
}

class Audience {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() all?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('4', { each: true }) userIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsIn(['en', 'hi'], { each: true }) languages?: string[];
}

class NotificationDto {
  @ApiProperty({ type: Localised }) @IsObject() @ValidateNested() @Type(() => Localised) title: Localised;
  @ApiProperty({ type: Localised }) @IsObject() @ValidateNested() @Type(() => Localised) body: Localised;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^reeldrama:\/\/[\w\-/?=&]*$/) @MaxLength(300) deepLink?: string;
  @ApiProperty({ type: Audience }) @IsObject() @ValidateNested() @Type(() => Audience) audience: Audience;
}

class ScheduleDto {
  @ApiPropertyOptional({ description: 'Omit to send as soon as the worker picks it up' }) @IsOptional() @IsDateString() scheduledAt?: string;
}

const REPORT_KINDS = ['plays', 'rewards', 'wallet', 'signups', 'revenue-direct', 'revenue-network'] as const;
type ReportKind = (typeof REPORT_KINDS)[number];

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const now = new Date();
    const today = startOfUtcDay(now);
    const dayAgo = new Date(now.getTime() - DAY);
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const p = this.prisma;
    const [users, newToday, dau, wau, playsToday, unlocks, coinsIn, coinsSpent, rewardsToday, assets, openReports, topDramas, directToday, network7d] =
      await Promise.all([
        p.user.count({ where: { status: { not: 'DELETED' } } }),
        p.user.count({ where: { createdAt: { gte: today } } }),
        p.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
        p.user.count({ where: { lastSeenAt: { gte: weekAgo } } }),
        p.watchHistory.count({ where: { createdAt: { gte: today } } }),
        p.episodeUnlock.groupBy({ by: ['method'], where: { createdAt: { gte: today } }, _count: true }),
        p.walletTransaction.groupBy({ by: ['type'], where: { createdAt: { gte: today }, amount: { gt: 0 } }, _sum: { amount: true } }),
        p.walletTransaction.aggregate({ where: { createdAt: { gte: today }, type: 'EPISODE_UNLOCK' }, _sum: { amount: true } }),
        p.rewardClaim.count({ where: { grantedAt: { gte: today } } }),
        p.videoAsset.groupBy({ by: ['status'], _count: true }),
        p.commentReport.count({ where: { status: 'OPEN' } }),
        p.drama.findMany({ orderBy: { viewCount: 'desc' }, take: 10, select: { id: true, title: true, viewCount: true, favoriteCount: true, status: true } }),
        Promise.all([p.adImpression.count({ where: { occurredAt: { gte: today } } }), p.adClick.count({ where: { occurredAt: { gte: today } } })]),
        p.adNetworkDailyReport.aggregate({ where: { reportDate: { gte: new Date(today.getTime() - 7 * DAY) } }, _sum: { estimatedEarningsMicros: true, impressions: true } }),
      ]);
    return plain({
      generatedAt: now,
      users: { total: users, newToday, dau, wau },
      engagement: { playsToday, rewardsGrantedToday: rewardsToday },
      unlocksToday: Object.fromEntries(unlocks.map((u) => [u.method, u._count])),
      coins: { issuedToday: Object.fromEntries(coinsIn.map((c) => [c.type, c._sum.amount ?? 0])), spentOnUnlocksToday: -(coinsSpent._sum.amount ?? 0) },
      media: Object.fromEntries(assets.map((a) => [a.status, a._count])),
      moderation: { openReports },
      ads: {
        direct: { impressionsToday: directToday[0], clicksToday: directToday[1] },
        network: { last7DaysImpressions: network7d._sum.impressions ?? 0, last7DaysEarningsMicros: network7d._sum.estimatedEarningsMicros ?? 0 },
      },
      topDramas,
    });
  }

  async auditLogs(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      actorId: q.actorId,
      entityType: q.entityType,
      entityId: q.entityId,
      createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined },
      ...(q.q ? { action: { contains: q.q } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q), include: { actor: { select: { email: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  // ───────── Notifications ─────────

  async listNotifications(q: AdminPageQuery) {
    const [rows, total] = await Promise.all([
      this.prisma.notificationJob.findMany({ orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.notificationJob.count(),
    ]);
    return paged(rows, total, q);
  }

  private validAudience(a: Audience) {
    const modes = [a.all ? 1 : 0, a.userIds?.length ? 1 : 0, a.languages?.length ? 1 : 0].reduce((x, y) => x + y, 0);
    if (modes !== 1) throw new AppException('VALIDATION_FAILED', 'Choose exactly one audience: all, userIds or languages');
  }

  async createNotification(req: Request, input: NotificationDto) {
    this.validAudience(input.audience);
    const job = await this.prisma.notificationJob.create({
      data: {
        title: input.title as unknown as Prisma.InputJsonValue,
        body: input.body as unknown as Prisma.InputJsonValue,
        deepLink: input.deepLink,
        audience: input.audience as unknown as Prisma.InputJsonValue,
        createdBy: req.user?.id,
      },
    });
    await this.audit.record(req, { action: 'notification.create', entityType: 'notification_job', entityId: job.id, after: job });
    return job;
  }

  async scheduleNotification(req: Request, id: string, scheduledAt?: string) {
    const when = scheduledAt ? new Date(scheduledAt) : new Date();
    const { count } = await this.prisma.notificationJob.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SCHEDULED', scheduledAt: when } });
    if (!count) throw new AppException('CONFLICT', 'Only draft or scheduled notifications can be scheduled');
    await this.audit.record(req, { action: 'notification.schedule', entityType: 'notification_job', entityId: id, after: { scheduledAt: when } });
    return this.prisma.notificationJob.findUnique({ where: { id } });
  }

  async cancelNotification(req: Request, id: string) {
    const { count } = await this.prisma.notificationJob.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'CANCELED' } });
    if (!count) throw new AppException('CONFLICT', 'Notification is already sending or finished');
    await this.audit.record(req, { action: 'notification.cancel', entityType: 'notification_job', entityId: id });
    return this.prisma.notificationJob.findUnique({ where: { id } });
  }

  // ───────── Products ─────────

  listProducts() {
    return this.prisma.product.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async upsertProduct(req: Request, input: ProductDto) {
    if (input.kind === 'COIN_PACK' && !input.coins) throw new AppException('VALIDATION_FAILED', 'Coin packs need coins');
    if (input.kind === 'SUBSCRIPTION' && !input.periodDays) throw new AppException('VALIDATION_FAILED', 'Subscriptions need periodDays');
    const before = await this.prisma.product.findUnique({ where: { sku: input.sku } });
    if (before && before.kind !== input.kind) throw new AppException('CONFLICT', 'A SKU cannot change kind');
    const after = await this.prisma.product.upsert({ where: { sku: input.sku }, create: input, update: input });
    await this.audit.record(req, { action: 'product.upsert', entityType: 'product', entityId: after.id, before, after });
    return after;
  }

  // ───────── CSV reports ─────────

  async report(kind: ReportKind, from: Date, to: Date): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
    const end = new Date(to.getTime() + DAY);
    switch (kind) {
      case 'plays':
        return {
          columns: ['day', 'drama', 'plays', 'completed'],
          rows: await this.prisma.$queryRaw`
            SELECT date_trunc('day', w.created_at)::date AS day, d.title AS drama, COUNT(*)::int AS plays, COUNT(*) FILTER (WHERE w.completed)::int AS completed
            FROM watch_history w JOIN dramas d ON d.id = w.drama_id
            WHERE w.created_at >= ${from} AND w.created_at < ${end}
            GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
        };
      case 'rewards':
        return {
          columns: ['day', 'placement', 'status', 'claims', 'coins'],
          rows: await this.prisma.$queryRaw`
            SELECT date_trunc('day', r.created_at)::date AS day, p.key AS placement, r.status::text AS status, COUNT(*)::int AS claims, SUM(r.coins)::int AS coins
            FROM reward_claims r JOIN ad_placements p ON p.id = r.placement_id
            WHERE r.created_at >= ${from} AND r.created_at < ${end}
            GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
        };
      case 'wallet':
        return {
          columns: ['day', 'type', 'transactions', 'coins'],
          rows: await this.prisma.$queryRaw`
            SELECT date_trunc('day', created_at)::date AS day, type::text AS type, COUNT(*)::int AS transactions, SUM(amount)::int AS coins
            FROM wallet_transactions WHERE created_at >= ${from} AND created_at < ${end}
            GROUP BY 1, 2 ORDER BY 1, 2`,
        };
      case 'signups':
        return {
          columns: ['day', 'signups'],
          rows: await this.prisma.$queryRaw`
            SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS signups
            FROM users WHERE created_at >= ${from} AND created_at < ${end} GROUP BY 1 ORDER BY 1`,
        };
      case 'revenue-direct':
        return {
          columns: ['day', 'campaign', 'advertiser', 'pricing_model', 'impressions', 'clicks', 'spend_paise'],
          rows: await this.prisma.$queryRaw`
            WITH days AS (
              SELECT campaign_id, date_trunc('day', occurred_at)::date AS day, COUNT(*)::int AS impressions, 0 AS clicks FROM ad_impressions
              WHERE occurred_at >= ${from} AND occurred_at < ${end} GROUP BY 1, 2
              UNION ALL
              SELECT campaign_id, date_trunc('day', occurred_at)::date, 0, COUNT(*)::int FROM ad_clicks
              WHERE occurred_at >= ${from} AND occurred_at < ${end} GROUP BY 1, 2)
            SELECT d.day, c.name AS campaign, c.advertiser_name AS advertiser, c.pricing_model::text AS pricing_model,
                   SUM(d.impressions)::int AS impressions, SUM(d.clicks)::int AS clicks,
                   (CASE c.pricing_model WHEN 'CPM' THEN SUM(d.impressions) * c.rate_paise / 1000
                                         WHEN 'CPC' THEN SUM(d.clicks) * c.rate_paise ELSE 0 END)::bigint AS spend_paise
            FROM days d JOIN ad_campaigns c ON c.id = d.campaign_id
            GROUP BY d.day, c.id ORDER BY d.day, c.name`,
        };
      case 'revenue-network':
        return {
          columns: ['day', 'ad_unit_id', 'impressions', 'clicks', 'estimated_earnings_micros', 'currency'],
          rows: (await this.prisma.adNetworkDailyReport.findMany({ where: { reportDate: { gte: from, lte: to } }, orderBy: [{ reportDate: 'asc' }] })).map((r) => ({
            day: r.reportDate.toISOString().slice(0, 10),
            ad_unit_id: r.adUnitId,
            impressions: r.impressions,
            clicks: r.clicks,
            estimated_earnings_micros: r.estimatedEarningsMicros,
            currency: r.currency,
          })),
        };
    }
  }
}

const uuid = () => new ParseUUIDPipe();

@ApiTags('admin: operations')
@ApiBearerAuth()
@Controller('admin')
export class AdminOpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('overview')
  @RequirePermissions('analytics:read')
  overview() {
    return this.ops.overview();
  }

  @Get('audit-logs')
  @RequirePermissions('audit:read')
  auditLogs(@Query() q: AuditQuery) {
    return this.ops.auditLogs(q);
  }

  @Get('notifications')
  @RequirePermissions('notifications:write')
  notifications(@Query() q: AdminPageQuery) {
    return this.ops.listNotifications(q);
  }

  @Post('notifications')
  @RequirePermissions('notifications:write')
  createNotification(@Req() req: Request, @Body() body: NotificationDto) {
    return this.ops.createNotification(req, body);
  }

  @Post('notifications/:id/schedule')
  @HttpCode(200)
  @RequirePermissions('notifications:write')
  schedule(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: ScheduleDto) {
    return this.ops.scheduleNotification(req, id, body.scheduledAt);
  }

  @Post('notifications/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('notifications:write')
  cancel(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ops.cancelNotification(req, id);
  }

  @Get('products')
  @RequirePermissions('monetization:write')
  products() {
    return this.ops.listProducts();
  }

  @Put('products')
  @RequirePermissions('monetization:write')
  upsertProduct(@Req() req: Request, @Body() body: ProductDto) {
    return this.ops.upsertProduct(req, body);
  }

  /** CSV export, e.g. GET /admin/reports/plays.csv?from=2026-10-01&to=2026-10-22 */
  @Get('reports/:kind.csv')
  @RequirePermissions('analytics:read')
  async report(@Param('kind') kind: string, @Query() q: ReportRangeQuery, @Res() res: Response) {
    if (!(REPORT_KINDS as readonly string[]).includes(kind)) throw notFound('Report');
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to < from || (to.getTime() - from.getTime()) / DAY > 366) throw new AppException('VALIDATION_FAILED', 'Range must be ascending and at most 366 days');
    const { columns, rows } = await this.ops.report(kind as ReportKind, from, to);
    const normalized = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'bigint' ? Number(v) : v])));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-${q.from.slice(0, 10)}-${q.to.slice(0, 10)}.csv"`);
    res.send(toCsv(normalized, columns));
  }
}
