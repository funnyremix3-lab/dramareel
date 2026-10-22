import { Module } from '@nestjs/common';
import { UnlockService } from './unlock.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [UnlockService],
  exports: [UnlockService],
})
export class WalletModule {}
