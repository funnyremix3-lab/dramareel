import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [CatalogModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
