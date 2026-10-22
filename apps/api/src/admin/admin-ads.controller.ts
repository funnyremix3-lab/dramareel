import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { AppException } from '../common/errors/app-exception';
import { AdminAdsService } from './admin-ads.service';
import {
  AdConfigurationDto,
  CampaignDto,
  CampaignListQuery,
  CreativeDto,
  CreativeReviewDto,
  CreativeUploadDto,
  NetworkReportImportDto,
  PlacementUpdateDto,
  ReportRangeQuery,
} from './ads.dto';

const uuid = () => new ParseUUIDPipe();
const MAX_RANGE_DAYS = 366;

function range(q: ReportRangeQuery) {
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (to < from || (to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    throw new AppException('VALIDATION_FAILED', `Range must be ascending and at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

@ApiTags('admin: ads')
@ApiBearerAuth()
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly ads: AdminAdsService) {}

  @Get('placements')
  @RequirePermissions('ads:read')
  placements() {
    return this.ads.listPlacements();
  }

  @Patch('placements/:key')
  @RequirePermissions('ads:write')
  updatePlacement(@Req() req: Request, @Param('key') key: string, @Body() body: PlacementUpdateDto) {
    return this.ads.updatePlacement(req, key, body);
  }

  @Put('placements/:key/configurations')
  @RequirePermissions('ads:write')
  configure(@Req() req: Request, @Param('key') key: string, @Body() body: AdConfigurationDto) {
    return this.ads.upsertConfiguration(req, key, body);
  }

  @Get('campaigns')
  @RequirePermissions('ads:read')
  campaigns(@Query() q: CampaignListQuery) {
    return this.ads.listCampaigns(q);
  }

  @Get('campaigns/:id')
  @RequirePermissions('ads:read')
  campaign(@Param('id', uuid()) id: string) {
    return this.ads.getCampaign(id);
  }

  @Post('campaigns')
  @RequirePermissions('ads:write')
  createCampaign(@Req() req: Request, @Body() body: CampaignDto) {
    return this.ads.createCampaign(req, body);
  }

  @Put('campaigns/:id')
  @RequirePermissions('ads:write')
  updateCampaign(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: CampaignDto) {
    return this.ads.updateCampaign(req, id, body);
  }

  @Post('campaigns/:id/activate')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  activate(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ads.setCampaignStatus(req, id, 'ACTIVE');
  }

  @Post('campaigns/:id/schedule')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  schedule(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ads.setCampaignStatus(req, id, 'SCHEDULED');
  }

  @Post('campaigns/:id/pause')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  pause(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ads.setCampaignStatus(req, id, 'PAUSED');
  }

  @Post('campaigns/:id/complete')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  complete(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ads.setCampaignStatus(req, id, 'COMPLETED');
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  cancel(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.ads.setCampaignStatus(req, id, 'CANCELED');
  }

  @Post('campaigns/:id/creative-upload-url')
  @RequirePermissions('ads:write')
  creativeUpload(@Param('id', uuid()) id: string, @Body() body: CreativeUploadDto) {
    return this.ads.creativeUploadUrl(id, body.contentType, body.sizeBytes);
  }

  @Post('campaigns/:id/creatives')
  @RequirePermissions('ads:write')
  createCreative(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: CreativeDto) {
    return this.ads.createCreative(req, id, body);
  }

  @Post('creatives/:id/review')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  review(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: CreativeReviewDto) {
    return this.ads.reviewCreative(req, id, body.decision);
  }

  @Get('campaigns/:id/report')
  @RequirePermissions('ads:read')
  report(@Param('id', uuid()) id: string, @Query() q: ReportRangeQuery) {
    const { from, to } = range(q);
    return this.ads.campaignReport(id, from, to);
  }

  @Get('network-reports')
  @RequirePermissions('ads:read')
  networkReports(@Query() q: ReportRangeQuery) {
    const { from, to } = range(q);
    return this.ads.networkReport(from, to);
  }

  @Post('network-reports/import')
  @HttpCode(200)
  @RequirePermissions('ads:write')
  importNetwork(@Req() req: Request, @Body() body: NetworkReportImportDto) {
    return this.ads.importNetworkReport(req, body.rows);
  }
}
