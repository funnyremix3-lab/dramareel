import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { CursorQuery } from '../common/pagination/cursor';
import { UnlockService } from './unlock.service';
import { WalletService } from './wallet.service';

class UnlockDto {
  @ApiProperty({ enum: ['COINS'] })
  @IsIn(['COINS'])
  method: 'COINS';
}

@ApiTags('wallet')
@ApiBearerAuth()
@Controller()
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly unlocks: UnlockService,
  ) {}

  @Get('wallet')
  async getWallet(@CurrentUser() user: AuthUser) {
    return { balance: await this.wallet.balance(user.id) };
  }

  @Get('wallet/transactions')
  history(@CurrentUser() user: AuthUser, @Query() query: CursorQuery) {
    return this.wallet.history(user.id, query);
  }

  /** Spend coins on a locked episode. Returns 409 INSUFFICIENT_COINS when the balance is too low. */
  @Post('episodes/:id/unlock')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  unlock(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() _body: UnlockDto) {
    return this.unlocks.unlockWithCoins(user.id, id);
  }
}
