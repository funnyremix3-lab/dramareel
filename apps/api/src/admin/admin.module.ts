import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminAdsController } from './admin-ads.controller';
import { AdminAdsService } from './admin-ads.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminModerationController, ModerationService } from './admin-moderation.controller';
import { AdminOpsController, OpsService } from './admin-ops.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** Everything under /api/v1/admin — every route requires explicit permissions. */
@Module({
  imports: [CatalogModule],
  controllers: [AdminCatalogController, AdminUsersController, AdminModerationController, AdminAdsController, AdminOpsController],
  providers: [AdminCatalogService, AdminUsersService, ModerationService, AdminAdsService, OpsService],
})
export class AdminModule {}
