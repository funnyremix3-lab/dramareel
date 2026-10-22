import { Body, Controller, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Platform, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, OptionalAuth } from '../auth/decorators';
import { PrismaService } from '../common/prisma/prisma.service';

/** The only events we collect. Adding one is a deliberate, reviewable change. */
export const EVENT_NAMES = [
  'app_open',
  'episode_start',
  'episode_complete',
  'paywall_view',
  'unlock_success',
  'rewarded_ad_shown',
  'search',
  'drama_view',
  'favorite_add',
] as const;

const MAX_PAST_MS = 7 * 86_400_000;
const MAX_FUTURE_MS = 5 * 60_000;

class EventDto {
  @ApiProperty({ enum: EVENT_NAMES }) @IsIn(EVENT_NAMES) name: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() properties?: Record<string, unknown>;
  @ApiProperty() @IsDateString() occurredAt: string;
}

class EventBatchDto {
  @ApiProperty({ type: [EventDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => EventDto) events: EventDto[];
  @ApiProperty({ enum: ['ANDROID', 'IOS', 'WEB'] }) @IsIn(['ANDROID', 'IOS', 'WEB']) platform: Platform;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[\w.+-]{1,20}$/) @MaxLength(20) appVersion?: string;
}

/** Keeps at most 20 primitive properties with short keys/values; drops everything else. */
export function sanitizeProperties(input: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input ?? {}).slice(0, 20)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Signed-in users are recorded only with analytics consent. Guests' clients send events only
   * after the guest opted in on the device; they are stored without any user id.
   */
  async ingest(userId: string | undefined, batch: EventBatchDto) {
    if (userId) {
      const profile = await this.prisma.userProfile.findUnique({ where: { userId }, select: { analyticsConsent: true } });
      if (!profile?.analyticsConsent) return { accepted: 0, reason: 'no consent' };
    }
    const now = Date.now();
    const rows: Prisma.AnalyticsEventCreateManyInput[] = batch.events
      .filter((e) => {
        const t = new Date(e.occurredAt).getTime();
        return t >= now - MAX_PAST_MS && t <= now + MAX_FUTURE_MS;
      })
      .map((e) => ({
        userId: userId ?? null,
        name: e.name,
        properties: sanitizeProperties(e.properties),
        platform: batch.platform,
        appVersion: batch.appVersion,
        occurredAt: new Date(e.occurredAt),
      }));
    if (rows.length) await this.prisma.analyticsEvent.createMany({ data: rows });
    return { accepted: rows.length };
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('events')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post()
  @OptionalAuth()
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ingest(@CurrentUser() user: AuthUser | undefined, @Body() body: EventBatchDto) {
    return this.analytics.ingest(user?.id, body);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
