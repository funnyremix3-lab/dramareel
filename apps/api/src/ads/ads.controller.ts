import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Platform, RewardPurpose } from '@prisma/client';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuth, Public } from '../auth/decorators';
import { Locale, RequestLocale } from '../common/http/locale';
import { AdmobSsvVerifier } from './admob-ssv.verifier';
import { AdsService } from './ads.service';
import { RewardsService } from './rewards.service';

const PLATFORMS = ['ANDROID', 'IOS'] as const;

class PlatformQuery {
  @ApiProperty({ enum: PLATFORMS }) @IsIn(PLATFORMS) platform: Platform;
}

class ServeQuery extends PlatformQuery {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_]{1,60}$/) placement: string;
}

class BeaconDto {
  @ApiProperty() @IsString() @Length(20, 1024) serveToken: string;
}

class CreateClaimDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_]{1,60}$/) placementKey: string;
  @ApiProperty({ enum: RewardPurpose }) @IsIn(Object.values(RewardPurpose)) purpose: RewardPurpose;
  @ApiPropertyOptional() @IsOptional() @IsUUID() episodeId?: string;
  @ApiProperty({ enum: PLATFORMS }) @IsIn(PLATFORMS) platform: Platform;
}

@ApiTags('ads')
@ApiBearerAuth()
@Controller()
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly rewards: RewardsService,
    private readonly ssv: AdmobSsvVerifier,
  ) {}

  @Get('ads/config')
  @OptionalAuth()
  config(@CurrentUser() user: AuthUser | undefined, @Query() q: PlatformQuery) {
    return this.ads.config(user?.id, q.platform);
  }

  /** A direct-campaign creative for the placement, or 204 when none is eligible. */
  @Get('ads/serve')
  @OptionalAuth()
  async serve(
    @CurrentUser() user: AuthUser | undefined,
    @Query() q: ServeQuery,
    @RequestLocale() locale: Locale,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.ads.serve(q.placement, { userId: user?.id, platform: q.platform, locale });
    if (!result) res.status(204);
    return result ?? undefined;
  }

  @Post('ads/impressions')
  @OptionalAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  impression(@CurrentUser() user: AuthUser | undefined, @Body() body: BeaconDto) {
    return this.ads.recordImpression(body.serveToken, user?.id);
  }

  @Post('ads/clicks')
  @OptionalAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  click(@CurrentUser() user: AuthUser | undefined, @Body() body: BeaconDto) {
    return this.ads.recordClick(body.serveToken, user?.id);
  }

  @Post('rewards/claims')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  createClaim(@CurrentUser() user: AuthUser, @Body() body: CreateClaimDto) {
    return this.rewards.createClaim(user.id, body);
  }

  @Get('rewards/claims/:id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getClaim(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.rewards.getClaim(user.id, id);
  }

  /**
   * AdMob server-side verification callback (configure this URL on each rewarded ad unit).
   * Authentic callbacks get 200 even when the reward is refused, so Google stops retrying.
   */
  @Get('ads/admob/ssv')
  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async admobSsv(@Req() req: Request, @Res() res: Response) {
    const rawQuery = req.originalUrl.slice(req.originalUrl.indexOf('?') + 1);
    const result = await this.ssv.verify(req.originalUrl.includes('?') ? rawQuery : '');
    if (!result.ok) return void res.status(400).send(result.reason);
    const outcome = await this.rewards.handleVerifiedCallback(result.params);
    res.status(200).send(outcome);
  }
}

