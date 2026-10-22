import { Body, Controller, DynamicModule, HttpCode, Inject, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SignJWT } from 'jose';
import { AdsModule } from '../ads/ads.module';
import { RewardsService } from '../ads/rewards.service';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { DEV_TOKEN_ISSUER } from '../auth/token-verifier.service';
import { AppException } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, Env, loadEnv } from '../config/env';

const DEV_ACCOUNTS = ['viewer', 'owner', 'content', 'ads', 'support'] as const;

class DevTokenDto {
  @IsIn(DEV_ACCOUNTS) account: (typeof DEV_ACCOUNTS)[number];
}

/**
 * DEVELOPMENT ONLY. Registered only when NODE_ENV !== production and DEV_JWT_SECRET is set.
 * - POST /dev/token: sign in as a seeded dev account without Supabase (for emulator/device testing).
 * - POST /dev/rewards/claims/:id/complete: stands in for AdMob SSV, because Google's TEST ad units
 *   never call your server. Disabled whenever ADMOB_SSV_ENABLED=true.
 */
@ApiExcludeController()
@Controller('dev')
class DevController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly rewards: RewardsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token')
  @Public()
  @HttpCode(200)
  async token(@Body() body: DevTokenDto) {
    const sub = `dev-${body.account}`;
    const token = await new SignJWT({ email: `${body.account}@dev.local`, role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(sub)
      .setIssuer(DEV_TOKEN_ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(new TextEncoder().encode(this.env.DEV_JWT_SECRET!));
    return { accessToken: token, expiresIn: 12 * 3600 };
  }

  @Post('rewards/claims/:id/complete')
  @HttpCode(200)
  async completeReward(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    if (this.env.ADMOB_SSV_ENABLED) throw new AppException('FORBIDDEN', 'Disabled while ADMOB_SSV_ENABLED=true');
    const claim = await this.prisma.rewardClaim.findFirst({ where: { id, userId: user.id } });
    if (!claim) throw new AppException('NOT_FOUND', 'Reward claim not found');
    if (claim.expiresAt <= new Date()) throw new AppException('REWARD_NOT_ELIGIBLE', 'Claim expired');
    const outcome = await this.rewards.grant(id, `dev-${id}`, { simulated: true });
    return { outcome, claim: await this.rewards.getClaim(user.id, id) };
  }
}

@Module({})
export class DevModule {
  static register(): DynamicModule {
    const env = loadEnv();
    const enabled = env.NODE_ENV !== 'production' && !!env.DEV_JWT_SECRET;
    return enabled ? { module: DevModule, imports: [AdsModule], controllers: [DevController] } : { module: DevModule };
  }
}
