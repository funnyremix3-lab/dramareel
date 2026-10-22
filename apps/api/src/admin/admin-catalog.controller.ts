import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { hasPermission } from '../auth/permissions';
import { AppException } from '../common/errors/app-exception';
import { AdminCatalogService } from './admin-catalog.service';
import { CategoryDto, CreateDramaDto, CreateEpisodeDto, DramaInputDto, DramaListQuery, EpisodeInputDto, ImageUploadDto, LanguageDto, TranslationDto } from './catalog.dto';

const uuid = () => new ParseUUIDPipe();

/** Pricing fields need monetization rights on top of content rights. */
function assertPricingAllowed(req: Request, input: EpisodeInputDto | DramaInputDto) {
  const touchesPricing =
    ('access' in input && input.access !== undefined) ||
    ('unlockCoins' in input && input.unlockCoins !== undefined) ||
    ('freeEpisodeCount' in input && input.freeEpisodeCount !== undefined) ||
    ('defaultUnlockCoins' in input && input.defaultUnlockCoins !== undefined);
  if (touchesPricing && !hasPermission(req.user?.permissions ?? [], 'monetization:write')) {
    throw new AppException('FORBIDDEN', 'Changing prices or free episodes needs monetization:write');
  }
}

@ApiTags('admin: catalog')
@ApiBearerAuth()
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get('dramas')
  @RequirePermissions('dramas:read')
  list(@Query() q: DramaListQuery) {
    return this.catalog.listDramas(q);
  }

  @Get('dramas/:id')
  @RequirePermissions('dramas:read')
  get(@Param('id', uuid()) id: string) {
    return this.catalog.getDrama(id);
  }

  @Post('dramas')
  @RequirePermissions('dramas:write')
  create(@Req() req: Request, @Body() body: CreateDramaDto) {
    assertPricingAllowed(req, body);
    return this.catalog.createDrama(req, body);
  }

  @Patch('dramas/:id')
  @RequirePermissions('dramas:write')
  update(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: DramaInputDto) {
    assertPricingAllowed(req, body);
    return this.catalog.updateDrama(req, id, body);
  }

  @Delete('dramas/:id')
  @HttpCode(204)
  @RequirePermissions('dramas:write')
  async remove(@Req() req: Request, @Param('id', uuid()) id: string) {
    await this.catalog.deleteDrama(req, id);
  }

  @Post('dramas/:id/publish')
  @HttpCode(200)
  @RequirePermissions('dramas:publish')
  publish(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.catalog.setDramaStatus(req, id, 'PUBLISHED');
  }

  @Post('dramas/:id/unpublish')
  @HttpCode(200)
  @RequirePermissions('dramas:publish')
  unpublish(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.catalog.setDramaStatus(req, id, 'DRAFT');
  }

  @Post('dramas/:id/archive')
  @HttpCode(200)
  @RequirePermissions('dramas:publish')
  archive(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.catalog.setDramaStatus(req, id, 'ARCHIVED');
  }

  @Put('dramas/:id/translations/:lang')
  @RequirePermissions('dramas:write')
  translation(@Req() req: Request, @Param('id', uuid()) id: string, @Param('lang') lang: string, @Body() body: TranslationDto) {
    return this.catalog.putTranslation(req, id, lang, body);
  }

  @Post('dramas/:id/poster-upload-url')
  @RequirePermissions('dramas:write')
  posterUpload(@Param('id', uuid()) id: string, @Body() body: ImageUploadDto) {
    return this.catalog.posterUploadUrl(id, body.contentType, body.sizeBytes);
  }

  @Get('dramas/:id/episodes')
  @RequirePermissions('dramas:read')
  episodes(@Param('id', uuid()) id: string) {
    return this.catalog.listEpisodes(id);
  }

  @Post('dramas/:id/episodes')
  @RequirePermissions('dramas:write')
  createEpisode(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: CreateEpisodeDto) {
    assertPricingAllowed(req, body);
    return this.catalog.createEpisode(req, id, body);
  }

  @Patch('episodes/:id')
  @RequirePermissions('dramas:write')
  updateEpisode(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: EpisodeInputDto) {
    assertPricingAllowed(req, body);
    return this.catalog.updateEpisode(req, id, body);
  }

  @Post('episodes/:id/publish')
  @HttpCode(200)
  @RequirePermissions('dramas:publish')
  publishEpisode(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.catalog.setEpisodeStatus(req, id, 'PUBLISHED');
  }

  @Post('episodes/:id/unpublish')
  @HttpCode(200)
  @RequirePermissions('dramas:publish')
  unpublishEpisode(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.catalog.setEpisodeStatus(req, id, 'DRAFT');
  }

  @Delete('episodes/:id')
  @HttpCode(204)
  @RequirePermissions('dramas:write')
  async deleteEpisode(@Req() req: Request, @Param('id', uuid()) id: string) {
    await this.catalog.deleteEpisode(req, id);
  }

  @Get('categories')
  @RequirePermissions('dramas:read')
  categories() {
    return this.catalog.listCategories();
  }

  @Put('categories')
  @RequirePermissions('dramas:write')
  upsertCategory(@Req() req: Request, @Body() body: CategoryDto) {
    return this.catalog.upsertCategory(req, body);
  }

  @Get('languages')
  @RequirePermissions('dramas:read')
  languages() {
    return this.catalog.listLanguages();
  }

  @Put('languages')
  @RequirePermissions('dramas:write')
  upsertLanguage(@Req() req: Request, @Body() body: LanguageDto) {
    return this.catalog.upsertLanguage(req, body);
  }
}
