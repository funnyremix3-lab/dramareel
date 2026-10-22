import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CampaignStatus, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { spentPaise } from '../ads/ads.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException, notFound } from '../common/errors/app-exception';
import { MediaUrlService } from '../common/http/media-url';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../media/storage.service';
import { paged, plain, skipTake } from './admin-common';
import { AdConfigurationDto, CampaignDto, CampaignListQuery, CreativeDto, NetworkReportRowDto, PlacementUpdateDto } from './ads.dto';

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Valid manual status transitions for a campaign. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE', 'CANCELED'],
  SCHEDULED: ['ACTIVE', 'PAUSED', 'CANCELED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus) {
  return TRANSITIONS[from].includes(to);
}

@Injectable()
export class AdminAdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly media: MediaUrlService,
  ) {}

  // ───────── Placements & AdMob configuration ─────────

  listPlacements() {
    return this.prisma.adPlacement.findMany({ orderBy: { key: 'asc' }, include: { configurations: { orderBy: [{ platform: 'asc' }, { source: 'asc' }] } } });
  }

  async updatePlacement(req: Request, key: string, input: PlacementUpdateDto) {
    const before = await this.prisma.adPlacement.findUnique({ where: { key } });
    if (!before) throw notFound('Placement');
    const after = await this.prisma.adPlacement.update({ where: { key }, data: input });
    await this.audit.record(req, { action: 'ad_placement.update', entityType: 'ad_placement', entityId: before.id, before, after });
    return after;
  }

  async upsertConfiguration(req: Request, key: string, input: AdConfigurationDto) {
    const placement = await this.prisma.adPlacement.findUnique({ where: { key } });
    if (!placement) throw notFound('Placement');
    if (input.source === 'ADMOB' && !['REWARDED', 'INTERSTITIAL', 'NATIVE'].includes(placement.format)) {
      throw new AppException('VALIDATION_FAILED', 'AdMob only serves rewarded, interstitial and native placements');
    }
    if (placement.format === 'INTERSTITIAL' && input.minEpisodesBetween === undefined) {
      // Interstitials must never fire on every transition.
      input.minEpisodesBetween = 4;
    }
    const where = { placementId_platform_source: { placementId: placement.id, platform: input.platform, source: input.source } };
    const before = await this.prisma.adConfiguration.findUnique({ where });
    const { platform, source, ...rules } = input;
    const after = await this.prisma.adConfiguration.upsert({ where, create: { placementId: placement.id, platform, source, ...rules }, update: rules });
    await this.audit.record(req, { action: 'ad_configuration.upsert', entityType: 'ad_configuration', entityId: after.id, before, after });
    return after;
  }

  // ───────── Campaigns ─────────

  async listCampaigns(q: CampaignListQuery) {
    const where: Prisma.AdCampaignWhereInput = {
      status: q.status,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { advertiserName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { placements: { include: { placement: { select: { key: true } } } }, _count: { select: { creatives: true, impressions: true, clicks: true } } },
      }),
      this.prisma.adCampaign.count({ where }),
    ]);
    return paged(
      rows.map((c) =>
        plain({
          ...c,
          placementKeys: c.placements.map((p) => p.placement.key),
          placements: undefined,
          impressions: c._count.impressions,
          clicks: c._count.clicks,
          creatives: c._count.creatives,
          spentPaise: spentPaise(c, c._count.impressions, c._count.clicks),
        }),
      ),
      total,
      q,
    );
  }

  async getCampaign(id: string) {
    const c = await this.prisma.adCampaign.findUnique({
      where: { id },
      include: { creatives: { orderBy: { createdAt: 'desc' } }, placements: { include: { placement: { select: { key: true } } } } },
    });
    if (!c) throw notFound('Campaign');
    return plain({
      ...c,
      placementKeys: c.placements.map((p) => p.placement.key),
      placements: undefined,
      creatives: c.creatives.map((cr) => ({ ...cr, mediaUrl: this.media.publicUrl(cr.mediaKey) })),
    });
  }

  private async placementIds(keys: string[]) {
    const rows = await this.prisma.adPlacement.findMany({ where: { key: { in: keys } } });
    if (rows.length !== new Set(keys).size) throw new AppException('VALIDATION_FAILED', 'Unknown placement key');
    if (rows.some((p) => p.format !== 'SPONSORED_CARD' && p.format !== 'SPONSORED_VIDEO')) {
      throw new AppException('VALIDATION_FAILED', 'Direct campaigns can only use sponsored placements');
    }
    return rows.map((p) => p.id);
  }

  private validateWindow(input: CampaignDto) {
    if (new Date(input.endAt) <= new Date(input.startAt)) throw new AppException('VALIDATION_FAILED', 'endAt must be after startAt');
  }

  private campaignData(input: CampaignDto) {
    const { placementKeys: _p, targeting, totalBudgetPaise, ratePaise, ...rest } = input;
    return {
      ...rest,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      ratePaise: BigInt(ratePaise),
      totalBudgetPaise: totalBudgetPaise === undefined || totalBudgetPaise === null ? null : BigInt(totalBudgetPaise),
      targeting: (targeting ?? {}) as Prisma.InputJsonValue,
    };
  }

  async createCampaign(req: Request, input: CampaignDto) {
    this.validateWindow(input);
    const placementIds = await this.placementIds(input.placementKeys);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.adCampaign.create({
        data: { ...this.campaignData(input), status: 'DRAFT', createdBy: req.user?.id, placements: { create: placementIds.map((placementId) => ({ placementId })) } },
      });
      await this.audit.record(req, { action: 'ad_campaign.create', entityType: 'ad_campaign', entityId: c.id, after: plain(c) }, tx);
      return plain(c);
    });
  }

  async updateCampaign(req: Request, id: string, input: CampaignDto) {
    this.validateWindow(input);
    const placementIds = await this.placementIds(input.placementKeys);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.adCampaign.findUnique({ where: { id } });
      if (!before) throw notFound('Campaign');
      if (before.status === 'COMPLETED' || before.status === 'CANCELED') throw new AppException('CONFLICT', 'Finished campaigns cannot be edited');
      const after = await tx.adCampaign.update({ where: { id }, data: this.campaignData(input) });
      await tx.adCampaignPlacement.deleteMany({ where: { campaignId: id } });
      await tx.adCampaignPlacement.createMany({ data: placementIds.map((placementId) => ({ campaignId: id, placementId })) });
      await this.audit.record(req, { action: 'ad_campaign.update', entityType: 'ad_campaign', entityId: id, before: plain(before), after: plain(after) }, tx);
      return plain(after);
    });
  }

  async setCampaignStatus(req: Request, id: string, status: CampaignStatus) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id }, include: { creatives: { where: { reviewStatus: 'APPROVED', isActive: true } } } });
    if (!c) throw notFound('Campaign');
    if (!canTransition(c.status, status)) throw new AppException('CONFLICT', `Cannot move a ${c.status} campaign to ${status}`);
    if ((status === 'ACTIVE' || status === 'SCHEDULED') && c.creatives.length === 0) {
      throw new AppException('CONFLICT', 'Approve at least one creative first');
    }
    const after = await this.prisma.adCampaign.update({ where: { id }, data: { status } });
    await this.audit.record(req, { action: `ad_campaign.${status.toLowerCase()}`, entityType: 'ad_campaign', entityId: id, before: { status: c.status }, after: { status } });
    return plain(after);
  }

  // ───────── Creatives ─────────

  async creativeUploadUrl(campaignId: string, contentType: string, sizeBytes: number) {
    if (!(await this.prisma.adCampaign.findUnique({ where: { id: campaignId }, select: { id: true } }))) throw notFound('Campaign');
    const key = `public/creatives/${campaignId}-${randomBytes(6).toString('hex')}.${IMAGE_EXT[contentType]}`;
    return { key, uploadUrl: await this.storage.presignUpload(key, contentType, sizeBytes, 600), method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async createCreative(req: Request, campaignId: string, input: CreativeDto) {
    if (!input.mediaKey.startsWith(`public/creatives/${campaignId}-`)) throw new AppException('VALIDATION_FAILED', 'mediaKey must come from the creative upload endpoint');
    if (!(await this.storage.head(input.mediaKey))) throw new AppException('VALIDATION_FAILED', 'Creative image has not been uploaded');
    const creative = await this.prisma.adCreative.create({
      data: { campaignId, type: input.type, mediaKey: input.mediaKey, headline: input.headline, ctaText: input.ctaText, destinationUrl: input.destinationUrl, label: input.label ?? 'Sponsored' },
    });
    await this.audit.record(req, { action: 'ad_creative.create', entityType: 'ad_creative', entityId: creative.id, after: creative });
    return creative;
  }

  /** Review is a separate step so whoever uploads cannot self-approve unchecked content. */
  async reviewCreative(req: Request, id: string, decision: 'APPROVED' | 'REJECTED') {
    const before = await this.prisma.adCreative.findUnique({ where: { id }, include: { campaign: { select: { createdBy: true } } } });
    if (!before) throw notFound('Creative');
    // Four-eyes rule: the person who created the campaign cannot approve its creatives (owners excepted).
    if (decision === 'APPROVED' && before.campaign.createdBy === req.user?.id && !req.user?.permissions.includes('*')) {
      throw new AppException('FORBIDDEN', 'Another ads manager or the owner must approve this creative');
    }
    const after = await this.prisma.adCreative.update({ where: { id }, data: { reviewStatus: decision, reviewedBy: req.user?.id } });
    await this.audit.record(req, { action: `ad_creative.${decision.toLowerCase()}`, entityType: 'ad_creative', entityId: id, before: { reviewStatus: before.reviewStatus }, after: { reviewStatus: decision } });
    return after;
  }

  // ───────── Reporting (direct and network kept apart) ─────────

  async campaignReport(id: string, from: Date, to: Date) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!c) throw notFound('Campaign');
    const rows = await this.prisma.$queryRaw<{ day: Date; impressions: number; clicks: number }[]>`
      SELECT d.day::date AS day,
             COALESCE((SELECT COUNT(*) FROM ad_impressions i WHERE i.campaign_id = ${id}::uuid AND i.occurred_at >= d.day AND i.occurred_at < d.day + interval '1 day'), 0)::int AS impressions,
             COALESCE((SELECT COUNT(*) FROM ad_clicks k WHERE k.campaign_id = ${id}::uuid AND k.occurred_at >= d.day AND k.occurred_at < d.day + interval '1 day'), 0)::int AS clicks
      FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d(day)
      ORDER BY day`;
    const days = rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.impressions ? r.clicks / r.impressions : 0,
      spendPaise: Number(spentPaise(c, r.impressions, r.clicks)),
    }));
    const totals = days.reduce((t, d) => ({ impressions: t.impressions + d.impressions, clicks: t.clicks + d.clicks, spendPaise: t.spendPaise + d.spendPaise }), { impressions: 0, clicks: 0, spendPaise: 0 });
    return { campaignId: id, pricingModel: c.pricingModel, ratePaise: Number(c.ratePaise), source: 'DIRECT', days, totals };
  }

  async importNetworkReport(req: Request, rows: NetworkReportRowDto[]) {
    for (const r of rows) {
      await this.prisma.adNetworkDailyReport.upsert({
        where: { source_reportDate_adUnitId: { source: 'ADMOB', reportDate: new Date(r.date), adUnitId: r.adUnitId } },
        create: { source: 'ADMOB', reportDate: new Date(r.date), adUnitId: r.adUnitId, impressions: r.impressions, clicks: r.clicks, estimatedEarningsMicros: BigInt(r.estimatedEarningsMicros), currency: r.currency },
        update: { impressions: r.impressions, clicks: r.clicks, estimatedEarningsMicros: BigInt(r.estimatedEarningsMicros), currency: r.currency, importedAt: new Date() },
      });
    }
    await this.audit.record(req, { action: 'ad_network_report.import', entityType: 'ad_network_daily_report', after: { rows: rows.length } });
    return { imported: rows.length };
  }

  async networkReport(from: Date, to: Date) {
    const rows = await this.prisma.adNetworkDailyReport.findMany({ where: { reportDate: { gte: from, lte: to } }, orderBy: [{ reportDate: 'asc' }, { adUnitId: 'asc' }] });
    return { source: 'ADMOB', rows: plain(rows) };
  }
}
