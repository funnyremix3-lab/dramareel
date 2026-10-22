import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuth, Public } from '../auth/decorators';
import { Locale, RequestLocale } from '../common/http/locale';
import { CursorQuery } from '../common/pagination/cursor';
import { ListDramasQuery, SearchDramasQuery } from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('home')
  @OptionalAuth()
  home(@CurrentUser() user: AuthUser | undefined, @RequestLocale() locale: Locale) {
    return this.catalog.home(user?.id, locale);
  }

  @Get('feed')
  @OptionalAuth()
  feed(@CurrentUser() user: AuthUser | undefined, @Query() query: CursorQuery, @RequestLocale() locale: Locale) {
    return this.catalog.feed(user?.id, query, locale);
  }

  @Get('categories')
  @Public()
  categories(@RequestLocale() locale: Locale) {
    return this.catalog.listCategories(locale);
  }

  @Get('dramas')
  @Public()
  listDramas(@Query() query: ListDramasQuery, @RequestLocale() locale: Locale) {
    return this.catalog.listDramas(query, locale);
  }

  // Declared before `dramas/:id` so "search" is never parsed as an id.
  @Get('dramas/search')
  @Public()
  search(@Query() query: SearchDramasQuery, @RequestLocale() locale: Locale) {
    return this.catalog.searchDramas(query, locale);
  }

  @Get('dramas/:id')
  @OptionalAuth()
  getDrama(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | undefined,
    @RequestLocale() locale: Locale,
  ) {
    return this.catalog.getDrama(id, user?.id, locale);
  }

  @Get('dramas/:id/episodes')
  @OptionalAuth()
  listEpisodes(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: CursorQuery,
  ) {
    return this.catalog.listEpisodes(id, user?.id, query);
  }
}
