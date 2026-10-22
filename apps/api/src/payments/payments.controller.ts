import { Body, Controller, Get, Headers, HttpCode, Inject, Module, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { GOOGLE_PLAY_API, GooglePlayHttpClient } from './google-play.client';
import { PaymentsService, RtdnMessage } from './payments.service';
import { GoogleOidcRtdnAuth, RTDN_AUTH, RtdnAuthVerifier } from './rtdn-auth';

class VerifyGooglePlayDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_.]{1,100}$/) sku: string;
  @ApiProperty() @IsString() @Length(10, 4096) purchaseToken: string;
}

class PubSubPushDto {
  @IsObject() message: { data?: string; messageId?: string };
  @IsOptional() @IsString() subscription?: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(RTDN_AUTH) private readonly rtdnAuth: RtdnAuthVerifier,
  ) {}

  @Get('products')
  @Public()
  products() {
    return this.payments.products();
  }

  @Get('me/subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.payments.mySubscription(user.id);
  }

  /** Called by the app after a Play Billing purchase; fulfils exactly once. */
  @Post('payments/google-play/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  verify(@CurrentUser() user: AuthUser, @Body() body: VerifyGooglePlayDto) {
    return this.payments.verifyGooglePlay(user.id, body.sku, body.purchaseToken);
  }

  /** Google Play Real-time Developer Notifications via Pub/Sub push. */
  @Post('payments/google-play/rtdn')
  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async rtdn(@Headers('authorization') authorization: string | undefined, @Body() body: PubSubPushDto, @Res() res: Response) {
    if (!(await this.rtdnAuth.verify(authorization))) return void res.status(401).send('unauthorized');
    let message: RtdnMessage;
    try {
      message = JSON.parse(Buffer.from(body.message?.data ?? '', 'base64').toString('utf8')) as RtdnMessage;
    } catch {
      // Malformed payloads will never parse; ack them so Pub/Sub stops redelivering.
      return void res.status(200).send('ignored: malformed');
    }
    // Non-2xx makes Pub/Sub retry, which is what we want for transient failures.
    res.status(200).send(await this.payments.handleRtdn(message));
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: GOOGLE_PLAY_API, useClass: GooglePlayHttpClient },
    { provide: RTDN_AUTH, useClass: GoogleOidcRtdnAuth },
  ],
})
export class PaymentsModule {}
