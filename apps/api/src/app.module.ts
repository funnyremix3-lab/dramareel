import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AdsModule } from './ads/ads.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuditModule } from './common/audit/audit.service';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { UserThrottlerGuard } from './common/http/user-throttler.guard';
import { PrismaModule } from './common/prisma/prisma.service';
import { ConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { DevModule } from './dev/dev.module';
import { EngagementModule } from './engagement/engagement.module';
import { EntitlementsModule } from './entitlements/entitlements.service';
import { HealthModule } from './health/health.controller';
import { MediaModule } from './media/media.module';
import { PaymentsModule } from './payments/payments.controller';
import { QueueModule } from './queue/transcode-queue.service';
import { UsersModule } from './users/users.module';
import { WalletModule } from './wallet/wallet.module';
import { WalletCoreModule } from './wallet/wallet.service';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        customProps: (req) => ({ userId: (req as { user?: { id: string } }).user?.id }),
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        autoLogging: { ignore: (req) => req.url?.includes('/health/') ?? false },
      },
    }),
    // In-memory limits for a single instance; switch to Redis storage before running >1 replica.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    QueueModule,
    EntitlementsModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    MediaModule.register(),
    EngagementModule,
    WalletCoreModule,
    WalletModule,
    AdsModule,
    PaymentsModule,
    AdminModule,
    DevModule.register(),
    HealthModule,
  ],
  providers: [
    // Order matters: authenticate first so limits can be tracked per user.
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
