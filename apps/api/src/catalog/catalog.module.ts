import { Module } from '@nestjs/common';
import { MediaUrlService } from '../common/http/media-url';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, MediaUrlService],
  exports: [CatalogService, MediaUrlService],
})
export class CatalogModule {}
