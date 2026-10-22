import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdmobSsvVerifier, GoogleSsvKeySource, SSV_KEY_SOURCE } from './admob-ssv.verifier';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { RewardsService } from './rewards.service';

@Module({
  imports: [WalletModule, CatalogModule],
  controllers: [AdsController],
  providers: [AdsService, RewardsService, AdmobSsvVerifier, { provide: SSV_KEY_SOURCE, useClass: GoogleSsvKeySource }],
  exports: [RewardsService, AdsService],
})
export class AdsModule {}
